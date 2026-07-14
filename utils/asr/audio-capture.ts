// Captures Netflix's actual audio output — NOT via getDisplayMedia. Firefox
// implements that API for video only and silently drops the audio track no
// matter what you share (tab/window/screen); this is a confirmed, long-
// standing Mozilla limitation (bugzilla.mozilla.org/show_bug.cgi?id=1541425),
// not something this extension can work around at the API level.
//
// Instead: the user routes their system/browser audio output into a virtual
// audio cable (e.g. VB-Audio Virtual Cable on Windows — free, install it
// yourself, znam does not and cannot install it for you), and znam captures
// that cable's OUTPUT as a normal microphone input via getUserMedia(), which
// Firefox supports perfectly well (this is just standard mic capture, not
// screen/tab sharing). One-time setup, no per-session share dialog — once
// mic permission is granted for netflix.com it persists.

/** rate = video playbackRate while this window was captured; at 1.5× (the
 *  pre-scan pass) 8s of audio spans 12s of video time, so segment offsets
 *  must be scaled by it when mapped back onto the video clock. */
export type ChunkHandler = (pcm: Float32Array, startTime: number, rate: number) => void
export type CaptureStartResult = 'ok' | 'denied' | 'no-device' | 'error'

const SAMPLE_RATE = 16000

/** Linear-interpolation resample of one mono frame from `inRate` to `outRate`.
 *  Only used on the native-rate fallback path (Firefox refused a 16kHz
 *  AudioContext); good enough for speech recognition. */
function downsample(frame: Float32Array, inRate: number, outRate: number): Float32Array {
  const ratio = inRate / outRate
  const outLen = Math.floor(frame.length / ratio)
  const out = new Float32Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio
    const i0 = Math.floor(pos)
    const i1 = Math.min(i0 + 1, frame.length - 1)
    const frac = pos - i0
    out[i] = frame[i0] * (1 - frac) + frame[i1] * frac
  }
  return out
}

const WINDOW_SEC = 8
const HOP_SEC = 6
const WINDOW_SAMPLES = WINDOW_SEC * SAMPLE_RATE
const HOP_SAMPLES = HOP_SEC * SAMPLE_RATE

/** Requests mic permission (if not already granted) and lists input devices
 *  with real labels. Labels are empty strings before permission is granted —
 *  callers should call this once interactively before showing a picker. */
export async function listAudioInputDevices(): Promise<MediaDeviceInfo[]> {
  try {
    const probe = await navigator.mediaDevices.getUserMedia({ audio: true })
    probe.getTracks().forEach((t) => t.stop())
  } catch {
    // Permission denied or no device — enumerateDevices() below still works,
    // just without labels; the caller's UI should surface the denial itself.
  }
  const devices = await navigator.mediaDevices.enumerateDevices()
  return devices.filter((d) => d.kind === 'audioinput')
}

export class AudioCapture {
  private stream: MediaStream | null = null
  private audioContext: AudioContext | null = null
  private workletNode: AudioWorkletNode | null = null
  private sourceNode: MediaStreamAudioSourceNode | null = null

  private buffer: Float32Array[] = []
  private bufferedSamples = 0
  private windowStartVideoTime = 0
  private getVideoTime: () => number = () => 0
  private getRate: () => number = () => 1
  private onChunk: ChunkHandler = () => {}
  // Rate the AudioContext actually runs at — 16kHz on success, or the
  // hardware-native rate (usually 48kHz) if Firefox rejected the 16kHz
  // request, in which case onFrame downsamples to 16kHz itself.
  private contextRate = SAMPLE_RATE

  /** Fired once after several consecutive silent windows — the classic
   *  symptom of the virtual cable receiving no routed audio (Firefox's
   *  output still going to the real speakers). Reset by any voiced window. */
  onSilentStretch: (() => void) | null = null
  private silentWindows = 0
  private silenceWarned = false

  get active(): boolean {
    return this.stream != null
  }

  async start(
    deviceId: string,
    onChunk: ChunkHandler,
    getVideoTime: () => number,
    getRate: () => number = () => 1,
  ): Promise<CaptureStartResult> {
    if (this.active) return 'ok'
    this.onChunk = onChunk
    this.getVideoTime = getVideoTime
    this.getRate = getRate

    let stream: MediaStream
    try {
      console.log('[znam ASR] getUserMedia deviceId=', deviceId || '(default)')
      stream = await navigator.mediaDevices.getUserMedia({
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
        video: false,
      })
    } catch (err: any) {
      console.error('[znam ASR] getUserMedia failed:', err?.name, err)
      if (err?.name === 'NotAllowedError') return 'denied'
      if (err?.name === 'NotFoundError' || err?.name === 'OverconstrainedError') return 'no-device'
      return 'error'
    }

    if (stream.getAudioTracks().length === 0) {
      stream.getTracks().forEach((t) => t.stop())
      console.error('[znam ASR] stream has no audio tracks')
      return 'no-device'
    }

    this.stream = stream
    stream.getAudioTracks()[0].addEventListener('ended', () => this.stop())

    // AudioContext at an arbitrary 16kHz was the shakiest, never-verified step
    // in Firefox. If the browser refuses that rate, fall back to the native
    // rate and downsample each frame to 16kHz in onFrame.
    let audioContext: AudioContext
    try {
      audioContext = new AudioContext({ sampleRate: SAMPLE_RATE })
      console.log('[znam ASR] AudioContext sampleRate=', audioContext.sampleRate)
    } catch (err) {
      console.warn('[znam ASR] AudioContext(16k) rejected, retrying at native rate:', err)
      try {
        audioContext = new AudioContext()
        console.log('[znam ASR] fallback AudioContext sampleRate=', audioContext.sampleRate)
      } catch (err2) {
        console.error('[znam ASR] AudioContext creation failed entirely:', err2)
        this.stop()
        return 'error'
      }
    }
    this.contextRate = audioContext.sampleRate

    try {
      // WXT's typed PublicPath only lists known files, not this dynamic path
      await audioContext.audioWorklet.addModule(browser.runtime.getURL('/asr/pcm-worklet.js' as any))
      const source = audioContext.createMediaStreamSource(stream)
      const worklet = new AudioWorkletNode(audioContext, 'pcm-capture', {
        numberOfInputs: 1,
        numberOfOutputs: 0,
      })
      worklet.port.onmessage = (e: MessageEvent<Float32Array>) => this.onFrame(e.data)
      source.connect(worklet)

      this.audioContext = audioContext
      this.sourceNode = source
      this.workletNode = worklet
      this.buffer = []
      this.bufferedSamples = 0
      this.windowStartVideoTime = getVideoTime()
      console.log('[znam ASR] capture graph ready @', this.contextRate, 'Hz')
      return 'ok'
    } catch (err) {
      console.error('[znam ASR] audio graph setup failed:', err)
      this.stop()
      return 'error'
    }
  }

  private onFrame(frame: Float32Array): void {
    // Downsample to 16kHz if the context is running at the native rate.
    // Cheap linear decimation is plenty for speech ASR.
    if (this.contextRate !== SAMPLE_RATE) frame = downsample(frame, this.contextRate, SAMPLE_RATE)
    this.buffer.push(frame)
    this.bufferedSamples += frame.length
    while (this.bufferedSamples >= WINDOW_SAMPLES) this.emitWindow()
  }

  private emitWindow(): void {
    const flat = new Float32Array(this.bufferedSamples)
    let offset = 0
    for (const f of this.buffer) {
      flat.set(f, offset)
      offset += f.length
    }

    // Cheap VAD: skip windows that are essentially silent — Netflix has long
    // stretches of music/silence, and every skipped window is several seconds
    // of Whisper inference saved. RMS over the window; 0.0015 is well below
    // any spoken dialogue but above line noise.
    const win = flat.slice(0, WINDOW_SAMPLES)
    let sumSq = 0
    for (let i = 0; i < win.length; i++) sumSq += win[i] * win[i]
    const rms = Math.sqrt(sumSq / win.length)
    if (rms >= 0.0015) {
      this.silentWindows = 0
      this.silenceWarned = false
      this.onChunk(win, this.windowStartVideoTime, this.getRate())
    } else {
      console.log('[znam ASR] skipping silent window (rms', rms.toFixed(5) + ')')
      this.silentWindows++
      if (this.silentWindows >= 3 && !this.silenceWarned) {
        this.silenceWarned = true
        this.onSilentStretch?.()
      }
    }

    // Keep the trailing overlap so the next window starts 2s before this one
    // ended, so words split across a boundary still appear whole somewhere.
    const remainder = flat.slice(HOP_SAMPLES)
    this.buffer = remainder.length > 0 ? [remainder] : []
    this.bufferedSamples = remainder.length

    // Resync against the real video clock each window rather than only
    // extrapolating forward — keeps drift bounded across pause/seek/buffering.
    // Buffered audio-seconds × playbackRate = video-seconds they represent.
    this.windowStartVideoTime = this.getVideoTime() - (this.bufferedSamples / SAMPLE_RATE) * this.getRate()
  }

  /** Tears down the audio graph and stops every track. */
  stop(): void {
    try { this.workletNode?.port.close() } catch {}
    this.workletNode?.disconnect()
    this.sourceNode?.disconnect()
    this.audioContext?.close().catch(() => {})
    this.stream?.getTracks().forEach((t) => t.stop())
    this.workletNode = null
    this.sourceNode = null
    this.audioContext = null
    this.stream = null
    this.buffer = []
    this.bufferedSamples = 0
  }
}

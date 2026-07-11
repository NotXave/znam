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

export type ChunkHandler = (pcm: Float32Array, startTime: number) => void
export type CaptureStartResult = 'ok' | 'denied' | 'no-device' | 'error'

const SAMPLE_RATE = 16000
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
  private onChunk: ChunkHandler = () => {}

  get active(): boolean {
    return this.stream != null
  }

  async start(deviceId: string, onChunk: ChunkHandler, getVideoTime: () => number): Promise<CaptureStartResult> {
    if (this.active) return 'ok'
    this.onChunk = onChunk
    this.getVideoTime = getVideoTime

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
        video: false,
      })
    } catch (err: any) {
      if (err?.name === 'NotAllowedError') return 'denied'
      if (err?.name === 'NotFoundError' || err?.name === 'OverconstrainedError') return 'no-device'
      console.error('[znam] getUserMedia failed:', err)
      return 'error'
    }

    if (stream.getAudioTracks().length === 0) {
      stream.getTracks().forEach((t) => t.stop())
      return 'no-device'
    }

    this.stream = stream
    stream.getAudioTracks()[0].addEventListener('ended', () => this.stop())

    try {
      const audioContext = new AudioContext({ sampleRate: SAMPLE_RATE })
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
      return 'ok'
    } catch (err) {
      console.error('[znam] audio graph setup failed:', err)
      this.stop()
      return 'error'
    }
  }

  private onFrame(frame: Float32Array): void {
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

    this.onChunk(flat.slice(0, WINDOW_SAMPLES), this.windowStartVideoTime)

    // Keep the trailing overlap so the next window starts 2s before this one
    // ended, so words split across a boundary still appear whole somewhere.
    const remainder = flat.slice(HOP_SAMPLES)
    this.buffer = remainder.length > 0 ? [remainder] : []
    this.bufferedSamples = remainder.length

    // Resync against the real video clock each window rather than only
    // extrapolating forward — keeps drift bounded across pause/seek/buffering.
    this.windowStartVideoTime = this.getVideoTime() - this.bufferedSamples / SAMPLE_RATE
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

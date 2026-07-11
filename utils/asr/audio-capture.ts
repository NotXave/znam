// Captures Netflix's actual audio output (not the DRM-protected <video>
// stream, which captureStream() cannot touch) via getDisplayMedia — the
// browser's tab-share picker, requiring a real per-session user gesture.
// Slices the resulting PCM into overlapping windows for the ASR pipeline.

export type ChunkHandler = (pcm: Float32Array, startTime: number) => void
export type CaptureStartResult = 'ok' | 'denied' | 'no-audio' | 'error'

const SAMPLE_RATE = 16000
const WINDOW_SEC = 8
const HOP_SEC = 6
const WINDOW_SAMPLES = WINDOW_SEC * SAMPLE_RATE
const HOP_SAMPLES = HOP_SEC * SAMPLE_RATE

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

  async start(onChunk: ChunkHandler, getVideoTime: () => number): Promise<CaptureStartResult> {
    if (this.active) return 'ok'
    this.onChunk = onChunk
    this.getVideoTime = getVideoTime

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
    } catch (err: any) {
      if (err?.name === 'NotAllowedError') return 'denied'
      console.error('[znam] getDisplayMedia failed:', err)
      return 'error'
    }

    // Video is only requested because Firefox otherwise won't offer a "Share
    // tab audio" checkbox — discard it immediately, only audio is needed.
    for (const track of stream.getVideoTracks()) track.stop()

    if (stream.getAudioTracks().length === 0) {
      for (const track of stream.getTracks()) track.stop()
      return 'no-audio'
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

  /** Tears down the audio graph and stops every track — required for
   *  Firefox's "this tab is being shared" indicator to clear. */
  stop(): void {
    try { this.workletNode?.port.close() } catch {}
    this.workletNode?.disconnect()
    this.sourceNode?.disconnect()
    this.audioContext?.close().catch(() => {})
    this.stream?.getTracks().forEach(t => t.stop())
    this.workletNode = null
    this.sourceNode = null
    this.audioContext = null
    this.stream = null
    this.buffer = []
    this.bufferedSamples = 0
  }
}

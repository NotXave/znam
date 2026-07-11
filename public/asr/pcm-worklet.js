// Runs on the audio render thread. Forwards raw mono Float32 PCM frames
// (128 samples/callback, per the Web Audio spec) back to the main thread —
// the main-thread ring buffer in utils/asr/audio-capture.ts does the
// windowing/slicing since AudioWorkletGlobalScope has no timers.
class PcmCapture extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0]?.[0]
    if (channel && channel.length > 0) {
      // Copy — the underlying buffer is reused by the audio thread.
      this.port.postMessage(channel.slice())
    }
    return true
  }
}
registerProcessor('pcm-capture', PcmCapture)

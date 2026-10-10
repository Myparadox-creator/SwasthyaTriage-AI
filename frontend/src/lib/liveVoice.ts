/**
 * Realtime voice client for the Gemini Live WebSocket endpoint.
 *
 * Streams microphone audio as 16 kHz mono PCM16 to
 * `/api/cases/{caseId}/voice/sessions/{sid}/live` and plays the 24 kHz PCM16
 * audio that the server streams back. Also surfaces live transcription of both
 * sides. This is a true full-duplex path — no browser speech synthesis and no
 * turn-by-turn request/response.
 */

export type LiveStatus =
  | 'connecting'
  | 'ready'
  | 'listening'
  | 'speaking'
  | 'closed'
  | 'error'

export interface LiveVoiceEvents {
  onStatus?: (status: LiveStatus) => void
  onInputTranscript?: (fragment: string) => void
  onOutputTranscript?: (fragment: string) => void
  onTurnComplete?: () => void
  onError?: (message: string) => void
}

export interface LiveVoiceController {
  end: () => void
  stop: () => void
  readonly status: LiveStatus
}

/** Linear-interpolating Float32 -> 16 kHz PCM16 downsampler. */
class DownsamplerPcm16 {
  private ratio: number
  private pending: number[] = []

  constructor(inputRate: number) {
    this.ratio = Math.max(1, inputRate / 16000)
  }

  feed(input: Float32Array): Int16Array {
    const buf = this.pending
    for (let i = 0; i < input.length; i++) buf.push(input[i])
    const usable = Math.floor((buf.length - 1) / this.ratio)
    const out = new Int16Array(Math.max(0, usable))
    for (let i = 0; i < out.length; i++) {
      const pos = i * this.ratio
      const i0 = Math.floor(pos)
      const frac = pos - i0
      const s0 = buf[i0]
      const s1 = buf[i0 + 1] ?? s0
      const s = s0 + (s1 - s0) * frac
      const v = Math.max(-1, Math.min(1, s))
      out[i] = v < 0 ? v * 0x8000 : v * 0x7fff
    }
    const keepFrom = out.length > 0 ? Math.floor((out.length - 1) * this.ratio) + 1 : 0
    this.pending = buf.slice(keepFrom)
    return out
  }
}

function wsUrl(caseId: number, sid: string, token: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const query = token ? `?token=${encodeURIComponent(token)}` : ''
  return `${proto}//${window.location.host}/api/cases/${caseId}/voice/sessions/${sid}/live${query}`
}

export function startLiveVoice(
  opts: { caseId: number; sessionId: string; token: string },
  events: LiveVoiceEvents = {}
): LiveVoiceController {
  let status: LiveStatus = 'connecting'
  const setStatus = (next: LiveStatus) => {
    status = next
    events.onStatus?.(next)
  }

  const ws = new WebSocket(wsUrl(opts.caseId, opts.sessionId, opts.token))
  ws.binaryType = 'arraybuffer'

  let captureCtx: AudioContext | null = null
  let playbackCtx: AudioContext | null = null
  let mediaStream: MediaStream | null = null
  let processor: ScriptProcessorNode | null = null
  let muteGain: GainNode | null = null
  let downsampler: DownsamplerPcm16 | null = null
  let nextPlayTime = 0
  const liveSources = new Set<AudioBufferSourceNode>()
  let closed = false
  let serverClosed = false

  const stopPlayback = () => {
    for (const src of liveSources) {
      try {
        src.stop()
      } catch {
        /* already stopped */
      }
    }
    liveSources.clear()
    nextPlayTime = 0
  }

  const playPcm = (data: ArrayBuffer) => {
    if (!playbackCtx) return
    const samples = new Int16Array(data)
    if (!samples.length) return
    const floats = new Float32Array(samples.length)
    for (let i = 0; i < samples.length; i++) floats[i] = samples[i] / 0x8000
    const buffer = playbackCtx.createBuffer(1, floats.length, 24000)
    buffer.copyToChannel(floats, 0)
    const src = playbackCtx.createBufferSource()
    src.buffer = buffer
    src.connect(playbackCtx.destination)
    const now = playbackCtx.currentTime
    const startAt = Math.max(now, nextPlayTime)
    src.start(startAt)
    nextPlayTime = startAt + buffer.duration
    liveSources.add(src)
    src.onended = () => liveSources.delete(src)
    setStatus('speaking')
  }

  const teardownAudio = async () => {
    stopPlayback()
    if (processor) {
      processor.onaudioprocess = null
      try {
        processor.disconnect()
      } catch {
        /* noop */
      }
      processor = null
    }
    try {
      muteGain?.disconnect()
    } catch {
      /* noop */
    }
    muteGain = null
    mediaStream?.getTracks().forEach((t) => t.stop())
    mediaStream = null
    if (captureCtx && captureCtx.state !== 'closed') await captureCtx.close().catch(() => {})
    captureCtx = null
    if (playbackCtx && playbackCtx.state !== 'closed') await playbackCtx.close().catch(() => {})
    playbackCtx = null
  }

  const setupAudio = async () => {
    const AudioCtx =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    captureCtx = new AudioCtx()
    playbackCtx = new AudioCtx()
    await captureCtx.resume().catch(() => {})
    await playbackCtx.resume().catch(() => {})

    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    })
    const source = captureCtx.createMediaStreamSource(mediaStream)
    downsampler = new DownsamplerPcm16(captureCtx.sampleRate)
    processor = captureCtx.createScriptProcessor(4096, 1, 1)
    processor.onaudioprocess = (event) => {
      if (ws.readyState !== WebSocket.OPEN || !downsampler) return
      const input = event.inputBuffer.getChannelData(0)
      const pcm = downsampler.feed(new Float32Array(input))
      if (pcm.length) ws.send(pcm.buffer as ArrayBuffer)
    }
    muteGain = captureCtx.createGain()
    muteGain.gain.value = 0
    source.connect(processor)
    processor.connect(muteGain)
    muteGain.connect(captureCtx.destination)
  }

  ws.onopen = () => {
    setStatus('connecting')
  }

  ws.onmessage = (event) => {
    if (typeof event.data === 'string') {
      let msg: { type?: string; text?: string; error?: string }
      try {
        msg = JSON.parse(event.data)
      } catch {
        return
      }
      switch (msg.type) {
        case 'ready':
          void setupAudio()
            .then(() => setStatus('listening'))
            .catch((err) => {
              setStatus('error')
              events.onError?.(
                'Microphone access is required for realtime voice. ' +
                  (err instanceof Error ? err.message : 'Please allow mic access and retry.')
              )
            })
          break
        case 'input':
          if (msg.text) events.onInputTranscript?.(msg.text)
          break
        case 'output':
          if (msg.text) events.onOutputTranscript?.(msg.text)
          break
        case 'interrupted':
          stopPlayback()
          break
        case 'turn_complete':
          setStatus('listening')
          events.onTurnComplete?.()
          break
        case 'error':
          setStatus('error')
          events.onError?.(
            msg.error === 'live_unavailable'
              ? 'Realtime voice is not configured on the server.'
              : msg.error === 'live_session_ended'
              ? 'The realtime call ended early. You can retry, or continue with turn-based voice.'
              : `Realtime voice error: ${msg.error || 'unknown'}`
          )
          break
        case 'closed':
          serverClosed = true
          setStatus('closed')
          break
        default:
          break
      }
      return
    }
    if (event.data instanceof ArrayBuffer) playPcm(event.data)
  }

  ws.onerror = () => {
    if (!closed) {
      setStatus('error')
      events.onError?.('Realtime voice connection error.')
    }
  }

  ws.onclose = () => {
    if (!closed) {
      if (serverClosed) {
        setStatus('closed')
      } else {
        setStatus('error')
        events.onError?.('Realtime voice connection closed unexpectedly. Please try again.')
      }
    }
    void teardownAudio()
  }

  const shutdown = () => {
    if (closed) return
    closed = true
    try {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'close' }))
      ws.close()
    } catch {
      /* noop */
    }
    void teardownAudio()
    setStatus('closed')
  }

  return {
    end: shutdown,
    stop: shutdown,
    get status() {
      return status
    },
  }
}

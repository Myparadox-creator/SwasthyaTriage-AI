import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  HeartPulse,
  Languages,
  Loader2,
  Mic,
  PhoneOff,
  Radio,
  Send,
  Volume2,
  Zap,
} from 'lucide-react'
import { api, getAccessToken } from '../../../lib/api'
import type { CaseDetail, VoiceSessionOut, VoiceTurnResponse } from '../../../lib/types'

type VoiceState =
  | 'IDLE'
  | 'CONNECTING'
  | 'LISTENING'
  | 'PROCESSING'
  | 'SPEAKING'
  | 'ERROR'
  | 'COMPLETED'

interface ExtractedData {
  symptoms: string[]
  duration: string | null
  measurements: string[]
  language: string
}

export interface TurnDiagnostics {
  turnIndex: number
  patientSpeechEnd: number
  sttCompletion: number
  llmFirstToken: number
  ttsFirstAudioChunk: number
  assistantFirstPlayback: number
  sttLatencyMs: number
  llmLatencyMs: number
  ttsLatencyMs: number
  totalResponseStartMs: number
  targetMet: boolean
  provider: string
  isEmergency: boolean
}

export default function PatientVoiceAssessment() {
  const navigate = useNavigate()
  const [lang, setLang] = useState<'en' | 'hi' | 'od'>('hi')
  const [voiceState, setVoiceState] = useState<VoiceState>('IDLE')
  const voiceStateRef = useRef<VoiceState>('IDLE')
  const applyVoiceState = (next: VoiceState) => {
    voiceStateRef.current = next
    setVoiceState(next)
  }
  const [caseDetail, setCaseDetail] = useState<CaseDetail | null>(null)
  const [voiceSession, setVoiceSession] = useState<VoiceSessionOut | null>(null)
  const [currentPrompt, setCurrentPrompt] = useState<string>(
    'Namaste. I will ask you a few questions about your current health concern. Your answers will be summarized for review by a healthcare professional.'
  )
  const [patientTranscript, setPatientTranscript] = useState<string>('')
  const [extracted, setExtracted] = useState<ExtractedData>({
    symptoms: [],
    duration: null,
    measurements: [],
    language: 'hi',
  })
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isEmergency, setIsEmergency] = useState<boolean>(false)

  // Real-time Latency Diagnostics State
  const [diagnosticsHistory, setDiagnosticsHistory] = useState<TurnDiagnostics[]>([])
  const [showDiagnostics, setShowDiagnostics] = useState<boolean>(true)
  const turnCounterRef = useRef<number>(0)

  // Microphone capture, AudioContext & VAD refs (MediaRecorder + server-side Gemini STT)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const vadIntervalRef = useRef<number | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recorderMimeRef = useRef<string>('')
  const hasSpeechRef = useRef(false)
  const lastVoiceAtRef = useRef(0)
  const shouldSubmitOnStopRef = useRef(false)
  const isListeningRef = useRef(false)
  const manualStopRef = useRef(false)
  const lastTranscriptRef = useRef<string>('')

  // Sentence-queue streaming TTS engine. Sentences are appended as the LLM
  // streams; each is spoken in order and, once the turn is closed and the queue
  // drains, the done callback fires (used for auto-submit or reopening the mic).
  const ttsGenerationRef = useRef(0)
  const ttsQueueRef = useRef<string[]>([])
  const ttsActiveRef = useRef(false)
  const ttsFirstCbRef = useRef<((ts: number) => void) | null>(null)
  const ttsDoneCbRef = useRef<(() => void) | null>(null)
  const ttsFirstFiredRef = useRef(false)
  const ttsClosedRef = useRef(true)
  const ttsResumeHackRef = useRef<number | null>(null)
  const ttsServerSrcRef = useRef<AudioBufferSourceNode | null>(null)
  const ttsAudioCtxRef = useRef<AudioContext | null>(null)
  const ttsServerDisabledRef = useRef(false)
  const caseIdRef = useRef<number | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const pendingAutoSubmitRef = useRef(false)
  const speechEndTimestampRef = useRef<number>(0)
  const [micLevel, setMicLevel] = useState(0)

  // Silence threshold for natural end-of-turn detection (1.3 seconds)
  const SILENCE_THRESHOLD_MS = 1300
  const SPEECH_RMS_THRESHOLD = 0.02

  const teardownListening = () => {
    shouldSubmitOnStopRef.current = false
    if (vadIntervalRef.current) {
      clearInterval(vadIntervalRef.current)
      vadIntervalRef.current = null
    }
    isListeningRef.current = false
    setMicLevel(0)
    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }
    } catch {}
    mediaRecorderRef.current = null
  }

  // Keep the current case/session ids available to the TTS engine.
  useEffect(() => {
    caseIdRef.current = caseDetail?.id ?? null
  }, [caseDetail])
  useEffect(() => {
    sessionIdRef.current = voiceSession?.public_id ?? null
  }, [voiceSession])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      manualStopRef.current = true
      teardownListening()
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop())
      mediaStreamRef.current = null
      audioContextRef.current?.close().catch(() => {})
      audioContextRef.current = null
      try {
        ttsServerSrcRef.current?.stop()
      } catch {}
      ttsServerSrcRef.current = null
      ttsAudioCtxRef.current?.close().catch(() => {})
      ttsAudioCtxRef.current = null
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel()
      }
    }
  }, [])

  // Calculate session percentiles
  const latencies = diagnosticsHistory.map((d) => d.totalResponseStartMs)
  const p50 = latencies.length
    ? [...latencies].sort((a, b) => a - b)[Math.floor(latencies.length * 0.5)]
    : 0
  const p95 = latencies.length
    ? [...latencies].sort((a, b) => a - b)[
        Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))
      ]
    : 0
  const p99 = latencies.length
    ? [...latencies].sort((a, b) => a - b)[
        Math.min(latencies.length - 1, Math.floor(latencies.length * 0.99))
      ]
    : 0
  const targetCompliance = latencies.length
    ? Math.round(
        (diagnosticsHistory.filter((d) => d.totalResponseStartMs <= 5000).length /
          latencies.length) *
          100
      )
    : 100

  const pickTtsVoice = (): SpeechSynthesisVoice | null => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return null
    const voices = window.speechSynthesis.getVoices()
    if (!voices.length) return null
    const prefixes = lang === 'od' ? ['or', 'hi'] : lang === 'hi' ? ['hi'] : ['en-in', 'en']
    for (const p of prefixes) {
      const match = voices.find(
        (v) => v.lang && v.lang.toLowerCase().replace('_', '-').startsWith(p)
      )
      if (match) return match
    }
    return null
  }

  // Natural sentence boundary splitting (. ! ? । |)
  const splitSentences = (text: string): string[] => {
    const rawChunks = text
      .split(/(?<=[.!?।|])\s+/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (rawChunks.length > 0) return rawChunks
    return text.trim() ? [text.trim()] : []
  }

  const clearResumeHack = () => {
    if (ttsResumeHackRef.current) {
      window.clearInterval(ttsResumeHackRef.current)
      ttsResumeHackRef.current = null
    }
  }

  // Cancels any queued/active speech and invalidates in-flight callbacks.
  const cancelTts = () => {
    ttsGenerationRef.current += 1
    ttsQueueRef.current = []
    ttsActiveRef.current = false
    ttsClosedRef.current = true
    ttsFirstCbRef.current = null
    ttsDoneCbRef.current = null
    ttsFirstFiredRef.current = false
    clearResumeHack()
    try {
      ttsServerSrcRef.current?.stop()
    } catch {}
    ttsServerSrcRef.current = null
    try {
      window.speechSynthesis?.cancel()
    } catch {}
  }

  const finishTts = (generation: number, done: (() => void) | null) => {
    if (ttsGenerationRef.current !== generation) return
    clearResumeHack()
    ttsActiveRef.current = false
    ttsFirstCbRef.current = null
    if (done) done()
  }

  // Server-side TTS (Gemini). Returns true when it played a sentence; the
  // caller falls back to the browser voice on false so audio never goes silent.
  const speakSentenceServer = async (
    sentence: string,
    generation: number,
    onStart: (ts: number) => void,
    advance: () => void
  ): Promise<boolean> => {
    const cid = caseIdRef.current
    const sid = sessionIdRef.current
    if (ttsServerDisabledRef.current || cid == null || sid == null) return false
    try {
      const token = getAccessToken()
      const res = await fetch(`/api/cases/${cid}/voice/sessions/${sid}/speak`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ text: sentence, language: lang }),
      })
      if (!res.ok) {
        if (res.status === 503) ttsServerDisabledRef.current = true
        return false
      }
      const buf = await res.arrayBuffer()
      if (ttsGenerationRef.current !== generation) return true
      if (!buf.byteLength) return false

      const ctx = (ttsAudioCtxRef.current ??= new AudioContext())
      if (ctx.state === 'suspended') {
        try {
          await ctx.resume()
        } catch {}
      }
      const i16 = new Int16Array(buf)
      const f32 = new Float32Array(i16.length)
      for (let i = 0; i < i16.length; i++) f32[i] = i16[i] / 32768
      const audioBuf = ctx.createBuffer(1, f32.length, 24000)
      audioBuf.copyToChannel(f32, 0)
      const src = ctx.createBufferSource()
      src.buffer = audioBuf
      src.connect(ctx.destination)
      src.onended = () => {
        if (ttsServerSrcRef.current === src) ttsServerSrcRef.current = null
        if (ttsGenerationRef.current === generation) advance()
      }
      if (!ttsFirstFiredRef.current) {
        ttsFirstFiredRef.current = true
        onStart(Date.now())
      }
      ttsServerSrcRef.current = src
      src.start()
      return true
    } catch {
      return false
    }
  }

  // Browser SpeechSynthesis fallback for one sentence.
  const speakSentenceBrowser = (
    sentence: string,
    generation: number,
    onStart: (ts: number) => void,
    advance: () => void
  ) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      onStart(Date.now())
      window.setTimeout(advance, 400)
      return
    }
    const chosenVoice = pickTtsVoice()
    const utterance = new SpeechSynthesisUtterance(sentence)
    utterance.lang = lang === 'en' ? 'en-IN' : 'hi-IN'
    utterance.rate = 1.0
    if (chosenVoice) utterance.voice = chosenVoice

    utterance.onstart = () => {
      if (ttsGenerationRef.current !== generation) return
      if (!ttsFirstFiredRef.current) {
        ttsFirstFiredRef.current = true
        onStart(Date.now())
      }
    }
    utterance.onend = advance
    utterance.onerror = advance

    try {
      window.speechSynthesis.speak(utterance)
    } catch {
      advance()
    }
  }

  const speakNextQueued = (generation: number) => {
    if (ttsGenerationRef.current !== generation) return
    if (!ttsQueueRef.current.length) {
      ttsActiveRef.current = false
      if (ttsClosedRef.current) {
        const done = ttsDoneCbRef.current
        ttsDoneCbRef.current = null
        finishTts(generation, done)
      }
      return
    }

    const sentence = ttsQueueRef.current.shift() as string
    ttsActiveRef.current = true
    const onStart = (ts: number) => ttsFirstCbRef.current?.(ts)
    const advance = () => {
      if (ttsGenerationRef.current !== generation) return
      speakNextQueued(generation)
    }

    // Prefer server-side TTS; transparently fall back to the browser voice.
    void speakSentenceServer(sentence, generation, onStart, advance).then((played) => {
      if (played) return
      if (ttsGenerationRef.current !== generation) return
      speakSentenceBrowser(sentence, generation, onStart, advance)
    })
  }

  // Appends a chunk of assistant text to the current turn's speech queue.
  const enqueueSpeech = (text: string) => {
    const pieces = splitSentences(text)
    if (!pieces.length) return
    ttsQueueRef.current.push(...pieces)
    if (!ttsActiveRef.current) speakNextQueued(ttsGenerationRef.current)
  }

  // Starts speaking a new turn; onFirst fires on first audible playback (used to
  // reopen the mic for barge-in), onDone fires once the queue has fully drained.
  const beginTurnSpeech = (
    firstText: string,
    onFirstPlaybackStart?: (timestamp: number) => void,
    onDone?: () => void
  ) => {
    cancelTts()
    ttsClosedRef.current = false
    ttsFirstFiredRef.current = false
    ttsFirstCbRef.current = onFirstPlaybackStart || null
    ttsDoneCbRef.current = onDone || null
    applyVoiceState('SPEAKING')

    if (typeof window !== 'undefined' && window.speechSynthesis) {
      // Chrome keeps utterances alive too long without a periodic resume() kick
      ttsResumeHackRef.current = window.setInterval(() => {
        try {
          if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
            window.speechSynthesis.resume()
          }
        } catch {}
      }, 8000)
    }

    enqueueSpeech(firstText)
  }

  // Marks the turn's text stream as complete; fires onDone once audio drains.
  const endTurnSpeech = (extraText?: string) => {
    if (extraText) enqueueSpeech(extraText)
    ttsClosedRef.current = true
    if (!ttsActiveRef.current) {
      const done = ttsDoneCbRef.current
      ttsDoneCbRef.current = null
      finishTts(ttsGenerationRef.current, done)
    }
  }

  // Initialize Case and Voice Session on Mount
  const startSession = async () => {
    applyVoiceState('CONNECTING')
    setErrorMsg(null)
    setIsEmergency(false)
    try {
      // 1. Create a draft case with consent
      const newCase = await api<CaseDetail>('/api/cases', {
        method: 'POST',
        body: {
          language: lang,
          chief_concern: null,
          consent_accepted: true,
          consent_text_version: 'v1_voice',
        },
      })
      setCaseDetail(newCase)

      // 2. Create in-app voice session
      const session = await api<VoiceSessionOut>(`/api/cases/${newCase.id}/voice/sessions`, {
        method: 'POST',
        body: { language: lang },
      })
      setVoiceSession(session)

      const initialGreeting =
        lang === 'hi'
          ? 'नमस्ते! मैं सोनम हूँ, स्वास्थ्यफ्लो एआई की एआई हेल्थ असिस्टेंट। आपको किस हेल्थ प्रॉब्लम में मदद चाहिए?'
          : lang === 'od'
          ? 'ନମସ୍କାର! ମୁଁ ସୋନମ, ସ୍ୱାସ୍ଥ୍ୟଫ୍ଲୋ ଏଆଇର ଏଆଇ ସ୍ୱାସ୍ଥ୍ୟ ସହାୟିକା। ଆପଣଙ୍କୁ କେଉଁ ସ୍ୱାସ୍ଥ୍ୟ ସମସ୍ୟାରେ ସାହାଯ୍ୟ ଦରକାର?'
          : 'Namaste! I am Sonam, an AI health intake assistant for SwasthyaFlow AI. What health concern do you need help with today?'

      setCurrentPrompt(initialGreeting)
      beginTurnSpeech(initialGreeting, () => void startListening(), () => {
        if (voiceStateRef.current === 'SPEAKING') applyVoiceState('LISTENING')
      })
      // Open the mic immediately so the patient can barge in during the greeting
      void startListening()
    } catch (err) {
      applyVoiceState('ERROR')
      setErrorMsg(err instanceof Error ? err.message : 'Could not initialize voice agent')
    }
  }

  const blobToBase64 = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => {
        const result = String(reader.result || '')
        resolve(result.includes(',') ? result.split(',')[1] : '')
      }
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })

  const pickRecorderMime = () => {
    if (typeof MediaRecorder === 'undefined') return ''
    for (const c of ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']) {
      if (MediaRecorder.isTypeSupported(c)) return c
    }
    return ''
  }

  // Microphone capture + RMS voice-activity detection.
  // Audio is uploaded to the backend, where Gemini transcribes it (works for
  // Hindi, Odia and English — unlike the browser-only Web Speech API).
  const startListening = async () => {
    if (manualStopRef.current || isListeningRef.current) return
    const state = voiceStateRef.current
    if (state === 'PROCESSING' || state === 'COMPLETED' || state === 'ERROR' || state === 'IDLE') {
      return
    }

    try {
      let stream = mediaStreamRef.current
      const trackEnded = !stream || stream.getTracks().every((t) => t.readyState === 'ended')
      if (trackEnded) {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        })
        mediaStreamRef.current = stream
      }
      if (!stream) throw new Error('no_microphone_stream')
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new AudioContext()
      }
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume()
      }
      const ctx = audioContextRef.current
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 1024
      source.connect(analyser)
      analyserRef.current = analyser

      if (!recorderMimeRef.current) recorderMimeRef.current = pickRecorderMime()
      const recorder = new MediaRecorder(
        stream,
        recorderMimeRef.current ? { mimeType: recorderMimeRef.current } : undefined
      )
      audioChunksRef.current = []
      hasSpeechRef.current = false
      lastVoiceAtRef.current = Date.now()
      shouldSubmitOnStopRef.current = false

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) audioChunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        const shouldSubmit = shouldSubmitOnStopRef.current
        const hadSpeech = hasSpeechRef.current
        const chunks = audioChunksRef.current
        const mime = recorderMimeRef.current || 'audio/webm'
        audioChunksRef.current = []
        if (!shouldSubmit || !hadSpeech || chunks.length === 0) return
        const blob = new Blob(chunks, { type: mime })
        if (blob.size < 200) return
        const speechEndTime = Date.now()
        speechEndTimestampRef.current = speechEndTime
        blobToBase64(blob)
          .then((b64) => {
            if (!b64) return
            handleSendTurn('', speechEndTime, { b64, mime: blob.type || mime })
          })
          .catch(() => {
            applyVoiceState('ERROR')
            setErrorMsg(
              'Could not process microphone audio. Please try again or type your response below.'
            )
          })
      }

      mediaRecorderRef.current = recorder
      recorder.start(250)
      isListeningRef.current = true
      // Keep the SPEAKING state while the assistant talks so patient barge-in
      // (detected by the VAD below) can cancel TTS; otherwise show LISTENING.
      if (voiceStateRef.current !== 'SPEAKING') applyVoiceState('LISTENING')

      const timeDomain = new Uint8Array(analyser.fftSize)
      vadIntervalRef.current = window.setInterval(() => {
        analyser.getByteTimeDomainData(timeDomain)
        let sum = 0
        for (let i = 0; i < timeDomain.length; i++) {
          const v = (timeDomain[i] - 128) / 128
          sum += v * v
        }
        const rms = Math.sqrt(sum / timeDomain.length)
        setMicLevel((prev) => prev * 0.55 + rms * 0.45)

        if (rms >= SPEECH_RMS_THRESHOLD) {
          if (!hasSpeechRef.current) hasSpeechRef.current = true
          lastVoiceAtRef.current = Date.now()
          // Patient barge-in: cut the assistant off the moment the user speaks
          if (voiceStateRef.current === 'SPEAKING') {
            cancelTts()
            applyVoiceState('LISTENING')
          }
        } else if (
          hasSpeechRef.current &&
          Date.now() - lastVoiceAtRef.current > SILENCE_THRESHOLD_MS
        ) {
          stopListening(true)
        }
      }, 80)
    } catch (err) {
      isListeningRef.current = false
      const name = err instanceof DOMException ? err.name : ''
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setErrorMsg(
          'Microphone access denied. Please allow microphone access in your browser settings, then press Resume Microphone.'
        )
      } else {
        setErrorMsg(
          'Could not open the microphone. Please check your input device, or type your response below.'
        )
      }
      applyVoiceState('ERROR')
    }
  }

  // Stops the recorder; when submit=true the captured audio is sent as a turn
  const stopListening = (submit: boolean) => {
    shouldSubmitOnStopRef.current = submit
    if (vadIntervalRef.current) {
      clearInterval(vadIntervalRef.current)
      vadIntervalRef.current = null
    }
    isListeningRef.current = false
    setMicLevel(0)
    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }
    } catch {}
    mediaRecorderRef.current = null
  }

  // Handle Turn with Real-Time Latency Tracking (text OR recorded audio)
  const handleSendTurn = async (
    userText: string,
    speechEndTime?: number,
    audio?: { b64: string; mime: string }
  ) => {
    if ((!userText && !audio) || !caseDetail || !voiceSession) return

    // Pause the mic while the turn is in flight
    stopListening(false)

    // 1. Record Speech-End and STT timestamps
    const tSpeechEnd = speechEndTime || speechEndTimestampRef.current || Date.now()
    const tSttDone = Date.now()
    applyVoiceState('PROCESSING')

    // 2. Safe brief acknowledgement if external service exceeds 1.8s
    let ackTimeout: any = null
    let acknowledged = false
    ackTimeout = setTimeout(() => {
      if (voiceStateRef.current === 'PROCESSING' && !acknowledged) {
        acknowledged = true
        const ackText =
          lang === 'hi'
            ? 'जी, मैं समझ रहा हूँ। कृपया एक पल दीजिए।'
            : lang === 'od'
            ? 'ହଁ, ମୁଁ ବୁଝିପାରୁଛି। ଦୟାକରି ଗୋଟିଏ ମୁହୂର୍ତ୍ତ ଅପେକ୍ଷା କରନ୍ତୁ।'
            : 'I understand. Please give me a moment.'
        setCurrentPrompt(ackText)
      }
    }, 1800)

    try {
      const token = getAccessToken()
      let turnRes: VoiceTurnResponse | null = null
      let tFirstToken = 0
      let tTtsPrep = 0

      // Stream turn using SSE for real-time sentence-by-sentence playback
      const turnBody = audio
        ? { audio_b64: audio.b64, audio_mime: audio.mime }
        : { text: userText }
      const response = await fetch(
        `/api/cases/${caseDetail.id}/voice/sessions/${voiceSession.public_id}/turns/stream`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(turnBody),
        }
      )

      if (ackTimeout) clearTimeout(ackTimeout)

      // Reopen the mic right after the assistant starts talking so the patient
      // can barge in; once the turn's audio drains, either auto-submit the case
      // to the doctor or simply resume listening.
      const reopenMic = () => void startListening()
      const finishTurn = () => {
        if (pendingAutoSubmitRef.current) {
          pendingAutoSubmitRef.current = false
          applyVoiceState('COMPLETED')
          stopListening(false)
          void handleSubmitDirectToDoctor()
        } else if (voiceStateRef.current === 'SPEAKING') {
          applyVoiceState('LISTENING')
        }
      }

      if (response.ok && response.body) {
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let streamDone = false
        let turnSpeechStarted = false
        let buffered = ''

        while (!streamDone) {
          const { done, value } = await reader.read()
          if (done) break
          buffered += decoder.decode(value, { stream: true })
          const lines = buffered.split('\n')
          buffered = lines.pop() ?? ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            try {
              const data = JSON.parse(line.slice(6))
              if (data.type === 'error') {
                setErrorMsg(data.error || 'Voice turn failed')
              } else if (data.type === 'sentence') {
                if (!turnSpeechStarted) {
                  turnSpeechStarted = true
                  tFirstToken = Date.now()
                  tTtsPrep = Date.now()

                  // Start TTS immediately on the first sentence!
                  beginTurnSpeech(
                    data.text,
                    (playbackStart) =>
                      recordTurnDiagnostics(
                        tSpeechEnd,
                        tSttDone,
                        tFirstToken,
                        tTtsPrep,
                        playbackStart,
                        data.provider || 'gemini',
                        false
                      ),
                    finishTurn
                  )
                  setCurrentPrompt(data.text)
                  reopenMic()
                } else {
                  // Queue every subsequent sentence, not just the first one
                  enqueueSpeech(data.text)
                  setCurrentPrompt((prev) =>
                    prev === data.text ? prev : `${prev} ${data.text}`
                  )
                }
              } else if (data.type === 'complete') {
                turnRes = data
                if (data.is_emergency) {
                  setIsEmergency(true)
                }
                if (data.transcript) {
                  lastTranscriptRef.current = data.transcript
                  setPatientTranscript(data.transcript)
                }
                if (data.can_submit || data.is_emergency) {
                  pendingAutoSubmitRef.current = true
                }
                if (!turnSpeechStarted) {
                  turnSpeechStarted = true
                  tFirstToken = Date.now()
                  tTtsPrep = Date.now()
                  beginTurnSpeech(
                    data.reply,
                    (playbackStart) =>
                      recordTurnDiagnostics(
                        tSpeechEnd,
                        tSttDone,
                        tFirstToken,
                        tTtsPrep,
                        playbackStart,
                        data.provider || 'gemini',
                        Boolean(data.is_emergency)
                      ),
                    finishTurn
                  )
                  setCurrentPrompt(data.reply)
                  reopenMic()
                } else {
                  endTurnSpeech()
                }
              }
            } catch {}
          }
        }
      }

      // Fallback to standard turn if streaming did not return complete
      if (!turnRes) {
        turnRes = await api<VoiceTurnResponse>(
          `/api/cases/${caseDetail.id}/voice/sessions/${voiceSession.public_id}/turns`,
          {
            method: 'POST',
            body: turnBody,
          }
        )
        if (turnRes.transcript) {
          lastTranscriptRef.current = turnRes.transcript
          setPatientTranscript(turnRes.transcript)
        }
        if (!tFirstToken) tFirstToken = Date.now()
        if (!tTtsPrep) tTtsPrep = Date.now()
        if (turnRes.can_submit) pendingAutoSubmitRef.current = true
        beginTurnSpeech(
          turnRes.reply,
          (playbackStart) =>
            recordTurnDiagnostics(
              tSpeechEnd,
              tSttDone,
              tFirstToken,
              tTtsPrep,
              playbackStart,
              turnRes?.provider || 'mock',
              false
            ),
          finishTurn
        )
        setCurrentPrompt(turnRes.reply)
        reopenMic()
      }

      // Update extracted clinical symptoms
      if (turnRes) {
        const answerText = (userText || turnRes.transcript || '').toLowerCase()
        setExtracted((prev) => {
          const symptoms = Array.from(
            new Set([...prev.symptoms, ...(turnRes?.added_symptoms || [])])
          )
          return {
            ...prev,
            symptoms,
            duration:
              answerText.includes('din') || answerText.includes('day') || answerText.includes('दिन')
                ? 'Reported'
                : prev.duration,
            measurements: turnRes?.added_measurement
              ? [...prev.measurements, 'Temperature']
              : prev.measurements,
          }
        })
      }
    } catch (err) {
      if (ackTimeout) clearTimeout(ackTimeout)
      applyVoiceState('ERROR')
      setErrorMsg(err instanceof Error ? err.message : 'Turn processing failed')
    }
  }

  // Record Telemetry Diagnostics for Turn
  const recordTurnDiagnostics = (
    speechEnd: number,
    sttDone: number,
    firstToken: number,
    ttsPrep: number,
    playbackStart: number,
    provider: string,
    emergencyFlag: boolean
  ) => {
    turnCounterRef.current += 1
    const sttLatencyMs = Math.max(0, sttDone - speechEnd)
    const llmLatencyMs = Math.max(0, firstToken - sttDone)
    const ttsLatencyMs = Math.max(0, playbackStart - firstToken)
    const totalMs = Math.max(0, playbackStart - speechEnd)

    const diag: TurnDiagnostics = {
      turnIndex: turnCounterRef.current,
      patientSpeechEnd: speechEnd,
      sttCompletion: sttDone,
      llmFirstToken: firstToken,
      ttsFirstAudioChunk: ttsPrep,
      assistantFirstPlayback: playbackStart,
      sttLatencyMs,
      llmLatencyMs,
      ttsLatencyMs,
      totalResponseStartMs: totalMs,
      targetMet: totalMs <= 5000,
      provider,
      isEmergency: emergencyFlag,
    }

    setDiagnosticsHistory((prev) => [diag, ...prev])
  }

  // Immediate "Stop & Send" manual trigger
  const handleImmediateSend = () => {
    if (isListeningRef.current) {
      stopListening(true)
      return
    }
    if (patientTranscript.trim() && voiceStateRef.current === 'LISTENING') {
      const speechEndTime = Date.now()
      speechEndTimestampRef.current = speechEndTime
      handleSendTurn(patientTranscript.trim(), speechEndTime)
    }
  }

  const resumeMicrophone = () => {
    setErrorMsg(null)
    applyVoiceState('LISTENING')
    void startListening()
  }

  const [submittingToDoctor, setSubmittingToDoctor] = useState(false)
  const [submittedToDoctor, setSubmittedToDoctor] = useState(false)
  const [submitResult, setSubmitResult] = useState<{ caseNumber: string; priority: string } | null>(null)

  const handleSubmitDirectToDoctor = async () => {
    if (!caseDetail) return
    setSubmittingToDoctor(true)
    setErrorMsg(null)
    try {
      stopListening(false)
      cancelTts()
      if (voiceSession) {
        try {
          await api(`/api/cases/${caseDetail.id}/voice/sessions/${voiceSession.public_id}/complete`, {
            method: 'POST',
          })
        } catch {}
      }

      const res = await api<{
        case_number: string
        status: string
        priority: string
        message: string
      }>(`/api/cases/${caseDetail.id}/submit`, { method: 'POST' })

      setSubmittedToDoctor(true)
      setSubmitResult({ caseNumber: res.case_number, priority: res.priority })

      const confirmSpeech =
        lang === 'hi'
          ? 'आपका केस सफलतापूर्वक डॉक्टर के पास भेज दिया गया है। डॉक्टर को नोटिफिकेशन मिल गया है।'
          : lang === 'od'
          ? 'ଆପଣଙ୍କ କେସ୍ ଡାକ୍ତରଙ୍କ ପାଖକୁ ପଠାଯାଇଛି। ଡାକ୍ତରଙ୍କୁ ସୂଚନା ମିଳିଛି।'
          : 'Your assessment has been successfully sent to the doctor. The clinical team has been notified.'
      beginTurnSpeech(confirmSpeech, undefined, () => {
        if (voiceStateRef.current === 'SPEAKING') applyVoiceState('COMPLETED')
      })
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to submit case to doctor')
    } finally {
      setSubmittingToDoctor(false)
    }
  }

  const handleEndConversation = async () => {
    manualStopRef.current = true
    stopListening(false)
    cancelTts()

    if (caseDetail) {
      try {
        await api(`/api/cases/${caseDetail.id}/voice/sessions/${voiceSession?.public_id}/complete`, {
          method: 'POST',
        })
      } catch {}
      navigate(`/app/patient/cases/${caseDetail.id}`)
    } else {
      navigate('/app/patient/dashboard')
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 sm:space-y-6">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => navigate('/app/patient/dashboard')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </button>

        <div className="flex items-center gap-2">
          <Languages className="h-4 w-4 text-teal-700" />
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value as any)}
            disabled={voiceState !== 'IDLE'}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            <option value="hi">हिन्दी (Hindi)</option>
            <option value="en">English</option>
            <option value="od">ଓଡ଼ିଆ (Odia)</option>
          </select>
        </div>
      </div>

      {/* Emergency Red Flag Notice Banner */}
      {isEmergency && (
        <div className="rounded-2xl border-2 border-red-500 bg-red-50 p-4 text-red-900 shadow-md animate-pulse">
          <div className="flex items-center gap-2 font-bold text-sm text-red-700 uppercase tracking-wide">
            <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
            🚨 Critical Red Flag Emergency Detected
          </div>
          <p className="mt-1 text-xs font-semibold text-red-800">
            Immediate emergency escalation active: Please dial <strong>108 / 112</strong> for an
            ambulance or visit the nearest hospital emergency department immediately. For mental
            health crisis support, call Tele-MANAS toll-free helpline at <strong>14416</strong>.
          </p>
        </div>
      )}

      {/* Main Voice Agent Card */}
      <div className="overflow-hidden rounded-3xl border border-teal-200 bg-white shadow-xl">
        {/* Header bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-teal-50/70 px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-700 text-white shadow-sm">
              <HeartPulse className="h-5 w-5 animate-pulse" />
            </span>
            <div className="min-w-0">
              <h1 className="text-base font-bold text-slate-900">Talk to Sonam — AI Health Intake</h1>
              <p className="truncate text-[11px] text-slate-500">Multilingual Clinical Triage · Direct Doctor Queue Delivery</p>
            </div>
          </div>

          {/* Voice State Badge */}
          <div className="flex shrink-0 items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold transition-colors ${
                voiceState === 'LISTENING'
                  ? 'bg-emerald-100 text-emerald-800 animate-pulse'
                  : voiceState === 'SPEAKING'
                  ? 'bg-blue-100 text-blue-800'
                  : voiceState === 'PROCESSING'
                  ? 'bg-amber-100 text-amber-800'
                  : voiceState === 'ERROR'
                  ? 'bg-red-100 text-red-800'
                  : voiceState === 'COMPLETED'
                  ? 'bg-teal-100 text-teal-800'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              <span className="h-2 w-2 rounded-full bg-current" />
              {voiceState}
            </span>
          </div>
        </div>

        {/* Center Animated Interactive Space */}
        <div className="flex flex-col items-center justify-center p-4 text-center sm:p-8 lg:p-12">
          {voiceState === 'IDLE' ? (
            <div className="max-w-md space-y-4">
              <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-teal-100 text-teal-700 shadow-md sm:h-20 sm:w-20">
                <Mic className="h-8 w-8 sm:h-10 sm:w-10" />
              </span>
              <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">
                Ready to speak with Sonam?
              </h2>
              <p className="text-xs text-slate-600 leading-relaxed">
                Speak naturally in Hindi, Odia, or English. Sonam is an AI health assistant who gathers facts, checks for red-flag symptoms, and sends your structured summary straight to the doctor.
              </p>
              <button
                type="button"
                onClick={startSession}
                className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-teal-700 px-7 py-3.5 text-sm font-bold text-white shadow-lg shadow-teal-700/25 transition hover:bg-teal-800 active:scale-95"
              >
                <Mic className="h-4 w-4" />
                Start Voice Conversation with Sonam
              </button>
              <button
                type="button"
                onClick={() => navigate('/app/patient/voice/live')}
                className="mx-auto flex items-center gap-2 rounded-2xl border border-teal-300 bg-white px-5 py-2.5 text-xs font-bold text-teal-800 shadow-sm transition hover:bg-teal-50 active:scale-95"
              >
                <Radio className="h-4 w-4" />
                Realtime Live mode (streaming, barge-in)
              </button>
              <p className="text-[10px] leading-relaxed text-slate-400">
                Classic mode listens turn-by-turn and speaks with your browser&apos;s voice. For a
                fully duplex, interruptible conversation that streams in real time, choose Realtime
                Live mode.
              </p>
            </div>
          ) : (
            <div className="w-full max-w-lg space-y-4 sm:space-y-6">
              {/* Dynamic Waveform Visualizer */}
              <div className="relative flex h-20 items-center justify-center gap-1 rounded-2xl bg-slate-950 px-3 shadow-inner sm:h-24 sm:gap-1.5 sm:px-6">
                {[30, 55, 80, 45, 95, 70, 40, 85, 60, 40, 90, 75, 50, 65, 85, 45, 60].map(
                  (h, i) => (
                    <div
                      key={i}
                      className={`w-1 rounded-full transition-all duration-150 sm:w-1.5 ${
                        voiceState === 'LISTENING'
                          ? 'bg-emerald-400'
                          : voiceState === 'SPEAKING'
                          ? 'bg-teal-400'
                          : 'bg-slate-700'
                      }`}
                      style={{
                        height:
                          voiceState === 'LISTENING'
                            ? `${Math.max(
                                15,
                                (h * ((i % 3) + 1) + Math.min(1, micLevel * 5) * 320) % 100
                              )}%`
                            : voiceState === 'SPEAKING'
                            ? `${Math.max(20, (h * ((i % 3) + 1)) % 100)}%`
                            : '15%',
                      }}
                    />
                  )
                )}
              </div>

              {/* Current AI Question Box */}
              <div className="rounded-2xl border border-teal-200 bg-teal-50/50 p-4 text-left sm:p-5">
                <div className="flex items-center gap-2 text-xs font-bold text-teal-800 uppercase tracking-wider">
                  <Volume2 className="h-4 w-4" />
                  Assistant Question:
                </div>
                <p className="mt-2 break-words text-sm font-semibold text-slate-900 leading-relaxed">
                  "{currentPrompt}"
                </p>
              </div>

              {/* Patient Live Transcript / Input */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 text-left">
                <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs text-slate-500">
                  <span className="font-semibold uppercase text-slate-700">Patient Response:</span>
                  {voiceState === 'LISTENING' && (
                    <span className="text-emerald-700 font-medium animate-pulse flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-emerald-600 animate-ping" />
                      Listening now (Auto-VAD Active)...
                    </span>
                  )}
                </div>

                <p className="mt-2 min-h-[30px] break-words text-sm text-slate-800 italic">
                  {patientTranscript ||
                    (voiceState === 'LISTENING'
                      ? 'Speak clearly into your microphone...'
                      : '')}
                </p>

                {/* Immediate Submit Action Button */}
                {voiceState === 'LISTENING' && patientTranscript.trim() && (
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={handleImmediateSend}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-800 transition active:scale-95"
                    >
                      <Zap className="h-3.5 w-3.5" />
                      Done Speaking (Send Now)
                    </button>
                  </div>
                )}

                {/* Text Turn Fallback for reliability in noisy environments */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    const form = e.currentTarget
                    const input = form.elements.namedItem('textInput') as HTMLInputElement
                    if (input?.value.trim()) {
                      handleSendTurn(input.value.trim())
                      input.value = ''
                    }
                  }}
                  className="mt-3 flex gap-2"
                >
                  <input
                    name="textInput"
                    type="text"
                    placeholder="Or type what you are experiencing..."
                    className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-teal-500 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={voiceState === 'PROCESSING'}
                    className="shrink-0 rounded-xl bg-teal-700 px-4 py-2 text-xs font-bold text-white hover:bg-teal-800 disabled:opacity-50"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </button>
                </form>
              </div>

              {/* Live Extraction Snapshot */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-left">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase text-slate-700">
                    Live Extracted Information:
                  </span>
                  <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-semibold text-teal-800">
                    Provenance: Voice Assessment
                  </span>
                </div>

                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {extracted.symptoms.length > 0 ? (
                    extracted.symptoms.map((s, i) => (
                      <span
                        key={i}
                        className="rounded-lg bg-teal-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm"
                      >
                        ✓ {s}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-slate-500">Speaking to extract symptoms...</span>
                  )}
                </div>
              </div>

              {/* Submission Status Confirmation */}
              {submittedToDoctor && submitResult && (
                <div className="rounded-2xl border-2 border-emerald-400 bg-emerald-50 p-4 text-left shadow-md animate-in fade-in zoom-in-95">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                    <div className="min-w-0">
                      <h4 className="text-sm font-bold text-emerald-900">
                        ✓ Case Dispatched Directly to Doctor!
                      </h4>
                      <p className="text-xs text-emerald-700 mt-0.5">
                        Notification sent to duty doctors & healthcare workers. Case Reference:{' '}
                        <strong>{submitResult.caseNumber}</strong> ({submitResult.priority}).
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => navigate(`/app/patient/cases/${caseDetail?.id}`)}
                      className="rounded-xl bg-emerald-700 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-800"
                    >
                      View Live Case Tracking
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('/app/patient/dashboard')}
                      className="rounded-xl border border-emerald-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                    >
                      Patient Dashboard
                    </button>
                  </div>
                </div>
              )}

              {/* Control Buttons */}
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleSubmitDirectToDoctor}
                  disabled={submittingToDoctor || submittedToDoctor}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-teal-700/20 hover:from-emerald-700 hover:to-teal-800 transition active:scale-95 disabled:opacity-50"
                >
                  {submittingToDoctor ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {submittedToDoctor ? '✓ Sent to Doctor' : 'Submit Direct to Doctor'}
                </button>

                <button
                  type="button"
                  onClick={handleEndConversation}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
                >
                  <PhoneOff className="h-4 w-4 text-red-500" />
                  End & View Case
                </button>
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1">{errorMsg}</span>
              {voiceState === 'ERROR' && (
                <button
                  type="button"
                  onClick={resumeMicrophone}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-red-700 active:scale-95"
                >
                  <Mic className="h-3.5 w-3.5" />
                  Resume Microphone
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Developer Diagnostics Telemetry Panel (Requirement 5) */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setShowDiagnostics(!showDiagnostics)}
          className="flex w-full items-center justify-between gap-2 bg-slate-50 px-4 py-3 text-left transition hover:bg-slate-100 sm:px-5"
        >
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <Activity className="h-4 w-4 shrink-0 text-teal-700" />
            <span className="min-w-0 text-[10px] font-bold uppercase tracking-wider text-slate-800 sm:text-xs">
              Developer Diagnostics · Voice Latency Telemetry (Target &lt; 5.0s)
            </span>
            {diagnosticsHistory.length > 0 && (
              <span
                className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  targetCompliance >= 90
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                Compliance: {targetCompliance}%
              </span>
            )}
          </div>
          {showDiagnostics ? (
            <ChevronUp className="h-4 w-4 text-slate-500" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-500" />
          )}
        </button>

        {showDiagnostics && (
          <div className="space-y-4 p-3 sm:p-5">
            {/* Aggregate Stats Cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <div className="text-[10px] font-bold uppercase text-slate-500">Total Turns</div>
                <div className="mt-1 text-base font-extrabold text-slate-900">
                  {diagnosticsHistory.length}
                </div>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <div className="text-[10px] font-bold uppercase text-slate-500">p50 Latency</div>
                <div className="mt-1 text-base font-extrabold text-teal-700">
                  {p50 > 0 ? `${(p50 / 1000).toFixed(2)}s` : '—'}
                </div>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <div className="text-[10px] font-bold uppercase text-slate-500">p95 Latency</div>
                <div className="mt-1 text-base font-extrabold text-teal-700">
                  {p95 > 0 ? `${(p95 / 1000).toFixed(2)}s` : '—'}
                </div>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <div className="text-[10px] font-bold uppercase text-slate-500">p99 Latency</div>
                <div className="mt-1 text-base font-extrabold text-teal-700">
                  {p99 > 0 ? `${(p99 / 1000).toFixed(2)}s` : '—'}
                </div>
              </div>
            </div>

            {/* Turn History Table */}
            {diagnosticsHistory.length === 0 ? (
              <p className="text-center py-4 text-xs text-slate-400 italic">
                Speak or send a turn to record speech-end-to-first-audio latency metrics.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-100">
                <table className="w-full min-w-[560px] text-left text-xs text-slate-700">
                  <thead className="bg-slate-50 text-[10px] font-bold uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Turn</th>
                      <th className="px-3 py-2">Speech End ➔ STT</th>
                      <th className="px-3 py-2">STT ➔ First Token</th>
                      <th className="px-3 py-2">Token ➔ Audio Start</th>
                      <th className="px-3 py-2">Total Response Start</th>
                      <th className="px-3 py-2">Target Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {diagnosticsHistory.map((d) => (
                      <tr key={d.turnIndex} className="hover:bg-slate-50/50">
                        <td className="px-3 py-2 font-semibold">#{d.turnIndex}</td>
                        <td className="px-3 py-2">{d.sttLatencyMs}ms</td>
                        <td className="px-3 py-2">{d.llmLatencyMs}ms</td>
                        <td className="px-3 py-2">{d.ttsLatencyMs}ms</td>
                        <td className="px-3 py-2 font-bold text-slate-900">
                          {(d.totalResponseStartMs / 1000).toFixed(2)}s
                        </td>
                        <td className="px-3 py-2">
                          {d.totalResponseStartMs <= 3000 ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                              <CheckCircle2 className="h-3 w-3" />
                              &lt; 3.0s Optimal
                            </span>
                          ) : d.totalResponseStartMs <= 5000 ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-800">
                              <CheckCircle2 className="h-3 w-3" />
                              &lt; 5.0s Target Met
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                              <Clock className="h-3 w-3" />
                              &gt; 5.0s Exceeded
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-[10px] text-slate-400">
              * Privacy note: Latency telemetry tracks execution performance and contains zero
              Protected Health Information (PHI).
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

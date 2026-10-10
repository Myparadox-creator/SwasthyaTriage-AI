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

  // Speech Recognition & VAD Refs
  const recognitionRef = useRef<any>(null)
  const silenceTimerRef = useRef<any>(null)
  const lastTranscriptRef = useRef<string>('')
  const speechEndTimestampRef = useRef<number>(0)
  const isSpeechSupported =
    typeof window !== 'undefined' &&
    ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)

  // Silence threshold for natural end-of-turn detection (1.3 seconds)
  const SILENCE_THRESHOLD_MS = 1300

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel()
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop()
        } catch {}
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

  // Pipelined Sentence-level Streaming TTS
  const speakSentences = (
    text: string,
    onFirstPlaybackStart?: (timestamp: number) => void
  ) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    window.speechSynthesis.cancel()

    // Natural sentence boundary splitting (. ! ? । |)
    const rawChunks = text
      .split(/(?<=[.!?।|])\s+/)
      .map((s) => s.trim())
      .filter(Boolean)
    const sentences = rawChunks.length > 0 ? rawChunks : [text.trim()]

    setVoiceState('SPEAKING')
    let firstPlaybackFired = false

    const playSentenceIndex = (index: number) => {
      if (index >= sentences.length) {
        setVoiceState('LISTENING')
        startListening()
        return
      }

      const utterance = new SpeechSynthesisUtterance(sentences[index])
      utterance.lang = lang === 'hi' ? 'hi-IN' : lang === 'od' ? 'hi-IN' : 'en-IN'
      utterance.rate = 1.0

      utterance.onstart = () => {
        if (!firstPlaybackFired) {
          firstPlaybackFired = true
          onFirstPlaybackStart?.(Date.now())
        }
      }

      utterance.onend = () => {
        playSentenceIndex(index + 1)
      }

      utterance.onerror = () => {
        playSentenceIndex(index + 1)
      }

      window.speechSynthesis.speak(utterance)
    }

    playSentenceIndex(0)
  }

  // Initialize Case and Voice Session on Mount
  const startSession = async () => {
    setVoiceState('CONNECTING')
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
          ? 'नमस्ते। कृपया बताएं आपको क्या समस्या हो रही है?'
          : lang === 'od'
          ? 'ନମସ୍କାର। ଦୟାକରି କୁହନ୍ତୁ ଆପଣଙ୍କର କଣ ଅସୁବିଧା ହେଉଛି?'
          : 'Namaste. Please tell me what health concern you are experiencing today.'

      setCurrentPrompt(initialGreeting)
      speakSentences(initialGreeting)
    } catch (err) {
      setVoiceState('ERROR')
      setErrorMsg(err instanceof Error ? err.message : 'Could not initialize voice agent')
    }
  }

  // Voice Activity Detection & Speech Recognition listener
  const startListening = () => {
    if (!isSpeechSupported) return
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)

    try {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      const recognition = new SpeechRecognition()
      recognition.lang = lang === 'hi' ? 'hi-IN' : lang === 'od' ? 'or-IN' : 'en-IN'
      recognition.continuous = true
      recognition.interimResults = true

      recognition.onstart = () => {
        setVoiceState('LISTENING')
      }

      recognition.onresult = (event: any) => {
        // Patient Barge-In / Interruption: cancel any currently playing assistant audio immediately
        if (window.speechSynthesis && window.speechSynthesis.speaking) {
          window.speechSynthesis.cancel()
          setVoiceState('LISTENING')
        }

        let finalStr = ''
        let interimStr = ''
        for (let i = 0; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalStr += event.results[i][0].transcript
          } else {
            interimStr += event.results[i][0].transcript
          }
        }

        const currentText = (finalStr + ' ' + interimStr).trim()
        if (!currentText) return

        setPatientTranscript(currentText)
        lastTranscriptRef.current = currentText

        // Voice Activity Detection: Reset silence timer on every new speech packet
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current)
        }

        silenceTimerRef.current = setTimeout(() => {
          if (lastTranscriptRef.current.trim() && voiceState !== 'PROCESSING') {
            const speechEndTime = Date.now()
            speechEndTimestampRef.current = speechEndTime
            try {
              recognition.stop()
            } catch {}
            handleSendTurn(lastTranscriptRef.current.trim(), speechEndTime)
          }
        }, SILENCE_THRESHOLD_MS)
      }

      recognition.onerror = (event: any) => {
        if (event.error === 'not-allowed') {
          setErrorMsg('Microphone access denied. Please grant permission in browser settings.')
          setVoiceState('ERROR')
        }
      }

      recognition.onend = () => {
        // If recognition closed unexpectedly and we have unsubmitted speech
        if (lastTranscriptRef.current.trim() && voiceState === 'LISTENING') {
          const speechEndTime = Date.now()
          speechEndTimestampRef.current = speechEndTime
          handleSendTurn(lastTranscriptRef.current.trim(), speechEndTime)
        }
      }

      recognitionRef.current = recognition
      recognition.start()
    } catch {
      // Speech recognition fallback
    }
  }

  // Handle Turn with Real-Time Latency Tracking
  const handleSendTurn = async (userText: string, speechEndTime?: number) => {
    if (!userText || !caseDetail || !voiceSession) return

    // Clear timers and stop listener
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch {}
    }

    // 1. Record Speech-End and STT timestamps
    const tSpeechEnd = speechEndTime || speechEndTimestampRef.current || Date.now()
    const tSttDone = Date.now()
    setVoiceState('PROCESSING')

    // 2. Safe brief acknowledgement if external service exceeds 1.8s
    let ackTimeout: any = null
    let acknowledged = false
    ackTimeout = setTimeout(() => {
      if (voiceState === 'PROCESSING' && !acknowledged) {
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
      const response = await fetch(
        `/api/cases/${caseDetail.id}/voice/sessions/${voiceSession.public_id}/turns/stream`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ text: userText }),
        }
      )

      if (ackTimeout) clearTimeout(ackTimeout)

      if (response.ok && response.body) {
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let streamDone = false
        let firstSentencePlayed = false

        while (!streamDone) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value, { stream: true })
          const lines = chunk.split('\n')

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6))
                if (data.type === 'sentence' && !firstSentencePlayed) {
                  firstSentencePlayed = true
                  tFirstToken = Date.now()
                  tTtsPrep = Date.now()

                  // Start TTS immediately on first sentence!
                  speakSentences(data.text, (playbackStart) => {
                    recordTurnDiagnostics(
                      tSpeechEnd,
                      tSttDone,
                      tFirstToken,
                      tTtsPrep,
                      playbackStart,
                      data.provider || 'gemini',
                      false
                    )
                  })
                  setCurrentPrompt(data.text)
                } else if (data.type === 'complete') {
                  turnRes = data
                  if (data.is_emergency) {
                    setIsEmergency(true)
                  }
                  if (!firstSentencePlayed) {
                    tFirstToken = Date.now()
                    tTtsPrep = Date.now()
                    speakSentences(data.reply, (playbackStart) => {
                      recordTurnDiagnostics(
                        tSpeechEnd,
                        tSttDone,
                        tFirstToken,
                        tTtsPrep,
                        playbackStart,
                        data.provider || 'gemini',
                        Boolean(data.is_emergency)
                      )
                    })
                    setCurrentPrompt(data.reply)
                  }
                }
              } catch {}
            }
          }
        }
      }

      // Fallback to standard turn if streaming did not return complete
      if (!turnRes) {
        turnRes = await api<VoiceTurnResponse>(
          `/api/cases/${caseDetail.id}/voice/sessions/${voiceSession.public_id}/turns`,
          {
            method: 'POST',
            body: { text: userText },
          }
        )
        if (!tFirstToken) tFirstToken = Date.now()
        if (!tTtsPrep) tTtsPrep = Date.now()
        speakSentences(turnRes.reply, (playbackStart) => {
          recordTurnDiagnostics(
            tSpeechEnd,
            tSttDone,
            tFirstToken,
            tTtsPrep,
            playbackStart,
            turnRes?.provider || 'mock',
            Boolean(turnRes?.status === 'SPEAKING' && userText.toLowerCase().includes('chest'))
          )
        })
        setCurrentPrompt(turnRes.reply)
      }

      // Update extracted clinical symptoms
      if (turnRes) {
        setExtracted((prev) => {
          const symptoms = Array.from(
            new Set([...prev.symptoms, ...(turnRes?.added_symptoms || [])])
          )
          return {
            ...prev,
            symptoms,
            duration:
              userText.toLowerCase().includes('din') || userText.toLowerCase().includes('day')
                ? 'Reported'
                : prev.duration,
            measurements: turnRes?.added_measurement
              ? [...prev.measurements, 'Temperature']
              : prev.measurements,
          }
        })

        if (turnRes.can_submit) {
          setVoiceState('COMPLETED')
        }
      }
    } catch (err) {
      if (ackTimeout) clearTimeout(ackTimeout)
      setVoiceState('ERROR')
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

  // Immediate "Done Speaking" manual trigger
  const handleImmediateSend = () => {
    if (patientTranscript.trim() && voiceState === 'LISTENING') {
      const speechEndTime = Date.now()
      speechEndTimestampRef.current = speechEndTime
      handleSendTurn(patientTranscript.trim(), speechEndTime)
    }
  }

  const [submittingToDoctor, setSubmittingToDoctor] = useState(false)
  const [submittedToDoctor, setSubmittedToDoctor] = useState(false)
  const [submitResult, setSubmitResult] = useState<{ caseNumber: string; priority: string } | null>(null)

  const handleSubmitDirectToDoctor = async () => {
    if (!caseDetail) return
    setSubmittingToDoctor(true)
    setErrorMsg(null)
    try {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop()
        } catch {}
      }
      if (voiceSession) {
        try {
          await api(`/api/cases/${caseDetail.id}/voice/sessions/${voiceSession.public_id}`, {
            method: 'PATCH',
            body: { status: 'COMPLETED' },
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
      speakSentences(confirmSpeech)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to submit case to doctor')
    } finally {
      setSubmittingToDoctor(false)
    }
  }

  const handleEndConversation = async () => {
    if (window.speechSynthesis) window.speechSynthesis.cancel()
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch {}
    }

    if (caseDetail) {
      try {
        await api(`/api/cases/${caseDetail.id}/voice/sessions/${voiceSession?.public_id}`, {
          method: 'PATCH',
          body: { status: 'COMPLETED' },
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
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-teal-50/70 px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-700 text-white shadow-sm">
              <HeartPulse className="h-5 w-5 animate-pulse" />
            </span>
            <div className="min-w-0">
              <h1 className="text-base font-bold text-slate-900">AI Voice Assessment</h1>
              <p className="truncate text-[11px] text-slate-500">Real-time Triage · VAD Silence Detection</p>
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
                Ready to speak with AI Assistant?
              </h2>
              <p className="text-xs text-slate-600 leading-relaxed">
                Speak naturally in Hindi, Odia, or English. The assistant responds within seconds to
                gather facts and prepare a triage summary for your doctor.
              </p>
              <button
                type="button"
                onClick={startSession}
                className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-teal-700 px-7 py-3.5 text-sm font-bold text-white shadow-lg shadow-teal-700/25 transition hover:bg-teal-800 active:scale-95"
              >
                <Mic className="h-4 w-4" />
                Start Voice Assessment
              </button>
            </div>
          ) : (
            <div className="w-full max-w-lg space-y-6">
              {/* Dynamic Waveform Visualizer */}
              <div className="relative flex h-24 items-center justify-center gap-1.5 rounded-2xl bg-slate-950 px-6 shadow-inner">
                {[30, 55, 80, 45, 95, 70, 40, 85, 60, 40, 90, 75, 50, 65, 85, 45, 60].map(
                  (h, i) => (
                    <div
                      key={i}
                      className={`w-1.5 rounded-full transition-all duration-150 ${
                        voiceState === 'LISTENING'
                          ? 'bg-emerald-400'
                          : voiceState === 'SPEAKING'
                          ? 'bg-teal-400'
                          : 'bg-slate-700'
                      }`}
                      style={{
                        height:
                          voiceState === 'LISTENING' || voiceState === 'SPEAKING'
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
                <p className="mt-2 text-sm font-semibold text-slate-900 leading-relaxed">
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

                <p className="mt-2 text-sm text-slate-800 min-h-[30px] italic">
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
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
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

import { useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  HeartPulse,
  Loader2,
  Mic,
  MicOff,
  PhoneOff,
  Send,
  ShieldAlert,
  Volume2,
  X,
} from 'lucide-react'
import { api } from '../../lib/api'
import type { CaseDetail, VoiceSessionOut, VoiceTurnResponse } from '../../lib/types'

type AssistantState =
  | 'IDLE'
  | 'CONNECTING'
  | 'LISTENING'
  | 'PROCESSING'
  | 'SPEAKING'
  | 'ERROR'
  | 'COMPLETED'

interface MessageTurn {
  id: string
  role: 'assistant' | 'patient'
  text: string
  timestamp: Date
}

export default function SonamFloatingAssistant() {
  const [isOpen, setIsOpen] = useState(false)
  const [lang, setLang] = useState<'hi' | 'od' | 'en'>('hi')
  const [state, setState] = useState<AssistantState>('IDLE')
  const stateRef = useRef<AssistantState>('IDLE')
  const applyState = (next: AssistantState) => {
    stateRef.current = next
    setState(next)
  }

  const [isMuted, setIsMuted] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isEmergency, setIsEmergency] = useState(false)

  const [caseDetail, setCaseDetail] = useState<CaseDetail | null>(null)
  const [voiceSession, setVoiceSession] = useState<VoiceSessionOut | null>(null)
  const [messages, setMessages] = useState<MessageTurn[]>([])
  const [inputText, setInputText] = useState('')
  const [extractedSymptoms, setExtractedSymptoms] = useState<string[]>([])

  const [submittingToDoctor, setSubmittingToDoctor] = useState(false)
  const [submittedToDoctor, setSubmittedToDoctor] = useState(false)
  const [submittedCaseNumber, setSubmittedCaseNumber] = useState<string | null>(null)

  // Media capture & AudioContext refs
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const vadIntervalRef = useRef<number | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const isListeningRef = useRef(false)
  const shouldSubmitAudioRef = useRef(false)
  const speechDetectedRef = useRef(false)
  const lastSpeechTimeRef = useRef(0)
  const isMutedRef = useRef(false)
  const transcriptBottomRef = useRef<HTMLDivElement | null>(null)

  // TTS cancellation and queue
  const ttsActiveRef = useRef(false)
  const speechQueueRef = useRef<string[]>([])
  const speechGenRef = useRef(0)

  useEffect(() => {
    transcriptBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, state])

  // Clean up media streams and speech on unmount
  useEffect(() => {
    return () => {
      cleanupAudio()
      stopTTS()
    }
  }, [])

  const cleanupAudio = () => {
    if (vadIntervalRef.current) {
      clearInterval(vadIntervalRef.current)
      vadIntervalRef.current = null
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop()
      } catch {}
    }
    mediaRecorderRef.current = null
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop())
      mediaStreamRef.current = null
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close()
      } catch {}
      audioContextRef.current = null
    }
    isListeningRef.current = false
  }

  const stopTTS = () => {
    speechGenRef.current += 1
    speechQueueRef.current = []
    ttsActiveRef.current = false
    try {
      window.speechSynthesis?.cancel()
    } catch {}
  }

  const speakText = (text: string, onEnd?: () => void) => {
    stopTTS()
    const gen = speechGenRef.current
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      if (onEnd) setTimeout(onEnd, 1000)
      return
    }

    applyState('SPEAKING')
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = lang === 'en' ? 'en-IN' : 'hi-IN'
    utterance.rate = 1.0

    // Pick best available Indian English or Hindi voice
    const voices = window.speechSynthesis.getVoices()
    const match = voices.find(
      (v) =>
        (lang === 'hi' && (v.lang.includes('hi') || v.name.toLowerCase().includes('hindi'))) ||
        (lang === 'en' && (v.lang.includes('en-IN') || v.name.toLowerCase().includes('india')))
    )
    if (match) utterance.voice = match

    utterance.onend = () => {
      if (speechGenRef.current === gen) {
        ttsActiveRef.current = false
        if (onEnd) onEnd()
      }
    }
    utterance.onerror = () => {
      if (speechGenRef.current === gen) {
        ttsActiveRef.current = false
        if (onEnd) onEnd()
      }
    }

    ttsActiveRef.current = true
    try {
      window.speechSynthesis.speak(utterance)
    } catch {
      ttsActiveRef.current = false
      if (onEnd) onEnd()
    }
  }

  // Start Assistant Session
  const handleStartConversation = async () => {
    setErrorMsg(null)
    setIsEmergency(false)
    setSubmittedToDoctor(false)
    setSubmittedCaseNumber(null)
    applyState('CONNECTING')

    try {
      // 1. Create a draft case for intake
      const c = await api<CaseDetail>('/api/cases', {
        method: 'POST',
        body: {
          language: lang,
          chief_concern: null,
          consent_accepted: true,
          consent_text_version: 'v1_sonam_floating',
        },
      })
      setCaseDetail(c)

      // 2. Initialize in-app voice session
      const s = await api<VoiceSessionOut>(`/api/cases/${c.id}/voice/sessions`, {
        method: 'POST',
        body: { language: lang },
      })
      setVoiceSession(s)

      // 3. Opening greeting with Sonam identity & consent
      const greeting =
        lang === 'hi'
          ? 'नमस्ते! मैं सोनम हूँ, स्वास्थ्यफ्लो एआई की एआई स्वास्थ्य सहायक। आपको किस स्वास्थ्य समस्या में मदद चाहिए?'
          : lang === 'od'
          ? 'ନମସ୍କାର! ମୁଁ ସୋନମ, ସ୍ୱାସ୍ଥ୍ୟଫ୍ଲୋ ଏଆଇର ଏଆଇ ସ୍ୱାସ୍ଥ୍ୟ ସହାୟିକା। ଆପଣଙ୍କୁ କେଉଁ ସ୍ୱାସ୍ଥ୍ୟ ସମସ୍ୟାରେ ସାହାଯ୍ୟ ଦରକାର?'
          : 'Namaste! I am Sonam, your AI health intake assistant from SwasthyaFlow AI. What health concern can I help you with today?'

      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          text: greeting,
          timestamp: new Date(),
        },
      ])

      // Speak greeting, then immediately start listening for patient response
      speakText(greeting, () => {
        applyState('LISTENING')
        void startMicrophone()
      })
    } catch (err) {
      applyState('ERROR')
      setErrorMsg(err instanceof Error ? err.message : 'Failed to connect to Sonam assistant')
    }
  }

  // Open Microphone and configure Voice Activity Detection
  const startMicrophone = async () => {
    if (isListeningRef.current) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      mediaStreamRef.current = stream

      const audioCtx = new AudioContext()
      if (audioCtx.state === 'suspended') await audioCtx.resume()
      audioContextRef.current = audioCtx

      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 512
      source.connect(analyser)
      analyserRef.current = analyser

      const mime =
        ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((t) =>
          MediaRecorder.isTypeSupported(t)
        ) || ''

      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      mediaRecorderRef.current = recorder
      audioChunksRef.current = []
      speechDetectedRef.current = false
      lastSpeechTimeRef.current = Date.now()
      shouldSubmitAudioRef.current = false

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        const chunks = audioChunksRef.current
        audioChunksRef.current = []
        if (shouldSubmitAudioRef.current && speechDetectedRef.current && chunks.length > 0) {
          const blob = new Blob(chunks, { type: mime || 'audio/webm' })
          if (blob.size > 300) {
            void sendAudioTurn(blob)
          }
        }
      }

      recorder.start(100)
      isListeningRef.current = true
      applyState('LISTENING')

      // VAD Loop: monitors mic level and detects silence to auto-send
      const buffer = new Uint8Array(analyser.frequencyBinCount)
      vadIntervalRef.current = window.setInterval(() => {
        if (!analyserRef.current || !isListeningRef.current || isMutedRef.current) return
        analyserRef.current.getByteFrequencyData(buffer)

        let sum = 0
        for (let i = 0; i < buffer.length; i++) sum += buffer[i]
        const avg = sum / buffer.length

        const now = Date.now()
        if (avg > 18) {
          speechDetectedRef.current = true
          lastSpeechTimeRef.current = now
        } else if (speechDetectedRef.current && now - lastSpeechTimeRef.current > 1400) {
          // Patient finished speaking -> Stop and submit turn
          stopMicrophone(true)
        }
      }, 80)
    } catch (err) {
      applyState('ERROR')
      const name = err instanceof DOMException ? err.name : ''
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setErrorMsg('Microphone access was denied. Please allow microphone permissions or type your message below.')
      } else {
        setErrorMsg('Could not access microphone. You can type your health questions below.')
      }
    }
  }

  const stopMicrophone = (submit: boolean) => {
    shouldSubmitAudioRef.current = submit
    if (vadIntervalRef.current) {
      clearInterval(vadIntervalRef.current)
      vadIntervalRef.current = null
    }
    isListeningRef.current = false
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop()
      } catch {}
    }
  }

  const toggleMute = () => {
    const next = !isMuted
    setIsMuted(next)
    isMutedRef.current = next
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !next
      })
    }
  }

  // Send turn with recorded audio to Gemini / Voice agent
  const sendAudioTurn = async (blob: Blob) => {
    if (!caseDetail || !voiceSession) return
    applyState('PROCESSING')

    try {
      const reader = new FileReader()
      reader.onloadend = async () => {
        const base64 = String(reader.result || '').split(',')[1] || ''
        await executeTurn({ audio_b64: base64, audio_mime: blob.type || 'audio/webm' })
      }
      reader.readAsDataURL(blob)
    } catch {
      applyState('ERROR')
      setErrorMsg('Failed to process recorded speech')
    }
  }

  // Send turn with typed text fallback
  const handleSendText = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!inputText.trim() || !caseDetail || !voiceSession) return
    const text = inputText.trim()
    setInputText('')
    stopTTS()
    stopMicrophone(false)

    // Add patient message to transcript immediately
    setMessages((prev) => [
      ...prev,
      {
        id: `patient-${Date.now()}`,
        role: 'patient',
        text,
        timestamp: new Date(),
      },
    ])

    applyState('PROCESSING')
    await executeTurn({ text })
  }

  const executeTurn = async (body: Record<string, unknown>) => {
    if (!caseDetail || !voiceSession) return

    try {
      const turnRes = await api<VoiceTurnResponse>(
        `/api/cases/${caseDetail.id}/voice/sessions/${voiceSession.public_id}/turns`,
        {
          method: 'POST',
          body,
        }
      )

      if (turnRes.transcript) {
        setMessages((prev) => [
          ...prev,
          {
            id: `patient-${Date.now()}`,
            role: 'patient',
            text: turnRes.transcript!,
            timestamp: new Date(),
          },
        ])
      }

      // Add assistant reply
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          text: turnRes.reply,
          timestamp: new Date(),
        },
      ])

      // Check for red flags / emergency in reply
      if (
        turnRes.reply.includes('112') ||
        turnRes.reply.includes('108') ||
        turnRes.reply.includes('🚨') ||
        turnRes.reply.toLowerCase().includes('emergency')
      ) {
        setIsEmergency(true)
      }

      // Track extracted symptoms
      if (turnRes.added_symptoms && turnRes.added_symptoms.length > 0) {
        setExtractedSymptoms((prev) => Array.from(new Set([...prev, ...turnRes.added_symptoms])))
      }

      // Speak assistant response and reopen microphone
      speakText(turnRes.reply, () => {
        applyState('LISTENING')
        void startMicrophone()
      })
    } catch (err) {
      applyState('ERROR')
      setErrorMsg(err instanceof Error ? err.message : 'Turn failed')
    }
  }

  // End conversation cleanly
  const handleEndConversation = () => {
    stopTTS()
    cleanupAudio()
    applyState('COMPLETED')
  }

  // Direct Submission to Doctor
  const handleSubmitDirectlyToDoctor = async () => {
    if (!caseDetail) return
    setSubmittingToDoctor(true)
    setErrorMsg(null)
    stopTTS()
    cleanupAudio()

    try {
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
      setSubmittedCaseNumber(res.case_number)
      applyState('COMPLETED')

      const ack =
        lang === 'hi'
          ? 'आपका केस सफलतापूर्वक डॉक्टर के पास भेज दिया गया है। डॉक्टर को नोटिफिकेशन मिल गया है।'
          : lang === 'od'
          ? 'ଆପଣଙ୍କ କେସ୍ ଡାକ୍ତରଙ୍କ ପାଖକୁ ପଠାଯାଇଛି। ଡାକ୍ତରଙ୍କୁ ସୂଚନା ମିଳିଛି।'
          : 'Your assessment has been delivered directly to the doctor for review.'

      setMessages((prev) => [
        ...prev,
        {
          id: `submit-${Date.now()}`,
          role: 'assistant',
          text: ack,
          timestamp: new Date(),
        },
      ])
      speakText(ack)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not submit case to doctor')
    } finally {
      setSubmittingToDoctor(false)
    }
  }

  return (
    <>
      {/* Floating Action Button — Fixed Bottom Right */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="group fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-full bg-gradient-to-r from-teal-700 via-teal-800 to-emerald-800 px-5 py-3.5 text-sm font-extrabold text-white shadow-2xl shadow-teal-900/40 ring-4 ring-teal-400/30 transition-all hover:scale-105 active:scale-95"
          aria-label="Open Sonam AI Voice Assistant"
        >
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-300" />
          </span>
          <Mic className="h-5 w-5 text-teal-200 group-hover:scale-110 transition-transform" />
          <span>Talk to Sonam</span>
        </button>
      )}

      {/* Expanded Floating Voice Panel */}
      {isOpen && (
        <div className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-h-[85vh] max-w-lg flex-col overflow-hidden rounded-3xl border border-teal-200 bg-white shadow-2xl ring-1 ring-slate-900/10 sm:bottom-6 sm:right-6 sm:inset-x-auto sm:w-[420px]">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-teal-100 bg-gradient-to-r from-teal-700 via-teal-800 to-emerald-900 px-4 py-3.5 text-white">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-600/80 text-white shadow-inner">
                <HeartPulse className="h-5 w-5 text-teal-200" />
              </span>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="text-sm font-bold leading-none">Sonam AI</h3>
                  <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-200 border border-emerald-400/30">
                    Voice Intake
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-teal-200">
                  Multimodal Triage · Sends Direct to Doctor
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {/* Language Selector */}
              <div className="flex rounded-lg bg-teal-900/60 p-0.5 text-[10px] font-bold">
                {(['hi', 'od', 'en'] as const).map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setLang(l)}
                    className={`rounded-md px-1.5 py-0.5 transition ${
                      lang === l ? 'bg-teal-600 text-white shadow-2xs' : 'text-teal-200 hover:text-white'
                    }`}
                  >
                    {l === 'hi' ? 'HI' : l === 'od' ? 'OD' : 'EN'}
                  </button>
                ))}
              </div>

              {/* Close / Minimize */}
              <button
                type="button"
                onClick={() => {
                  stopTTS()
                  cleanupAudio()
                  setIsOpen(false)
                }}
                className="rounded-lg p-1.5 text-teal-200 hover:bg-teal-700 hover:text-white transition"
                aria-label="Close Sonam Panel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Emergency Alert Callout */}
          {isEmergency && (
            <div className="flex items-start gap-2.5 border-b border-red-200 bg-red-50 p-3 text-xs text-red-900">
              <ShieldAlert className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
              <div>
                <span className="font-bold">🚨 Emergency Signs:</span> Call 112 / 108 immediately or reach nearest hospital. Hospital desk: 6370659934.
              </div>
            </div>
          )}

          {/* Messages / Transcript Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[220px] max-h-[340px] bg-slate-50/50">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-100 text-teal-800 mb-3 shadow-inner">
                  <Mic className="h-6 w-6 text-teal-700" />
                </div>
                <h4 className="text-sm font-bold text-slate-900">Talk directly with Sonam</h4>
                <p className="mt-1 text-xs text-slate-500 max-w-xs leading-relaxed">
                  Sonam will ask a few gentle questions about your symptoms, organize your answers, and forward them straight to the doctor.
                </p>

                <button
                  type="button"
                  onClick={handleStartConversation}
                  className="mt-4 flex items-center gap-2 rounded-xl bg-teal-700 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-teal-700/20 hover:bg-teal-800 transition active:scale-95"
                >
                  <Mic className="h-4 w-4" />
                  <span>Start Voice Chat</span>
                </button>
              </div>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${m.role === 'patient' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl p-3 text-xs leading-relaxed ${
                      m.role === 'patient'
                        ? 'bg-teal-700 text-white rounded-br-xs shadow-xs'
                        : 'bg-white border border-slate-200 text-slate-800 rounded-bl-xs shadow-xs'
                    }`}
                  >
                    {m.text}
                  </div>
                </div>
              ))
            )}

            {/* Live Status Animation Orb */}
            {state === 'LISTENING' && (
              <div className="flex items-center gap-2 text-xs font-semibold text-teal-800 bg-teal-50 border border-teal-200 rounded-xl px-3 py-2 w-fit">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-teal-600" />
                </span>
                <span>Sonam is listening... speak clearly</span>
              </div>
            )}

            {state === 'PROCESSING' && (
              <div className="flex items-center gap-2 text-xs text-slate-500 bg-white border border-slate-200 rounded-xl px-3 py-2 w-fit">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-teal-600" />
                <span>Sonam is processing your answer...</span>
              </div>
            )}

            {state === 'SPEAKING' && (
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 w-fit">
                <Volume2 className="h-3.5 w-3.5 animate-pulse text-emerald-600" />
                <span>Sonam is speaking...</span>
              </div>
            )}

            <div ref={transcriptBottomRef} />
          </div>

          {/* Extracted Symptoms Pills */}
          {extractedSymptoms.length > 0 && (
            <div className="border-t border-slate-100 bg-white px-3 py-1.5 flex items-center gap-1.5 overflow-x-auto text-[10px]">
              <span className="text-slate-400 font-semibold shrink-0">Captured:</span>
              {extractedSymptoms.map((s, idx) => (
                <span
                  key={idx}
                  className="rounded-md bg-teal-50 border border-teal-200 px-2 py-0.5 text-teal-800 font-medium shrink-0"
                >
                  {s}
                </span>
              ))}
            </div>
          )}

          {/* Controls & Action Footer */}
          <div className="border-t border-slate-200 bg-white p-3 space-y-2.5">
            {errorMsg && (
              <div className="flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50 p-2 text-[11px] text-red-800">
                <AlertCircle className="h-3.5 w-3.5 text-red-600 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Direct Send to Doctor Confirmation */}
            {submittedToDoctor ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-2.5 text-center">
                <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-emerald-900">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span>Delivered Directly to Doctor Queue!</span>
                </div>
                <p className="mt-0.5 text-[11px] text-emerald-700">
                  Case #{submittedCaseNumber ?? 'Submitted'} · Reviewer notified
                </p>
              </div>
            ) : caseDetail ? (
              <div className="flex items-center gap-2">
                {/* Voice Control Buttons */}
                <button
                  type="button"
                  onClick={toggleMute}
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-xs transition ${
                    isMuted
                      ? 'border-red-300 bg-red-50 text-red-700'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                  }`}
                  title={isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
                >
                  {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </button>

                <button
                  type="button"
                  onClick={handleEndConversation}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 transition"
                  title="End Conversation"
                >
                  <PhoneOff className="h-4 w-4" />
                </button>

                {/* Direct Send to Doctor Button */}
                <button
                  type="button"
                  onClick={handleSubmitDirectlyToDoctor}
                  disabled={submittingToDoctor}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-teal-700 py-2 px-3 text-xs font-bold text-white shadow-xs hover:bg-teal-800 disabled:opacity-50 transition active:scale-95"
                >
                  {submittingToDoctor ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Sending to Doctor...</span>
                    </>
                  ) : (
                    <>
                      <Send className="h-3.5 w-3.5" />
                      <span>Send to Doctor Now</span>
                    </>
                  )}
                </button>
              </div>
            ) : null}

            {/* Text Input Fallback */}
            {caseDetail && !submittedToDoctor && (
              <form onSubmit={handleSendText} className="flex gap-1.5">
                <input
                  type="text"
                  placeholder="Or type your health symptom here..."
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-900 focus:border-teal-600 focus:bg-white focus:outline-hidden"
                />
                <button
                  type="submit"
                  disabled={!inputText.trim()}
                  className="rounded-xl bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40 transition hover:bg-slate-900"
                >
                  Send
                </button>
              </form>
            )}

            {/* Non-diagnostic Privacy Disclaimer */}
            <p className="text-[10px] text-center text-slate-400">
              Sonam assists with clinical intake. Only qualified healthcare professionals diagnose and prescribe.
            </p>
          </div>
        </div>
      )}
    </>
  )
}

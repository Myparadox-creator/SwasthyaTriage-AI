import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertCircle,
  ArrowLeft,
  HeartPulse,
  Languages,
  Mic,
  PhoneOff,
  Send,
  Volume2,
} from 'lucide-react'
import { api } from '../../../lib/api'
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


  // Speech recognition and speech synthesis references
  const recognitionRef = useRef<any>(null)
  const isSpeechSupported =
    typeof window !== 'undefined' &&
    ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)

  // Initialize Case and Voice Session on Mount
  const startSession = async () => {
    setVoiceState('CONNECTING')
    setErrorMsg(null)
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
          ? 'Namaste. Kripya batayein aapko kya samasya ho rahi hai?'
          : lang === 'od'
          ? 'Namaskar. Dayakari kahantu aapananka kichi asubidha heuchi ki?'
          : 'Namaste. Please tell me what health concern you are experiencing today.'

      setCurrentPrompt(initialGreeting)

      // Speak initial prompt

      speakText(initialGreeting)
      setVoiceState('LISTENING')
      startListening()
    } catch (err) {
      setVoiceState('ERROR')
      setErrorMsg(err instanceof Error ? err.message : 'Could not initialize voice agent')
    }
  }

  // Text-to-Speech playback using SpeechSynthesis
  const speakText = (text: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = lang === 'hi' ? 'hi-IN' : 'en-IN'
    utterance.rate = 0.95
    utterance.onstart = () => {
      setVoiceState('SPEAKING')
    }
    utterance.onend = () => {
      setVoiceState('LISTENING')
      startListening()
    }
    utterance.onerror = () => {
      setVoiceState('LISTENING')
      startListening()
    }
    window.speechSynthesis.speak(utterance)
  }

  // Speech Recognition listener
  const startListening = () => {
    if (!isSpeechSupported) return
    try {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      const recognition = new SpeechRecognition()
      recognition.lang = lang === 'hi' ? 'hi-IN' : lang === 'od' ? 'or-IN' : 'en-IN'
      recognition.continuous = false
      recognition.interimResults = true

      recognition.onstart = () => {
        setVoiceState('LISTENING')
      }

      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((r: any) => r[0].transcript)
          .join('')
        setPatientTranscript(transcript)
      }

      recognition.onerror = (event: any) => {
        if (event.error === 'not-allowed') {
          setErrorMsg('Microphone access denied. Please grant permission in browser settings.')
          setVoiceState('ERROR')
        }
      }

      recognition.onend = () => {
        // Automatically send turn if text was captured
        setPatientTranscript((currentText) => {
          if (currentText.trim() && voiceState !== 'PROCESSING') {
            handleSendTurn(currentText.trim())
          }
          return ''
        })
      }

      recognitionRef.current = recognition
      recognition.start()
    } catch {
      // Speech recognition fallback to manual input
    }
  }

  const handleSendTurn = async (userText: string) => {
    if (!userText || !caseDetail || !voiceSession) return
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch {
        // ignored
      }
    }

    setVoiceState('PROCESSING')

    try {
      const res = await api<VoiceTurnResponse>(
        `/api/cases/${caseDetail.id}/voice/sessions/${voiceSession.public_id}/turns`,
        {
          method: 'POST',
          body: { text: userText },
        }
      )

      // Update extracted tokens
      setExtracted((prev) => {
        const symptoms = Array.from(new Set([...prev.symptoms, ...(res.added_symptoms || [])]))
        return {
          ...prev,
          symptoms,
          duration: userText.toLowerCase().includes('din') || userText.toLowerCase().includes('day') ? 'Reported' : prev.duration,
          measurements: res.added_measurement ? [...prev.measurements, 'Temperature'] : prev.measurements,
        }
      })

      setCurrentPrompt(res.reply)

      // Playback audio response
      speakText(res.reply)


      if (res.can_submit) {
        setVoiceState('COMPLETED')
      }
    } catch (err) {
      setVoiceState('ERROR')
      setErrorMsg(err instanceof Error ? err.message : 'Turn processing failed')
    }
  }

  const handleEndConversation = async () => {
    if (window.speechSynthesis) window.speechSynthesis.cancel()
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch {
        // ignored
      }
    }

    if (caseDetail) {
      try {
        await api(`/api/cases/${caseDetail.id}/voice/sessions/${voiceSession?.public_id}`, {
          method: 'PATCH',
          body: { status: 'COMPLETED' },
        })
      } catch {
        // ignore
      }
      navigate(`/app/patient/cases/${caseDetail.id}`)
    } else {
      navigate('/app/patient/dashboard')
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Back button & Title */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate('/app/patient/dashboard')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
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
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800"
          >
            <option value="hi">हिन्दी (Hindi)</option>
            <option value="en">English</option>
            <option value="od">ଓଡ଼ିଆ (Odia)</option>
          </select>
        </div>
      </div>

      {/* Main Voice Agent Container */}
      <div className="overflow-hidden rounded-3xl border border-teal-200 bg-white shadow-xl">
        {/* Header bar */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-teal-50/70 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-700 text-white">
              <HeartPulse className="h-5 w-5 animate-pulse" />
            </span>
            <div>
              <h1 className="text-base font-bold text-slate-900">AI Voice Assessment</h1>
              <p className="text-[11px] text-slate-500">Multimodal intake · Non-diagnostic</p>
            </div>
          </div>

          {/* Voice State Badge */}
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
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
        <div className="flex flex-col items-center justify-center p-8 text-center sm:p-12">
          {voiceState === 'IDLE' ? (
            <div className="max-w-md space-y-4">
              <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-teal-100 text-teal-700 shadow-md">
                <Mic className="h-10 w-10" />
              </span>
              <h2 className="text-xl font-bold text-slate-900">Ready to speak with AI Assistant?</h2>
              <p className="text-xs text-slate-600 leading-relaxed">
                You can describe your symptoms in Hindi, Odia, or English. The assistant will ask controlled questions to organize a triage note for the doctor.
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
              {/* Animated Waveform Visualizer */}
              <div className="relative flex h-24 items-center justify-center gap-1.5 rounded-2xl bg-slate-950 px-6 shadow-inner">
                {[30, 55, 80, 45, 95, 70, 40, 85, 60, 40, 90, 75, 50, 65, 85, 45, 60].map((h, i) => (
                  <div
                    key={i}
                    className={`w-1.5 rounded-full transition-all duration-200 ${
                      voiceState === 'LISTENING'
                        ? 'bg-emerald-400'
                        : voiceState === 'SPEAKING'
                        ? 'bg-teal-400'
                        : 'bg-slate-700'
                    }`}
                    style={{
                      height:
                        voiceState === 'LISTENING' || voiceState === 'SPEAKING'
                          ? `${Math.max(20, (h * (i % 3 + 1)) % 100)}%`
                          : '15%',
                    }}
                  />
                ))}
              </div>

              {/* Current AI Question Box */}
              <div className="rounded-2xl border border-teal-200 bg-teal-50/50 p-5 text-left">
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
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="font-semibold uppercase text-slate-700">Patient Response:</span>
                  {voiceState === 'LISTENING' && (
                    <span className="text-emerald-700 font-medium animate-pulse">● Listening now...</span>
                  )}
                </div>

                <p className="mt-2 text-sm text-slate-800 min-h-[28px] italic">
                  {patientTranscript || (voiceState === 'LISTENING' ? 'Speak clearly into your microphone...' : '')}
                </p>

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
                    className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-teal-500 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={voiceState === 'PROCESSING'}
                    className="rounded-xl bg-teal-700 px-4 py-2 text-xs font-bold text-white hover:bg-teal-800 disabled:opacity-50"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </button>
                </form>
              </div>

              {/* Live Extraction Snapshot */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-left">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase text-slate-700">
                    Live Extracted Information:
                  </span>
                  <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-semibold text-teal-800">
                    Provenance: Patient Voice
                  </span>
                </div>

                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {extracted.symptoms.length > 0 ? (
                    extracted.symptoms.map((s, i) => (
                      <span
                        key={i}
                        className="rounded-lg bg-teal-600 px-2.5 py-1 text-xs font-semibold text-white"
                      >
                        ✓ {s}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-slate-500">Speaking to extract symptoms...</span>
                  )}
                </div>
              </div>

              {/* Control Buttons */}
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleEndConversation}
                  className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-5 py-2.5 text-xs font-bold text-red-700 hover:bg-red-100"
                >
                  <PhoneOff className="h-4 w-4" />
                  End Conversation & View Case
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
    </div>
  )
}

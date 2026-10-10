import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertCircle,
  ArrowUp,
  BookOpen,
  Bot,
  Check,
  CheckCircle2,
  Copy,
  FileText,
  FolderOpen,
  GitCompare,
  Lightbulb,
  ListOrdered,
  Loader2,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Paperclip,
  Plus,
  Search,
  Send,
  ShieldAlert,
  Sun,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react'
import { api, fetchBlob } from '../../../lib/api'
import { useAuthStore } from '../../../stores/auth'
import type {
  CaseListItem,
  DocumentCitation,
  DocumentListResponse,
  DocumentOut,
  DocumentRAGResponse,
} from '../../../lib/types'

const MAX_MB = 20
const ACCEPT = '.pdf,.docx,.txt,.csv,.png,.jpg,.jpeg'
const ALLOWED_EXTS = new Set(['pdf', 'docx', 'txt', 'csv', 'png', 'jpg', 'jpeg'])

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations?: DocumentCitation[]
  clinicalFlags?: string[]
  suggestedFollowups?: string[]
  timestamp: string
  mode?: string
}

const STARTER_ACTIONS = [
  {
    mode: 'summarize',
    title: 'Summarize',
    description: 'Concise grounded summary',
    icon: FileText,
    iconLight: 'bg-teal-50 text-teal-700 border-teal-200',
    iconDark: 'bg-teal-950/60 text-teal-400 border-teal-800',
    prompt: 'Please provide a comprehensive summary of my uploaded document.',
  },
  {
    mode: 'key_points',
    title: 'Key points',
    description: 'Extract core takeaways',
    icon: ListOrdered,
    iconLight: 'bg-purple-50 text-purple-700 border-purple-200',
    iconDark: 'bg-purple-950/60 text-purple-400 border-purple-800',
    prompt: 'Extract the key takeaways, core findings, and important points from this document.',
  },
  {
    mode: 'explain',
    title: 'Explain',
    description: 'Plain-language explanation',
    icon: Lightbulb,
    iconLight: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    iconDark: 'bg-cyan-950/60 text-cyan-400 border-cyan-800',
    prompt: 'Explain the main terms, concepts, and technical or clinical details in simple language.',
  },
  {
    mode: 'compare',
    title: 'Compare',
    description: 'Compare across sections/docs',
    icon: GitCompare,
    iconLight: 'bg-amber-50 text-amber-700 border-amber-200',
    iconDark: 'bg-amber-950/60 text-amber-400 border-amber-800',
    prompt: 'Compare the findings and parameters across my uploaded documents.',
  },
  {
    mode: 'quotes',
    title: 'Find quotes',
    description: 'Locate verbatim passages',
    icon: Search,
    iconLight: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    iconDark: 'bg-emerald-950/60 text-emerald-400 border-emerald-800',
    prompt: 'Find verbatim quotes and specific passages regarding the main topics.',
  },
  {
    mode: 'deep_dive',
    title: 'Deep dive',
    description: 'In-depth analysis',
    icon: BookOpen,
    iconLight: 'bg-rose-50 text-rose-700 border-rose-200',
    iconDark: 'bg-rose-950/60 text-rose-400 border-rose-800',
    prompt: 'Perform an in-depth analysis on the methodologies, findings, and metrics in this document.',
  },
]

export default function PatientUploads() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)

  const [sidebarOpen, setSidebarOpen] = useState(true)
  // Default to project theme (light healthcare colorway) with dark mode toggle option
  const [darkMode, setDarkMode] = useState(false)
  const [cases, setCases] = useState<CaseListItem[]>([])
  const [caseId, setCaseId] = useState<number | null>(null)
  const [docs, setDocs] = useState<DocumentOut[]>([])
  const [docsDrawerOpen, setDocsDrawerOpen] = useState(false)

  const [uploading, setUploading] = useState(false)
  const [submittingToDoctor, setSubmittingToDoctor] = useState(false)
  const [doctorSubmittedModal, setDoctorSubmittedModal] = useState<any | null>(null)
  const [errorBanner, setErrorBanner] = useState<string | null>(null)

  const [inputQuery, setInputQuery] = useState('')
  const [searchHistoryQuery, setSearchHistoryQuery] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isQueryingRAG, setIsQueryingRAG] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [busyDocId, setBusyDocId] = useState<number | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const chatBottomRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom when messages update
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isQueryingRAG])

  // Fetch or create case
  // Fetch and filter cases for Document Consultations
  useEffect(() => {
    let active = true
    api<{ items: CaseListItem[] }>('/api/cases', { params: { page_size: 50 } })
      .then((res) => {
        if (!active) return
        // Filter out dummy voice tests and show only cases with documents or document consultations
        const docCases = res.items.filter(
          (c) =>
            c.has_documents ||
            (c.chief_concern && c.chief_concern.startsWith('Medical Document:'))
        )
        setCases(docCases)
        if (docCases.length > 0) {
          // Auto-select the first case that has uploaded documents (e.g. the recently uploaded report)
          const target = docCases.find((c) => c.has_documents) || docCases[0]
          setCaseId(target.id)
        }
      })
      .catch((err) => {
        if (!active) return
        setErrorBanner(err instanceof Error ? err.message : 'Failed to load health records')
      })
    return () => {
      active = false
    }
  }, [])

  // Load documents for active case
  const loadDocuments = useCallback(async (cId: number) => {
    try {
      const res = await api<DocumentListResponse>(`/api/cases/${cId}/documents`)
      const items = res.items || []
      setDocs(items)
      if (items.length > 0) {
        setMessages((prev) => {
          if (prev.length === 0) {
            return [
              {
                id: `intro-${cId}`,
                role: 'assistant',
                content: `📄 **Document Loaded & Indexed:** ${items
                  .map((d) => `**\`${d.filename}\`** (${(d.size_bytes / 1024).toFixed(1)} KB)`)
                  .join(', ')}\n\nInsightRAG is ready to analyze your document. You can click any of the action cards below (Summarize, Key points, Explain, Quotes) or ask any specific question in the prompt bar.`,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                suggestedFollowups: [
                  'Summarize this document',
                  'What are the key points and findings?',
                  'Explain the main concepts in simple terms',
                ],
              },
            ]
          }
          return prev
        })
      }
    } catch {
      setDocs([])
    }
  }, [])

  useEffect(() => {
    if (caseId) {
      void loadDocuments(caseId)
    }
  }, [caseId, loadDocuments])

  // Handle Document Upload
  const handleFileUpload = useCallback(
    async (file: File) => {
      const ext = file.name.split('.').pop()?.toLowerCase() || ''
      if (!ALLOWED_EXTS.has(ext)) {
        setErrorBanner(`Unsupported file format. Please upload PDF, DOCX, TXT, CSV, JPG or PNG.`)
        return
      }
      if (file.size > MAX_MB * 1024 * 1024) {
        setErrorBanner(`File exceeds maximum allowed size of ${MAX_MB}MB.`)
        return
      }

      setUploading(true)
      setErrorBanner(null)

      try {
        let targetCaseId = caseId
        const activeCase = cases.find((c) => c.id === targetCaseId)
        if (!targetCaseId || (activeCase && activeCase.status === 'SUBMITTED')) {
          const newCase = await api<{
            id: number
            case_number: string
            chief_concern: string | null
            created_at: string
          }>('/api/cases', {
            method: 'POST',
            body: {
              language: 'en',
              consent_accepted: true,
              chief_concern: `Medical Document: ${file.name.slice(0, 50)}`,
            },
          })
          targetCaseId = newCase.id
          setCaseId(newCase.id)
          setCases((prev) => [
            {
              ...newCase,
              status: 'DRAFT' as any,
              priority: 'ROUTINE' as any,
              source: 'CHAT' as any,
              language: 'en' as any,
              submitted_at: null,
              reviewed_at: null,
              patient_name: user?.full_name || 'Patient',
              facility_id: 1,
              facility_name: 'PHC Clinic',
              assigned_reviewer_id: null,
              assigned_reviewer_name: null,
              symptom_count: 0,
              signal_count: 0,
              has_documents: true,
            } as CaseListItem,
            ...prev,
          ])
        }

        const formData = new FormData()
        formData.append('file', file)
        await api<DocumentOut>(`/api/cases/${targetCaseId}/documents`, {
          method: 'POST',
          body: formData,
        })

        // Ensure this case is marked as having documents in list
        setCases((prev) =>
          prev.map((c) => (c.id === targetCaseId ? { ...c, has_documents: true } : c))
        )

        await loadDocuments(targetCaseId)

        // Add assistant note acknowledging upload
        const uploadMsg: ChatMessage = {
          id: `upload-${Date.now()}`,
          role: 'assistant',
          content: `✅ Successfully uploaded and indexed **\`${file.name}\`** (${(file.size / 1024).toFixed(1)} KB).\n\nInsightRAG is ready to analyze your document. You can click any of the action cards below (Summarize, Key points, Explain, Quotes) or ask any specific question in the prompt bar.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          suggestedFollowups: [
            'Summarize this document',
            'What are the key points and findings?',
            'Explain the main concepts in simple terms',
          ],
        }
        setMessages((prev) => [...prev, uploadMsg])
      } catch (err) {
        setErrorBanner(err instanceof Error ? err.message : 'Document upload failed')
      } finally {
        setUploading(false)
      }
    },
    [caseId, cases, loadDocuments, user?.full_name]
  )

  // Execute Grounded RAG Query
  const runRAGQuery = async (queryText: string, mode = 'general') => {
    if (!queryText.trim()) return

    if (!docs || docs.length === 0) {
      fileInputRef.current?.click()
      setErrorBanner('Please upload your medical document first before asking questions.')
      return
    }

    // Auto-detect clinical mode if query keywords match
    let effectiveMode = mode
    const lowerQ = queryText.toLowerCase()
    if (effectiveMode === 'general') {
      if (lowerQ.includes('summar') || lowerQ.includes('summary')) {
        effectiveMode = 'summarize'
      } else if (lowerQ.includes('key point') || lowerQ.includes('takeaway') || lowerQ.includes('important')) {
        effectiveMode = 'key_points'
      } else if (lowerQ.includes('explain') || lowerQ.includes('mean') || lowerQ.includes('matlab')) {
        effectiveMode = 'explain'
      } else if (lowerQ.includes('abnormal') || lowerQ.includes('lab') || lowerQ.includes('range') || lowerQ.includes('value')) {
        effectiveMode = 'deep_dive'
      } else if (lowerQ.includes('quote') || lowerQ.includes('verbatim')) {
        effectiveMode = 'quotes'
      }
    }

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: queryText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      mode: effectiveMode,
    }

    setMessages((prev) => [...prev, userMsg])
    setInputQuery('')
    setIsQueryingRAG(true)
    setErrorBanner(null)

    try {
      const activeId = caseId || docs[0]?.case_id
      if (!activeId) {
        throw new Error('No active case found. Please upload a document.')
      }

      const res = await api<DocumentRAGResponse>(`/api/cases/${activeId}/documents/rag`, {
        method: 'POST',
        body: { query: queryText, mode: effectiveMode },
      })

      const botMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: res.answer,
        citations: res.citations,
        clinicalFlags: res.clinical_flags,
        suggestedFollowups: res.suggested_followups,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        mode: res.mode,
      }
      setMessages((prev) => [...prev, botMsg])
    } catch (err) {
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: `⚠️ Failed to execute InsightRAG query: ${err instanceof Error ? err.message : 'Unknown server error'}. Please try again.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }
      setMessages((prev) => [...prev, errorMsg])
    } finally {
      setIsQueryingRAG(false)
    }
  }

  // Handle Starter Action Card Click
  const handleStarterClick = (action: (typeof STARTER_ACTIONS)[0]) => {
    if (!docs || docs.length === 0) {
      fileInputRef.current?.click()
      setErrorBanner(`Please upload a document first to run "${action.title}".`)
      return
    }
    void runRAGQuery(action.prompt, action.mode)
  }

  // Submit Case Directly to Doctor with Date and Time
  const handleSubmitToDoctor = async () => {
    const activeCaseId = caseId || docs[0]?.case_id
    if (!activeCaseId) {
      setErrorBanner('No active case found to submit. Please upload a medical document first.')
      return
    }

    setSubmittingToDoctor(true)
    setErrorBanner(null)

    try {
      const res = await api<{
        case_number: string
        status: string
        priority: string
        signals_detected: number
        message: string
        submitted_at?: string
      }>(`/api/cases/${activeCaseId}/submit`, { method: 'POST' })

      const now = res.submitted_at ? new Date(res.submitted_at) : new Date()
      const formattedDate = now.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
      const formattedTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      const formattedFull = `${formattedDate}, ${formattedTime}`

      setDoctorSubmittedModal({
        caseNumber: res.case_number,
        priority: res.priority,
        signals: res.signals_detected,
        date: formattedDate,
        time: formattedTime,
        dateTime: formattedFull,
        message: res.message,
      })

      // Update case status in the local list
      setCases((prev) =>
        prev.map((c) =>
          c.id === activeCaseId
            ? {
                ...c,
                status: res.status as any,
                priority: res.priority as any,
                submitted_at: res.submitted_at || new Date().toISOString(),
              }
            : c
        )
      )

      setMessages((prev) => [
        ...prev,
        {
          id: `submit-${Date.now()}`,
          role: 'assistant',
          content: `👨‍⚕️ **Case Successfully Dispatched to Doctor!**\n\n- **Case Reference:** \`${res.case_number}\`\n- **Dispatched Date & Time:** 📅 **${formattedFull}**\n- **Triage Priority:** **${res.priority}**\n- **Live Clinical Queue:** On-duty physicians have been notified directly with your uploaded records and InsightRAG clinical findings for prompt review.`,
          timestamp: formattedTime,
        },
      ])
    } catch (err) {
      setErrorBanner(
        err instanceof Error
          ? err.message
          : 'Failed to submit case to doctor. Case might already be in review.'
      )
    } finally {
      setSubmittingToDoctor(false)
    }
  }

  // View Document in browser
  const handleViewDoc = async (doc: DocumentOut) => {
    const activeCaseId = doc.case_id || caseId
    if (!activeCaseId) return
    setBusyDocId(doc.id)
    try {
      const blob = await fetchBlob(`/api/cases/${activeCaseId}/documents/${doc.id}/file`)
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener')
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to view document')
    } finally {
      setBusyDocId(null)
    }
  }

  // Delete Document
  const handleDeleteDoc = async (doc: DocumentOut) => {
    const activeCaseId = doc.case_id || caseId
    if (!activeCaseId) return
    setBusyDocId(doc.id)
    try {
      await api(`/api/cases/${activeCaseId}/documents/${doc.id}`, { method: 'DELETE' })
      setDocs((prev) => prev.filter((d) => d.id !== doc.id))
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to delete document')
    } finally {
      setBusyDocId(null)
    }
  }

  const copyToClipboard = (id: string, text: string) => {
    void navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleNewChat = () => {
    setCaseId(null)
    setDocs([])
    setMessages([])
    setInputQuery('')
    setErrorBanner(null)
  }

  const userInitial = user?.full_name ? user.full_name.charAt(0).toUpperCase() : 'S'

  return (
    <div
      className={`min-h-[calc(100vh-6rem)] rounded-3xl overflow-hidden border transition-colors flex flex-col md:flex-row shadow-sm ${
        darkMode
          ? 'bg-slate-900 text-slate-100 border-slate-800'
          : 'bg-white text-slate-900 border-slate-200/90'
      }`}
    >
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void handleFileUpload(file)
          e.target.value = ''
        }}
      />

      {/* ========================================================================= */}
      {/* 1. LEFT SIDEBAR (CONVERSATIONS) */}
      {/* ========================================================================= */}
      <aside
        className={`${
          sidebarOpen ? 'w-full md:w-64 lg:w-72' : 'hidden'
        } shrink-0 border-r flex flex-col transition-all duration-300 ${
          darkMode ? 'bg-slate-950/70 border-slate-800' : 'bg-slate-50/80 border-slate-200'
        }`}
      >
        {/* Sidebar Header */}
        <div
          className={`p-4 flex items-center justify-between border-b ${
            darkMode ? 'border-slate-800' : 'border-slate-200'
          }`}
        >
          <span className="text-xs font-bold tracking-wider uppercase text-slate-500">
            Conversations
          </span>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className={`p-1.5 rounded-lg transition ${
              darkMode
                ? 'text-slate-400 hover:text-white hover:bg-slate-800'
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
            title="Collapse sidebar"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>

        {/* New Chat Button - Styled with Swasthya brand teal */}
        <div className="p-3">
          <button
            type="button"
            onClick={handleNewChat}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-teal-700 hover:bg-teal-800 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-teal-700/20 transition active:scale-98"
          >
            <Plus className="h-4 w-4" />
            + New Chat
          </button>
        </div>

        {/* Search Bar */}
        <div className="px-3 pb-2">
          <div
            className={`flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs border ${
              darkMode
                ? 'bg-slate-900 border-slate-800 text-slate-400'
                : 'bg-white border-slate-200 text-slate-600 shadow-2xs'
            }`}
          >
            <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <input
              type="text"
              value={searchHistoryQuery}
              onChange={(e) => setSearchHistoryQuery(e.target.value)}
              placeholder="Search..."
              className="bg-transparent w-full focus:outline-none text-xs placeholder:text-slate-400"
            />
            <span
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                darkMode ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-500'
              }`}
            >
              Ctrl+K
            </span>
          </div>
        </div>

        {/* Conversations History List */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
          {cases.length === 0 ? (
            <div className="py-16 text-center text-xs text-slate-400 flex flex-col items-center justify-center">
              <span
                className={`p-3 rounded-2xl mb-2 ${
                  darkMode ? 'bg-slate-800 text-slate-400' : 'bg-slate-200/70 text-slate-500'
                }`}
              >
                <Bot className="h-5 w-5" />
              </span>
              <p className="font-semibold text-slate-600">No conversations yet</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Upload a document to begin</p>
            </div>
          ) : (
            cases
              .filter(
                (c) =>
                  !searchHistoryQuery ||
                  (c.chief_concern &&
                    c.chief_concern.toLowerCase().includes(searchHistoryQuery.toLowerCase())) ||
                  c.case_number.toLowerCase().includes(searchHistoryQuery.toLowerCase())
              )
              .map((c) => {
                const isSelected = caseId === c.id
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setCaseId(c.id)
                      setMessages([])
                    }}
                    className={`w-full text-left p-2.5 rounded-xl text-xs transition flex items-start gap-2.5 ${
                      isSelected
                        ? darkMode
                          ? 'bg-teal-950/60 text-teal-300 border border-teal-800 font-semibold'
                          : 'bg-teal-50 text-teal-900 border border-teal-200 font-semibold shadow-2xs'
                        : darkMode
                        ? 'text-slate-400 hover:bg-slate-850 hover:text-slate-200'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <FileText
                      className={`h-4 w-4 shrink-0 mt-0.5 ${
                        isSelected ? 'text-teal-600' : 'opacity-60'
                      }`}
                    />
                    <div className="truncate flex-1">
                      <p className="truncate font-medium">
                        {c.chief_concern?.replace(/^Medical Document:\s*/i, '') || c.case_number}
                      </p>
                      <p className="text-[10px] opacity-60 font-mono mt-0.5">
                        {c.case_number} · {c.status}
                        {c.submitted_at &&
                          ` · ${new Date(c.submitted_at).toLocaleDateString([], {
                            month: 'short',
                            day: 'numeric',
                          })}`}
                      </p>
                    </div>
                  </button>
                )
              })
          )}
        </div>

        {/* User Profile Footer */}
        <div
          className={`p-3.5 border-t flex items-center justify-between ${
            darkMode ? 'bg-slate-950/90 border-slate-800' : 'bg-white border-slate-200'
          }`}
        >
          <div className="flex items-center gap-2.5 truncate">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-teal-600 to-emerald-600 text-xs font-bold text-white shadow-sm">
              {userInitial}
            </span>
            <div className="truncate">
              <p
                className={`text-xs font-bold truncate leading-tight ${
                  darkMode ? 'text-slate-200' : 'text-slate-900'
                }`}
              >
                {user?.full_name || 'Shubham Patra'}
              </p>
              <p className="text-[10px] text-slate-500 truncate leading-tight mt-0.5">
                {user?.email || 'patrashubham031@gmail.com'}
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* ========================================================================= */}
      {/* 2. MAIN INSIGHTRAG WORKSPACE */}
      {/* ========================================================================= */}
      <main className="flex-1 flex flex-col min-w-0 h-[calc(100vh-6rem)] relative">
        {/* Top Navbar */}
        <header
          className={`h-14 px-4 sm:px-6 flex items-center justify-between border-b shrink-0 ${
            darkMode
              ? 'bg-slate-900/90 border-slate-800'
              : 'bg-white/95 border-slate-200'
          } backdrop-blur-md z-10`}
        >
          {/* Left Brand */}
          <div className="flex items-center gap-3">
            {!sidebarOpen && (
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className={`p-1.5 rounded-lg transition ${
                  darkMode
                    ? 'text-slate-400 hover:text-white hover:bg-slate-800'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                }`}
                title="Open sidebar"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </button>
            )}

            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-teal-600 to-cyan-600 text-white shadow-md shadow-teal-600/20">
                <FileText className="h-4 w-4" />
              </span>
              <div>
                <span
                  className={`font-extrabold text-sm sm:text-base tracking-tight ${
                    darkMode ? 'text-white' : 'text-slate-900'
                  }`}
                >
                  InsightRAG
                </span>
                <span className="ml-1.5 rounded-md bg-teal-100/80 px-1.5 py-0.5 text-[9px] font-bold text-teal-800">
                  DocAI
                </span>
              </div>
            </div>
          </div>

          {/* Right Action Controls */}
          <div className="flex items-center gap-2.5">
            {/* Direct Submit to Doctor Button */}
            <button
              type="button"
              onClick={handleSubmitToDoctor}
              disabled={submittingToDoctor}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 px-3.5 py-1.5 text-xs font-bold text-white shadow-md shadow-teal-800/20 transition active:scale-95 disabled:opacity-50"
            >
              {submittingToDoctor ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              <span className="hidden sm:inline">Submit to Doctor</span>
              <span className="sm:hidden">Send</span>
            </button>

            {/* Documents Counter Button */}
            <button
              type="button"
              onClick={() => setDocsDrawerOpen(true)}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold border transition ${
                darkMode
                  ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750 hover:text-white'
                  : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <FolderOpen className="h-3.5 w-3.5 text-teal-600" />
              <span>Documents ({docs.length})</span>
            </button>

            {/* Theme Toggle (Light / Dark) */}
            <button
              type="button"
              onClick={() => setDarkMode(!darkMode)}
              className={`p-2 rounded-xl border transition ${
                darkMode
                  ? 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                  : 'bg-slate-100 border-slate-200 text-slate-600 hover:text-slate-900'
              }`}
              title="Toggle theme"
            >
              {darkMode ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            </button>
          </div>
        </header>

        {/* Global Error Banner */}
        {errorBanner && (
          <div className="mx-4 mt-2 p-3 rounded-2xl border border-red-300 bg-red-50 text-red-800 text-xs flex items-center justify-between animate-in fade-in">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
              <span>{errorBanner}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorBanner(null)}
              className="p-1 hover:text-red-950"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Main Conversation or Empty Hero Area */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-6">
          {messages.length === 0 ? (
            /* =============================================================== */
            /* HERO EMPTY STATE (CLEAN CLINICAL AESTHETIC) */
            /* =============================================================== */
            <div className="max-w-2xl mx-auto flex flex-col items-center justify-center text-center my-auto min-h-[60vh] space-y-7">
              {/* Glowing Robot Avatar Icon */}
              <div
                className="relative group cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="absolute -inset-4 rounded-3xl bg-teal-500/20 blur-2xl group-hover:bg-cyan-500/30 transition duration-500" />
                <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-teal-600 to-cyan-500 text-white shadow-xl shadow-teal-600/30">
                  <Bot className="h-8 w-8" />
                </div>
              </div>

              {/* Title & Subtitle */}
              <div className="space-y-2">
                <h1
                  className={`text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight ${
                    darkMode ? 'text-white' : 'text-slate-900'
                  }`}
                >
                  How can I help with your{' '}
                  <span className="bg-gradient-to-r from-teal-700 via-teal-600 to-cyan-600 bg-clip-text text-transparent">
                    documents?
                  </span>
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 max-w-lg mx-auto leading-relaxed">
                  Upload your prescriptions, lab reports, or scans. InsightRAG will find grounded clinical
                  answers from your files.
                </p>
              </div>

              {/* Central Upload CTA Button */}
              <div className="space-y-2 w-full max-w-xs">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full flex items-center justify-center gap-2.5 rounded-2xl bg-teal-700 hover:bg-teal-800 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-teal-800/25 transition active:scale-95 disabled:opacity-50"
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Paperclip className="h-4 w-4" />
                  )}
                  <span>
                    {docs.length > 0 ? 'Upload another document' : 'Upload your first document'}
                  </span>
                </button>
                <p className="text-[11px] text-slate-400 font-mono">
                  PDF · DOCX · TXT · CSV · Max 20MB
                </p>
              </div>

              {/* 6 Action Starter Cards in 3x2 Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 w-full pt-3">
                {STARTER_ACTIONS.map((action) => {
                  const Icon = action.icon
                  return (
                    <button
                      key={action.mode}
                      type="button"
                      onClick={() => handleStarterClick(action)}
                      className={`group flex flex-col text-left p-4 rounded-2xl border transition-all duration-200 hover:shadow-md active:scale-98 ${
                        darkMode
                          ? 'border-slate-800 bg-slate-850/80 hover:border-slate-700 hover:bg-slate-800'
                          : 'border-slate-200/90 bg-white hover:border-teal-300 hover:bg-teal-50/20 shadow-2xs'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 mb-1.5">
                        <span
                          className={`p-1.5 rounded-lg border ${
                            darkMode ? action.iconDark : action.iconLight
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <h4
                          className={`text-xs font-bold ${
                            darkMode
                              ? 'text-slate-200 group-hover:text-white'
                              : 'text-slate-900 group-hover:text-teal-900'
                          }`}
                        >
                          {action.title}
                        </h4>
                      </div>
                      <p className="text-[11px] text-slate-500 group-hover:text-slate-600 leading-tight">
                        {action.description}
                      </p>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : (
            /* =============================================================== */
            /* CHAT TIMELINE STREAM */
            /* =============================================================== */
            <div className="max-w-3xl mx-auto space-y-6">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${
                    msg.role === 'user' ? 'items-end' : 'items-start'
                  } space-y-1.5`}
                >
                  {/* Sender identity */}
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500 px-1">
                    {msg.role === 'assistant' ? (
                      <>
                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-teal-600 text-white text-[9px] font-black">
                          AI
                        </span>
                        <span className="font-semibold text-slate-700">InsightRAG</span>
                      </>
                    ) : (
                      <span className="font-semibold text-slate-700">You</span>
                    )}
                    <span>· {msg.timestamp}</span>
                  </div>

                  {/* Message Bubble */}
                  <div
                    className={`rounded-2xl p-4.5 text-xs sm:text-sm leading-relaxed max-w-2xl shadow-sm ${
                      msg.role === 'user'
                        ? 'bg-teal-700 text-white rounded-br-xs'
                        : darkMode
                        ? 'bg-slate-800/90 border border-slate-700 text-slate-100 rounded-bl-xs'
                        : 'bg-white border border-slate-200/90 text-slate-800 rounded-bl-xs'
                    }`}
                  >
                    {/* Message Body */}
                    <div className="whitespace-pre-line font-sans">{msg.content}</div>

                    {/* Citations Badges */}
                    {msg.citations && msg.citations.length > 0 && (
                      <div
                        className={`mt-3 pt-3 border-t space-y-1.5 ${
                          darkMode ? 'border-slate-700' : 'border-slate-100'
                        }`}
                      >
                        <p className="text-[10px] font-bold uppercase tracking-wider text-teal-700">
                          Source Citations:
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {msg.citations.map((c, i) => (
                            <span
                              key={i}
                              title={c.excerpt}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-mono border ${
                                darkMode
                                  ? 'bg-slate-900 border-slate-700 text-teal-300'
                                  : 'bg-teal-50 border-teal-200 text-teal-800'
                              }`}
                            >
                              <FileText className="h-3 w-3 text-teal-600" />
                              {c.filename}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Clinical Warning Flags */}
                    {msg.clinicalFlags && msg.clinicalFlags.length > 0 && (
                      <div className="mt-2.5 p-2.5 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 text-xs flex items-center gap-2">
                        <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600" />
                        <div>
                          <strong className="block text-[11px] uppercase">
                            Clinical Observation:
                          </strong>
                          {msg.clinicalFlags.join(', ')}
                        </div>
                      </div>
                    )}

                    {/* Copy Button */}
                    {msg.role === 'assistant' && (
                      <div className="mt-3 flex justify-end">
                        <button
                          type="button"
                          onClick={() => copyToClipboard(msg.id, msg.content)}
                          className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 transition"
                        >
                          {copiedId === msg.id ? (
                            <>
                              <Check className="h-3 w-3 text-emerald-600" />
                              <span className="text-emerald-600">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Suggested Followups */}
                  {msg.suggestedFollowups && msg.suggestedFollowups.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1 max-w-2xl">
                      {msg.suggestedFollowups.map((s, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => void runRAGQuery(s)}
                          className={`text-[11px] rounded-xl border px-3 py-1 transition ${
                            darkMode
                              ? 'border-slate-800 bg-slate-900 text-slate-300 hover:border-teal-500 hover:text-teal-300'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-teal-300 hover:text-teal-800 hover:bg-teal-50/30 shadow-2xs'
                          }`}
                        >
                          💬 {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {/* Thinking Indicator */}
              {isQueryingRAG && (
                <div
                  className={`flex items-center gap-2 p-3.5 rounded-2xl border text-xs max-w-xs animate-pulse ${
                    darkMode
                      ? 'bg-slate-800 border-slate-700 text-teal-400'
                      : 'bg-teal-50 border-teal-200 text-teal-800 shadow-2xs'
                  }`}
                >
                  <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
                  <span>InsightRAG reasoning over documents...</span>
                </div>
              )}

              <div ref={chatBottomRef} />
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* 3. BOTTOM PILL-SHAPED CHAT INPUT BAR */}
        {/* ========================================================================= */}
        <div
          className={`p-4 border-t ${
            darkMode ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200'
          }`}
        >
          <div className="max-w-3xl mx-auto space-y-2">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void runRAGQuery(inputQuery)
              }}
              className={`flex items-center gap-2 rounded-2xl px-3.5 py-2.5 border transition-all shadow-sm ${
                darkMode
                  ? 'bg-slate-950 border-slate-750 focus-within:border-teal-500'
                  : 'bg-white border-slate-300 focus-within:border-teal-600 focus-within:ring-2 focus-within:ring-teal-500/20'
              }`}
            >
              {/* Paperclip upload button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="p-1.5 rounded-xl text-slate-400 hover:text-teal-600 transition shrink-0"
                title="Attach documents (PDF, DOCX, TXT, CSV)"
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
                ) : (
                  <Paperclip className="h-4 w-4" />
                )}
              </button>

              {/* Chat Input Field */}
              <input
                type="text"
                value={inputQuery}
                onChange={(e) => setInputQuery(e.target.value)}
                placeholder="Ask about your documents..."
                className={`flex-1 bg-transparent text-xs sm:text-sm focus:outline-none ${
                  darkMode
                    ? 'text-slate-100 placeholder:text-slate-500'
                    : 'text-slate-900 placeholder:text-slate-400'
                }`}
              />

              {/* Send Button */}
              <button
                type="submit"
                disabled={!inputQuery.trim() || isQueryingRAG}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-teal-700 hover:bg-teal-800 text-white shadow-md transition disabled:opacity-30 disabled:hover:bg-teal-700 active:scale-95 shrink-0"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
            </form>

            <p className="text-[10px] text-center text-slate-400 font-mono">
              Enter to send · Shift+Enter for new line · AI can make mistakes
            </p>
          </div>
        </div>
      </main>

      {/* ========================================================================= */}
      {/* 4. DOCUMENTS SLIDE-OVER DRAWER */}
      {/* ========================================================================= */}
      {docsDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs animate-in fade-in">
          <div
            className={`w-full max-w-md h-full p-6 flex flex-col border-l shadow-2xl ${
              darkMode ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <FolderOpen className="h-5 w-5 text-teal-600" />
                <h3 className="font-bold text-sm">Indexed Medical Documents</h3>
              </div>
              <button
                type="button"
                onClick={() => setDocsDrawerOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-3">
              {docs.length === 0 ? (
                <div className="py-20 text-center text-xs text-slate-400">
                  <UploadCloud className="mx-auto h-8 w-8 text-slate-400 mb-2" />
                  <p>No documents uploaded in this record yet.</p>
                </div>
              ) : (
                docs.map((doc) => (
                  <div
                    key={doc.id}
                    className={`p-3 rounded-2xl border flex items-center justify-between gap-3 text-xs ${
                      darkMode ? 'border-slate-800 bg-slate-850' : 'border-slate-200 bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <FileText className="h-4 w-4 text-teal-600 shrink-0" />
                      <div className="truncate">
                        <p className="font-bold truncate text-slate-900">{doc.filename}</p>
                        <p className="text-[10px] text-slate-500 font-mono">
                          {(doc.size_bytes / 1024).toFixed(1)} KB · {doc.status}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => void handleViewDoc(doc)}
                        disabled={busyDocId === doc.id}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-teal-700 transition"
                        title="View file"
                      >
                        {busyDocId === doc.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <FileText className="h-3.5 w-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteDoc(doc)}
                        disabled={busyDocId === doc.id}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 transition"
                        title="Delete file"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-4 border-t border-slate-200 space-y-2">
              <button
                type="button"
                onClick={() => {
                  setDocsDrawerOpen(false)
                  fileInputRef.current?.click()
                }}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-teal-700 hover:bg-teal-800 py-2.5 text-xs font-bold text-white shadow-sm"
              >
                <Plus className="h-4 w-4" />
                Upload New Document
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. DOCTOR SUBMITTED CONFIRMATION MODAL */}
      {/* ========================================================================= */}
      {doctorSubmittedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in zoom-in-95">
          <div className="w-full max-w-md rounded-3xl border border-emerald-300 bg-white p-6 shadow-2xl text-slate-900 space-y-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                <CheckCircle2 className="h-6 w-6" />
              </span>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Successfully Sent to Doctor!
                </h3>
                <p className="text-xs text-emerald-700">
                  Notification delivered to clinical queue
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Case Reference:</span>
                <span className="font-mono font-bold text-slate-900">
                  {doctorSubmittedModal.caseNumber}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Triage Priority:</span>
                <span className="font-bold text-emerald-700">
                  {doctorSubmittedModal.priority}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Submission Date & Time:</span>
                <span className="text-slate-900 font-bold">📅 {doctorSubmittedModal.dateTime || doctorSubmittedModal.time}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Doctor Queue:</span>
                <span className="text-teal-700 font-semibold">Active & Notified</span>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Your attending healthcare professional has received your case details, uploaded medical files,
              and InsightRAG report summary for immediate review.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDoctorSubmittedModal(null)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  setDoctorSubmittedModal(null)
                  navigate(`/app/patient/cases/${caseId}`)
                }}
                className="rounded-xl bg-teal-700 hover:bg-teal-800 px-4 py-2 text-xs font-bold text-white shadow-sm"
              >
                Track Case Live
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
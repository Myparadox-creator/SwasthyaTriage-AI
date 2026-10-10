import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AppShell from './components/Layout/AppShell'
import { GuestOnly, ProtectedRoute, RequireRole } from './components/guards'
import SplashPage from './pages/SplashPage'
import LandingPage from './pages/LandingPage'
import NotFound from './pages/NotFound'
import AuthLayout from './pages/auth/AuthLayout'
import LoginPage from './pages/auth/LoginPage'
import SignupPage from './pages/auth/SignupPage'
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage'
import ResetPasswordPage from './pages/auth/ResetPasswordPage'
import VerifyEmailPage from './pages/auth/VerifyEmailPage'
import SsoCallbackPage from './pages/auth/SsoCallbackPage'
import OAuthSyncPage from './pages/auth/OAuthSyncPage'
import PatientDashboard from './pages/app/patient/PatientDashboard'
import NewAssessment from './pages/app/patient/NewAssessment'
import CaseChat from './pages/app/patient/CaseChat'
import PatientUploads from './pages/app/patient/PatientUploads'
import PatientVoiceAssessment from './pages/app/patient/PatientVoiceAssessment'
import PatientLiveVoice from './pages/app/patient/PatientLiveVoice'
import VoiceCallbackPage from './pages/app/patient/VoiceCallbackPage'
import PrivacyCenterPage from './pages/app/patient/PrivacyCenterPage'
import HcwDashboard from './pages/app/hcw/HcwDashboard'
import PatientQueue from './pages/app/hcw/PatientQueue'
import CaseReview from './pages/app/hcw/CaseReview'
import Followups from './pages/app/hcw/Followups'
import Referrals from './pages/app/hcw/Referrals'
import AuditCenter from './pages/app/hcw/AuditCenter'
import HcwVoiceCalls from './pages/app/hcw/HcwVoiceCalls'
import HcwReports from './pages/app/hcw/HcwReports'
import FacilityAdminDashboard from './pages/app/admin/FacilityAdminDashboard'
import SuperAdminDashboard from './pages/app/admin/SuperAdminDashboard'
import CommunicationCentre from './pages/app/communication/CommunicationCentre'
import SyncQueuePage from './pages/app/offline/SyncQueuePage'
import NearbyPharmaciesPage from './pages/app/pharmacies/NearbyPharmaciesPage'
import { useAuthStore } from './stores/auth'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
})

function AdminRedirect() {
  const user = useAuthStore((s) => s.user)
  if (user?.role === 'SUPER_ADMIN') {
    return <Navigate to="super" replace />
  }
  return <Navigate to="facility" replace />
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<SplashPage />} />
          <Route path="/landing" element={<LandingPage />} />

          <Route element={<GuestOnly />}>
            <Route path="/auth" element={<AuthLayout />}>
              <Route path="login" element={<LoginPage />} />
              <Route path="signup" element={<SignupPage />} />
              <Route path="forgot-password" element={<ForgotPasswordPage />} />
              <Route path="reset-password" element={<ResetPasswordPage />} />
              <Route path="verify-email" element={<VerifyEmailPage />} />
            </Route>
          </Route>

          <Route path="/sso-callback" element={<SsoCallbackPage />} />
          <Route path="/auth/oauth-sync" element={<OAuthSyncPage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              {/* PATIENT ROUTES */}
              <Route path="/app/patient" element={<RequireRole roles={['PATIENT']} />}>
                <Route index element={<Navigate to="dashboard" replace />} />
                <Route path="dashboard" element={<PatientDashboard />} />
                <Route path="new" element={<NewAssessment />} />
                <Route path="cases/:caseId" element={<CaseChat />} />
                <Route path="uploads" element={<PatientUploads />} />
                <Route path="voice" element={<PatientVoiceAssessment />} />
        <Route path="voice/live" element={<PatientLiveVoice />} />
                <Route path="callback" element={<VoiceCallbackPage />} />
                <Route path="privacy" element={<PrivacyCenterPage />} />
                <Route path="pharmacies" element={<NearbyPharmaciesPage />} />
              </Route>

              {/* HEALTHCARE WORKER ROUTES */}
              <Route
                path="/app/hcw"
                element={
                  <RequireRole
                    roles={['HEALTHCARE_WORKER', 'FACILITY_ADMIN', 'SUPER_ADMIN']}
                  />
                }
              >
                <Route index element={<Navigate to="dashboard" replace />} />
                <Route path="dashboard" element={<HcwDashboard />} />
                <Route path="queue" element={<PatientQueue />} />
                <Route path="cases" element={<Navigate to="queue" replace />} />
                <Route path="cases/:caseId" element={<CaseReview />} />
                <Route path="followups" element={<Followups />} />
                <Route path="referrals" element={<Referrals />} />
                <Route path="audit" element={<AuditCenter />} />
                <Route path="voice" element={<HcwVoiceCalls />} />
                <Route path="communication" element={<CommunicationCentre />} />
                <Route path="sync-queue" element={<SyncQueuePage />} />
                <Route path="pharmacies" element={<NearbyPharmaciesPage />} />
                <Route path="reports" element={<HcwReports />} />
              </Route>

              {/* ADMIN ROUTES */}
              <Route
                path="/app/admin"
                element={<RequireRole roles={['FACILITY_ADMIN', 'SUPER_ADMIN']} />}
              >
                <Route index element={<AdminRedirect />} />
                <Route path="dashboard" element={<AdminRedirect />} />
                <Route path="communication" element={<CommunicationCentre />} />
                <Route path="sync-queue" element={<SyncQueuePage />} />
                <Route path="facility" element={<FacilityAdminDashboard />} />
                <Route element={<RequireRole roles={['SUPER_ADMIN']} />}>
                  <Route path="super" element={<SuperAdminDashboard />} />
                </Route>
              </Route>

            </Route>
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { SessionProvider } from './components/SessionTimeout'
import LoginPage from './pages/LoginPage'
import { useTweaks } from './hooks/useTweaks'
import { shade } from './utils/color'
import { formatLocalClock } from './utils/format'
import Topbar from './components/layout/Topbar'
import Sidebar from './components/layout/Sidebar'
import Statusbar from './components/layout/Statusbar'
import MobileNav from './components/layout/MobileNav'
import MobileDrawer from './components/layout/MobileDrawer'

import { LoadingState } from './components/ui'
import { TweaksPanel, TweakSection, TweakRadio, TweakColor, TweakToggle } from './components/tweaks/TweaksPanel'
import OverviewPage from './pages/OverviewPage'
import TrafficPage from './pages/TrafficPage'
import ThreatsPage from './pages/ThreatsPage'
import UsersPage from './pages/UsersPage'
import ApiKeysPage from './pages/ApiKeysPage'
import AppsPage from './pages/AppsPage'
import AiProvidersPage from './pages/AiProvidersPage'
import UpstreamProvidersPage from './pages/UpstreamProvidersPage'
import ClassificationProvidersPage from './pages/ClassificationProvidersPage'
import ProfilePage from './pages/ProfilePage'
import AuditPage from './pages/AuditPage'
import GatewayPage from './pages/GatewayPage'
import DetectorsPage from './pages/DetectorsPage'
import AIActivitiesPage from './pages/AIActivitiesPage'
import NotificationsPage from './pages/NotificationsPage'
import NetworkAclPage from './pages/NetworkAclPage'
import EmailLogPage from './pages/EmailLogPage'
import IncidentsPage from './pages/IncidentsPage'
import PasswordPolicyPage from './pages/PasswordPolicyPage'
import EmbeddingSettingsPage from './pages/EmbeddingSettingsPage'
import ResponseCacheSettingsPage from './pages/ResponseCacheSettingsPage'
import ToolManagementPage from './pages/ToolManagementPage'
import ThreatKnowledgePage from './pages/ThreatKnowledgePage'
import T2AgentPage from './pages/T2AgentPage'
import EmbeddingProvidersPage from './pages/EmbeddingProvidersPage'
import EmbeddingLogsPage from './pages/EmbeddingLogsPage'
import ProviderCallLogsPage from './pages/ProviderCallLogsPage'
import ContentQualityLogPage from './pages/ContentQualityLogPage'
import AdminKeysPage from './pages/AdminKeysPage'
import DetectionFrameworksPage from './pages/DetectionFrameworksPage'
import PromptTestingPage from './pages/PromptTestingPage'
import GatewayEmbeddingTestPage from './pages/GatewayEmbeddingTestPage'

import OnboardingPage from './pages/OnboardingPage'
import AccessRequestsAdminPage from './pages/AccessRequestsAdminPage'
import OrgManagementPage from './pages/OrgManagementPage'
import ProviderUsagePage from './pages/ProviderUsagePage'
import ReloadLogPage from './pages/ReloadLogPage'
import QualityReviewLogPage from './pages/QualityReviewLogPage'
import DataReviewProviderPage from './pages/DataReviewProviderPage'
import ContentQualityJudgePage from './pages/ContentQualityJudgePage'
import ContentQualityProviderPage from './pages/ContentQualityProviderPage'

import StubPage from './pages/StubPage'
import ForcePasswordChangePage from './pages/ForcePasswordChangePage'
import RequestAccessPage from './pages/RequestAccessPage'

import type { TweakValues } from './types'

const TWEAK_DEFAULTS: TweakValues = {
  theme: 'dark',
  density: 'default',
  accent: '#76B400',
  overviewLayout: 'default',
  tickerFlow: true,
}

function AppShell() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [tickClock, setTickClock] = useState(() => formatLocalClock())

  // density
  useEffect(() => {
    const r = document.documentElement
    if (tweaks.density === "compact") {
      r.style.setProperty("--row-md", "28px")
      r.style.setProperty("--row-sm", "24px")
      r.style.setProperty("--fs-13", "12px")
    } else if (tweaks.density === "comfortable") {
      r.style.setProperty("--row-md", "36px")
      r.style.setProperty("--row-sm", "32px")
      r.style.setProperty("--fs-13", "13px")
    } else {
      r.style.removeProperty("--row-md")
      r.style.removeProperty("--row-sm")
      r.style.removeProperty("--fs-13")
    }
  }, [tweaks.density])

  // accent
  useEffect(() => {
    const isDark = tweaks.theme === "dark"
    const hex = tweaks.accent
    const hov = shade(hex, isDark ? 0.18 : -0.18)
    document.documentElement.style.setProperty("--accent", hex)
    document.documentElement.style.setProperty("--accent-hover", hov)
    document.documentElement.style.setProperty("--border-accent", hex)
  }, [tweaks.accent, tweaks.theme])

  // clock
  useEffect(() => {
    const t = setInterval(() => {
      setTickClock(formatLocalClock())
    }, 1000)
    return () => clearInterval(t)
  }, [])

   return (
    <div className="app">
      <Topbar
        theme={tweaks.theme}
        onTheme={() => setTweak("theme", tweaks.theme === "dark" ? "light" : "dark")}
        onMenu={() => setMobileOpen(true)}
      />
      <Sidebar />

      <main className="main">
        <Routes>
          <Route path="/" element={<OverviewPage tweaks={tweaks} />} />
          <Route path="/traffic" element={<TrafficPage tweaks={tweaks} />} />
          <Route path="/threats" element={<ThreatsPage tweaks={tweaks} />} />
          {/* Admin-only routes (Settings + Providers sections) */}
          <Route path="/users" element={<AdminGuard><UsersPage tweaks={tweaks} /></AdminGuard>} />
          <Route path="/ai-providers" element={<AdminGuard><AiProvidersPage tweaks={tweaks} /></AdminGuard>} />
          <Route path="/embedding-providers" element={<AdminGuard><EmbeddingProvidersPage /></AdminGuard>} />
          <Route path="/providers" element={<AdminGuard><UpstreamProvidersPage /></AdminGuard>} />
          <Route path="/provider-usage" element={<AdminGuard><ProviderUsagePage /></AdminGuard>} />
          <Route path="/classifiers" element={<AdminGuard><ClassificationProvidersPage tweaks={tweaks} /></AdminGuard>} />
          <Route path="/notifications" element={<AdminGuard><NotificationsPage tweaks={tweaks} /></AdminGuard>} />
          <Route path="/network-acl" element={<AdminGuard><NetworkAclPage tweaks={tweaks} /></AdminGuard>} />
          <Route path="/password-policy" element={<AdminGuard><PasswordPolicyPage tweaks={tweaks} /></AdminGuard>} />
          <Route path="/response-cache" element={<AdminGuard><ResponseCacheSettingsPage tweaks={tweaks} /></AdminGuard>} />
          <Route path="/embedding-settings" element={<AdminGuard><EmbeddingSettingsPage tweaks={tweaks} /></AdminGuard>} />
          <Route path="/adminkeys" element={<AdminGuard><AdminKeysPage tweaks={tweaks} /></AdminGuard>} />
          <Route path="/onboarding" element={<AdminGuard><OnboardingPage tweaks={tweaks} /></AdminGuard>} />
          <Route path="/gateways" element={<AdminGuard><GatewayPage tweaks={tweaks} /></AdminGuard>} />
          <Route path="/data-review-provider" element={<AdminGuard><DataReviewProviderPage /></AdminGuard>} />
          <Route path="/quality-review-log" element={<AdminGuard><QualityReviewLogPage /></AdminGuard>} />
          <Route path="/content-quality-provider" element={<AdminGuard><ContentQualityProviderPage /></AdminGuard>} />
          <Route path="/organizations" element={<AdminGuard><OrgManagementPage /></AdminGuard>} />
          <Route path="/access-requests" element={<AdminGuard><AccessRequestsAdminPage tweaks={tweaks} /></AdminGuard>} />

          {/* Admin+Viewer-only routes (Data Management items users cannot see) */}
          <Route path="/audit" element={<ViewerGuard><AuditPage /></ViewerGuard>} />
          <Route path="/embedding-logs" element={<ViewerGuard><EmbeddingLogsPage tweaks={tweaks} /></ViewerGuard>} />
          <Route path="/provider-logs" element={<ViewerGuard><ProviderCallLogsPage tweaks={tweaks} /></ViewerGuard>} />
          <Route path="/content-quality-log" element={<ViewerGuard><ContentQualityLogPage tweaks={tweaks} /></ViewerGuard>} />
          <Route path="/email-log" element={<ViewerGuard><EmailLogPage tweaks={tweaks} /></ViewerGuard>} />
          <Route path="/reload-logs" element={<ViewerGuard><ReloadLogPage tweaks={tweaks} /></ViewerGuard>} />

          {/* All authenticated users */}
          <Route path="/apikeys" element={<ApiKeysPage tweaks={tweaks} />} />
          <Route path="/apps" element={<AppsPage tweaks={tweaks} />} />
          <Route path="/detectors" element={<DetectorsPage tweaks={tweaks} />} />

          <Route path="/ai-activities" element={<AIActivitiesPage tweaks={tweaks} />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/threat-knowledge" element={<ThreatKnowledgePage tweaks={tweaks} />} />
          <Route path="/detection-frameworks" element={<DetectionFrameworksPage tweaks={tweaks} />} />
          <Route path="/incidents" element={<IncidentsPage tweaks={tweaks} />} />
          <Route path="/tools" element={<ToolManagementPage tweaks={tweaks} />} />
          {/* Knowledge-admin routes (admin + knowledge_admin) */}
          <Route path="/t2-agent" element={<AdminGuard><T2AgentPage tweaks={tweaks} /></AdminGuard>} />
          <Route path="/content-quality-judge" element={<AdminGuard><ContentQualityJudgePage tweaks={tweaks} /></AdminGuard>} />
          <Route path="/prompt-testing" element={<PromptTestingPage />} />
          <Route path="/gateway-embedding-test" element={<GatewayEmbeddingTestPage />} />
          <Route path="/:stub" element={<StubPage />} />
        </Routes>
      </main>

      <Statusbar tickClock={tickClock} />
      <MobileNav />
      <MobileDrawer open={mobileOpen} onClose={() => setMobileOpen(false)} theme={tweaks.theme} />

      <TweaksPanel title="Console Tweaks">
        <TweakSection label="Appearance" />
        <TweakRadio label="Theme" value={tweaks.theme} onChange={v => setTweak("theme", v as TweakValues['theme'])}
          options={[{ value: "dark", label: "Dark" }, { value: "light", label: "Light" }]} />
        <TweakRadio label="Density" value={tweaks.density} onChange={v => setTweak("density", v as TweakValues['density'])}
          options={[
            { value: "compact",     label: "Dense" },
            { value: "default",     label: "Std" },
            { value: "comfortable", label: "Loose" },
          ]} />
        <TweakColor label="Accent" value={tweaks.accent} onChange={v => setTweak("accent", v as string)}
          options={[["#76B400", "#9FD13D", "#5A8E00"], ["#5B8DEF", "#1E4A8A", "#3A6BD4"], ["#E84F36", "#C03A2B", "#EE8073"], ["#D9A32E", "#B8860B", "#E5B73D"]]} />
        <TweakSection label="Behaviour" />
        <TweakRadio label="Overview" value={tweaks.overviewLayout} onChange={v => setTweak("overviewLayout", v as TweakValues['overviewLayout'])}
          options={[{ value: "default", label: "Cards" }, { value: "rail", label: "Rail" }]} />
        <TweakToggle label="Flash new rows in stream" value={tweaks.tickerFlow} onChange={v => setTweak("tickerFlow", v)} />
      </TweaksPanel>
    </div>
  )
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) {
    return <LoadingState message="Loading…" size="lg" />
  }
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

// Redirects user-role accounts away from admin/viewer-only pages.
function AdminGuard({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useAuth()
  if (!isAdmin) return <Navigate to="/" replace />
  return <>{children}</>
}

function ViewerGuard({ children }: { children: React.ReactNode }) {
  const { hasViewerOrAbove } = useAuth()
  if (!hasViewerOrAbove) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SessionProvider>
       <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/request-access" element={<RequestAccessPage />} />
          <Route path="/force-password-change" element={<ForcePasswordChangePage />} />
          <Route path="/*" element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          } />
        </Routes>
        </SessionProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

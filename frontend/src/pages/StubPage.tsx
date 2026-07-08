import React from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Layers, ChevronL } from '../components/ui/Icons'
import { PageHeader } from '../components/ui'

const LABELS: Record<string, string> = {
  sources: "Sources",
  detectors: "Detectors",
  apps: "AI Apps",
  audit: "Audit Log",
  incidents: "Incidents",
  users: "Users & roles",
  apikeys: "API keys",
  workspace: "Workspace",
  integrations: "Integrations",
}

const StubPage: React.FC = () => {
  const { stub } = useParams<{ stub: string }>()
  const navigate = useNavigate()
  const label = (stub && LABELS[stub]) || (stub ? stub.charAt(0).toUpperCase() + stub.slice(1) : "Page")

  return (
    <div className="page fade-in">
      <PageHeader title={label} subtitle="This area is wired in production but stubbed in the prototype."
        crumbs={<><span>Console</span><span className="sep">/</span><span className="here">{label}</span></>}
        actions={<button className="btn btn-secondary" onClick={() => navigate('/')}><ChevronL w={13} /> Back to overview</button>} />
      <div className="card" style={{ padding: 24, textAlign: "center" }}>
        <Layers w={32} style={{ color: "var(--fg-tertiary)" }} />
        <div style={{ fontFamily: "var(--font-display)", fontSize: 22, marginTop: 12 }}>{label}</div>
        <div className="caption" style={{ fontSize: 12, marginTop: 6 }}>
          Not implemented in this prototype scope. Available in the full console: live editing, version history, role-scoped access.
        </div>
      </div>
    </div>
  )
}

export default StubPage

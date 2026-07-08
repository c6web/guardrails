import React from 'react'
import { RefreshCw, Trash2 } from '../components/ui/Icons'
import { DeleteLogsModal } from '../components/DeleteLogsModal'
import { deleteAuditLogsBefore, deleteAllAuditLogs, deleteActivityLogsBefore, deleteAllUserActivityLogs, deleteAdminLogsBefore, deleteAllAdminActivityLogs } from '../api/logs'
import ComplianceTab from './ComplianceTab'
import UserActivityTab from './UserActivityTab'
import AdminActionsTab from './AdminActionsTab'
import { PageHeader, Breadcrumbs } from '../components/ui'

type AuditTab = 'compliance' | 'activity' | 'admin'

export default function AuditPage() {
  const [tab, setTab] = React.useState<AuditTab>('compliance')
  const [showDeleteModal, setShowDeleteModal] = React.useState(false)
  const complianceRefreshRef = React.useRef(() => {})
  const activityRefreshRef = React.useRef(() => {})
  const adminRefreshRef = React.useRef(() => {})

  const handleRefresh = () => {
    complianceRefreshRef.current()
    activityRefreshRef.current()
    adminRefreshRef.current()
  }

  const handleDelete = async (daysBack: number | null) => {
    if (daysBack === -1) {
      if (tab === 'compliance') return deleteAllAuditLogs()
      if (tab === 'activity') return deleteAllUserActivityLogs()
      if (tab === 'admin') return deleteAllAdminActivityLogs()
      return 0
    }
    if (tab === 'compliance') return deleteAuditLogsBefore(daysBack ?? 0)
    if (tab === 'activity') return deleteActivityLogsBefore(daysBack ?? 0)
    if (tab === 'admin') return deleteAdminLogsBefore(daysBack ?? 0)
    return 0
  }

  return (
    <div className="page fade-in">
      <Breadcrumbs pageId="audit" />
      <PageHeader title="Audit Log" subtitle="Compliance trail, user session events, and admin configuration changes."
        actions={<><button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => setShowDeleteModal(true)} title="Delete old logs"><Trash2 w={14} /> Delete old logs</button><button className="btn btn-ghost btn-sm" onClick={handleRefresh} title="Refresh all tabs"><RefreshCw w={14} /></button></>} />

      <div className="tabs" style={{ marginBottom: 16 }}>
        <div className={`tab ${tab === 'compliance' ? 'active' : ''}`} onClick={() => setTab('compliance')}>Compliance</div>
        <div className={`tab ${tab === 'activity'   ? 'active' : ''}`} onClick={() => setTab('activity')}>User Activity</div>
        <div className={`tab ${tab === 'admin'      ? 'active' : ''}`} onClick={() => setTab('admin')}>Admin Actions</div>
      </div>

      {tab === 'compliance' && <ComplianceTab refresh={() => complianceRefreshRef.current()} />}
      {tab === 'activity'   && <UserActivityTab refresh={() => activityRefreshRef.current()} />}
      {tab === 'admin'      && <AdminActionsTab refresh={() => adminRefreshRef.current()} />}

      {showDeleteModal && (
        <DeleteLogsModal
          title={`Delete ${tab} logs older than`}
          onClose={() => { setShowDeleteModal(false); handleRefresh() }}
          onDelete={handleDelete}
        />
      )}
    </div>
  )
}

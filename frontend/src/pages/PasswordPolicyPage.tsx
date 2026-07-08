import React from 'react'
import { getPasswordPolicy, updatePasswordPolicy, type PasswordPolicy } from '../api/passwordPolicy'
import { Check, Pencil, Settings } from '../components/ui/Icons'
import { PageHeader, Breadcrumbs, LoadingState } from '../components/ui'
import { Toast } from './components/ProviderShared'
import type { TweakValues } from '../types'

interface PasswordPolicyPageProps { tweaks: TweakValues }

const PasswordPolicyPage: React.FC<PasswordPolicyPageProps> = () => {
  const [policy, setPolicy] = React.useState<PasswordPolicy | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const [toast, setToast] = React.useState<{ msg: string; kind: 'ok' | 'err' } | null>(null)

  const savedPolicyRef = React.useRef<PasswordPolicy | null>(null)
  const [edit, setEdit] = React.useState<Omit<PasswordPolicy, 'min_length'> & { max_age_days: number | null }>({
    id: 0, grace_period_days: 0, require_uppercase: false, require_lowercase: false,
    require_numbers: false, require_symbols: false, max_age_days: null,
  })

  function hasChanges(): boolean {
    const saved = savedPolicyRef.current
    if (!saved || !policy) return false
    return (
      edit.require_uppercase !== saved.require_uppercase ||
      edit.require_lowercase !== saved.require_lowercase ||
      edit.require_numbers !== saved.require_numbers ||
      edit.require_symbols !== saved.require_symbols ||
      edit.max_age_days !== saved.max_age_days ||
      policy.min_length !== saved.min_length ||
      policy.grace_period_days !== saved.grace_period_days
    )
  }

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const p = await getPasswordPolicy()
      savedPolicyRef.current = p
      setPolicy(p)
      setEdit({
        id: p.id, grace_period_days: p.grace_period_days,
        require_uppercase: p.require_uppercase,
        require_lowercase: p.require_lowercase,
        require_numbers: p.require_numbers,
        require_symbols: p.require_symbols,
        max_age_days: p.max_age_days ?? null,
      })
    } catch (err) {
      setToast({ msg: (err as Error).message || 'Failed to load policy', kind: 'err' })
    } finally { setLoading(false) }
  }, [])

  React.useEffect(() => { load() }, [load])

  React.useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  async function handleSave() {
    if (!policy) return
    setBusy(true)
    try {
      await updatePasswordPolicy({ ...edit, grace_period_days: policy.grace_period_days })
      const updated = await getPasswordPolicy()
      savedPolicyRef.current = updated
      setPolicy(updated)
      setEdit(prev => ({ ...prev, max_age_days: updated.max_age_days ?? null }))
      setToast({ msg: 'Password policy saved', kind: 'ok' })
    } catch (err) {
      const e = err as Error
      if (savedPolicyRef.current && policy) {
        setPolicy(savedPolicyRef.current)
    setEdit({
           id: savedPolicyRef.current.id, grace_period_days: savedPolicyRef.current.grace_period_days,
           require_uppercase: savedPolicyRef.current.require_uppercase,
           require_lowercase: savedPolicyRef.current.require_lowercase,
           require_numbers: savedPolicyRef.current.require_numbers,
           require_symbols: savedPolicyRef.current.require_symbols,
           max_age_days: savedPolicyRef.current.max_age_days ?? null,
         })
      }
      setToast({ msg: `${e.message || 'Failed to save'} — changes were not saved`, kind: 'err' })
    } finally { setBusy(false) }
  }

  const fields = [
    { key: 'require_uppercase' as const, label: 'Require uppercase letters' },
    { key: 'require_lowercase' as const, label: 'Require lowercase letters' },
    { key: 'require_numbers' as const, label: 'Require digits (0-9)' },
    { key: 'require_symbols' as const, label: 'Require special characters' },
  ]

  const dirty = hasChanges()

  return (
    <div className="page fade-in">
      <Breadcrumbs pageId="password-policy" />
      <PageHeader title="Password Policy" subtitle="Set password strength requirements, expiration intervals, and account lockout rules to enforce security compliance across all console accounts."
        actions={policy && <button className="btn btn-primary" onClick={handleSave} disabled={busy || !dirty}><Check w={13} /> Save</button>} />

      {loading ? (
        <LoadingState />
      ) : policy ? (
        <>
          <div className="card">
            <div style={{ padding: '16px 20px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <Settings w={15} />
                <span style={{ fontWeight: 600, fontSize: 14 }}>Password requirements</span>
              </div>

              {/* Minimum length */}
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 14 }}>Minimum password length</span>
                <input
                  type="number"
                  min={4}
                  max={999}
                  value={policy.min_length}
                  onChange={(e) => setPolicy({ ...policy, min_length: Number(e.target.value) || 0 })}
                  className="input"
                  style={{ width: 80, textAlign: 'right', background: 'var(--bg-sunken)' }}
                />
              </div>

              {/* Toggles */}
{fields.map(f => (
                <div className="row" key={f.key} style={{ justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ fontSize: 14 }}>{f.label}</span>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={edit[f.key]}
                      onChange={(e) => setEdit({ ...edit, [f.key]: e.target.checked })}
                    />
                    <span className="slider" />
                  </label>
                </div>
              ))}

              {/* Password aging */}
              <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--bg-sunken)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  <Settings w={15} />
                  <span style={{ fontWeight: 600, fontSize: 14 }}>Password aging</span>
                </div>

                <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ fontSize: 14 }}>Maximum password age (days)</span>
                  <input
                    type="number"
                    min={0}
                    max={9999}
                    value={edit.max_age_days ?? ''}
                    onChange={(e) => setEdit({ ...edit, max_age_days: e.target.value === '' ? null : Number(e.target.value) })}
                    placeholder="None (never expires)"
                    className="input"
                    style={{ width: 120, textAlign: 'right', background: 'var(--bg-sunken)' }}
                  />
                </div>

                <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ fontSize: 14 }}>Grace period (days)</span>
                  <input
                    type="number"
                    min={0}
                    max={9999}
                    value={policy.grace_period_days}
                    onChange={(e) => setPolicy({ ...policy, grace_period_days: Number(e.target.value) || 0 })}
                    className="input"
                    style={{ width: 80, textAlign: 'right', background: 'var(--bg-sunken)' }}
                  />
                </div>

                <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginTop: 6 }}>
                  Users are denied login after the grace period expires. Leave max age blank to disable expiration.
                </div>
              </div>

              {dirty && (
                <div style={{ marginTop: 8, padding: '8px 12px', background: 'var(--bg-sunken)', borderRadius: 6, fontSize: 12, color: 'var(--fg-secondary)' }}>
                  Unsaved changes — click Save to apply them.
                </div>
              )}

              <div style={{ marginTop: 8, padding: '8px 12px', background: 'var(--bg-sunken)', borderRadius: 6, fontSize: 12, color: 'var(--fg-secondary)' }}>
                Changes take effect immediately for all password operations.
              </div>
            </div>
          </div>

          <button className="btn btn-primary" onClick={handleSave} disabled={busy || !dirty} style={{ marginTop: 8 }}>
            <Pencil w={13} /> Save changes
          </button>
        </>
      ) : null}

      {toast && <Toast msg={toast.msg} kind={toast.kind} />}
    </div>
  )
}

export default PasswordPolicyPage

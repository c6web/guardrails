import React from 'react'

export interface FieldProps {
  label: string
  hint?: string
  error?: string
  required?: boolean
  children: React.ReactNode
}

export function Field({ label, hint, error, required, children }: FieldProps) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label className="label" style={{ display: 'block', marginBottom: 4 }}>{label}{required && ' *'}</label>
      {hint && <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginBottom: 6 }}>{hint}</div>}
      {children}
      {error && <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 3 }}>{error}</div>}
    </div>
  )
}

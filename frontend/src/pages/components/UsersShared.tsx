export { Toast } from '../../components/ui'
import { FORM_INPUT_STYLE } from '../../components/ui'

export const GROUP_COLORS: Record<string, string> = {
  '00000000-0000-0000-0000-000000000001': 'danger',
  '00000000-0000-0000-0000-000000000002': 'info',
  '00000000-0000-0000-0000-000000000003': 'ok',
  '00000000-0000-0000-0000-000000000004': 'warn',
}

export function avClass(groupId: string | null) {
  if (groupId === '00000000-0000-0000-0000-000000000001') return 'av-jade'
  if (groupId === '00000000-0000-0000-0000-000000000002') return 'av-amber'
  if (groupId === '00000000-0000-0000-0000-000000000003') return 'av-cobalt'
  if (groupId === '00000000-0000-0000-0000-000000000004') return 'av-violet'
  return 'av-muted'
}

export function initials(name: string | null) {
  if (!name) return '??'
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

export const inputStyle = FORM_INPUT_STYLE



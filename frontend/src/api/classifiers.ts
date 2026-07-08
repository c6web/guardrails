import { apiFetch } from './client'

export interface ClassifierConfig {
  primary_id:  string | null
  backup1_id:  string | null
  backup2_id:  string | null
  confidence_threshold: number
}

export async function getClassifierConfig(): Promise<ClassifierConfig> {
  const res = await apiFetch<{ data: ClassifierConfig }>('/api/classifiers/config')
  return res.data
}

export async function updateClassifierConfig(config: Partial<ClassifierConfig>): Promise<ClassifierConfig> {
  const res = await apiFetch<{ data: ClassifierConfig }>('/api/classifiers/config', {
    method: 'PATCH', body: JSON.stringify(config),
  })
  return res.data
}

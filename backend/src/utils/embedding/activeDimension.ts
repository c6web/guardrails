import { EmbeddingProvider } from '../../models/data-db/EmbeddingProvider'
import { getOrCreateConfig } from '../../models/data-db/EmbeddingProviderConfig'

export async function getActiveEmbeddingDimension(): Promise<number | null> {
  const config = await getOrCreateConfig()
  if (config.dimensions !== null && config.dimensions !== undefined) {
    return config.dimensions
  }

  const providerIds = [config.primary_id, config.backup1_id, config.backup2_id].filter(Boolean) as string[]
  for (const id of providerIds) {
    const provider = await EmbeddingProvider.findByPk(id)
    if (provider && provider.dimensions !== null && provider.dimensions !== undefined) {
      return provider.dimensions
    }
  }

  return 1024
}

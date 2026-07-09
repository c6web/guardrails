import type { Transaction } from 'sequelize'
import { AiProviderAllowedModel } from '../models/data-db/AiProviderAllowedModel'

export async function syncAllowedModelDefault(
  providerId: string,
  modelId: string,
  transaction?: Transaction,
): Promise<void> {
  const doSync = async (t: Transaction) => {
    const existingRows = await AiProviderAllowedModel.findAll({
      where: { ai_provider_id: providerId },
      transaction: t,
    })

    const existingMatch = existingRows.find(r => r.model_id === modelId)

    if (existingMatch) {
      await AiProviderAllowedModel.update(
        { is_default: false },
        { where: { ai_provider_id: providerId, is_default: true }, transaction: t },
      )
      await existingMatch.update({ is_default: true }, { transaction: t })
    } else {
      if (existingRows.length > 0) {
        await AiProviderAllowedModel.update(
          { is_default: false },
          { where: { ai_provider_id: providerId, is_default: true }, transaction: t },
        )
      }

      await AiProviderAllowedModel.upsert(
        {
          ai_provider_id: providerId,
          model_id: modelId,
          is_default: true,
        },
        { transaction: t },
      )
    }
  }

  if (transaction) {
    await doSync(transaction)
  } else {
    const seq = AiProviderAllowedModel.sequelize
    if (!seq) throw new Error('AiProviderAllowedModel.sequelize is not initialized')
    await seq.transaction(async (t) => {
      await doSync(t)
    })
  }
}

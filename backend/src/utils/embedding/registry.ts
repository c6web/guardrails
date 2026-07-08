import type { EmbeddingAdapter } from './types'
import { OpenAIAdapter } from './adapters/openai'
import { OpenRouterAdapter } from './adapters/openrouter'
import { OllamaAdapter } from './adapters/ollama'
import { GoogleAdapter } from './adapters/google'

const adapters: Record<string, EmbeddingAdapter> = {
  openai:         new OpenAIAdapter(),
  openrouter:     new OpenRouterAdapter(),
  ollama:         new OllamaAdapter(),
  google:         new GoogleAdapter(),
  'google-gemini': new GoogleAdapter(),
}

const openAIFallback = new OpenAIAdapter()

export function getAdapter(vendor: string): EmbeddingAdapter {
  const adapter = adapters[vendor]
  if (!adapter) {
    console.warn(`embedding/registry: unknown vendor "${vendor}", falling back to OpenAI-compatible adapter`)
    return openAIFallback
  }
  return adapter
}

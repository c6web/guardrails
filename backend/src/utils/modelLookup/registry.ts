import type { ModelLookupAdapter } from './types'
import { OpenAIAdapter } from './adapters/openai'
import { AnthropicAdapter } from './adapters/anthropic'
import { OpenRouterAdapter } from './adapters/openrouter'
import { OllamaAdapter } from './adapters/ollama'
import { GoogleAdapter } from './adapters/google'

const adapters: Record<string, ModelLookupAdapter> = {
  openai:         new OpenAIAdapter(),
  anthropic:      new AnthropicAdapter(),
  openrouter:     new OpenRouterAdapter(),
  ollama:         new OllamaAdapter(),
  google:         new GoogleAdapter(),
  'google-gemini': new GoogleAdapter(),
}

const openAIFallback = new OpenAIAdapter()

export function getAdapter(vendor: string): ModelLookupAdapter {
  const adapter = adapters[vendor]
  if (!adapter) {
    console.warn(`modelLookup/registry: unknown vendor "${vendor}", falling back to OpenAI-compatible adapter`)
    return openAIFallback
  }
  return adapter
}

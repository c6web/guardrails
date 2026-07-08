import { useState } from 'react'
import { CodeSnippet } from '../../components/ui/CodeSnippet'

type Tab = 'curl' | 'python' | 'js' | 'fetch'

const TABS: { id: Tab; label: string }[] = [
  { id: 'curl',   label: 'cURL'       },
  { id: 'python', label: 'Python SDK' },
  { id: 'js',     label: 'JS SDK'     },
  { id: 'fetch',  label: 'fetch'      },
]

const PLACEHOLDER = '<YOUR_APP_API_KEY>'

function codeText(tab: Tab, url: string): string {
  switch (tab) {
    case 'curl': return `curl -X POST \\
  ${url}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${PLACEHOLDER}" \\
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role":"user","content":"Hello!"}],
    "max_tokens": 256
  }'`

    case 'python': return `from openai import OpenAI

# Point the SDK at the gateway instead of OpenAI
client = OpenAI(
    base_url="${url}/v1",
    api_key="${PLACEHOLDER}",
)

response = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "Hello!"}],
    max_tokens=256,
)
print(response.choices[0].message.content)`

    case 'js': return `import OpenAI from "openai";

// Point the SDK at the gateway instead of OpenAI
const client = new OpenAI({
  baseURL: "${url}/v1",
  apiKey: "${PLACEHOLDER}",
  dangerouslyAllowBrowser: true, // omit for Node / server-side
});

const response = await client.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [{ role: "user", content: "Hello!" }],
  max_tokens: 256,
});
console.log(response.choices[0].message.content);`

    case 'fetch': return `const response = await fetch(
  "${url}/v1/chat/completions",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": \`Bearer ${PLACEHOLDER}\`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Hello!" }],
      max_tokens: 256,
    }),
  }
);
const data = await response.json();
console.log(data.choices[0].message.content);`
  }
}

export function GatewayConnectionGuide({ gatewayUrl }: { gatewayUrl: string }) {
  const [tab, setTab] = useState<Tab>('curl')
  const code = codeText(tab, gatewayUrl || 'http://<GATEWAY_HOST>:8082')

  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <div className="label-strong" style={{ fontSize: 12, marginBottom: 4 }}>Connect your app</div>
        <div style={{ fontSize: 12, color: 'var(--fg-secondary)', lineHeight: 1.5 }}>
          The gateway exposes an <strong>OpenAI-compatible</strong> endpoint — just change the{' '}
          <code style={{ fontSize: 11 }}>base_url</code> and API key in your existing app. No other code changes needed.
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 10, borderBottom: '1px solid var(--border-subtle)' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '4px 12px', fontSize: 11, fontWeight: tab === t.id ? 600 : 400,
            background: 'none', border: 'none', cursor: 'pointer', marginBottom: -1,
            borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
            color: tab === t.id ? 'var(--fg-primary)' : 'var(--fg-tertiary)',
          }}>
            {t.label}
          </button>
        ))}
      </div>

      <CodeSnippet code={code} language={tab} />

      <div style={{ marginTop: 10, fontSize: 11, color: 'var(--fg-tertiary)', lineHeight: 1.5 }}>
        Generate an app API key via the <strong>key icon (⚿)</strong> on the instance row below, then replace{' '}
        <code style={{ fontSize: 10 }}>{PLACEHOLDER}</code> with it.
        The <code style={{ fontSize: 10 }}>model</code> field is forwarded to the upstream provider — use whatever model your upstream supports.
      </div>
    </div>
  )
}

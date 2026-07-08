import { useState } from 'react'
import { CodeSnippet } from '../../components/ui/CodeSnippet'

type Lang = 'curl' | 'python' | 'js'

interface Props {
  url: string
  apiKey: string
  input: string | string[]
  model?: string
}

function curlText(url: string, apiKey: string, input: string | string[], model?: string) {
  const body: Record<string, string> = { input: Array.isArray(input) ? input.join(', ') : input }
  if (model) body['model'] = model
  const safeBody = JSON.stringify(body, null, 2)
    .replace(/'/g, "'\\''")
    .replace(/\n/g, '\\n')
  return `curl -X POST \\
  ${url}/v1/embeddings \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -d '${safeBody}'`
}

function pythonText(url: string, apiKey: string, input: string | string[], model?: string) {
  const inputStr = Array.isArray(input)
    ? `[${input.map(s => `"${s.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`).join(', ')}]`
    : `"${input.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`
  const modelLine = model ? `\n    "model": "${model}",` : ''
  return `import requests

url = "${url}/v1/embeddings"
headers = {
    "Content-Type": "application/json",
    "Authorization": "Bearer ${apiKey}",
}
payload = {${modelLine}
    "input": ${inputStr},
}

response = requests.post(url, headers=headers, json=payload)
data = response.json()
print(data)`
}

function jsText(url: string, apiKey: string, input: string | string[], model?: string) {
  const inputStr = Array.isArray(input)
    ? `[${input.map(s => `"${s.replace(/`/g, '\\`').replace(/\$/g, '\\$')}"`).join(', ')}]`
    : `"${input.replace(/`/g, '\\`').replace(/\$/g, '\\$')}"`
  const modelLine = model ? `\n      model: "${model}",` : ''
  return `const response = await fetch(
  \`${url}/v1/embeddings\`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": \`Bearer ${apiKey}\`,
    },
    body: JSON.stringify({${modelLine}
      input: ${inputStr},
    }),
  }
);
const data = await response.json();
console.log(data);`
}

const k = (t: string) => <span className="k">{t}</span>
const s = (t: string) => <span className="s">{t}</span>
const c = (t: string) => <span className="c">{t}</span>
const dim = (t: string) => <span style={{ color: 'var(--fg-tertiary)' }}>{t}</span>

function CurlHighlighted({ url, apiKey, input, model }: Props) {
  const inputDisplay = Array.isArray(input)
    ? `[${input.map(s => JSON.stringify(s.length > 40 ? s.slice(0, 40) + '…' : s)).join(', ')}]`
    : JSON.stringify(input.length > 80 ? input.slice(0, 80) + '…' : input)
  return (
    <pre style={{ margin: 0, lineHeight: 1.65 }}>
      {k('curl')} {dim('-X')} POST {dim('\\')}
      {'\n  '}{s(`${url}/v1/embeddings`)} {dim('\\')}
      {'\n  '}{dim('-H')} {s('"Content-Type: application/json"')} {dim('\\')}
      {'\n  '}{dim('-H')} {s(`"Authorization: Bearer `)}
      <span className="s" style={{ wordBreak: 'break-all' }}>{apiKey}</span>
      {s('"')} {dim('\\')}
      {'\n  '}{dim('-d')} {s("'")}
      {'{'}
      {model ? <>{'\n    '}{s('"model"')}: {s(`"${model}"`)},</> : null}
      {'\n    '}{s('"input"')}: {s(inputDisplay)}
      {'\n  '}{s("'")}
    </pre>
  )
}

function PythonHighlighted({ url, apiKey, input, model }: Props) {
  const inputDisplay = Array.isArray(input)
    ? `[${input.map(s => JSON.stringify(s.length > 40 ? s.slice(0, 40) + '…' : s)).join(', ')}]`
    : JSON.stringify(input.length > 60 ? input.slice(0, 60) + '…' : input)
  return (
    <pre style={{ margin: 0, lineHeight: 1.65 }}>
      {k('import')} requests{'\n\n'}
      {c('# Endpoint')}
      {'\n'}url = {s(`"${url}/v1/embeddings"`)}
      {'\n\n'}headers = {'{'}
      {'\n    '}{s('"Content-Type"')}: {s('"application/json"')},{'\n'}
      {'    '}{s('"Authorization"')}: {s(`"Bearer `)}
      <span className="s" style={{ wordBreak: 'break-all' }}>{apiKey}</span>
      {s('"')},{'\n'}
      {'}'}
      {'\n\npayload = {'}
      {model ? <>{'\n    '}{s('"model"')}: {s(`"${model}"`)},</> : null}
      {'\n    '}{s('"input"')}: {s(inputDisplay)},{'\n'}
      {'}'}
      {'\n\nresponse = requests.'}
      {k('post')}(url, headers=headers, json=payload){'\n'}
      {k('print')}(response.json())
    </pre>
  )
}

function JsHighlighted({ url, apiKey, input, model }: Props) {
  const inputDisplay = Array.isArray(input)
    ? `[${input.map(s => JSON.stringify(s.length > 40 ? s.slice(0, 40) + '…' : s)).join(', ')}]`
    : JSON.stringify(input.length > 60 ? input.slice(0, 60) + '…' : input)
  return (
    <pre style={{ margin: 0, lineHeight: 1.65 }}>
      {c('// Uses the OpenAI-compatible Embeddings endpoint')}
      {'\n'}{k('const')} response = {k('await')} fetch({'\n'}
      {'  '}{s(`\`${url}/v1/embeddings\``)}{'  '}
      {c('// gateway URL')}
      {'\n  {'}{'\n'}
      {'    method: '}{s('"POST"')},{'\n'}
      {'    headers: {'}
      {'\n      '}{s('"Content-Type"')}: {s('"application/json"')},{'\n'}
      {'      '}{s('"Authorization"')}: {s('`Bearer ')}
      <span className="s" style={{ wordBreak: 'break-all' }}>{apiKey}</span>
      {s('`')},{'\n    }'}
      {',\n    body: JSON.stringify({'}
      {model ? <>{'\n      model: '}{s(`"${model}"`)},</> : null}
      {'\n      input: '}{s(inputDisplay)},{'\n'}
      {'    }),\n  }\n);\n\n'}
      {k('const')} data = {k('await')} response.json();{'\n'}
      console.log(data);
    </pre>
  )
}

const LANGS: { id: Lang; label: string }[] = [
  { id: 'curl',   label: 'cURL' },
  { id: 'python', label: 'Python' },
  { id: 'js',     label: 'JavaScript' },
]

export function GatewayEmbeddingTestCodePanel({ url, apiKey, input, model }: Props) {
  const [lang, setLang] = useState<Lang>('curl')

  const plainText =
    lang === 'curl'   ? curlText(url, apiKey, input, model) :
    lang === 'python' ? pythonText(url, apiKey, input, model) :
                        jsText(url, apiKey, input, model)

  const hasValues = url !== '' && apiKey !== ''

  return (
    <div style={{ borderTop: '1px solid var(--border-subtle)', padding: '14px 18px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 12 }}>
        <span className="label-strong" style={{ fontSize: 12, marginRight: 12 }}>Code Example</span>
        {LANGS.map(l => (
          <button
            key={l.id}
            onClick={() => setLang(l.id)}
            style={{
              padding: '3px 12px', fontSize: 11, fontWeight: lang === l.id ? 600 : 400,
              background: 'none', border: 'none', cursor: 'pointer',
              borderBottom: lang === l.id ? '2px solid var(--accent)' : '2px solid transparent',
              color: lang === l.id ? 'var(--fg-primary)' : 'var(--fg-tertiary)',
              marginBottom: -1,
            }}
          >
            {l.label}
          </button>
        ))}
      </div>

      {!hasValues && (
        <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginBottom: 8 }}>
          Select a gateway and API key above to fill in the placeholders.
        </div>
      )}

      <CodeSnippet code={plainText}>
        {lang === 'curl'   && <CurlHighlighted   url={url} apiKey={apiKey} input={input} model={model} />}
        {lang === 'python' && <PythonHighlighted url={url} apiKey={apiKey} input={input} model={model} />}
        {lang === 'js'     && <JsHighlighted     url={url} apiKey={apiKey} input={input} model={model} />}
      </CodeSnippet>

      <div style={{ fontSize: 10, color: 'var(--fg-tertiary)', marginTop: 8 }}>
        The input content is reflected live. Treat the API key as a secret — do not share this snippet with the key visible.
      </div>
    </div>
  )
}

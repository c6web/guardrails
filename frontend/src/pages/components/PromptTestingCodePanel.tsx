import { useState } from 'react'
import { CodeSnippet } from '../../components/ui/CodeSnippet'

type Lang = 'curl' | 'python' | 'js'
type Mode = 'prompt' | 'scan'

interface Props {
  url: string
  apiKey: string
  prompt: string
  maxTokens: number
  mode?: Mode
}

function jsonEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\t/g, '\\t')
}

function curlText(url: string, apiKey: string, prompt: string, maxTokens: number) {
  return `curl -X POST ${url}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -d @- <<'EOF'
{
  "messages": [{"role": "user", "content": "${jsonEscape(prompt)}"}],
  "max_tokens": ${maxTokens}
}
EOF`
}

function pythonText(url: string, apiKey: string, prompt: string, maxTokens: number) {
  return `import requests

url = "${url}/v1/chat/completions"
headers = {
    "Content-Type": "application/json",
    "Authorization": "Bearer ${apiKey}",
}
payload = {
    "messages": [{"role": "user", "content": "${jsonEscape(prompt)}"}],
    "max_tokens": ${maxTokens},
}

response = requests.post(url, headers=headers, json=payload)
data = response.json()
print(data["choices"][0]["message"]["content"])`
}

function jsText(url: string, apiKey: string, prompt: string, maxTokens: number) {
  const safePrompt = prompt.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\${/g, '\\${')
  return `const response = await fetch(
  \`${url}/v1/chat/completions\`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": \`Bearer ${apiKey}\`,
    },
    body: JSON.stringify({
      messages: [{ role: "user", content: \`${safePrompt}\` }],
      max_tokens: ${maxTokens},
    }),
  }
);
const data = await response.json();
console.log(data.choices[0].message.content);`
}

function curlScanText(url: string, apiKey: string, prompt: string) {
  return `curl -X POST ${url}/v1/scan \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -d @- <<'EOF'
{
  "input": "${jsonEscape(prompt)}"
}
EOF`
}

function pythonScanText(url: string, apiKey: string, prompt: string) {
  return `import requests

url = "${url}/v1/scan"
headers = {
    "Content-Type": "application/json",
    "Authorization": "Bearer ${apiKey}",
}
payload = {
    "input": "${jsonEscape(prompt)}",
}

response = requests.post(url, headers=headers, json=payload)
data = response.json()
print(data["verdict"], "-", data["reason"])`
}

function jsScanText(url: string, apiKey: string, prompt: string) {
  const safePrompt = prompt.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\${/g, '\\${')
  return `const response = await fetch(
  \`${url}/v1/scan\`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": \`Bearer ${apiKey}\`,
    },
    body: JSON.stringify({
      input: \`${safePrompt}\`,
    }),
  }
);
const data = await response.json();
console.log(data.verdict, "-", data.reason);`
}

const k = (t: string) => <span className="k">{t}</span>
const s = (t: string) => <span className="s">{t}</span>
const c = (t: string) => <span className="c">{t}</span>
const dim = (t: string) => <span style={{ color: 'var(--fg-tertiary)' }}>{t}</span>

function CurlHighlighted({ url, apiKey, prompt, maxTokens }: Props) {
  const promptLine = prompt.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
  const truncated = promptLine.length > 80 ? promptLine.slice(0, 80) + '…' : promptLine
  return (
    <pre style={{ margin: 0, lineHeight: 1.65 }}>
      {k('curl')} {dim('-X')} POST {s(`${url}/v1/chat/completions`)} {dim('\\')}
      {'\n  '}{dim('-H')} {s('"Content-Type: application/json"')} {dim('\\')}
      {'\n  '}{dim('-H')} {s(`"Authorization: Bearer `)}
      <span className="s" style={{ wordBreak: 'break-all' }}>{apiKey}</span>
      {s('"')} {dim('\\')}
      {'\n  '}{dim('-d')} {s('@-')} {dim('<<')}{s("'EOF'")}
      {'\n'}{'{'}
      {'\n  '}{s('"messages"')}: [{'{'}
        {s('"role"')}: {s('"user"')}, {s('"content"')}: {s(`"${truncated}"`)}{'}'}],{'\n'}
      {'  '}{s('"max_tokens"')}: {maxTokens}
      {'\n'}{'}'}
      {'\n'}{'EOF'}
    </pre>
  )
}

function PythonHighlighted({ url, apiKey, prompt, maxTokens }: Props) {
  const escaped = jsonEscape(prompt)
  const truncated = escaped.length > 60 ? escaped.slice(0, 60) + '…' : escaped
  return (
    <pre style={{ margin: 0, lineHeight: 1.65 }}>
      {k('import')} requests{'\n\n'}
      {c('# Endpoint')}
      {'\n'}url = {s(`"${url}/v1/chat/completions"`)}
      {'\n\n'}headers = {'{'}
      {'\n    '}{s('"Content-Type"')}: {s('"application/json"')},{'\n'}
      {'    '}{s('"Authorization"')}: {s(`"Bearer `)}
      <span className="s" style={{ wordBreak: 'break-all' }}>{apiKey}</span>
      {s('"')},{'\n'}
      {'}'}
      {'\n\npayload = {'}
      {'\n    '}{s('"messages"')}: [{'{'}
        {s('"role"')}: {s('"user"')}, {s('"content"')}: {s(`"${truncated}"`)}{'}'}],{'\n'}
      {'    '}{s('"max_tokens"')}: {maxTokens},{'\n'}
      {'}'}
      {'\n\nresponse = requests.'}
      {k('post')}(url, headers=headers, json=payload){'\n'}
      {k('print')}(response.json()[{s('"choices"')}][0][{s('"message"')}][{s('"content"')}])
    </pre>
  )
}

function JsHighlighted({ url, apiKey, prompt, maxTokens }: Props) {
  const escaped = prompt.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\n/g, '\\n').replace(/\${/g, '\\${')
  const truncated = escaped.length > 60 ? escaped.slice(0, 60) + '…' : escaped
  return (
    <pre style={{ margin: 0, lineHeight: 1.65 }}>
      {c('// Uses the OpenAI-compatible Chat Completions endpoint')}
      {'\n'}{k('const')} response = {k('await')} fetch({'\n'}
      {'  '}{s(`\`${url}/v1/chat/completions\``)}{'  '}
      {c('// gateway URL')}
      {'\n  {'}{'\n'}
      {'    method: '}{s('"POST"')},{'\n'}
      {'    headers: {'}
      {'\n      '}{s('"Content-Type"')}: {s('"application/json"')},{'\n'}
      {'      '}{s('"Authorization"')}: {s('`Bearer ')}
      <span className="s" style={{ wordBreak: 'break-all' }}>{apiKey}</span>
      {s('`')},{'\n    }'}
      {',\n    body: JSON.stringify('}
      {'\n      messages: [{ role: '}{s('"user"')}{', content: '}{s(`\`${truncated}\``)}{' }],\n'}
      {'      max_tokens: '}{maxTokens},{'\n'}
      {'    }),\n  }\n);\n\n'}
      {k('const')} data = {k('await')} response.json();{'\n'}
      console.log(data.choices[0].message.content);
    </pre>
  )
}

type ScanProps = Pick<Props, 'url' | 'apiKey' | 'prompt'>

function CurlScanHighlighted({ url, apiKey, prompt }: ScanProps) {
  const promptLine = prompt.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
  const truncated = promptLine.length > 80 ? promptLine.slice(0, 80) + '…' : promptLine
  return (
    <pre style={{ margin: 0, lineHeight: 1.65 }}>
      {k('curl')} {dim('-X')} POST {s(`${url}/v1/scan`)} {dim('\\')}
      {'\n  '}{dim('-H')} {s('"Content-Type: application/json"')} {dim('\\')}
      {'\n  '}{dim('-H')} {s(`"Authorization: Bearer `)}
      <span className="s" style={{ wordBreak: 'break-all' }}>{apiKey}</span>
      {s('"')} {dim('\\')}
      {'\n  '}{dim('-d')} {s('@-')} {dim('<<')}{s("'EOF'")}
      {'\n'}{'{'}
      {'\n  '}{s('"input"')}: {s(`"${truncated}"`)}
      {'\n'}{'}'}
      {'\n'}{'EOF'}
    </pre>
  )
}

function PythonScanHighlighted({ url, apiKey, prompt }: ScanProps) {
  const escaped = jsonEscape(prompt)
  const truncated = escaped.length > 60 ? escaped.slice(0, 60) + '…' : escaped
  return (
    <pre style={{ margin: 0, lineHeight: 1.65 }}>
      {k('import')} requests{'\n\n'}
      {c('# Detect-only — never forwards to a model')}
      {'\n'}url = {s(`"${url}/v1/scan"`)}
      {'\n\n'}headers = {'{'}
      {'\n    '}{s('"Content-Type"')}: {s('"application/json"')},{'\n'}
      {'    '}{s('"Authorization"')}: {s(`"Bearer `)}
      <span className="s" style={{ wordBreak: 'break-all' }}>{apiKey}</span>
      {s('"')},{'\n'}
      {'}'}
      {'\n\npayload = {'}
      {'\n    '}{s('"input"')}: {s(`"${truncated}"`)},{'\n'}
      {'}'}
      {'\n\nresponse = requests.'}
      {k('post')}(url, headers=headers, json=payload){'\n'}
      data = response.json(){'\n'}
      {k('print')}(data[{s('"verdict"')}], {s('"-"')}, data[{s('"reason"')}])
    </pre>
  )
}

function JsScanHighlighted({ url, apiKey, prompt }: ScanProps) {
  const escaped = prompt.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\n/g, '\\n').replace(/\${/g, '\\${')
  const truncated = escaped.length > 60 ? escaped.slice(0, 60) + '…' : escaped
  return (
    <pre style={{ margin: 0, lineHeight: 1.65 }}>
      {c('// Detect-only — runs the scan pipeline, never calls a model')}
      {'\n'}{k('const')} response = {k('await')} fetch({'\n'}
      {'  '}{s(`\`${url}/v1/scan\``)}{'  '}
      {c('// gateway URL')}
      {'\n  {'}{'\n'}
      {'    method: '}{s('"POST"')},{'\n'}
      {'    headers: {'}
      {'\n      '}{s('"Content-Type"')}: {s('"application/json"')},{'\n'}
      {'      '}{s('"Authorization"')}: {s('`Bearer ')}
      <span className="s" style={{ wordBreak: 'break-all' }}>{apiKey}</span>
      {s('`')},{'\n    }'}
      {',\n    body: JSON.stringify('}
      {'\n      input: '}{s(`\`${truncated}\``)}{',\n'}
      {'    }),\n  }\n);\n\n'}
      {k('const')} data = {k('await')} response.json();{'\n'}
      console.log(data.verdict, {s('"-"')}, data.reason);
    </pre>
  )
}

const LANGS: { id: Lang; label: string }[] = [
  { id: 'curl',   label: 'cURL' },
  { id: 'python', label: 'Python' },
  { id: 'js',     label: 'JavaScript' },
]

export function PromptTestingCodePanel({ url, apiKey, prompt, maxTokens, mode = 'prompt' }: Props) {
  const [lang, setLang] = useState<Lang>('curl')
  const isScan = mode === 'scan'

  const plainText = isScan
    ? (lang === 'curl'   ? curlScanText(url, apiKey, prompt) :
       lang === 'python' ? pythonScanText(url, apiKey, prompt) :
                           jsScanText(url, apiKey, prompt))
    : (lang === 'curl'   ? curlText(url, apiKey, prompt, maxTokens) :
       lang === 'python' ? pythonText(url, apiKey, prompt, maxTokens) :
                           jsText(url, apiKey, prompt, maxTokens))

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
        {isScan ? (
          <>
            {lang === 'curl'   && <CurlScanHighlighted   url={url} apiKey={apiKey} prompt={prompt} />}
            {lang === 'python' && <PythonScanHighlighted url={url} apiKey={apiKey} prompt={prompt} />}
            {lang === 'js'     && <JsScanHighlighted     url={url} apiKey={apiKey} prompt={prompt} />}
          </>
        ) : (
          <>
            {lang === 'curl'   && <CurlHighlighted   url={url} apiKey={apiKey} prompt={prompt} maxTokens={maxTokens} />}
            {lang === 'python' && <PythonHighlighted url={url} apiKey={apiKey} prompt={prompt} maxTokens={maxTokens} />}
            {lang === 'js'     && <JsHighlighted     url={url} apiKey={apiKey} prompt={prompt} maxTokens={maxTokens} />}
          </>
        )}
      </CodeSnippet>

      <div style={{ fontSize: 10, color: 'var(--fg-tertiary)', marginTop: 8 }}>
        The prompt content above is reflected live. Treat the API key as a secret — do not share this snippet with the key visible.
      </div>
    </div>
  )
}

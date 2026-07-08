import React from 'react'
import { CodeSnippet } from './CodeSnippet'

interface CodeBlockProps {
  children: React.ReactNode;
}

const CodeBlock: React.FC<CodeBlockProps> = ({ children }) => {
  return (
    <CodeSnippet
      code={typeof children === 'string' ? children : ''}
      copyable={false}
    >
      {typeof children === 'string' ? undefined : children}
    </CodeSnippet>
  )
}

export default CodeBlock

import React, { createContext, useContext, useState, useEffect } from 'react'
import { getAllDetectionFrameworks } from '../api/detectionFrameworks'


interface FrameworkLookup {
  id: string
  framework_code: string
  name: string
  description: string
}

export type FrameworkMap = Record<string, FrameworkLookup>

interface FrameworkContextValue {
  frameworks: FrameworkMap
  loading: boolean
}

const FrameworkContext = createContext<FrameworkContextValue | null>(null)

export function FrameworkProvider({ children }: { children: React.ReactNode }) {
  const [frameworks, setFrameworks] = useState<FrameworkMap>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getAllDetectionFrameworks({ limit: 500 }).then(res => {
      const map: FrameworkMap = {}
      for (const fw of res.data) {
        map[fw.id] = {
          id: fw.id,
          framework_code: fw.framework_code,
          name: fw.name,
          description: fw.description,
        }
      }
      setFrameworks(map)
      setLoading(false)
    }).catch(() => {
      setFrameworks({})
      setLoading(false)
    })
  }, [])

  return (
    <FrameworkContext.Provider value={{ frameworks, loading }}>
      {children}
    </FrameworkContext.Provider>
  )
}

export function useFrameworks(): FrameworkMap | null {
  const ctx = useContext(FrameworkContext)
  if (!ctx) return null
  return ctx.frameworks
}

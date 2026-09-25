/**
 * Build-time configuration (Vite inlines `import.meta.env.VITE_*` at build).
 * Validated once at startup; `main.tsx` renders a config error screen instead
 * of the app when anything is missing or malformed.
 */

export interface AppEnv {
  supabaseUrl: string
  supabasePublishableKey: string
  /** Backend base URL without a trailing slash, e.g. `http://localhost:8000`. */
  apiUrl: string
}

export interface EnvProblem {
  name: string
  message: string
}

export type EnvResult = { ok: true; env: AppEnv } | { ok: false; problems: EnvProblem[] }

function readUrl(name: string, raw: string | undefined, problems: EnvProblem[]): string {
  const value = raw?.trim() ?? ''
  if (!value) {
    problems.push({ name, message: 'is not set' })
    return ''
  }
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('bad protocol')
    return value.replace(/\/+$/, '')
  } catch {
    problems.push({ name, message: `must be an absolute http(s) URL (got "${value}")` })
    return ''
  }
}

function validate(): EnvResult {
  const problems: EnvProblem[] = []
  const supabaseUrl = readUrl('VITE_SUPABASE_URL', import.meta.env.VITE_SUPABASE_URL, problems)
  const apiUrl = readUrl('VITE_API_URL', import.meta.env.VITE_API_URL, problems)
  const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? ''
  if (!supabasePublishableKey) {
    problems.push({ name: 'VITE_SUPABASE_PUBLISHABLE_KEY', message: 'is not set' })
  }
  if (problems.length > 0) return { ok: false, problems }
  return { ok: true, env: { supabaseUrl, supabasePublishableKey, apiUrl } }
}

export const envResult: EnvResult = validate()

/** Returns the validated env. Only call from modules loaded after the startup check. */
export function getEnv(): AppEnv {
  if (!envResult.ok) {
    throw new Error(
      `Invalid configuration: ${envResult.problems.map((p) => `${p.name} ${p.message}`).join('; ')}`,
    )
  }
  return envResult.env
}

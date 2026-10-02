import { getEnv } from './env'
import { supabase } from './supabase'

/** Typed view of an RFC 7807 `application/problem+json` error (or a transport failure). */
export class ApiError extends Error {
  readonly status: number
  readonly title: string
  readonly detail: string
  /** Field-level validation messages keyed by camelCase field name, when the server provides them. */
  readonly fieldErrors: Record<string, string>

  constructor(status: number, title: string, detail: string, fieldErrors: Record<string, string> = {}) {
    super(detail || title)
    this.name = 'ApiError'
    this.status = status
    this.title = title
    this.detail = detail
    this.fieldErrors = fieldErrors
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

export interface ApiRequestInit extends Omit<RequestInit, 'body'> {
  /** Serialised as JSON with the matching Content-Type. */
  json?: unknown
  body?: BodyInit | null
}

const DEFAULT_TITLES: Record<number, string> = {
  400: 'Bad request',
  401: 'Not signed in',
  403: 'Access denied',
  404: 'Not found',
  409: 'Conflict',
  422: 'Validation failed',
  429: 'Too many requests',
  500: 'Server error',
  502: 'Service unavailable',
  503: 'Service unavailable',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Collects field errors from either an RFC 7807 `errors` extension
 * (`[{ field | loc, message | msg }]`) or FastAPI's default `detail: [{ loc, msg }]`.
 */
function extractFieldErrors(list: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (!Array.isArray(list)) return out
  for (const entry of list) {
    if (!isRecord(entry)) continue
    const message = typeof entry.message === 'string' ? entry.message : typeof entry.msg === 'string' ? entry.msg : null
    let field: string | null = typeof entry.field === 'string' ? entry.field : null
    if (!field && Array.isArray(entry.loc)) {
      const last = entry.loc[entry.loc.length - 1]
      if (typeof last === 'string' && last !== 'body') field = last
    }
    if (field && message && !out[field]) out[field] = message
  }
  return out
}

async function toApiError(response: Response): Promise<ApiError> {
  const fallbackTitle = DEFAULT_TITLES[response.status] ?? `Request failed (${response.status})`
  let payload: unknown = null
  try {
    const text = await response.text()
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = null
  }
  if (!isRecord(payload)) return new ApiError(response.status, fallbackTitle, '')

  const title = typeof payload.title === 'string' && payload.title ? payload.title : fallbackTitle
  let detail = ''
  let fieldErrors = extractFieldErrors(payload.errors)
  if (typeof payload.detail === 'string') {
    detail = payload.detail
  } else if (Array.isArray(payload.detail)) {
    fieldErrors = { ...extractFieldErrors(payload.detail), ...fieldErrors }
    detail = 'Some fields are invalid.'
  }
  return new ApiError(response.status, title, detail, fieldErrors)
}

async function accessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

async function send(path: string, init: ApiRequestInit, token: string | null): Promise<Response> {
  const { json, headers: initHeaders, body, ...rest } = init
  const headers = new Headers(initHeaders)
  headers.set('Accept', 'application/json, application/problem+json')
  if (token) headers.set('Authorization', `Bearer ${token}`)
  let requestBody: BodyInit | null | undefined = body
  if (json !== undefined) {
    headers.set('Content-Type', 'application/json')
    requestBody = JSON.stringify(json)
  }
  const url = `${getEnv().apiUrl}${path.startsWith('/') ? path : `/${path}`}`
  try {
    return await fetch(url, { ...rest, headers, body: requestBody })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError(0, 'Network error', "We couldn't reach the server. Check your connection and try again.")
  }
}

/**
 * Authenticated JSON request against `VITE_API_URL`.
 * On 401 it refreshes the Supabase session once and retries; if that fails the
 * user is signed out locally (the route guard then sends them to /login).
 */
export async function apiFetch<T>(path: string, init: ApiRequestInit = {}): Promise<T> {
  let response = await send(path, init, await accessToken())

  if (response.status === 401) {
    const { data, error } = await supabase.auth.refreshSession()
    if (!error && data.session) {
      response = await send(path, init, data.session.access_token)
    }
    if (response.status === 401) {
      await supabase.auth.signOut({ scope: 'local' })
    }
  }

  if (!response.ok) throw await toApiError(response)
  if (response.status === 204) return undefined as T
  const text = await response.text()
  return (text ? JSON.parse(text) : undefined) as T
}

/** Human-readable message for any thrown value. */
export function errorMessage(error: unknown): string {
  if (isApiError(error)) return error.detail || error.title
  if (error instanceof Error && error.message) return error.message
  return 'Something went wrong. Please try again.'
}

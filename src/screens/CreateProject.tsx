import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { useOrg } from '@/org/useOrg'
import { useCreateProject, useMembers } from '@/lib/queries'
import { errorMessage, isApiError } from '@/lib/api'
import { formatNumber, todayIsoDate } from '@/lib/format'
import {
  METHODOLOGIES,
  METHODOLOGY_LABELS,
  PRIORITIES,
  PRIORITY_LABELS,
  PROJECT_TYPES,
  PROJECT_TYPE_LABELS,
  VISIBILITIES,
  VISIBILITY_LABELS,
  type Methodology,
  type Priority,
  type ProjectCreate,
  type ProjectType,
  type Visibility,
} from '@/lib/types'
import { Alert, Button } from '@/components/ui'

const DEPARTMENTS = ['Engineering', 'Operations', 'Finance', 'Product'] as const
const CURRENCY = 'USD'
const MAX_BUDGET_CENTS = 100_000_000_000_00 // $100B — guards against typos like an extra "000000".

interface FormState {
  name: string
  type: ProjectType
  description: string
  startDate: string
  targetEndDate: string
  budget: string
  pmUserId: string
  department: string
  sponsor: string
  priority: Priority
  methodology: Methodology
  visibility: Visibility
}

type FieldName = keyof FormState
type FieldErrors = Partial<Record<FieldName, string>>
type Intent = 'draft' | 'continue'

/** Order used to focus the first invalid field. */
const FIELD_ORDER: FieldName[] = ['name', 'type', 'description', 'startDate', 'targetEndDate', 'budget', 'pmUserId', 'department', 'sponsor']

/** Parses "375,000", "$375,000.50" or "375000" into integer cents; `null` if invalid. */
function parseBudgetToCents(input: string): number | null {
  const cleaned = input.replace(/[\s,$]/g, '')
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned)
  if (!match) return null
  const whole = Number(match[1])
  const fraction = Number((match[2] ?? '').padEnd(2, '0'))
  const cents = whole * 100 + fraction
  return Number.isSafeInteger(cents) ? cents : null
}

function formatBudgetInput(cents: number): string {
  const whole = Math.floor(cents / 100)
  const fraction = cents % 100
  return fraction ? `${formatNumber(whole)}.${String(fraction).padStart(2, '0')}` : formatNumber(whole)
}

function validate(form: FormState): FieldErrors {
  const errors: FieldErrors = {}
  const name = form.name.trim()
  if (!name) errors.name = 'Give the project a name.'
  else if (name.length > 200) errors.name = 'Keep the name under 200 characters.'
  if (!form.description.trim()) errors.description = 'Describe the project so AI has context during intake.'
  if (!form.startDate) errors.startDate = 'Choose a start date.'
  if (!form.targetEndDate) errors.targetEndDate = 'Choose a target end date.'
  else if (form.startDate && form.targetEndDate < form.startDate) errors.targetEndDate = 'End date must be on or after the start date.'
  if (!form.budget.trim()) {
    errors.budget = 'Enter the total budget.'
  } else {
    const cents = parseBudgetToCents(form.budget)
    if (cents === null) errors.budget = 'Enter an amount like 375,000 or 375000.50.'
    else if (cents <= 0) errors.budget = 'Budget must be greater than zero.'
    else if (cents > MAX_BUDGET_CENTS) errors.budget = 'That budget looks too large — check for extra zeros.'
  }
  return errors
}

/** Maps server field names (camelCase API) onto form fields. */
function serverFieldErrors(fieldErrors: Record<string, string>): FieldErrors {
  const out: FieldErrors = {}
  for (const [field, message] of Object.entries(fieldErrors)) {
    const key = field === 'budgetCents' ? 'budget' : field
    if (key in FORM_FIELDS) out[key as FieldName] = message
  }
  return out
}

const FORM_FIELDS: Record<FieldName, true> = {
  name: true,
  type: true,
  description: true,
  startDate: true,
  targetEndDate: true,
  budget: true,
  pmUserId: true,
  department: true,
  sponsor: true,
  priority: true,
  methodology: true,
  visibility: true,
}

export default function CreateProject() {
  const navigate = useNavigate()
  const { me, org } = useOrg()
  const members = useMembers(org.id)
  const createProject = useCreateProject(org.id)

  const [form, setForm] = useState<FormState>(() => ({
    name: '',
    type: 'technology',
    description: '',
    startDate: todayIsoDate(),
    targetEndDate: '',
    budget: '',
    pmUserId: me.id,
    department: DEPARTMENTS[0],
    sponsor: '',
    priority: 'medium',
    methodology: 'waterfall',
    visibility: 'internal',
  }))
  const [errors, setErrors] = useState<FieldErrors>({})
  const [submitted, setSubmitted] = useState(false)
  const [pendingIntent, setPendingIntent] = useState<Intent | null>(null)
  const [serverError, setServerError] = useState<{ title: string; detail: string } | null>(null)
  const fieldRefs = useRef<Partial<Record<FieldName, HTMLElement | null>>>({})

  useEffect(() => {
    document.title = 'Create Project · ProjectAI'
  }, [])

  // PM candidates: org members, always including the current user as the default.
  const pmOptions = (() => {
    const list = (members.data ?? []).map((m) => ({ id: m.userId, label: m.fullName?.trim() || m.email }))
    if (!list.some((m) => m.id === me.id)) list.unshift({ id: me.id, label: me.fullName?.trim() || me.email })
    return list.map((m) => (m.id === me.id ? { ...m, label: `${m.label} (you)` } : m))
  })()

  function update<K extends FieldName>(key: K, value: FormState[K]) {
    const next = { ...form, [key]: value }
    setForm(next)
    // After the first submit attempt, re-validate live so errors clear as they're fixed.
    if (submitted) setErrors(validate(next))
  }

  function bind(name: FieldName) {
    return {
      id: `cp-${name}`,
      name,
      ref: (el: HTMLElement | null) => {
        fieldRefs.current[name] = el
      },
      'aria-invalid': errors[name] ? true : undefined,
      'aria-describedby': errors[name] ? `cp-${name}-error` : undefined,
    }
  }

  async function submit(intent: Intent) {
    if (createProject.isPending) return
    setSubmitted(true)
    setServerError(null)
    const found = validate(form)
    setErrors(found)
    const firstInvalid = FIELD_ORDER.find((f) => found[f])
    if (firstInvalid) {
      fieldRefs.current[firstInvalid]?.focus()
      return
    }

    const payload: ProjectCreate = {
      name: form.name.trim(),
      description: form.description.trim(),
      type: form.type,
      department: form.department || null,
      sponsor: form.sponsor.trim() || null,
      pmUserId: form.pmUserId || null,
      priority: form.priority,
      methodology: form.methodology,
      visibility: form.visibility,
      startDate: form.startDate,
      targetEndDate: form.targetEndDate,
      budgetCents: parseBudgetToCents(form.budget) ?? 0,
      currency: CURRENCY,
      status: intent === 'draft' ? 'draft' : 'planning',
      currentStep: intent === 'draft' ? 'create' : 'intake',
    }

    setPendingIntent(intent)
    try {
      const project = await createProject.mutateAsync(payload)
      if (intent === 'draft') {
        navigate('/', { state: { notice: `Draft “${project.name}” saved.` } })
      } else {
        navigate(`/projects/${encodeURIComponent(project.id)}/intake`)
      }
    } catch (error) {
      setPendingIntent(null)
      if (isApiError(error)) {
        const fieldErrors = serverFieldErrors(error.fieldErrors)
        if (Object.keys(fieldErrors).length > 0) {
          setErrors((prev) => ({ ...prev, ...fieldErrors }))
          const first = FIELD_ORDER.find((f) => fieldErrors[f])
          if (first) fieldRefs.current[first]?.focus()
        }
        setServerError({
          title: error.status === 0 ? 'Connection problem' : "We couldn't create the project",
          detail: error.detail || error.title,
        })
      } else {
        setServerError({ title: "We couldn't create the project", detail: errorMessage(error) })
      }
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void submit('continue')
  }

  const busy = pendingIntent !== null
  const errorCount = Object.keys(errors).length

  return (
    <div style={{ padding: '32px 36px', maxWidth: 800 }}>
      <Breadcrumb />

      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Create New Project</h1>
        <div style={{ fontSize: 13, color: '#737373', marginTop: 2 }}>
          Define the basic parameters for your project. AI will use this context during intake.
        </div>
      </div>

      <form onSubmit={onSubmit} noValidate aria-describedby="cp-form-status">
        <div style={cardStyle}>
          <SectionLabel>Project Identity</SectionLabel>

          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <Field label="Project Name" htmlFor="cp-name" required error={errors.name}>
              <input
                {...bind('name')}
                className={fieldClass}
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
                placeholder="e.g. Enterprise Data Platform"
                maxLength={200}
                autoComplete="off"
                required
              />
            </Field>
            <Field label="Project Type" htmlFor="cp-type" error={errors.type}>
              <select {...bind('type')} className={fieldClass} value={form.type} onChange={(e) => update('type', e.target.value as ProjectType)}>
                {PROJECT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {PROJECT_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Project Description" htmlFor="cp-description" required error={errors.description}>
            <textarea
              {...bind('description')}
              className={fieldClass}
              style={{ minHeight: 80, resize: 'vertical' }}
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
              placeholder="What is this project meant to achieve, and for whom?"
              required
            />
          </Field>

          <SectionLabel style={{ marginTop: 24 }}>Timeline &amp; Budget</SectionLabel>

          <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 16 }}>
            <Field label="Start Date" htmlFor="cp-startDate" required error={errors.startDate}>
              <input {...bind('startDate')} type="date" className={fieldClass} value={form.startDate} onChange={(e) => update('startDate', e.target.value)} required />
            </Field>
            <Field label="Target End Date" htmlFor="cp-targetEndDate" required error={errors.targetEndDate}>
              <input
                {...bind('targetEndDate')}
                type="date"
                className={fieldClass}
                value={form.targetEndDate}
                min={form.startDate || undefined}
                onChange={(e) => update('targetEndDate', e.target.value)}
                required
              />
            </Field>
            <Field label="Total Budget ($)" htmlFor="cp-budget" required error={errors.budget}>
              <input
                {...bind('budget')}
                type="text"
                inputMode="decimal"
                className={fieldClass}
                value={form.budget}
                placeholder="375,000"
                autoComplete="off"
                onChange={(e) => update('budget', e.target.value)}
                onBlur={() => {
                  const cents = parseBudgetToCents(form.budget)
                  if (cents !== null) update('budget', formatBudgetInput(cents))
                }}
                required
              />
            </Field>
          </div>

          <SectionLabel style={{ marginTop: 24 }}>Team &amp; Ownership</SectionLabel>

          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <Field
              label="Project Manager"
              htmlFor="cp-pmUserId"
              error={errors.pmUserId}
              hint={members.isError ? "Couldn't load your team — you can still assign yourself." : undefined}
            >
              <select
                {...bind('pmUserId')}
                className={fieldClass}
                value={form.pmUserId}
                onChange={(e) => update('pmUserId', e.target.value)}
                aria-busy={members.isPending || undefined}
              >
                {pmOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
                {members.isPending && (
                  <option disabled value="__loading">
                    Loading team…
                  </option>
                )}
              </select>
            </Field>
            <Field label="Department / Business Unit" htmlFor="cp-department" error={errors.department}>
              <select {...bind('department')} className={fieldClass} value={form.department} onChange={(e) => update('department', e.target.value)}>
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Sponsor / Executive Owner" htmlFor="cp-sponsor" error={errors.sponsor}>
            <input
              {...bind('sponsor')}
              className={fieldClass}
              value={form.sponsor}
              onChange={(e) => update('sponsor', e.target.value)}
              placeholder="e.g. VP of Engineering — Robert Walsh"
              autoComplete="off"
            />
          </Field>

          <SectionLabel style={{ marginTop: 24 }}>Classification</SectionLabel>

          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 8 }}>
            <Field label="Priority" htmlFor="cp-priority" error={errors.priority}>
              <select {...bind('priority')} className={fieldClass} value={form.priority} onChange={(e) => update('priority', e.target.value as Priority)}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Methodology" htmlFor="cp-methodology" error={errors.methodology}>
              <select {...bind('methodology')} className={fieldClass} value={form.methodology} onChange={(e) => update('methodology', e.target.value as Methodology)}>
                {METHODOLOGIES.map((m) => (
                  <option key={m} value={m}>
                    {METHODOLOGY_LABELS[m]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Visibility" htmlFor="cp-visibility" error={errors.visibility}>
              <select {...bind('visibility')} className={fieldClass} value={form.visibility} onChange={(e) => update('visibility', e.target.value as Visibility)}>
                {VISIBILITIES.map((v) => (
                  <option key={v} value={v}>
                    {VISIBILITY_LABELS[v]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>

        <div id="cp-form-status" aria-live="assertive" aria-atomic="true">
          {serverError ? (
            <div style={{ marginTop: 20 }}>
              <Alert tone="error" title={serverError.title} onDismiss={() => setServerError(null)}>
                {serverError.detail}
              </Alert>
            </div>
          ) : submitted && errorCount > 0 ? (
            <p className="sr-only">
              {errorCount === 1 ? '1 field needs attention.' : `${errorCount} fields need attention.`}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-between" style={{ marginTop: 24 }}>
          <Link
            to="/"
            className="inline-flex items-center rounded-[4px] border border-[#d4d4d4] bg-white px-4 py-[9px] text-[13px] text-[#3a3a3a] hover:bg-[#fafafa] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2d2d2d]"
          >
            ← Back to Dashboard
          </Link>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => void submit('draft')} loading={pendingIntent === 'draft'} disabled={busy}>
              Save Draft
            </Button>
            <Button type="submit" loading={pendingIntent === 'continue'} disabled={busy}>
              Continue to AI Intake →
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}

function Breadcrumb() {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-2" style={{ fontSize: 12, color: '#737373', marginBottom: 20 }}>
      <Link to="/" className="hover:text-[#1a1a1a] hover:underline">
        Dashboard
      </Link>
      <span aria-hidden="true">›</span>
      <span aria-current="page" style={{ color: '#1a1a1a' }}>
        Create Project
      </span>
    </nav>
  )
}

function SectionLabel({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, color: '#737373', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #f0f0f0', ...style }}>
      {children}
    </div>
  )
}

function Field({
  label,
  htmlFor,
  required,
  error,
  hint,
  children,
}: {
  label: string
  htmlFor: string
  required?: boolean
  error?: string
  hint?: string
  children: ReactNode
}) {
  const hintId = useId()
  return (
    <div>
      <label htmlFor={htmlFor} style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 5, color: '#3a3a3a' }}>
        {label}
        {required && (
          <span aria-hidden="true" style={{ color: '#999', marginLeft: 2 }}>
            *
          </span>
        )}
      </label>
      {children}
      {error && (
        <p id={`${htmlFor}-error`} style={{ margin: '5px 0 0', fontSize: 12, color: '#b03030' }}>
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={hintId} style={{ margin: '5px 0 0', fontSize: 12, color: '#737373' }}>
          {hint}
        </p>
      )}
    </div>
  )
}

const fieldClass =
  'w-full rounded-[4px] border border-[#d4d4d4] bg-white px-2.5 py-2 text-[13px] text-[#1a1a1a] font-[inherit] outline-none transition-[border-color,box-shadow] placeholder:text-[#a3a3a3] focus:border-[#2d2d2d] focus:shadow-[0_0_0_3px_rgba(45,45,45,0.12)] aria-[invalid=true]:border-[#b03030] aria-[invalid=true]:focus:shadow-[0_0_0_3px_rgba(176,48,48,0.14)]'

const cardStyle: CSSProperties = { background: '#fff', border: '1px solid #e8e8e8', borderRadius: 6, padding: '24px 24px' }

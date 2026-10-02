import { useEffect, useId, useRef, useState, type KeyboardEvent, type Ref } from 'react'
import { ASSISTANT_SUGGESTIONS, getAssistantReply } from '@/lib/assistant'

interface Message {
  id: number
  role: 'user' | 'ai'
  text: string
}

const REPLY_DELAY_MS = 700

export default function AIChat({
  contextLabel,
  firstName,
  onClose,
  inputRef,
}: {
  contextLabel: string
  firstName: string | null
  onClose: () => void
  inputRef?: Ref<HTMLInputElement>
}) {
  const [messages, setMessages] = useState<Message[]>(() => [
    {
      id: 0,
      role: 'ai',
      text: `Hi${firstName ? ` ${firstName}` : ''}, I'm NirnAIn AI. You're on ${contextLabel}. Ask me anything about your project plan.`,
    },
  ])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const nextId = useRef(1)
  const endRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<number | undefined>(undefined)
  const headingId = useId()
  const inputId = useId()

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, typing])

  useEffect(() => () => window.clearTimeout(timerRef.current), [])

  function send(text: string) {
    const question = text.trim()
    if (!question || typing) return
    setMessages((m) => [...m, { id: nextId.current++, role: 'user', text: question }])
    setInput('')
    setTyping(true)
    timerRef.current = window.setTimeout(() => {
      setMessages((m) => [...m, { id: nextId.current++, role: 'ai', text: getAssistantReply(question, contextLabel) }])
      setTyping(false)
    }, REPLY_DELAY_MS)
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
    }
  }

  return (
    <aside
      aria-labelledby={headingId}
      onKeyDown={onKeyDown}
      className="fixed inset-y-0 right-0 z-30 flex w-[320px] max-w-full shrink-0 flex-col border-l border-border bg-white shadow-[-12px_0_32px_-16px_rgba(75,74,158,0.35)] min-[1100px]:static min-[1100px]:z-auto min-[1100px]:shadow-none"
    >
      <header className="flex items-center justify-between border-b border-border bg-[#ebe8fa] px-4 py-3">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-xs text-primary-foreground">
            ✦
          </span>
          <div>
            <div className="flex items-center gap-1.5">
              <h2 id={headingId} className="m-0 text-[13px] font-semibold">
                NirnAIn AI
              </h2>
              <span
                className="rounded-full border border-[#e7c9a3] bg-[#fdeedd] px-1.5 py-px text-[9px] font-semibold uppercase tracking-[0.06em] text-[#8a5518]"
                title="Answers are placeholders until the AI service is connected."
              >
                Preview
              </span>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#3f8a6a]" /> Context: {contextLabel}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close NirnAIn AI"
          className="flex h-7 w-7 items-center justify-center rounded text-secondary-foreground transition-colors hover:bg-white/70 cursor-pointer"
        >
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </header>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        <div role="log" aria-live="polite" aria-label="Conversation" className="flex flex-col gap-3">
          {messages.map((m) => (
            <div
              key={m.id}
              className={
                m.role === 'user'
                  ? 'max-w-[88%] self-end rounded-xl rounded-br-[3px] bg-primary px-3 py-2 text-[13px] leading-[1.45] text-primary-foreground'
                  : 'max-w-[88%] self-start rounded-xl rounded-bl-[3px] bg-muted px-3 py-2 text-[13px] leading-[1.45] text-foreground'
              }
            >
              <span className="sr-only">{m.role === 'user' ? 'You: ' : 'NirnAIn AI: '}</span>
              {m.text}
            </div>
          ))}
          {typing && (
            <div className="self-start rounded-xl bg-muted px-3 py-2 text-[13px] text-muted-foreground">Thinking…</div>
          )}
        </div>
        {messages.length === 1 && (
          <ul aria-label="Suggested questions" className="mt-1 flex flex-col gap-2">
            {ASSISTANT_SUGGESTIONS.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => send(s)}
                  className="w-full rounded-lg bg-accent px-3 py-2 text-left text-xs text-accent-foreground transition-colors hover:bg-[#c9e8dc] cursor-pointer"
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          send(input)
        }}
        className="flex gap-2 border-t border-border p-3"
      >
        <label htmlFor={inputId} className="sr-only">
          Ask NirnAIn AI about your plan
        </label>
        <input
          ref={inputRef}
          id={inputId}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your plan…"
          autoComplete="off"
          maxLength={500}
          className="min-w-0 flex-1 rounded-lg border border-border bg-[#faf9fe] px-2.5 py-2 text-[13px] text-foreground outline-none placeholder:text-[#9b98b5] focus:border-primary focus:shadow-[0_0_0_3px_rgba(75,74,158,0.16)]"
        />
        <button
          type="submit"
          disabled={!input.trim() || typing}
          className="rounded-lg bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground transition hover:bg-[#3d3c85] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
        >
          Send
        </button>
      </form>
    </aside>
  )
}

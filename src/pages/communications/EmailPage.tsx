import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, CalendarClock, FlaskConical, Inbox, Link2, Mail, MailOpen, Paperclip, PenSquare, Reply, Send } from 'lucide-react'
import { useLookups, useStore } from '@/app/store'
import { useScope } from '@/hooks/useScope'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge, StatusBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Avatar, EmptyState } from '@/components/ui/misc'
import { SelectField, TextareaField, TextField } from '@/components/forms/Field'
import { FileDrop, type LocalFile } from '@/components/forms/FileDrop'
import { SearchInput } from '@/components/data-display/FilterBar'
import { Popover, MenuItem, MenuDivider } from '@/components/ui/Menu'
import { useToast } from '@/components/ui/Toast'
import { downloadFile } from '@/services/api/client'
import { cn } from '@/utils/cn'
import { dateTime, fileSize, relative } from '@/utils/format'
import type { EmailThread, FollowUpStatus } from '@/types/domain'

type Filter = 'all' | 'unread' | 'followup'

export default function EmailPage() {
  const scope = useScope()
  const { user, can, markThreadRead, sendEmail, setFollowUp, linkThread } = useStore()
  const lookups = useLookups()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const [reply, setReply] = useState('')
  const [replyFiles, setReplyFiles] = useState<LocalFile[]>([])
  const [showReplyFiles, setShowReplyFiles] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkCustomer, setLinkCustomer] = useState('')
  const [linkRequest, setLinkRequest] = useState('')

  const threadId = params.get('thread')
  const composeFor = params.get('compose')
  const threads = useMemo(
    () =>
      [...scope.threads]
        .filter((t) => (filter === 'unread' ? t.unread : filter === 'followup' ? ['Open', 'Due Today', 'Overdue'].includes(t.followUp.status) : true))
        .filter((t) => !q || `${t.subject} ${lookups.customer(t.customerId)?.name} ${t.messages.map((m) => m.body).join(' ')}`.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => b.messages.at(-1)!.sentAt.localeCompare(a.messages.at(-1)!.sentAt)),
    [scope.threads, filter, q, lookups],
  )
  const active = scope.threads.find((t) => t.id === threadId)

  useEffect(() => {
    if (active?.unread) markThreadRead(active.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id])

  const open = (t: EmailThread) => {
    setParams({ thread: t.id })
    setReply('')
    setReplyFiles([])
    setShowReplyFiles(false)
  }

  const sendReply = async () => {
    if (!active || !reply.trim()) return
    const last = active.messages.at(-1)!
    const to = last.from.email === user.email ? last.to : [last.from]
    const r = await sendEmail({ threadId: active.id, subject: active.subject, to, body: reply.trim(), attachments: replyFiles, customerId: active.customerId, requestId: active.requestId })
    if (!r.ok) return toast.error('Reply not sent', r.error)
    setReply('')
    setReplyFiles([])
    setShowReplyFiles(false)
    toast.success('Reply sent', 'Recorded on the conversation and queued for e-mail delivery.')
  }

  const setFU = async (status: FollowUpStatus, days?: number) => {
    if (!active) return
    const due = days !== undefined ? new Date(Date.now() + days * 864e5).toISOString() : active.followUp.dueAt
    const r = await setFollowUp(active.id, status, status === 'None' ? undefined : due, active.followUp.note)
    if (!r.ok) return toast.error('Follow-up not changed', r.error)
    toast.success(status === 'Done' ? 'Follow-up completed' : status === 'None' ? 'Follow-up cleared' : 'Follow-up scheduled')
  }

  return (
    <>
      <PageHeader
        title="Email conversations"
        description="Customer correspondence linked to accounts and orders."
        breadcrumbs={[{ label: 'Communication' }, { label: 'Email Conversations' }]}
        actions={<Button icon={<PenSquare className="size-4" />} onClick={() => setParams({ compose: scope.customers[0]?.id ?? '' })}>Compose</Button>}
      />

      <div className="card grid h-[calc(100dvh-230px)] min-h-[520px] overflow-hidden lg:grid-cols-[360px_1fr]">
        {/* Conversation list */}
        <div className={cn('flex min-h-0 flex-col border-line lg:border-r', active && 'hidden lg:flex')}>
          <div className="space-y-2 border-b border-line p-3">
            <SearchInput value={q} onChange={setQ} placeholder="Search mail…" />
            <div className="flex gap-1">
              {(['all', 'unread', 'followup'] as Filter[]).map((f) => (
                <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={cn('rounded-md px-2.5 py-1 text-xs font-medium', filter === f ? 'bg-primary-50 text-primary-700' : 'text-muted hover:bg-canvas')}>
                  {f === 'all' ? 'All' : f === 'unread' ? `Unread (${scope.threads.filter((t) => t.unread).length})` : 'Follow-up'}
                </button>
              ))}
            </div>
          </div>
          <ul className="scroll-thin min-h-0 flex-1 divide-y divide-line overflow-y-auto">
            {threads.length === 0 && <li><EmptyState icon={<Inbox className="size-5" />} title="No conversations" /></li>}
            {threads.map((t) => {
              const last = t.messages.at(-1)!
              const selected = t.id === active?.id
              return (
                <li key={t.id}>
                  <button type="button" onClick={() => open(t)} className={cn('relative block w-full px-4 py-3 text-left transition-colors', selected ? 'bg-primary-50/70' : 'hover:bg-canvas')}>
                    {selected && <span className="absolute inset-y-0 left-0 w-0.5 bg-primary" aria-hidden />}
                    <div className="flex items-center gap-2">
                      {t.unread && <span className="size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                      <span className={cn('min-w-0 flex-1 truncate text-[13px]', t.unread ? 'font-semibold' : 'font-medium')}>{lookups.customer(t.customerId)?.name}</span>
                      <span className="shrink-0 text-[11px] text-muted">{relative(last.sentAt)}</span>
                    </div>
                    <p className={cn('mt-0.5 truncate text-[13px]', t.unread ? 'text-ink' : 'text-ink/80')}>{t.subject}</p>
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted">{last.body.replace(/\n+/g, ' ')}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {t.requestId && <Badge tone="neutral" className="font-mono text-[10px]">{lookups.request(t.requestId)?.ref}</Badge>}
                      {t.followUp.status !== 'None' && t.followUp.status !== 'Done' && <StatusBadge status={t.followUp.status} className="text-[10px]" />}
                      {t.messages.some((m) => m.attachments.length) && <Paperclip className="size-3 text-muted" aria-label="Has attachments" />}
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>

        {/* Thread */}
        <div className={cn('flex min-h-0 flex-col', !active && 'hidden lg:flex')}>
          {!active ? (
            <EmptyState className="m-auto" icon={<MailOpen className="size-5" />} title="Select a conversation" description="Threads are linked to customers and order requests." />
          ) : (
            <>
              <div className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <button type="button" onClick={() => setParams({})} className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-ink lg:hidden"><ArrowLeft className="size-3.5" />All conversations</button>
                  <h2 className="text-[15px] font-semibold">{active.subject}</h2>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                    {user.kind === 'external' ? <span>{lookups.customer(active.customerId)?.name}</span> : <Link to={`/app/customers/${active.customerId}`} className="font-medium text-primary hover:underline">{lookups.customer(active.customerId)?.name}</Link>}
                    {active.requestId && <>·<Link to={`/app/requests/${active.requestId}`} className="font-mono text-primary hover:underline">{lookups.request(active.requestId)?.ref}</Link></>}
                    · {active.messages.length} message(s)
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {user.kind !== 'external' && can('email.send') && (
                    <>
                      <Button size="sm" variant="secondary" icon={<Link2 className="size-3.5" />} onClick={() => { setLinkCustomer(active.customerId); setLinkRequest(active.requestId ?? ''); setLinkOpen(true) }}>Link</Button>
                      <Popover
                        trigger={(p) => (
                          <Button size="sm" variant="secondary" onClick={p.toggle} aria-expanded={p['aria-expanded']} icon={<CalendarClock className="size-3.5" />}>
                            {active.followUp.status === 'None' ? 'Follow-up' : active.followUp.status}
                          </Button>
                        )}
                      >
                        {(close) => (
                          <div role="menu">
                            <MenuItem onClick={() => { setFU('Due Today', 0); close() }}>Due today</MenuItem>
                            <MenuItem onClick={() => { setFU('Open', 1); close() }}>Tomorrow</MenuItem>
                            <MenuItem onClick={() => { setFU('Open', 3); close() }}>In 3 days</MenuItem>
                            <MenuItem onClick={() => { setFU('Open', 7); close() }}>Next week</MenuItem>
                            <MenuDivider />
                            <MenuItem onClick={() => { setFU('Done'); close() }}>Mark done</MenuItem>
                            <MenuItem onClick={() => { setFU('None'); close() }}>Clear</MenuItem>
                          </div>
                        )}
                      </Popover>
                    </>
                  )}
                  <Button size="sm" variant="ghost" icon={<Mail className="size-3.5" />} onClick={() => { markThreadRead(active.id, true); setParams({}) }}>Mark unread</Button>
                </div>
              </div>
              {active.followUp.status !== 'None' && (
                <div className="flex items-center gap-2 border-b border-line bg-warning-50/50 px-5 py-2 text-xs">
                  <CalendarClock className="size-3.5 text-warning-700" />
                  <span>Follow-up <strong>{active.followUp.status}</strong>{active.followUp.dueAt && ` · due ${relative(active.followUp.dueAt)}`}{active.followUp.ownerId && ` · ${lookups.user(active.followUp.ownerId)?.name}`}{active.followUp.note && ` — ${active.followUp.note}`}</span>
                </div>
              )}
              <ol className="scroll-thin min-h-0 flex-1 space-y-4 overflow-y-auto bg-canvas/50 p-5">
                {active.messages.map((m) => {
                  const mine = m.from.email === user.email
                  return (
                    <li key={m.id} className={cn('card max-w-3xl p-4', mine && 'ml-auto border-primary/20 bg-primary-50/30')}>
                      <div className="flex items-start gap-3">
                        <Avatar name={m.from.name} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <p className="text-[13px] font-semibold">{m.from.name} <span className="font-normal text-muted">&lt;{m.from.email}&gt;</span></p>
                            <span className="text-[11px] text-muted" title={dateTime(m.sentAt)}>{dateTime(m.sentAt)}</span>
                          </div>
                          <p className="text-xs text-muted">to {m.to.map((t) => t.name).join(', ')}</p>
                          <p className="mt-3 whitespace-pre-line text-[13px] leading-relaxed">{m.body}</p>
                          {m.attachments.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {m.attachments.map((a) => (
                                <button key={a.name} type="button" onClick={() => (a.documentId ? downloadFile(`/documents/${encodeURIComponent(a.documentId)}/content`, a.name).catch((e) => toast.error('File not available', e instanceof Error ? e.message : '')) : toast.info('No stored file', 'This attachment was recorded without file content.'))} className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs hover:border-primary/40">
                                  <Paperclip className="size-3.5 text-muted" />{a.name} <span className="text-muted">{fileSize(a.sizeKb)}</span>
                                </button>
                              ))}
                            </div>
                          )}
                          {m.simulated && <p className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-primary-700"><FlaskConical className="size-3" />Simulated — not sent</p>}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ol>
              <div className="border-t border-line p-4">
                <TextareaField aria-label="Reply" placeholder={`Reply to ${active.messages.at(-1)!.from.email === user.email ? active.messages.at(-1)!.to[0]?.name : active.messages.at(-1)!.from.name}…`} rows={3} value={reply} onChange={(e) => setReply(e.target.value)} className="min-h-20" />
                {showReplyFiles && <div className="mt-3"><FileDrop files={replyFiles} onChange={setReplyFiles} /></div>}
                <div className="mt-3 flex items-center justify-between gap-2">
                  <Button size="sm" variant="ghost" icon={<Paperclip className="size-4" />} onClick={() => setShowReplyFiles(!showReplyFiles)}>{replyFiles.length ? `${replyFiles.length} attached` : 'Attach'}</Button>
                  <Button size="sm" icon={<Reply className="size-4" />} disabled={!reply.trim()} onClick={sendReply}>Send reply</Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <ComposeDialog
        open={composeFor !== null}
        defaultCustomerId={composeFor ?? ''}
        defaultRequestId={params.get('request') ?? ''}
        onClose={() => setParams(threadId ? { thread: threadId } : {})}
        onSent={(id) => setParams({ thread: id })}
      />

      <Dialog
        open={linkOpen}
        onClose={() => setLinkOpen(false)}
        title="Link conversation"
        description="Associate this thread with a customer and, optionally, a sales order request."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setLinkOpen(false)}>Cancel</Button>
            <Button onClick={async () => { const r = await linkThread(active!.id, linkCustomer, linkRequest || undefined); if (!r.ok) return toast.error('Not linked', r.error); setLinkOpen(false); toast.success('Conversation linked') }}>Save link</Button>
          </>
        }
      >
        <div className="space-y-4">
          <SelectField label="Customer" value={linkCustomer} onChange={(e) => { setLinkCustomer(e.target.value); setLinkRequest('') }} options={scope.customers.map((c) => ({ value: c.id, label: c.name }))} />
          <SelectField label="Sales order request" placeholder="None" value={linkRequest} onChange={(e) => setLinkRequest(e.target.value)} options={scope.requests.filter((r) => r.customerId === linkCustomer).map((r) => ({ value: r.id, label: `${r.ref} · ${r.status}` }))} />
        </div>
      </Dialog>
    </>
  )
}

function ComposeDialog({ open, defaultCustomerId, defaultRequestId, onClose, onSent }: { open: boolean; defaultCustomerId: string; defaultRequestId: string; onClose: () => void; onSent: (id: string) => void }) {
  const scope = useScope()
  const { state, user, sendEmail } = useStore()
  const lookups = useLookups()
  const toast = useToast()
  const [customerId, setCustomerId] = useState(defaultCustomerId)
  const [requestId, setRequestId] = useState(defaultRequestId)
  const [to, setTo] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [files, setFiles] = useState<LocalFile[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) return
    const c = scope.customers.find((x) => x.id === defaultCustomerId) ?? scope.customers[0]
    const r = lookups.request(defaultRequestId)
    setCustomerId(c?.id ?? '')
    setRequestId(r?.id ?? '')
    setTo(user.kind === 'external' ? (state.users.find((u) => u.id === c?.accountManagerId)?.email ?? 'priya.nair@tradeflow.example') : c?.contacts.find((x) => x.primary)?.email ?? '')
    setSubject(r ? `${r.ref} — ` : '')
    setBody('')
    setFiles([])
    setErrors({})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const send = async () => {
    const e: Record<string, string> = {}
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim())) e.to = 'Enter a valid recipient email'
    if (subject.trim().length < 3) e.subject = 'Add a subject'
    if (body.trim().length < 5) e.body = 'Write a message'
    if (!customerId) e.customer = 'Link a customer'
    setErrors(e)
    if (Object.keys(e).length) return
    const contact = lookups.customer(customerId)?.contacts.find((c) => c.email === to.trim())
    const r = await sendEmail({ subject: subject.trim(), to: [{ name: contact?.name ?? to.trim(), email: to.trim() }], body: body.trim(), attachments: files, customerId, requestId: requestId || undefined })
    if (!r.ok) return toast.error('Not sent', r.error)
    toast.success('Message sent', 'Queued for e-mail delivery and recorded on the conversation.')
    onSent(r.threadId)
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New email"
      size="lg"
      footer={
        <>
          <span className="mr-auto inline-flex items-center gap-1.5 text-xs text-muted"><FlaskConical className="size-3.5" />Sent by the server's email queue</span>
          <Button variant="secondary" onClick={onClose}>Discard</Button>
          <Button icon={<Send className="size-4" />} onClick={send}>Send</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {user.kind !== 'external' ? (
          <SelectField label="Customer" required error={errors.customer} value={customerId} onChange={(e) => { setCustomerId(e.target.value); setRequestId(''); setTo(lookups.customer(e.target.value)?.contacts.find((c) => c.primary)?.email ?? '') }} options={scope.customers.map((c) => ({ value: c.id, label: c.name }))} />
        ) : (
          <TextField label="Account" value={lookups.customer(customerId)?.name ?? ''} disabled readOnly />
        )}
        <SelectField label="Link to request" placeholder="None" value={requestId} onChange={(e) => setRequestId(e.target.value)} options={scope.requests.filter((r) => r.customerId === customerId).map((r) => ({ value: r.id, label: `${r.ref} · ${r.status}` }))} />
        <TextField className="sm:col-span-2" label="To" required type="email" list="compose-contacts" error={errors.to} value={to} onChange={(e) => setTo(e.target.value)} />
        <datalist id="compose-contacts">
          {lookups.customer(customerId)?.contacts.map((c) => <option key={c.id} value={c.email}>{c.name}</option>)}
        </datalist>
        <div className="sm:col-span-2"><TextField label="Subject" required error={errors.subject} value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
        <div className="sm:col-span-2"><TextareaField label="Message" required error={errors.body} rows={7} value={body} onChange={(e) => setBody(e.target.value)} /></div>
        <div className="sm:col-span-2"><FileDrop files={files} onChange={setFiles} label="Attach files" /></div>
      </div>
    </Dialog>
  )
}

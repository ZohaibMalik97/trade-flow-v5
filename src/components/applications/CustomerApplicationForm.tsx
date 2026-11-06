/**
 * Customer application form (multi-step).
 * Shared by public registration (creates the applicant account) and the applicant
 * portal (complete a draft, or correct the sections a reviewer re-opened).
 */
import { useMemo, useState, type ReactNode } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { ArrowLeft, ArrowRight, Building2, Check, CheckCircle2, Eye, EyeOff, FileText, KeyRound, Lock, MapPin, RotateCcw, Save, Send, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Checkbox, SelectField, TextField } from '@/components/forms/Field'
import { FileDrop, type LocalFile } from '@/components/forms/FileDrop'
import { zodResolver } from '@/components/forms/zodResolver'
import { Notice } from '@/components/ui/misc'
import { Badge } from '@/components/ui/Badge'
import { useStore, type NewFile } from '@/app/store'
import { brands } from '@/data/reference'
import { COUNTRIES } from '@/data/reference'
import { passwordProblems } from '@/auth/passwordPolicy'
import { SECTION_LABELS } from '@/workflow/onboarding'
import { cn } from '@/utils/cn'
import { date, fileSize } from '@/utils/format'
import type { ApplicationContent, ApplicationDocument, ApplicationSection, DocumentType } from '@/types/domain'

const base = {
  companyName: z.string().trim().min(2, 'Enter the trading name'),
  legalName: z.string().trim().min(2, 'Enter the registered legal name'),
  crNumber: z.string().trim().min(4, 'Commercial registration number is required'),
  taxNumber: z.string().trim().min(3, 'Tax / VAT number is required (enter “N/A” if exempt)'),
  businessType: z.string().min(1, 'Select a business type'),
  annualVolumeBand: z.string().min(1, 'Select an expected annual volume'),
  website: z.string().trim().optional(),
  country: z.string().min(1, 'Select a country'),
  city: z.string().trim().min(2, 'Enter a city'),
  contactName: z.string().trim().min(2, 'Enter the contact’s full name'),
  contactRole: z.string().trim().min(2, 'Enter the contact’s job title'),
  email: z.string().trim().email('Enter a valid email address'),
  phone: z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/, 'Enter a valid phone number with country code'),
  requestedBrandIds: z.array(z.string()).min(1, 'Select at least one brand'),
  billingLine1: z.string().trim().min(4, 'Enter the billing street address'),
  billingCity: z.string().trim().min(2, 'Enter the billing city'),
  billingPostal: z.string().trim().optional(),
  sameAsBilling: z.boolean(),
  deliveryLine1: z.string().trim().optional(),
  deliveryCity: z.string().trim().optional(),
  confirmAccuracy: z.boolean().refine((v) => v, 'Please confirm the information is accurate'),
  accountEmail: z.string().trim().optional(),
  password: z.string().optional(),
  confirmPassword: z.string().optional(),
}

const makeSchema = (withAccount: boolean) =>
  z.object(base).superRefine((v, ctx) => {
    if (!v.sameAsBilling) {
      if (!v.deliveryLine1 || v.deliveryLine1.length < 4) ctx.addIssue({ code: 'custom', path: ['deliveryLine1'], message: 'Enter the delivery street address' })
      if (!v.deliveryCity || v.deliveryCity.length < 2) ctx.addIssue({ code: 'custom', path: ['deliveryCity'], message: 'Enter the delivery city' })
    }
    if (withAccount) {
      if (!v.accountEmail || !/^\S+@\S+\.\S+$/.test(v.accountEmail)) ctx.addIssue({ code: 'custom', path: ['accountEmail'], message: 'Enter a valid email address — you will use it to sign in' })
      const probs = passwordProblems(v.password ?? '')
      if (probs.length) ctx.addIssue({ code: 'custom', path: ['password'], message: `Password needs ${probs.join(', ')}` })
      if ((v.confirmPassword ?? '') !== (v.password ?? '')) ctx.addIssue({ code: 'custom', path: ['confirmPassword'], message: 'Passwords do not match' })
    }
  })

export type ApplicationFormValues = z.infer<ReturnType<typeof makeSchema>>

type StepKey = 'account' | 'company' | 'contact' | 'brands' | 'documents' | 'review'
const ALL_STEPS: { key: StepKey; label: string; icon: typeof Building2; fields: (keyof ApplicationFormValues)[]; sections: ApplicationSection[] }[] = [
  { key: 'account', label: 'Your account', icon: KeyRound, fields: ['accountEmail', 'password', 'confirmPassword'], sections: [] },
  { key: 'company', label: 'Company', icon: Building2, fields: ['companyName', 'legalName', 'crNumber', 'taxNumber', 'businessType', 'annualVolumeBand', 'website'], sections: ['company'] },
  { key: 'contact', label: 'Contact & territory', icon: UserRound, fields: ['country', 'city', 'contactName', 'contactRole', 'email', 'phone'], sections: ['contact'] },
  { key: 'brands', label: 'Brands & addresses', icon: MapPin, fields: ['requestedBrandIds', 'billingLine1', 'billingCity', 'billingPostal', 'sameAsBilling', 'deliveryLine1', 'deliveryCity'], sections: ['brands', 'addresses'] },
  { key: 'documents', label: 'Documents', icon: FileText, fields: [], sections: ['documents'] },
  { key: 'review', label: 'Review & submit', icon: CheckCircle2, fields: ['confirmAccuracy'], sections: [] },
]

const DOC_TYPES: DocumentType[] = ['Commercial Registration', 'Trade License', 'Tax Certificate', 'Bank Reference Letter']

export interface ApplicationFormOutput {
  account?: { email: string; password: string; name: string; title: string }
  content: ApplicationContent
  addDocuments: NewFile[]
  supersedeDocumentIds: string[]
}

const emptyContent: ApplicationContent = {
  companyName: '', legalName: '', crNumber: '', taxNumber: '', country: '', city: '', territoryId: '', website: '', businessType: '', annualVolumeBand: '',
  contact: { name: '', role: '', email: '', phone: '' }, requestedBrandIds: [], billingAddress: { line1: '', city: '', country: '' }, deliveryAddress: { line1: '', city: '', country: '' },
}

function toValues(c: ApplicationContent): ApplicationFormValues {
  const same = c.deliveryAddress.line1 === c.billingAddress.line1 && c.deliveryAddress.city === c.billingAddress.city
  return {
    companyName: c.companyName, legalName: c.legalName, crNumber: c.crNumber, taxNumber: c.taxNumber, businessType: c.businessType, annualVolumeBand: c.annualVolumeBand, website: c.website ?? '',
    country: c.country, city: c.city, contactName: c.contact.name, contactRole: c.contact.role, email: c.contact.email, phone: c.contact.phone,
    requestedBrandIds: [...c.requestedBrandIds], billingLine1: c.billingAddress.line1, billingCity: c.billingAddress.city, billingPostal: c.billingAddress.postalCode ?? '',
    sameAsBilling: same, deliveryLine1: same ? '' : c.deliveryAddress.line1, deliveryCity: same ? '' : c.deliveryAddress.city,
    confirmAccuracy: false, accountEmail: '', password: '', confirmPassword: '',
  }
}

export function CustomerApplicationForm({
  mode,
  initial,
  existingDocuments = [],
  editableSections,
  submitLabel,
  reviewExtra,
  onSaveDraft,
  onSubmit,
  busy,
}: {
  mode: 'register' | 'draft' | 'correction'
  initial?: ApplicationContent
  existingDocuments?: ApplicationDocument[]
  /** Sections the user may change (correction). Undefined = everything. */
  editableSections?: ApplicationSection[]
  submitLabel: string
  reviewExtra?: ReactNode
  onSaveDraft?: (out: ApplicationFormOutput) => void
  onSubmit: (out: ApplicationFormOutput) => void
  busy?: boolean
}) {
  const { state } = useStore()
  const withAccount = mode === 'register'
  const steps = ALL_STEPS.filter((s) => withAccount || s.key !== 'account')
  const [step, setStep] = useState(0)
  const [showPw, setShowPw] = useState(false)
  const [newDocs, setNewDocs] = useState<(LocalFile & { type: DocumentType })[]>([])
  const [supersede, setSupersede] = useState<string[]>([])
  const [docError, setDocError] = useState<string>()
  const schema = useMemo(() => makeSchema(withAccount), [withAccount])
  const editable = (sec: ApplicationSection) => !editableSections || editableSections.includes(sec)

  const form = useForm<ApplicationFormValues>({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: toValues(initial ?? emptyContent),
  })
  const { register, formState, trigger, getValues, setValue, control } = form
  const errors = formState.errors
  const country = useWatch({ control, name: 'country' })
  const sameAsBilling = useWatch({ control, name: 'sameAsBilling' })
  const selectedBrands = useWatch({ control, name: 'requestedBrandIds' })

  const territory = useMemo(() => {
    const tId = COUNTRIES.find((c) => c.country === country)?.territoryId
    return state.territories.find((t) => t.id === tId)
  }, [country, state.territories])
  const availableBrands = brands.filter((b) => !territory || territory.visibleBrandIds.includes(b.id))
  const currentExisting = existingDocuments.filter((d) => !d.supersededAt)
  const keptExisting = currentExisting.filter((d) => !supersede.includes(d.id))

  const validateDocs = () => {
    if (!editable('documents')) return true
    const all = [...keptExisting.map((d) => d.type), ...newDocs.map((d) => d.type)]
    const msg = !all.some((t) => t === 'Commercial Registration' || t === 'Trade License')
      ? 'Attach a commercial registration or trade license.'
      : !all.includes('Tax Certificate')
        ? 'Attach a tax / VAT registration certificate.'
        : mode === 'correction' && editableSections?.includes('documents') && newDocs.length === 0
          ? 'The reviewer asked for documents — upload at least one new file.'
          : undefined
    setDocError(msg)
    return !msg
  }

  const output = (v: ApplicationFormValues): ApplicationFormOutput => {
    const billing = { line1: v.billingLine1, city: v.billingCity, postalCode: v.billingPostal || undefined, country: v.country }
    return {
      account: withAccount ? { email: v.accountEmail!.trim(), password: v.password!, name: v.contactName.trim(), title: `${v.contactRole.trim()}${v.companyName ? `, ${v.companyName.trim()}` : ''}` } : undefined,
      content: {
        companyName: v.companyName.trim(), legalName: v.legalName.trim(), crNumber: v.crNumber.trim(), taxNumber: v.taxNumber.trim(), country: v.country, city: v.city.trim(),
        territoryId: territory?.id ?? initial?.territoryId ?? '', website: v.website?.trim() || undefined, businessType: v.businessType, annualVolumeBand: v.annualVolumeBand,
        contact: { name: v.contactName.trim(), role: v.contactRole.trim(), email: v.email.trim(), phone: v.phone.trim() },
        requestedBrandIds: v.requestedBrandIds,
        billingAddress: billing,
        deliveryAddress: v.sameAsBilling ? { ...billing } : { line1: v.deliveryLine1 ?? '', city: v.deliveryCity ?? '', country: v.country },
      },
      addDocuments: newDocs.map((d) => ({ name: d.name, type: d.type, sizeKb: d.sizeKb, file: d.file })),
      supersedeDocumentIds: supersede,
    }
  }

  const goNext = async () => {
    const s = steps[step]!
    const lockedStep = s.sections.length > 0 && !s.sections.some(editable)
    const ok = s.fields.length && !lockedStep ? await trigger(s.fields, { shouldFocus: true }) : true
    if (!ok) return
    if (s.key === 'account') {
      const v = getValues()
      if (!v.email) setValue('email', v.accountEmail ?? '')
    }
    if (s.key === 'documents' && !validateDocs()) return
    setStep((x) => Math.min(x + 1, steps.length - 1))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const saveDraft = async () => {
    if (!onSaveDraft) return
    if (withAccount) {
      const ok = await trigger(['accountEmail', 'password', 'confirmPassword', 'companyName', 'contactName'], { shouldFocus: true })
      if (!ok) {
        setStep(0)
        return
      }
    }
    onSaveDraft(output(getValues()))
  }

  const submit = form.handleSubmit((v) => {
    if (!validateDocs()) {
      setStep(steps.findIndex((s) => s.key === 'documents'))
      return
    }
    onSubmit(output(v))
  })

  const v = getValues()
  const cur = steps[step]!
  const locked = cur.sections.length > 0 && !cur.sections.some(editable)
  const lockNote = (sec: ApplicationSection) =>
    !editable(sec) && <Notice tone="info" icon={<Lock className="size-4" />}>{SECTION_LABELS[sec]} {sec === 'documents' ? 'are' : 'is'} not open for correction — shown for reference.</Notice>

  return (
    <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[230px_1fr]">
      <aside>
        <ol className="flex gap-2 overflow-x-auto lg:flex-col lg:gap-1">
          {steps.map((s, i) => {
            const open = s.sections.length === 0 || s.sections.some(editable)
            return (
              <li key={s.key}>
                <button
                  type="button"
                  disabled={i > step}
                  onClick={() => setStep(i)}
                  aria-current={i === step ? 'step' : undefined}
                  className={cn(
                    'flex w-full items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-left text-[13px] font-medium',
                    i === step ? 'bg-surface text-primary shadow-sm ring-1 ring-line' : i < step ? 'text-ink hover:bg-surface' : 'text-muted',
                  )}
                >
                  <span className={cn('flex size-6 items-center justify-center rounded-full text-[11px]', i < step ? 'bg-success text-white' : i === step ? 'bg-primary text-white' : 'bg-slate-200 text-muted')}>
                    {i < step ? <Check className="size-3.5" /> : i + 1}
                  </span>
                  <span className="flex-1">{s.label}</span>
                  {mode === 'correction' && s.sections.length > 0 && (open ? <Badge tone="warning">Edit</Badge> : <Lock className="size-3.5 text-muted" aria-label="Locked" />)}
                </button>
              </li>
            )
          })}
        </ol>
      </aside>

      <form onSubmit={submit} noValidate className="card">
        <div className="border-b border-line px-6 py-4">
          <p className="eyebrow">Step {step + 1} of {steps.length}</p>
          <h2 className="mt-0.5 text-base font-semibold">{cur.label}</h2>
        </div>
        <div className="space-y-5 p-6">
          {cur.key === 'account' && (
            <div className="grid gap-5 sm:grid-cols-2">
              <Notice tone="info" className="sm:col-span-2">You’ll use this email and password to sign in, follow your application and respond to reviewer requests.</Notice>
              <TextField label="Sign-in email" type="email" required className="" autoComplete="username" error={errors.accountEmail?.message} {...register('accountEmail')} />
              <div className="hidden sm:block" />
              <TextField
                label="Password"
                type={showPw ? 'text' : 'password'}
                required
                autoComplete="new-password"
                hint="At least 8 characters, including a letter and a number."
                error={errors.password?.message}
                trailing={
                  <button type="button" onClick={() => setShowPw((x) => !x)} aria-label={showPw ? 'Hide password' : 'Show password'} aria-pressed={showPw} className="rounded-md p-1.5 text-muted hover:bg-canvas hover:text-ink">
                    {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                }
                {...register('password')}
              />
              <TextField label="Confirm password" type={showPw ? 'text' : 'password'} required autoComplete="new-password" error={errors.confirmPassword?.message} {...register('confirmPassword')} />
            </div>
          )}

          {cur.key === 'company' && (
            <>
              {lockNote('company')}
              <fieldset disabled={locked} className="grid gap-5 sm:grid-cols-2">
                <TextField label="Trading name" required error={errors.companyName?.message} {...register('companyName')} />
                <TextField label="Registered legal name" required error={errors.legalName?.message} {...register('legalName')} />
                <TextField label="Commercial registration no." required error={errors.crNumber?.message} hint="As printed on your CR / trade license" {...register('crNumber')} />
                <TextField label="Tax / VAT number" required error={errors.taxNumber?.message} {...register('taxNumber')} />
                <SelectField label="Business type" required placeholder="Select…" error={errors.businessType?.message} options={['Wholesale distributor', 'Retail chain', 'Online retailer', 'Duty free operator', 'Specialist perfumery'].map((x) => ({ value: x, label: x }))} {...register('businessType')} />
                <SelectField label="Expected annual volume" required placeholder="Select…" error={errors.annualVolumeBand?.message} options={['Below USD 100k', 'USD 100k – 500k', 'USD 500k – 1M', 'Above USD 1M'].map((x) => ({ value: x, label: x }))} {...register('annualVolumeBand')} />
                <TextField label="Website" placeholder="example.com" className="sm:col-span-2" {...register('website')} />
              </fieldset>
            </>
          )}

          {cur.key === 'contact' && (
            <>
              {lockNote('contact')}
              <fieldset disabled={locked} className="grid gap-5 sm:grid-cols-2">
                <SelectField label="Country" required placeholder="Select country…" error={errors.country?.message} options={COUNTRIES.map((c) => ({ value: c.country, label: c.country }))} {...register('country')} />
                <TextField label="City" required error={errors.city?.message} {...register('city')} />
                <div className="sm:col-span-2">
                  <div className="flex items-center gap-3 rounded-lg border border-line bg-canvas px-4 py-3">
                    <MapPin className="size-4 text-primary" />
                    <p className="text-[13px]">
                      <span className="text-muted">Assigned territory: </span>
                      <span className="font-medium">{territory ? territory.name : 'Select a country to see your territory'}</span>
                    </p>
                  </div>
                </div>
                <TextField label="Contact full name" required error={errors.contactName?.message} autoComplete="name" {...register('contactName')} />
                <TextField label="Job title" required error={errors.contactRole?.message} {...register('contactRole')} />
                <TextField label="Business email" type="email" required error={errors.email?.message} autoComplete="email" {...register('email')} />
                <TextField label="Phone" type="tel" required placeholder="+971 4 555 0100" error={errors.phone?.message} autoComplete="tel" {...register('phone')} />
              </fieldset>
            </>
          )}

          {cur.key === 'brands' && (
            <>
              {lockNote('brands')}
              <fieldset disabled={!editable('brands')}>
                <legend className="label">Requested brands <span className="text-danger">*</span></legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {availableBrands.map((b) => {
                    const checked = selectedBrands.includes(b.id)
                    return (
                      <label key={b.id} className={cn('flex cursor-pointer items-center gap-3 rounded-lg border px-3.5 py-3 transition-colors', checked ? 'border-primary bg-primary-50/60' : 'border-line hover:border-line-strong')}>
                        <input
                          type="checkbox"
                          className="size-4 accent-primary"
                          checked={checked}
                          onChange={() => setValue('requestedBrandIds', checked ? selectedBrands.filter((x) => x !== b.id) : [...selectedBrands, b.id], { shouldValidate: true })}
                        />
                        <span className="size-3 rounded-full" style={{ background: `hsl(${b.hue} 55% 55%)` }} aria-hidden />
                        <span>
                          <span className="block text-[13px] font-medium">{b.name}</span>
                          <span className="block text-xs text-muted">{b.origin}</span>
                        </span>
                      </label>
                    )
                  })}
                </div>
                {errors.requestedBrandIds && <p role="alert" className="mt-1.5 text-xs font-medium text-danger-700">{errors.requestedBrandIds.message}</p>}
                {territory && availableBrands.length < brands.length && <p className="mt-2 text-xs text-muted">Only brands distributed in {territory.name} are listed.</p>}
              </fieldset>
              {editable('brands') !== editable('addresses') && lockNote('addresses')}
              <fieldset disabled={!editable('addresses')} className="grid gap-5 border-t border-line pt-5 sm:grid-cols-2">
                <p className="text-sm font-semibold sm:col-span-2">Billing address</p>
                <TextField label="Street address" required error={errors.billingLine1?.message} {...register('billingLine1')} />
                <TextField label="City" required error={errors.billingCity?.message} {...register('billingCity')} />
                <TextField label="Postal code" {...register('billingPostal')} />
                <TextField label="Country" value={country || '—'} disabled readOnly />
                <Checkbox className="sm:col-span-2" label="Delivery address is the same as billing" {...register('sameAsBilling')} />
                {!sameAsBilling && (
                  <>
                    <TextField label="Delivery street address" required error={errors.deliveryLine1?.message} {...register('deliveryLine1')} />
                    <TextField label="Delivery city" required error={errors.deliveryCity?.message} {...register('deliveryCity')} />
                  </>
                )}
              </fieldset>
            </>
          )}

          {cur.key === 'documents' && (
            <>
              {lockNote('documents')}
              <Notice tone="info">Required: a commercial registration <em>or</em> trade license, and a tax / VAT certificate. A bank reference letter speeds up review.</Notice>
              {currentExisting.length > 0 && (
                <div className="space-y-2">
                  <p className="label">Documents on file</p>
                  {currentExisting.map((d) => {
                    const removed = supersede.includes(d.id)
                    return (
                      <div key={d.id} className={cn('flex flex-wrap items-center gap-3 rounded-lg border border-line px-3 py-2', removed && 'bg-canvas opacity-70')}>
                        <FileText className="size-4 shrink-0 text-primary" />
                        <span className={cn('min-w-0 flex-1 truncate text-[13px]', removed && 'line-through')}>{d.name} <span className="text-muted">· {d.type} · {fileSize(d.sizeKb)} · added {date(d.uploadedAt)} (rev. {d.revision})</span></span>
                        {editable('documents') && (
                          <Button variant="ghost" size="sm" icon={removed ? <RotateCcw className="size-3.5" /> : undefined} onClick={() => setSupersede(removed ? supersede.filter((x) => x !== d.id) : [...supersede, d.id])}>
                            {removed ? 'Keep' : mode === 'correction' ? 'Replace / withdraw' : 'Remove'}
                          </Button>
                        )}
                      </div>
                    )
                  })}
                  {mode === 'correction' && supersede.length > 0 && <p className="text-xs text-muted">Withdrawn files are kept in the application history as superseded — they are not deleted.</p>}
                </div>
              )}
              {editable('documents') && (
                <>
                  <FileDrop
                    files={newDocs}
                    error={docError}
                    onChange={(files) => {
                      setDocError(undefined)
                      setNewDocs(files.map((f, i) => ({ ...f, type: newDocs[i]?.type ?? (DOC_TYPES[Math.min(i + keptExisting.length, DOC_TYPES.length - 1)] as DocumentType) })))
                    }}
                  />
                  {newDocs.length > 0 && (
                    <div className="space-y-2">
                      <p className="label">Document types</p>
                      {newDocs.map((d, i) => (
                        <div key={`${d.name}-${i}`} className="flex flex-col gap-2 rounded-lg border border-line px-3 py-2 sm:flex-row sm:items-center">
                          <span className="min-w-0 flex-1 truncate text-[13px]">{d.name} <span className="text-muted">· {fileSize(d.sizeKb)}</span></span>
                          <SelectField aria-label={`Type for ${d.name}`} className="h-9 sm:w-60" value={d.type} options={DOC_TYPES.map((t) => ({ value: t, label: t }))} onChange={(e) => setNewDocs(newDocs.map((x, j) => (j === i ? { ...x, type: e.target.value as DocumentType } : x)))} />
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {cur.key === 'review' && (
            <div className="space-y-5">
              {withAccount && <ReviewBlock title="Account" onEdit={() => setStep(0)} rows={[['Sign-in email', v.accountEmail], ['Password', '••••••••']]} />}
              <ReviewBlock title="Company" onEdit={() => setStep(steps.findIndex((s) => s.key === 'company'))} rows={[['Trading name', v.companyName], ['Legal name', v.legalName], ['CR number', v.crNumber], ['Tax number', v.taxNumber], ['Business type', v.businessType], ['Annual volume', v.annualVolumeBand]]} />
              <ReviewBlock title="Contact & territory" onEdit={() => setStep(steps.findIndex((s) => s.key === 'contact'))} rows={[['Location', `${v.city}, ${v.country}`], ['Territory', territory?.name ?? '—'], ['Contact', `${v.contactName} — ${v.contactRole}`], ['Email', v.email], ['Phone', v.phone]]} />
              <ReviewBlock title="Brands & addresses" onEdit={() => setStep(steps.findIndex((s) => s.key === 'brands'))} rows={[['Brands', v.requestedBrandIds.map((id) => brands.find((b) => b.id === id)?.name).join(', ')], ['Billing', `${v.billingLine1}, ${v.billingCity}`], ['Delivery', v.sameAsBilling ? 'Same as billing' : `${v.deliveryLine1}, ${v.deliveryCity}`]]} />
              <ReviewBlock title="Documents" onEdit={() => setStep(steps.findIndex((s) => s.key === 'documents'))} rows={[...keptExisting.map((d) => [d.type, `${d.name} (on file)`] as [string, string]), ...newDocs.map((d) => [d.type, `${d.name} (new)`] as [string, string])]} />
              {reviewExtra}
              <Checkbox label="I confirm the information provided is accurate and complete." description="Prototype: nothing is sent to a server." {...register('confirmAccuracy')} />
              {errors.confirmAccuracy && <p role="alert" className="-mt-3 text-xs font-medium text-danger-700">{errors.confirmAccuracy.message}</p>}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-canvas/60 px-6 py-4">
          <Button variant="ghost" icon={<ArrowLeft className="size-4" />} disabled={step === 0} onClick={() => setStep((x) => x - 1)}>Back</Button>
          <div className="flex flex-wrap gap-2">
            {onSaveDraft && (
              <Button variant="secondary" icon={<Save className="size-4" />} onClick={saveDraft} disabled={busy}>
                {mode === 'register' ? 'Save draft' : mode === 'correction' ? 'Save changes' : 'Save draft'}
              </Button>
            )}
            {step < steps.length - 1 ? (
              <Button onClick={goNext} iconRight={<ArrowRight className="size-4" />}>Continue</Button>
            ) : (
              <Button type="submit" loading={busy} icon={<Send className="size-4" />}>{submitLabel}</Button>
            )}
          </div>
        </div>
      </form>
    </div>
  )
}

function ReviewBlock({ title, rows, onEdit }: { title: string; rows: [string, string | undefined][]; onEdit: () => void }) {
  return (
    <div className="rounded-lg border border-line">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <p className="text-[13px] font-semibold">{title}</p>
        <button type="button" onClick={onEdit} className="text-xs font-medium text-primary hover:underline">Edit</button>
      </div>
      <dl className="divide-y divide-line">
        {rows.length === 0 && <p className="px-4 py-2 text-[13px] text-muted">None</p>}
        {rows.map(([k, val], i) => (
          <div key={i} className="grid grid-cols-[140px_1fr] gap-3 px-4 py-2 text-[13px]">
            <dt className="text-muted">{k}</dt>
            <dd className="break-words font-medium">{val || '—'}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

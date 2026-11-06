import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye, FileText, FolderOpen, Upload } from 'lucide-react'
import { useLookups, useStore } from '@/app/store'
import { useScope } from '@/hooks/useScope'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { EmptyState } from '@/components/ui/misc'
import { SelectField } from '@/components/forms/Field'
import { FileDrop, type LocalFile } from '@/components/forms/FileDrop'
import { DataTable, type Column } from '@/components/data-display/DataTable'
import { FilterBar, FilterSelect, SearchInput } from '@/components/data-display/FilterBar'
import { DocumentPreview } from '@/components/data-display/DocumentPreview'
import { useToast } from '@/components/ui/Toast'
import { date, fileSize } from '@/utils/format'
import type { DocumentRecord, DocumentType } from '@/types/domain'

const TYPES: DocumentType[] = ['Commercial Registration', 'Tax Certificate', 'Trade License', 'Bank Reference Letter', 'Proforma Invoice', 'Payment Receipt', 'Packing List', 'Commercial Invoice', 'Certificate of Origin', 'Bill of Lading', 'Safety Data Sheet']

export default function DocumentsPage() {
  const scope = useScope()
  const { user, addDocument } = useStore()
  const lookups = useLookups()
  const toast = useToast()
  const [q, setQ] = useState('')
  const [type, setType] = useState('')
  const [status, setStatus] = useState('')
  const [preview, setPreview] = useState<DocumentRecord | null>(null)
  const [upload, setUpload] = useState(false)
  const [files, setFiles] = useState<LocalFile[]>([])
  const [newType, setNewType] = useState<DocumentType>(user.kind === 'external' ? 'Trade License' : 'Commercial Registration')
  const [customerId, setCustomerId] = useState(user.kind === 'external' ? user.customerId ?? '' : '')

  const rows = scope.documents.filter(
    (d) => (!q || `${d.name} ${lookups.customer(d.customerId)?.name ?? ''}`.toLowerCase().includes(q.toLowerCase())) && (!type || d.type === type) && (!status || d.status === status),
  )

  const linkFor = (d: DocumentRecord) => {
    const k = d.linkedTo
    if (k.kind === 'invoice') return { to: `/app/invoices/${k.id}`, label: lookups.invoice(k.id)?.number }
    if (k.kind === 'shipment') return { to: `/app/shipments/${k.id}`, label: lookups.shipment(k.id)?.ref }
    if (k.kind === 'customer') return user.kind === 'external' ? { to: `/app/customers/${k.id}`, label: 'Company profile' } : { to: `/app/customers/${k.id}`, label: lookups.customer(k.id)?.code }
    if (k.kind === 'request') return { to: `/app/requests/${k.id}`, label: lookups.request(k.id)?.ref }
    return { to: '#', label: '—' }
  }

  const columns: Column<DocumentRecord>[] = [
    {
      key: 'name', header: 'Document', primary: true, sortValue: (d) => d.name,
      cell: (d) => (
        <span className="flex items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary"><FileText className="size-4" /></span>
          <span className="min-w-0"><span className="block max-w-72 truncate font-medium">{d.name}</span><span className="block text-xs text-muted">{fileSize(d.sizeKb)}</span></span>
        </span>
      ),
    },
    { key: 'type', header: 'Type', sortValue: (d) => d.type, cell: (d) => d.type },
    ...(user.kind !== 'external' ? [{ key: 'customer', header: 'Customer', sortValue: (d: DocumentRecord) => lookups.customer(d.customerId)?.name ?? '', cell: (d: DocumentRecord) => <span className="text-muted">{lookups.customer(d.customerId)?.name}</span> } as Column<DocumentRecord>] : []),
    { key: 'link', header: 'Linked to', hideOnMobile: true, cell: (d) => { const l = linkFor(d); return <Link onClick={(e) => e.stopPropagation()} to={l.to} className="font-mono text-[12px] text-primary hover:underline">{l.label}</Link> } },
    { key: 'date', header: 'Uploaded', sortValue: (d) => d.uploadedAt, cell: (d) => date(d.uploadedAt) },
    { key: 'status', header: 'Status', sortValue: (d) => d.status, cell: (d) => <StatusBadge status={d.status} /> },
    { key: 'act', header: '', align: 'right', cell: (d) => <Button size="xs" variant="ghost" icon={<Eye className="size-3.5" />} onClick={(e) => { e.stopPropagation(); setPreview(d) }}>View</Button> },
  ]

  return (
    <>
      <PageHeader
        title="Documents"
        description="Registration, finance and shipping documents linked to customers and orders."
        breadcrumbs={[{ label: 'Fulfillment' }, { label: 'Documents' }]}
        actions={<Button icon={<Upload className="size-4" />} onClick={() => setUpload(true)}>Upload document</Button>}
      />
      <Card>
        <FilterBar active={!!(q || type || status)} onReset={() => { setQ(''); setType(''); setStatus('') }}>
          <SearchInput value={q} onChange={setQ} placeholder="File name or customer…" className="w-full sm:w-64" />
          <FilterSelect label="Type" value={type} onChange={setType} options={TYPES.filter((t) => scope.documents.some((d) => d.type === t)).map((t) => ({ value: t, label: t }))} />
          <FilterSelect label="Status" value={status} onChange={setStatus} options={['Verified', 'Final', 'Draft', 'Pending Review', 'Expired'].map((s) => ({ value: s, label: s }))} />
        </FilterBar>
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(d) => d.id}
          onRowClick={setPreview}
          pageSize={12}
          initialSort={{ key: 'date', dir: 'desc' }}
          empty={<EmptyState icon={<FolderOpen className="size-5" />} title="No documents found" />}
        />
      </Card>

      <Dialog
        open={upload}
        onClose={() => setUpload(false)}
        title="Upload document"
        description="The file is read locally for its name and size only."
        footer={
          <>
            <Button variant="secondary" onClick={() => setUpload(false)}>Cancel</Button>
            <Button
              disabled={!files.length || !customerId}
              onClick={async () => {
                for (const f of files) {
                  const res = await addDocument({ name: f.name, type: newType, sizeKb: f.sizeKb, file: f.file, linkedTo: { kind: 'customer', id: customerId }, customerId, status: 'Pending Review' })
                  if (!res.ok) return toast.error(`${f.name} not uploaded`, res.error)
                }
                toast.success(`${files.length} document(s) uploaded`, 'Status: Pending review.')
                setFiles([])
                setUpload(false)
              }}
            >
              Upload
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {user.kind !== 'external' && (
            <SelectField label="Customer" required placeholder="Select customer…" value={customerId} onChange={(e) => setCustomerId(e.target.value)} options={scope.customers.map((c) => ({ value: c.id, label: c.name }))} />
          )}
          <SelectField label="Document type" value={newType} onChange={(e) => setNewType(e.target.value as DocumentType)} options={TYPES.map((t) => ({ value: t, label: t }))} />
          <FileDrop files={files} onChange={setFiles} />
        </div>
      </Dialog>
      <DocumentPreview doc={preview} onClose={() => setPreview(null)} />
    </>
  )
}

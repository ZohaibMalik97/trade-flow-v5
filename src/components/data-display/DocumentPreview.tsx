import { useState } from 'react'
import { Download, ExternalLink, FileText } from 'lucide-react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { ApiError, downloadFile } from '@/services/api/client'
import { fileSize } from '@/utils/format'

/**
 * Document details with open / download. File content is streamed from the API
 * (`GET /documents/{id}/content`) after a server-side access check; it is never stored in SQL.
 */
export function DocumentPreview({ doc, onClose }: { doc: { id?: string; name: string; type: string; sizeKb: number } | null; onClose: () => void }) {
  const toast = useToast()
  const [busy, setBusy] = useState<'open' | 'download' | null>(null)
  const fetchFile = async (inline: boolean) => {
    if (!doc?.id) return
    setBusy(inline ? 'open' : 'download')
    try {
      await downloadFile(`/documents/${encodeURIComponent(doc.id)}/content`, doc.name, inline)
    } catch (e) {
      toast.error('File not available', e instanceof ApiError ? e.message : 'The file could not be retrieved.')
    } finally {
      setBusy(null)
    }
  }
  return (
    <Dialog
      open={!!doc}
      onClose={onClose}
      title={doc?.name ?? ''}
      description={doc ? `${doc.type} · ${fileSize(doc.sizeKb)}` : undefined}
      size="sm"
      footer={
        <>
          <Button variant="secondary" disabled={!doc?.id} loading={busy === 'open'} icon={<ExternalLink className="size-4" />} onClick={() => void fetchFile(true)}>Open</Button>
          <Button variant="secondary" disabled={!doc?.id} loading={busy === 'download'} icon={<Download className="size-4" />} onClick={() => void fetchFile(false)}>Download</Button>
          <Button onClick={onClose}>Close</Button>
        </>
      }
    >
      <div className="flex items-center gap-3 rounded-lg border border-line bg-canvas p-4">
        <FileText className="size-8 shrink-0 text-primary" />
        <div className="min-w-0 text-[13px]">
          <p className="truncate font-semibold">{doc?.name}</p>
          <p className="text-muted">{doc?.type} · {doc ? fileSize(doc.sizeKb) : ''}</p>
          {!doc?.id && <p className="mt-1 text-xs text-muted">This item has no stored file.</p>}
        </div>
      </div>
    </Dialog>
  )
}

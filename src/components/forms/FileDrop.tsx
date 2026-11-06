import { useId, useRef, useState } from 'react'
import { FileText, UploadCloud, X } from 'lucide-react'
import { cn } from '@/utils/cn'
import { fileSize } from '@/utils/format'

export interface LocalFile {
  name: string
  sizeKb: number
  /** The picked file; uploaded to the server's document storage when the form is submitted. */
  file?: File
}

/** File picker. The selected files are uploaded when the surrounding form is submitted (the server validates type and size). */
export function FileDrop({
  files,
  onChange,
  accept = '.pdf,.jpg,.jpeg,.png',
  multiple = true,
  label = 'Drop files here or browse',
  hint = 'PDF, JPG or PNG up to 10 MB.',
  error,
}: {
  files: LocalFile[]
  onChange: (files: LocalFile[]) => void
  accept?: string
  multiple?: boolean
  label?: string
  hint?: string
  error?: string
}) {
  const input = useRef<HTMLInputElement>(null)
  const id = useId()
  const [drag, setDrag] = useState(false)

  const add = (list: FileList | null) => {
    if (!list) return
    const picked = Array.from(list).map((f) => ({ name: f.name, sizeKb: Math.max(1, Math.round(f.size / 1024)), file: f }))
    onChange(multiple ? [...files, ...picked] : picked.slice(0, 1))
  }

  return (
    <div>
      <label
        htmlFor={id}
        onDragOver={(e) => {
          e.preventDefault()
          setDrag(true)
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDrag(false)
          add(e.dataTransfer.files)
        }}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-7 text-center transition-colors',
          drag ? 'border-primary bg-primary-50' : error ? 'border-danger/60 bg-danger-50/40' : 'border-line-strong bg-canvas hover:border-primary/60 hover:bg-primary-50/40',
        )}
      >
        <span className="flex size-10 items-center justify-center rounded-full bg-surface text-primary shadow-sm ring-1 ring-line">
          <UploadCloud className="size-5" />
        </span>
        <span className="text-sm font-medium text-ink">{label}</span>
        <span className="text-xs text-muted">{hint}</span>
        <input ref={input} id={id} type="file" className="sr-only" accept={accept} multiple={multiple} onChange={(e) => {
          add(e.target.files)
          e.target.value = ''
        }} />
      </label>
      {error && <p role="alert" className="mt-1.5 text-xs font-medium text-danger-700">{error}</p>}
      {files.length > 0 && (
        <ul className="mt-3 space-y-2">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2">
              <FileText className="size-4 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{f.name}</span>
              <span className="text-xs text-muted">{fileSize(f.sizeKb)}</span>
              <button type="button" aria-label={`Remove ${f.name}`} onClick={() => onChange(files.filter((_, j) => j !== i))} className="rounded p-1 text-muted hover:bg-canvas hover:text-danger">
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

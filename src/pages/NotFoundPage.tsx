import { Compass } from 'lucide-react'
import { ButtonLink } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/misc'

export default function NotFoundPage() {
  return (
    <div className="card">
      <EmptyState icon={<Compass className="size-5" />} title="Page not found" description="The page you’re looking for doesn’t exist." action={<ButtonLink to="/app">Back to overview</ButtonLink>} />
    </div>
  )
}

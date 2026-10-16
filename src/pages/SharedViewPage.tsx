import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { atlasApi } from '@/lib/backend'
import { useOpenView } from '@/pages/AtlasPage'
import { useDocumentMeta } from '@/hooks/useMisc'
import { Card, ErrorText, PageShell } from '@/components/layout/PageShell'

/** /views/:slug – loads a shared view, applies it to the explorer and opens the globe. */
export default function SharedViewPage() {
  useDocumentMeta({ title: 'Shared view · World Explorer', description: 'A globe view shared by a World Explorer user.' })
  const { slug } = useParams()
  const navigate = useNavigate()
  const openView = useOpenView()
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    if (!slug) return
    atlasApi
      .view(slug)
      .then((v) => {
        openView(v)
        navigate('/', { replace: true })
      })
      .catch(setError)
  }, [slug, navigate, openView])

  return (
    <PageShell title="Opening view…" eyebrow="Shared globe view">
      <Card>
        {error ? <ErrorText error={error} /> : <div className="skeleton h-6 w-48" />}
      </Card>
    </PageShell>
  )
}

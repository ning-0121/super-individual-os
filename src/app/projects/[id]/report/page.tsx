'use client'
import { use, useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Thin redirect to the existing global report page
// (which already takes projectId and renders the full report)
export default function ProjectReportRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  useEffect(() => { router.replace(`/reports/${id}`) }, [id, router])
  return null
}

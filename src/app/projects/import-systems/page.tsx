'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// V3.6 — the dedicated import page is merged into /projects/new (导入 mode).
export default function ImportSystemsRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/projects/new?mode=import') }, [router])
  return null
}

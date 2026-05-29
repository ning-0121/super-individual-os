import { logger } from '@/lib/observability'
import type { DailyDigest } from './digest'

// ─────────────────────────────────────────────────
// V3.3 — Webhook delivery
// Posts to a generic incoming webhook. The `{ text }` body shape is what
// Slack, Discord (with ?wait), Mattermost, and most "incoming webhook" bots
// accept, so one env var works across channels. Telegram users can point this
// at a small relay. Best-effort: never throws.
// ─────────────────────────────────────────────────

export interface DeliveryResult {
  ok: boolean
  status?: number
  error?: string
  skipped?: boolean
}

export async function deliverDigestWebhook(
  url: string | undefined, digest: DailyDigest,
): Promise<DeliveryResult> {
  if (!url || !/^https?:\/\//i.test(url)) {
    return { ok: false, skipped: true, error: 'no DIGEST_WEBHOOK_URL configured' }
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // `text` for Slack/Discord/Mattermost; `content` is Discord's field, so
      // we send both — receivers ignore unknown keys.
      body: JSON.stringify({
        text: digest.markdown,
        content: digest.markdown,
        severity: digest.severity,
        title: digest.title,
      }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      logger.warn('digest.webhook_fail', { status: String(res.status), body: body.slice(0, 200) })
      return { ok: false, status: res.status, error: body.slice(0, 200) }
    }
    return { ok: true, status: res.status }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    logger.warn('digest.webhook_error', { error })
    return { ok: false, error }
  }
}

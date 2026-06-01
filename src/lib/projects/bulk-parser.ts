// ─────────────────────────────────────────────────
// V3.4 — Project-list bulk parser (pure)
// Turns a free-form blurb like
//   "我目前已经用 Claude 做了几个项目，1、节拍器，2、财务系统，
//    3、客户开发系统（两个版本）4、生产系统 5、报价员"
// into a clean list of project names ready to materialize.
//
// Heuristic, not perfect — the UI shows the parsed preview so the user can
// edit before submit. Pure: no DB, no time-now, fully unit-testable.
// ─────────────────────────────────────────────────

export interface ParseResult {
  items: string[]                 // cleaned project names, in order, deduped
  dropped: string[]               // raw chunks we threw away (preamble, empties)
}

const MAX_ITEMS = 20
const MAX_NAME_LEN = 80

// Numbered markers we use as primary segment boundaries.
// Examples matched: "1、" "2." "3)" "4：" "(5)" "①" "②" ... "⑩"
// Order matters: keep the marker-with-symbol patterns BEFORE the bare-number
// fallback so we don't accidentally split "Q4 2024" into "4 2024".
const NUMBERED_MARKER = /(?:^|[\s,，;；])(?:[(（]?\d{1,2}[)）][\s、.．。：:,，]?|\d{1,2}[、.．。)）：:,，][\s]?|[①-⑳])/g

// Lines that are clearly preamble, not a project name.
const PREAMBLE_HINTS = [
  '我目前', '我已经', '我有', '已经做了', '做了几个', '做了 ', '我做了',
  '正在用', '用 claude', '用 chatgpt', '帮我管理', '导入', '搬进来',
  'i have', 'i made', 'i built', 'here are', 'the projects', 'my projects',
]

function stripBulletPrefix(s: string): string {
  return s
    .replace(/^[\s•·●◦‣▪︎▫︎\-—–*]+/, '')
    .replace(/^[(（]?\d{1,2}[)）][\s、.．。：:,，]?/, '')
    .replace(/^\d{1,2}[、.．。)）：:,，]\s?/, '')
    .replace(/^[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]\s?/, '')
    .trim()
}

function looksLikePreamble(s: string): boolean {
  const lower = s.toLowerCase()
  if (lower.length > 40) return false                  // long sentences usually aren't preamble
  return PREAMBLE_HINTS.some(p => lower.includes(p))
}

function cleanName(raw: string): string {
  let s = raw.trim()
  // Drop a trailing sentence terminator that snuck in.
  s = s.replace(/[。；;.,，、\s]+$/, '').trim()
  // Squash internal whitespace.
  s = s.replace(/\s{2,}/g, ' ')
  // Cap length.
  if (s.length > MAX_NAME_LEN) s = s.slice(0, MAX_NAME_LEN).trim()
  return s
}

export function parseProjectList(input: string): ParseResult {
  const text = (input ?? '').trim()
  if (!text) return { items: [], dropped: [] }

  // Strategy: split on numbered markers; if that yields ≥2 segments, use them.
  // Otherwise fall back to newlines, then to comma/分号 splits.
  let segments: string[] = []
  const numberedHits = text.match(NUMBERED_MARKER)

  if (numberedHits && numberedHits.length >= 2) {
    segments = text.split(NUMBERED_MARKER)
  } else if (/[\r\n]/.test(text)) {
    segments = text.split(/[\r\n]+/)
  } else {
    segments = text.split(/[,，;；]+/)
  }

  const seen = new Set<string>()
  const items: string[] = []
  const dropped: string[] = []

  for (const seg of segments) {
    const stripped = stripBulletPrefix(seg)
    const cleaned  = cleanName(stripped)
    if (!cleaned) { if (seg.trim()) dropped.push(seg.trim()); continue }
    if (looksLikePreamble(cleaned)) { dropped.push(cleaned); continue }

    // Dedup case-insensitively, but keep the first form's casing.
    const key = cleaned.toLowerCase()
    if (seen.has(key)) { dropped.push(cleaned); continue }
    seen.add(key)
    items.push(cleaned)
    if (items.length >= MAX_ITEMS) break
  }

  return { items, dropped }
}

// Convenience for the API: just the cleaned list.
export function extractProjectNames(input: string): string[] {
  return parseProjectList(input).items
}

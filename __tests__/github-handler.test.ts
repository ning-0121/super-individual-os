import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { githubTool } from '@/lib/tools/github'

const originalFetch = global.fetch

interface MockCall { url: string; method: string; body: unknown }

describe('github handler', () => {
  let calls: MockCall[] = []

  beforeEach(() => {
    calls = []
    global.fetch = vi.fn(async (input: unknown, init: unknown = {}) => {
      const url = String(input)
      const i = init as { method?: string; body?: string }
      const body = i.body ? JSON.parse(i.body) : null
      const method = i.method ?? 'GET'
      calls.push({ url, method, body })

      const ok = (data: unknown, status = 200) => ({
        ok: true, status, json: async () => data, text: async () => '',
      } as unknown as Response)
      const fail = (status: number, text: string) => ({
        ok: false, status, json: async () => ({}), text: async () => text,
      } as unknown as Response)

      if (url.includes('/git/refs/heads/main')) return ok({ object: { sha: 'base_sha_123' } })
      if (url.endsWith('/git/refs') && method === 'POST') return ok({}, 201)
      if (url.includes('/contents/') && method === 'PUT') return ok({ content: { sha: 'file_sha' } }, 201)
      if (url.includes('/contents/') && method === 'GET') return fail(404, 'not found')
      if (url.endsWith('/pulls') && method === 'POST') {
        return ok({ html_url: 'https://github.com/u/r/pull/99', number: 99, state: 'open' }, 201)
      }
      if (url.endsWith('/user') && method === 'GET') return ok({ login: 'testuser' })
      return fail(404, `unhandled ${method} ${url}`)
    }) as unknown as typeof fetch
  })

  afterEach(() => { global.fetch = originalFetch })

  it('createPullRequest hits endpoints in order: getRef → createBranch → putContents → openPR', async () => {
    const result = await githubTool.execute('createPullRequest', {
      repo: 'u/r', branch: 'feat/x', title: 'Add X', body: 'desc',
      files: [{ path: 'src/a.ts', content: 'console.log()' }],
    }, { access_token: 'tok' }) as { pr_url: string; pr_number: number; files_written: string[] }

    expect(result.pr_url).toBe('https://github.com/u/r/pull/99')
    expect(result.pr_number).toBe(99)
    expect(result.files_written).toEqual(['src/a.ts'])

    expect(calls[0].url).toContain('/git/refs/heads/main')
    expect(calls[0].method).toBe('GET')
    expect(calls[1].url).toContain('/git/refs')
    expect(calls[1].method).toBe('POST')
    expect((calls[1].body as { ref: string }).ref).toBe('refs/heads/feat/x')
    expect(calls[1].body).toMatchObject({ sha: 'base_sha_123' })
    const putCall = calls.find(c => c.url.includes('/contents/') && c.method === 'PUT')
    expect(putCall).toBeDefined()
    expect(calls[calls.length - 1].url).toContain('/pulls')
    expect(calls[calls.length - 1].method).toBe('POST')
  })

  it('createPullRequest sends base64-encoded file content', async () => {
    await githubTool.execute('createPullRequest', {
      repo: 'u/r', branch: 'feat/x', title: 'Add X', body: 'desc',
      files: [{ path: 'a.txt', content: 'hello world' }],
    }, { access_token: 'tok' })

    const putCall = calls.find(c => c.url.includes('/contents/') && c.method === 'PUT')!
    const sentContent = (putCall.body as { content: string }).content
    expect(Buffer.from(sentContent, 'base64').toString('utf-8')).toBe('hello world')
  })

  it('rejects when access_token missing', async () => {
    await expect(githubTool.execute('createPullRequest', {
      repo: 'u/r', branch: 'b', title: 't', body: 'b', files: [{ path: 'a', content: 'b' }],
    }, {})).rejects.toThrow(/access_token/)
  })

  it('rejects malformed repo', async () => {
    await expect(githubTool.execute('createPullRequest', {
      repo: 'invalid', branch: 'b', title: 't', body: 'b', files: [{ path: 'a', content: 'b' }],
    }, { access_token: 'tok' })).rejects.toThrow(/repo/)
  })

  it('validateConfig succeeds with valid token', async () => {
    const result = await githubTool.validateConfig!({ access_token: 'tok' })
    expect(result.ok).toBe(true)
    expect(result.message).toContain('testuser')
  })

  it('validateConfig fails without token', async () => {
    const result = await githubTool.validateConfig!({})
    expect(result.ok).toBe(false)
  })
})

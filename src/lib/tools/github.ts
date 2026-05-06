import type { ToolHandler } from './types'

// ─────────────────────────────────────────────────
// GitHub REST API thin wrapper
// ─────────────────────────────────────────────────
const GH_BASE = 'https://api.github.com'

interface GitHubConfig {
  access_token: string
  default_repo?: string
  default_branch?: string
}

async function gh<T = unknown>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${GH_BASE}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'super-individual-os',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`GitHub ${method} ${path} → ${res.status}: ${err.slice(0, 300)}`)
  }
  if (res.status === 204) return null as T
  return res.json() as Promise<T>
}

// Encode path segments while preserving slashes
function encodeContentPath(p: string): string {
  return p.split('/').map(encodeURIComponent).join('/')
}

// ─────────────────────────────────────────────────
// Action: createPullRequest
// ─────────────────────────────────────────────────
interface CreatePRParams {
  repo?: string                                  // owner/name; falls back to default_repo
  branch: string                                 // new branch name
  base?: string                                  // base branch, default: main
  title: string
  body: string
  files: Array<{ path: string; content: string; message?: string }>
}

async function createPullRequest(p: CreatePRParams, cfg: GitHubConfig) {
  const repoFull = p.repo || cfg.default_repo
  if (!repoFull) throw new Error('未指定 repo（owner/name），且未配置默认仓库')
  const [owner, repo] = repoFull.split('/')
  if (!owner || !repo) throw new Error(`repo 格式错误：${repoFull}（应为 owner/name）`)
  if (!Array.isArray(p.files) || p.files.length === 0) throw new Error('files 至少要 1 个')
  if (!p.branch) throw new Error('branch 不能为空')
  if (!p.title) throw new Error('title 不能为空')

  const base = p.base || cfg.default_branch || 'main'

  // 1. Get base ref SHA
  const ref = await gh<{ object: { sha: string } }>(cfg.access_token, 'GET',
    `/repos/${owner}/${repo}/git/refs/heads/${base}`)
  const baseSha = ref.object.sha

  // 2. Create new branch (idempotent: ignore "Reference already exists")
  try {
    await gh(cfg.access_token, 'POST', `/repos/${owner}/${repo}/git/refs`, {
      ref: `refs/heads/${p.branch}`,
      sha: baseSha,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (!/already exists/i.test(msg)) throw e
  }

  // 3. Create / update each file via Contents API
  const written: string[] = []
  for (const f of p.files) {
    // Check if file exists on this branch (need its SHA to update)
    let existingSha: string | undefined
    try {
      const cur = await gh<{ sha: string }>(cfg.access_token, 'GET',
        `/repos/${owner}/${repo}/contents/${encodeContentPath(f.path)}?ref=${encodeURIComponent(p.branch)}`)
      existingSha = cur.sha
    } catch {
      // file doesn't exist yet — that's fine
    }

    const contentB64 = Buffer.from(f.content, 'utf-8').toString('base64')
    await gh(cfg.access_token, 'PUT', `/repos/${owner}/${repo}/contents/${encodeContentPath(f.path)}`, {
      message: f.message || `agent: update ${f.path}`,
      content: contentB64,
      branch: p.branch,
      ...(existingSha ? { sha: existingSha } : {}),
    })
    written.push(f.path)
  }

  // 4. Create PR (idempotent: if already exists, fetch it)
  try {
    const pr = await gh<{ html_url: string; number: number; state: string }>(cfg.access_token, 'POST',
      `/repos/${owner}/${repo}/pulls`, {
        title: p.title, body: p.body, head: p.branch, base,
      })
    return {
      pr_url: pr.html_url,
      pr_number: pr.number,
      pr_state: pr.state,
      branch: p.branch,
      base_branch: base,
      files_written: written,
      repo: `${owner}/${repo}`,
    }
  } catch (e) {
    // Fallback: try to find existing PR
    const msg = e instanceof Error ? e.message : String(e)
    if (/already exists|pull request already/i.test(msg)) {
      const list = await gh<Array<{ html_url: string; number: number; state: string; head: { ref: string } }>>(
        cfg.access_token, 'GET',
        `/repos/${owner}/${repo}/pulls?head=${owner}:${encodeURIComponent(p.branch)}&state=open`)
      const existing = list.find(x => x.head.ref === p.branch)
      if (existing) {
        return {
          pr_url: existing.html_url,
          pr_number: existing.number,
          pr_state: existing.state,
          branch: p.branch,
          base_branch: base,
          files_written: written,
          repo: `${owner}/${repo}`,
          note: 'PR already existed, files updated on the same branch',
        }
      }
    }
    throw e
  }
}

// ─────────────────────────────────────────────────
// Action: createIssue
// ─────────────────────────────────────────────────
interface CreateIssueParams {
  repo?: string
  title: string
  body: string
  labels?: string[]
}

async function createIssue(p: CreateIssueParams, cfg: GitHubConfig) {
  const repoFull = p.repo || cfg.default_repo
  if (!repoFull) throw new Error('未指定 repo')
  const [owner, repo] = repoFull.split('/')
  if (!p.title) throw new Error('title 不能为空')

  const issue = await gh<{ html_url: string; number: number }>(cfg.access_token, 'POST',
    `/repos/${owner}/${repo}/issues`, { title: p.title, body: p.body, labels: p.labels ?? [] })
  return { issue_url: issue.html_url, issue_number: issue.number, repo: `${owner}/${repo}` }
}

// ─────────────────────────────────────────────────
// Action: listRepos (for connection validation)
// ─────────────────────────────────────────────────
async function listRepos(cfg: GitHubConfig) {
  const repos = await gh<Array<{ full_name: string; private: boolean }>>(
    cfg.access_token, 'GET', '/user/repos?per_page=20&sort=updated')
  return { repos: repos.map(r => ({ full_name: r.full_name, private: r.private })) }
}

// ─────────────────────────────────────────────────
// V2.2 — Read-only / lower-risk actions
// ─────────────────────────────────────────────────

function parseRepo(p: { repo?: string }, cfg: GitHubConfig): [string, string] {
  const full = p.repo || cfg.default_repo
  if (!full) throw new Error('repo required (owner/name)')
  const [owner, repo] = full.split('/')
  if (!owner || !repo) throw new Error(`bad repo: ${full}`)
  return [owner, repo]
}

interface ReadFileParams { repo?: string; path: string; ref?: string }
async function readFile(p: ReadFileParams, cfg: GitHubConfig) {
  if (!p.path) throw new Error('path required')
  const [owner, repo] = parseRepo(p, cfg)
  const ref = p.ref ?? cfg.default_branch ?? 'main'
  const data = await gh<{ content?: string; encoding?: string; sha?: string; size?: number; path?: string }>(
    cfg.access_token, 'GET',
    `/repos/${owner}/${repo}/contents/${encodeContentPath(p.path)}?ref=${encodeURIComponent(ref)}`)
  const content = data.content && data.encoding === 'base64'
    ? Buffer.from(data.content, 'base64').toString('utf-8') : ''
  return { path: data.path ?? p.path, ref, sha: data.sha ?? null, size: data.size ?? content.length, content }
}

interface ListBranchesParams { repo?: string; per_page?: number }
async function listBranches(p: ListBranchesParams, cfg: GitHubConfig) {
  const [owner, repo] = parseRepo(p, cfg)
  const per = Math.min(Math.max(p.per_page ?? 30, 1), 100)
  const data = await gh<Array<{ name: string; protected: boolean; commit: { sha: string } }>>(
    cfg.access_token, 'GET', `/repos/${owner}/${repo}/branches?per_page=${per}`)
  return {
    repo: `${owner}/${repo}`,
    branches: data.map(b => ({ name: b.name, protected: b.protected, sha: b.commit.sha })),
  }
}

interface CreateBranchParams { repo?: string; branch: string; base?: string }
async function createBranch(p: CreateBranchParams, cfg: GitHubConfig) {
  if (!p.branch) throw new Error('branch required')
  const [owner, repo] = parseRepo(p, cfg)
  const base = p.base || cfg.default_branch || 'main'
  if (p.branch === 'main' || p.branch === 'master') throw new Error('cannot use main/master as a new branch')
  const ref = await gh<{ object: { sha: string } }>(cfg.access_token, 'GET',
    `/repos/${owner}/${repo}/git/refs/heads/${base}`)
  try {
    await gh(cfg.access_token, 'POST', `/repos/${owner}/${repo}/git/refs`, {
      ref: `refs/heads/${p.branch}`, sha: ref.object.sha,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (!/already exists/i.test(msg)) throw e
  }
  return { repo: `${owner}/${repo}`, branch: p.branch, base, base_sha: ref.object.sha }
}

interface CreateOrUpdateFileParams { repo?: string; branch: string; path: string; content: string; message?: string }
async function createOrUpdateFile(p: CreateOrUpdateFileParams, cfg: GitHubConfig) {
  if (!p.branch) throw new Error('branch required')
  if (p.branch === 'main' || p.branch === 'master')
    throw new Error('writing directly to main/master is forbidden — open a PR instead')
  if (!p.path) throw new Error('path required')
  const [owner, repo] = parseRepo(p, cfg)

  let existingSha: string | undefined
  try {
    const cur = await gh<{ sha: string }>(cfg.access_token, 'GET',
      `/repos/${owner}/${repo}/contents/${encodeContentPath(p.path)}?ref=${encodeURIComponent(p.branch)}`)
    existingSha = cur.sha
  } catch { /* missing → create */ }

  const contentB64 = Buffer.from(p.content, 'utf-8').toString('base64')
  const out = await gh<{ content: { sha: string; html_url: string }; commit: { sha: string } }>(
    cfg.access_token, 'PUT', `/repos/${owner}/${repo}/contents/${encodeContentPath(p.path)}`, {
      message: p.message || `agent: update ${p.path}`,
      content: contentB64,
      branch: p.branch,
      ...(existingSha ? { sha: existingSha } : {}),
    })
  return {
    repo: `${owner}/${repo}`, branch: p.branch, path: p.path,
    sha: out.content.sha, html_url: out.content.html_url, commit_sha: out.commit.sha,
  }
}

interface CommentOnPRParams { repo?: string; pr_number: number; body: string }
async function commentOnPullRequest(p: CommentOnPRParams, cfg: GitHubConfig) {
  if (!p.pr_number) throw new Error('pr_number required')
  if (!p.body) throw new Error('body required')
  const [owner, repo] = parseRepo(p, cfg)
  const c = await gh<{ id: number; html_url: string }>(cfg.access_token, 'POST',
    `/repos/${owner}/${repo}/issues/${p.pr_number}/comments`, { body: p.body })
  return { id: c.id, url: c.html_url, repo: `${owner}/${repo}` }
}

interface GetPRDiffParams { repo?: string; pr_number: number }
async function getPullRequestDiff(p: GetPRDiffParams, cfg: GitHubConfig) {
  if (!p.pr_number) throw new Error('pr_number required')
  const [owner, repo] = parseRepo(p, cfg)
  const files = await gh<Array<{ filename: string; status: string; additions: number; deletions: number; changes: number; patch?: string }>>(
    cfg.access_token, 'GET', `/repos/${owner}/${repo}/pulls/${p.pr_number}/files?per_page=100`)
  return {
    repo: `${owner}/${repo}`, pr_number: p.pr_number,
    files: files.map(f => ({
      filename: f.filename, status: f.status,
      additions: f.additions, deletions: f.deletions, changes: f.changes,
      patch: (f.patch ?? '').slice(0, 4000),
    })),
  }
}

// ─────────────────────────────────────────────────
// Handler export
// ─────────────────────────────────────────────────
export const githubTool: ToolHandler = {
  describe() {
    return {
      actions: [
        {
          name: 'createPullRequest',
          description: '创建新分支 → 提交文件 → 开启 PR。返回 PR URL。',
          params: ['repo (owner/name, 可选)', 'branch (新分支名)', 'base (基础分支, 默认 main)', 'title', 'body', 'files: [{path, content, message?}]'],
          example: {
            repo: 'username/test-repo',
            branch: 'agent/feature-x',
            base: 'main',
            title: 'feat: add feature X',
            body: '## What\nAdd feature X.\n\n## Why\n…',
            files: [{ path: 'docs/notes.md', content: '# Notes\n\nGenerated by Agent.' }],
          },
        },
        {
          name: 'createIssue',
          description: '创建一个 GitHub Issue。返回 issue URL。',
          params: ['repo (可选)', 'title', 'body', 'labels (可选)'],
        },
        {
          name: 'listRepos',
          description: '列出 token 可访问的最近 20 个仓库（用于验证连接）。',
          params: [],
        },
      ],
    }
  },

  async execute(action, params, config) {
    const cfg = config as unknown as GitHubConfig
    if (!cfg?.access_token) throw new Error('GitHub 工具未配置 access_token')

    switch (action) {
      case 'createPullRequest':       return createPullRequest(params as unknown as CreatePRParams, cfg)
      case 'createIssue':             return createIssue(params as unknown as CreateIssueParams, cfg)
      case 'listRepos':               return listRepos(cfg)
      // V2.2 additions
      case 'readFile':                return readFile(params as unknown as ReadFileParams, cfg)
      case 'listBranches':            return listBranches(params as unknown as ListBranchesParams, cfg)
      case 'createBranch':            return createBranch(params as unknown as CreateBranchParams, cfg)
      case 'createOrUpdateFile':      return createOrUpdateFile(params as unknown as CreateOrUpdateFileParams, cfg)
      case 'commentOnPullRequest':    return commentOnPullRequest(params as unknown as CommentOnPRParams, cfg)
      case 'getPullRequestDiff':      return getPullRequestDiff(params as unknown as GetPRDiffParams, cfg)
      case 'mergePullRequest':
        throw new Error('mergePullRequest is L4 — must be approved by CEO and executed manually for safety')
      default: throw new Error(`Unknown action: ${action}`)
    }
  },

  async validateConfig(config) {
    try {
      const cfg = config as unknown as GitHubConfig
      if (!cfg?.access_token) return { ok: false, message: '缺少 access_token' }
      // Hit /user to validate token
      const user = await gh<{ login: string }>(cfg.access_token, 'GET', '/user')
      return { ok: true, message: `✓ 已认证为 ${user.login}` }
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : '验证失败' }
    }
  },
}

import type { ToolHandler } from './types'

interface VercelConfig {
  access_token: string
  team_id?: string
  project_id?: string
}

const VC_BASE = 'https://api.vercel.com'

async function vc<T>(cfg: VercelConfig, path: string): Promise<T> {
  const sep = path.includes('?') ? '&' : '?'
  const url = VC_BASE + path + (cfg.team_id ? `${sep}teamId=${encodeURIComponent(cfg.team_id)}` : '')
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${cfg.access_token}`,
      'Content-Type': 'application/json',
    },
  })
  if (!res.ok) {
    // P1-3 — status only, never the upstream body.
    throw new Error(`Vercel ${path} → ${res.status} (request failed)`)
  }
  return res.json() as Promise<T>
}

async function vcPost<T>(cfg: VercelConfig, path: string, body: unknown): Promise<T> {
  const sep = path.includes('?') ? '&' : '?'
  const url = VC_BASE + path + (cfg.team_id ? `${sep}teamId=${encodeURIComponent(cfg.team_id)}` : '')
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${cfg.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    // P1-3 — status only, never the upstream body.
    throw new Error(`Vercel POST ${path} → ${res.status} (request failed)`)
  }
  return res.json() as Promise<T>
}

async function listProjects(p: { limit?: number }, cfg: VercelConfig) {
  const limit = Math.min(Math.max(p?.limit ?? 20, 1), 100)
  const data = await vc<{ projects: Array<{ id: string; name: string; framework?: string; createdAt?: number }> }>(
    cfg, `/v9/projects?limit=${limit}`)
  return {
    projects: data.projects.map(p => ({
      id: p.id, name: p.name, framework: p.framework ?? null,
      created_at: p.createdAt ? new Date(p.createdAt).toISOString() : null,
    })),
  }
}

async function triggerPreviewDeploy(p: { project: string; git_branch: string; git_repo?: string }, cfg: VercelConfig) {
  if (!p.project) throw new Error('project (id or name) required')
  if (!p.git_branch) throw new Error('git_branch required')
  if (p.git_branch === 'main' || p.git_branch === 'master')
    throw new Error('main/master maps to production — preview deploy must use a feature branch')

  const body = {
    name: p.project,
    target: 'preview',
    gitSource: p.git_repo
      ? { type: 'github', repo: p.git_repo, ref: p.git_branch }
      : { ref: p.git_branch },
  }
  const out = await vcPost<{ id?: string; url?: string; readyState?: string }>(
    cfg, '/v13/deployments', body)
  return {
    deployment_id: out.id ?? null,
    url: out.url ? `https://${out.url}` : null,
    state: out.readyState ?? 'queued',
    target: 'preview',
  }
}

async function getProject(p: { project?: string }, cfg: VercelConfig) {
  const id = p?.project || cfg.project_id
  if (!id) throw new Error('未指定 project（id 或 name），且未配置默认 project_id')
  const proj = await vc<{ id: string; name: string; framework: string; latestDeployments?: unknown[] }>(
    cfg, `/v9/projects/${encodeURIComponent(id)}`)
  return {
    id: proj.id,
    name: proj.name,
    framework: proj.framework ?? null,
    has_latest: Array.isArray(proj.latestDeployments) && proj.latestDeployments.length > 0,
  }
}

async function listDeployments(p: { project?: string; limit?: number }, cfg: VercelConfig) {
  const id = p?.project || cfg.project_id
  if (!id) throw new Error('未指定 project')
  const limit = Math.min(Math.max(p?.limit ?? 10, 1), 50)
  const data = await vc<{ deployments: Array<{ uid: string; url: string; state: string; readyState?: string; createdAt: number; meta?: { branchAlias?: string; commitMessage?: string } }> }>(
    cfg, `/v6/deployments?projectId=${encodeURIComponent(id)}&limit=${limit}`)
  return {
    project: id,
    deployments: data.deployments.map(d => ({
      id: d.uid,
      url: d.url ? `https://${d.url}` : '',
      state: d.readyState ?? d.state,
      created_at: new Date(d.createdAt).toISOString(),
      branch: d.meta?.branchAlias ?? null,
      commit: d.meta?.commitMessage ?? null,
    })),
  }
}

async function getDeploymentStatus(p: { deployment_id: string }, cfg: VercelConfig) {
  if (!p?.deployment_id) throw new Error('需要 deployment_id (uid)')
  const d = await vc<{ uid: string; url: string; readyState: string; state: string; createdAt: number; readyAt?: number; errorMessage?: string }>(
    cfg, `/v13/deployments/${encodeURIComponent(p.deployment_id)}`)
  return {
    id: d.uid,
    url: d.url ? `https://${d.url}` : '',
    state: d.readyState ?? d.state,
    created_at: new Date(d.createdAt).toISOString(),
    ready_at: d.readyAt ? new Date(d.readyAt).toISOString() : null,
    error_message: d.errorMessage ?? null,
  }
}

export const vercelTool: ToolHandler = {
  describe() {
    return {
      actions: [
        {
          name: 'getProject',
          description: '查询 Vercel 项目信息（框架、ID、最近部署是否存在）',
          params: ['project (id 或 name, 可选 — 未填用默认值)'],
        },
        {
          name: 'listDeployments',
          description: '列出最近 N 个部署记录（含 state、URL、分支、commit message）',
          params: ['project (可选)', 'limit (默认 10, 最大 50)'],
        },
        {
          name: 'getDeploymentStatus',
          description: '查询单个部署的最新状态（READY / BUILDING / ERROR / CANCELED 等）',
          params: ['deployment_id (uid, 形如 dpl_xxx)'],
        },
      ],
    }
  },

  async execute(action, params, config) {
    const cfg = config as unknown as VercelConfig
    if (!cfg?.access_token) throw new Error('Vercel 工具未配置 access_token')
    switch (action) {
      case 'getProject':          return getProject(params as { project?: string }, cfg)
      case 'listProjects':        return listProjects(params as { limit?: number }, cfg)
      case 'listDeployments':     return listDeployments(params as { project?: string; limit?: number }, cfg)
      case 'getDeploymentStatus': return getDeploymentStatus(params as { deployment_id: string }, cfg)
      case 'triggerPreviewDeploy':
        return triggerPreviewDeploy(params as { project: string; git_branch: string; git_repo?: string }, cfg)
      case 'triggerProductionDeploy':
        throw new Error('triggerProductionDeploy is L4 — CEO approval required; not auto-executable')
      case 'updateEnv':
        throw new Error('updateEnv is L4 — CEO approval required; not auto-executable')
      default: throw new Error(`Unknown action: ${action}`)
    }
  },

  async validateConfig(config) {
    const cfg = config as unknown as VercelConfig
    if (!cfg?.access_token) return { ok: false, message: '缺少 access_token' }
    try {
      const data = await vc<{ user: { email: string; username: string } }>(cfg, '/v2/user')
      return { ok: true, message: `✓ 已认证为 ${data.user.username}` }
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : '验证失败' }
    }
  },
}

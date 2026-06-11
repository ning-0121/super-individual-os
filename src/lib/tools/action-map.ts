// ─────────────────────────────────────────────────
// V3.8 — Handler-action → canonical-capability resolver (pure)
// The model emits tool calls using HANDLER action names (e.g. 'createPullRequest'),
// but risk classification (classifyToolRisk/findCapability) keys off the
// CANONICAL capability_action (e.g. 'github.pr.create'). This maps between them.
//
// FAIL-SAFE: any handler action NOT in this map resolves to a synthetic
// `${tool}.${action}` that findCapability() will miss → classifyToolRisk
// defaults it to risk 4 (CEO approval, NOT executed). So an unknown/new tool
// action can never slip through the gate unclassified.
// ─────────────────────────────────────────────────

const HANDLER_TO_CAPABILITY: Record<string, string> = {
  // GitHub
  'github:listRepos':            'github.repo.list',
  'github:readFile':             'github.file.read',
  'github:listBranches':         'github.branch.list',
  'github:getPullRequestDiff':   'github.pr.diff',
  'github:createBranch':         'github.branch.create',
  'github:createIssue':          'github.issue.create',
  'github:commentOnPullRequest': 'github.pr.comment',
  'github:createOrUpdateFile':   'github.file.write',
  'github:createPullRequest':    'github.pr.create',
  'github:mergePullRequest':     'github.pr.merge',
  // createRepo has no read-only capability → intentionally unmapped → risk 4

  // Vercel
  'vercel:getProject':               'vercel.project.list',
  'vercel:listProjects':             'vercel.project.list',
  'vercel:listDeployments':          'vercel.deployment.list',
  'vercel:getDeploymentStatus':      'vercel.deployment.status',
  'vercel:triggerPreviewDeploy':     'vercel.deploy.preview',
  'vercel:triggerProductionDeploy':  'vercel.deploy.production',
  'vercel:updateEnv':                'vercel.env.update',

  // Supabase
  'supabase:listTables':         'supabase.schema.read',
  'supabase:validateSql':        'supabase.sql.validate',
  'supabase:createMigrationFile':'supabase.migration.create',
}

// Returns the canonical capability_action for a (tool, handlerAction) pair.
// Unknown pairs return a synthetic id that findCapability will miss — by
// design, so they fail closed into the risk-4 approval path.
export function resolveCapabilityAction(tool: string, handlerAction: string): string {
  const key = `${tool}:${handlerAction}`
  return HANDLER_TO_CAPABILITY[key] ?? `${tool}.${handlerAction}`
}

// True when the pair maps to a known capability (i.e. it WILL classify cleanly).
export function isMappedAction(tool: string, handlerAction: string): boolean {
  return `${tool}:${handlerAction}` in HANDLER_TO_CAPABILITY
}

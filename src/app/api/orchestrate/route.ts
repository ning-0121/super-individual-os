import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { buildOrchestratorPrompt, parseOrchestratorOutput } from '@/lib/ai/orchestrator'
import { assertBudgetAllowed } from '@/services/cost-budget'
import { audit } from '@/lib/audit'
import type { ExecutionUnit } from '@/types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  // P1-1 — cost hard cap before spending tokens.
  const budget = await assertBudgetAllowed(supabase, user.id)
  if (budget.blocked) {
    await audit(supabase, user.id, 'tool_call.executed', {
      resource_type: 'orchestrate',
      metadata: { rejected: 'budget_exceeded', reason: budget.reason, month_usd: budget.status.month_usd },
    })
    return Response.json({ error: budget.reason ?? '成本已触顶', code: 'budget_exceeded' }, { status: 402 })
  }

  const { projectId, goal, context = '' } = await req.json() as {
    projectId: string
    goal: string
    context?: string
  }

  // Fetch available agents
  const { data: agentRows } = await supabase
    .from('execution_units')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_active', true)

  const agents = (agentRows ?? []) as ExecutionUnit[]

  // Build orchestrator prompt
  const systemPrompt = buildOrchestratorPrompt(agents)
  const userMessage  = `Project Goal: ${goal}\n\nAdditional Context: ${context || 'None provided.'}`

  // Call Claude
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  })

  const rawText = message.content.find(b => b.type === 'text')?.text ?? ''
  const plan    = parseOrchestratorOutput(rawText)

  if (!plan) {
    return Response.json({ error: 'Failed to parse execution plan', raw: rawText }, { status: 422 })
  }

  // Persist tasks to DB — first pass with placeholder depends_on (still order numbers)
  const createdTasks: Array<{ id: string; order: number; depends_on_orders: number[] }> = []
  for (const t of plan.tasks) {
    const matchingAgent = agents.find(a => a.agent_type === t.requested_agent_type && a.type !== 'human')

    const { data: task } = await supabase.from('tasks').insert({
      user_id: user.id,
      project_id: projectId,
      title: t.title,
      description: t.description,
      task_type: t.task_type,
      requested_agent_type: t.requested_agent_type,
      status: 'todo',
      workflow_status: 'planned',
      priority: t.priority,
      execution_unit_id: matchingAgent?.id ?? null,
      assigned_unit_id: matchingAgent?.id ?? null,
      expected_output: t.expected_output,
      acceptance_criteria: t.acceptance_criteria,
      context_payload: { order: t.order, depends_on: t.depends_on },  // depends_on is still order numbers here
    }).select().single()

    if (task) createdTasks.push({ id: task.id, order: t.order, depends_on_orders: t.depends_on })
  }

  // Second pass: rewrite depends_on from order numbers → task UUIDs (V1.4 dependency gate)
  const orderToId = new Map<number, string>()
  for (const ct of createdTasks) orderToId.set(ct.order, ct.id)

  for (const ct of createdTasks) {
    if (ct.depends_on_orders.length === 0) continue
    const depIds = ct.depends_on_orders
      .map(o => orderToId.get(o))
      .filter((x): x is string => typeof x === 'string')
    if (depIds.length > 0) {
      await supabase.from('tasks')
        .update({ context_payload: { order: ct.order, depends_on: depIds } })
        .eq('id', ct.id)
    }
  }

  // Mark project as having a plan
  await supabase.from('projects')
    .update({ plan_generated: true, goal_statement: goal })
    .eq('id', projectId)

  return Response.json({ plan, tasks: createdTasks })
}

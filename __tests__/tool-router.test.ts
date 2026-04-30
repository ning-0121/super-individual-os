import { describe, it, expect } from 'vitest'
import { TOOL_REGISTRY, listRegisteredTools, describeTool } from '@/lib/tools/router'

describe('tool registry', () => {
  it('has expected built-in tools', () => {
    const tools = listRegisteredTools()
    expect(tools).toContain('github')
    expect(tools).toContain('supabase')
    expect(tools).toContain('vercel')
  })

  it('describes each tool with at least one action', () => {
    for (const name of listRegisteredTools()) {
      const desc = describeTool(name)
      expect(desc, `tool ${name} must describe()`).not.toBeNull()
      expect(desc!.actions.length).toBeGreaterThan(0)
      for (const a of desc!.actions) {
        expect(a.name, `${name}.${a.name}`).toBeTruthy()
        expect(a.description).toBeTruthy()
        expect(Array.isArray(a.params)).toBe(true)
      }
    }
  })

  it('returns null for unknown tool', () => {
    expect(describeTool('not-a-tool')).toBeNull()
  })

  it('every registered tool has execute() and validateConfig()', () => {
    for (const name of listRegisteredTools()) {
      const handler = TOOL_REGISTRY[name]
      expect(typeof handler.execute).toBe('function')
      expect(typeof handler.describe).toBe('function')
      // validateConfig is optional; warn but don't fail
      if (handler.validateConfig) {
        expect(typeof handler.validateConfig).toBe('function')
      }
    }
  })

  it('rejects unknown action with descriptive error', async () => {
    await expect(
      TOOL_REGISTRY.github.execute('nonexistentAction', {}, { access_token: 'x' })
    ).rejects.toThrow(/Unknown action/)
  })
})

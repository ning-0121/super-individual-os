# E2E 测试说明（V1.5 占位）

V1.5 阶段提供 e2e 测试**脚本与流程文档**。完整 Playwright 套件在 V1.6 完成。

## 安装

```bash
npm install -D @playwright/test
npx playwright install chromium
```

## 关键流程脚本

`e2e/sample.spec.ts` 覆盖核心闭环：登录 → 连接 GitHub → 生成计划 → 运行 Engineering Agent → 检查 PR 出现。

```ts
import { test, expect } from '@playwright/test'

test.describe('Multi-Agent OS — happy path', () => {
  test('connect github → run engineering agent → see PR artifact', async ({ page }) => {
    await page.goto('http://localhost:3000/auth/login')
    await page.fill('input[name="email"]', process.env.TEST_USER_EMAIL!)
    await page.fill('input[name="password"]', process.env.TEST_USER_PASSWORD!)
    await page.click('button[type="submit"]')
    await page.waitForURL('**/dashboard')

    // Connect GitHub (assumes prior connection cleared)
    await page.goto('/tools')
    await page.click('text=连接 GitHub')
    await page.fill('input[type="password"]', process.env.GITHUB_TEST_PAT!)
    await page.fill('input[placeholder*="repo-name"]', process.env.GITHUB_TEST_REPO!)
    await page.click('text=测试连接')
    await expect(page.locator('text=已认证为')).toBeVisible({ timeout: 10000 })
    await page.click('text=保存')

    // Generate plan
    await page.goto('/command-center')
    // ... select project, click 生成执行计划, wait for tasks
    // ... find Engineering task, click 运行 Agent
    // ... wait for redirect to /task-runs/[id]
    // ... assert tool_calls section contains 'pr_url'
  })
})
```

## 手动 e2e 验证清单（V1.5 推荐）

1. **加密验证**：
   - 连接 GitHub → 在 Supabase Table Editor 看 `tool_integrations.config.access_token`
   - 应该是 `enc:v1:xxx:yyy:zzz`，不是明文

2. **Run Lock**：同一任务双击「运行 Agent」 → 第二次应被 409 拦截

3. **Dependency Gate**：包含依赖的任务在前置完成前显示「等待 N 个前置」chip

4. **Retry**：故意配错 PAT 让 Engineering 失败 → 一键重试 → 看到 retry_count 递增

5. **新工具**：
   - Supabase tool: validateSql 输入 `DROP TABLE foo;` → 应返回 warnings 含 "DROP TABLE 不带"
   - Vercel tool: getProject → 返回 framework

6. **观测性**：服务端日志应包含 JSON 格式的 `run.start`、`run.ok`、`tool.exec.ok` 等事件

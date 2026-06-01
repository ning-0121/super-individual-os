// ─────────────────────────────────────────────────
// V3.6 — Local scaffold command generator (pure)
// The cloud app can't touch your disk, so "新建项目自动在电脑上建立" works by
// the OS handing you a single shell command to paste & run locally. This file
// turns a project + chosen stack into that command. Pure + testable.
// ─────────────────────────────────────────────────

export type StackId = 'nextjs-supabase' | 'node' | 'static' | 'empty'

export interface StackMeta {
  id: StackId
  label: string
  description: string
}

export const STACKS: StackMeta[] = [
  { id: 'nextjs-supabase', label: 'Next.js + Supabase', description: '与本 OS 同栈，直连 Vercel + Supabase' },
  { id: 'node',            label: 'Node + TypeScript',   description: '纯 Node 脚本/服务，tsx 起步' },
  { id: 'static',          label: '静态站点',             description: '一个 index.html + git' },
  { id: 'empty',           label: '空项目',               description: '只建目录 + README + git init' },
]

// Turn a (possibly Chinese) project name into a filesystem-safe dir name.
export function slugify(name: string): string {
  const s = (name ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')   // non-ascii (incl. Chinese) → hyphen
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
  return s || 'my-project'
}

export interface ScaffoldPlan {
  dir_name: string
  stack: StackId
  command: string        // single paste-and-run line
  steps: string[]        // human-readable breakdown
  next: string[]         // what to do after (connect GitHub/Vercel/Supabase)
}

function safeDir(raw: string): string {
  // Defence: never allow path traversal / absolute paths in the dir token.
  const cleaned = (raw ?? '').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^[-.]+/, '')
  return cleaned || 'my-project'
}

export function buildScaffoldCommand(opts: { dirName: string; stack: StackId }): ScaffoldPlan {
  const dir = safeDir(opts.dirName)
  const stack = opts.stack

  let command: string
  let steps: string[]

  switch (stack) {
    case 'nextjs-supabase':
      command =
        `npx create-next-app@latest ${dir} --ts --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-npm --yes && ` +
        `cd ${dir} && npm i @supabase/supabase-js @supabase/ssr && ` +
        `printf "NEXT_PUBLIC_SUPABASE_URL=\\nNEXT_PUBLIC_SUPABASE_ANON_KEY=\\n" > .env.local.example && ` +
        `git init -q && git add -A && git commit -qm "init ${dir} (Next.js + Supabase)"`
      steps = [
        `create-next-app 脚手架 (TypeScript + Tailwind + App Router)`,
        `安装 @supabase/supabase-js + @supabase/ssr`,
        `生成 .env.local.example`,
        `git init + 首次提交`,
      ]
      break
    case 'node':
      command =
        `mkdir -p ${dir} && cd ${dir} && npm init -y && npm i -D typescript tsx @types/node && ` +
        `npx tsc --init && mkdir -p src && printf "console.log('hello ${dir}')\\n" > src/index.ts && ` +
        `git init -q && git add -A && git commit -qm "init ${dir} (Node + TS)"`
      steps = [
        `npm init + 安装 typescript / tsx`,
        `tsc --init + src/index.ts`,
        `git init + 首次提交`,
      ]
      break
    case 'static':
      command =
        `mkdir -p ${dir} && cd ${dir} && ` +
        `printf "<!doctype html>\\n<title>${dir}</title>\\n<h1>${dir}</h1>\\n" > index.html && ` +
        `git init -q && git add -A && git commit -qm "init ${dir} (static)"`
      steps = [`建目录 + index.html`, `git init + 首次提交`]
      break
    case 'empty':
    default:
      command =
        `mkdir -p ${dir} && cd ${dir} && ` +
        `printf "# ${dir}\\n" > README.md && git init -q && git add -A && git commit -qm "init ${dir}"`
      steps = [`建目录 + README.md`, `git init + 首次提交`]
      break
  }

  const next = [
    `连接 GitHub：gh repo create ${dir} --private --source=. --push（或 git remote add origin <url> && git push -u origin main）`,
    `部署 Vercel：vercel link 然后 vercel --prod`,
    ...(stack === 'nextjs-supabase'
      ? [`配置 Supabase：把 URL/anon key 填进 .env.local`]
      : []),
  ]

  return { dir_name: dir, stack, command, steps, next }
}

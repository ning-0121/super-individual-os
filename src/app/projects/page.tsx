import Sidebar from '@/components/layout/Sidebar'
import Link from 'next/link'

const projects = [
  {
    name: '超级个体 OS',
    status: 'active',
    phase: 'Month 1',
    northStar: 'MRR',
    target: '¥10,000',
    current: '¥0',
    focus: '找到 10 个愿意付钱的人',
    continueIf: '有 10 人表达付费意愿',
    stopIf: '0 人愿意付费',
  },
  {
    name: '外贸现金流业务',
    status: 'maintain',
    phase: '系统化',
    northStar: '月收入',
    target: '不下滑',
    current: '正常',
    focus: '系统化后交接日常运营',
    continueIf: '收入稳定',
    stopIf: '—',
  },
]

const statusLabel: Record<string, { label: string; style: string }> = {
  active: { label: '进行中', style: 'bg-blue-900/40 text-blue-300 border-blue-800' },
  maintain: { label: '维持', style: 'bg-green-900/40 text-green-300 border-green-800' },
  frozen: { label: '已冻结', style: 'bg-gray-800 text-gray-500 border-gray-700' },
}

export default function ProjectsPage() {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto p-8">
        <div className="max-w-3xl mx-auto">
          <div className="mb-6 flex items-center justify-between">
            <h1 className="text-2xl font-semibold text-white">项目</h1>
            <button className="text-sm px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white transition-colors">
              + 新建项目
            </button>
          </div>

          <div className="space-y-4">
            {projects.map(p => (
              <div key={p.name} className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-medium text-white">{p.name}</h2>
                    <p className="text-sm text-gray-500 mt-0.5">{p.phase}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded border ${statusLabel[p.status].style}`}>
                    {statusLabel[p.status].label}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="bg-gray-800/60 rounded-lg p-3">
                    <div className="text-xs text-gray-500 mb-1">北极星指标 · {p.northStar}</div>
                    <div className="text-sm font-mono">
                      <span className="text-white">{p.current}</span>
                      <span className="text-gray-600"> / {p.target}</span>
                    </div>
                  </div>
                  <div className="bg-gray-800/60 rounded-lg p-3">
                    <div className="text-xs text-gray-500 mb-1">本月唯一重点</div>
                    <div className="text-sm text-gray-200">{p.focus}</div>
                  </div>
                </div>

                <div className="text-xs text-gray-600 flex gap-4">
                  <span>✓ Continue: {p.continueIf}</span>
                  <span>✕ Stop: {p.stopIf}</span>
                </div>

                <div className="mt-4 flex gap-2">
                  <Link href="/chat" className="text-xs px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors">
                    AI 分析
                  </Link>
                  <button className="text-xs px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors">
                    编辑
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}

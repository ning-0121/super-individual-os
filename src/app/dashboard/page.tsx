import Sidebar from '@/components/layout/Sidebar'

export default function DashboardPage() {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto p-8">
        <div className="max-w-4xl mx-auto space-y-6">

          {/* Header */}
          <div>
            <h2 className="text-xs text-gray-500 uppercase tracking-widest mb-1">指挥台</h2>
            <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
          </div>

          {/* Current Stage */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs text-gray-500 uppercase tracking-widest">当前阶段</span>
              <span className="text-xs bg-blue-900/50 text-blue-300 border border-blue-800 px-2 py-0.5 rounded">Month 1 · 验证期</span>
            </div>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-400">北极星指标 · MRR</span>
                  <span className="text-white font-mono">¥0 / ¥10,000</span>
                </div>
                <div className="h-1.5 bg-gray-800 rounded-full">
                  <div className="h-1.5 bg-blue-500 rounded-full w-0" />
                </div>
              </div>
              <div className="text-sm text-gray-400">
                <span className="text-white">本周唯一任务：</span>完成 5 个用户访谈
              </div>
              <div className="text-sm text-gray-400">
                <span className="text-white">今日最优先：</span>约好第 3 个访谈对象
              </div>
            </div>
          </div>

          {/* Projects */}
          <div>
            <h3 className="text-sm font-medium text-gray-400 mb-3">项目状态</h3>
            <div className="space-y-3">
              {[
                { name: '超级个体 OS', status: '进行中', phase: 'Month 1', focus: '找到 10 个愿意付钱的人', color: 'blue' },
                { name: '外贸现金流业务', status: '维持', phase: '系统化', focus: '不下滑，系统化交接', color: 'green' },
              ].map((p) => (
                <div key={p.name} className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex items-start justify-between">
                  <div>
                    <div className="font-medium text-white mb-1">{p.name}</div>
                    <div className="text-sm text-gray-500">{p.phase} · {p.focus}</div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded border shrink-0
                    ${p.color === 'blue' ? 'bg-blue-900/40 text-blue-300 border-blue-800' : 'bg-green-900/40 text-green-300 border-green-800'}`}>
                    {p.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Risk Warning */}
          <div className="bg-amber-950/30 border border-amber-900/50 rounded-xl p-4 text-sm text-amber-300">
            ⚠ 风险预警：Month 1 验收还有 18 天，用户访谈完成率 2/5，需要加速。
          </div>

        </div>
      </main>
    </div>
  )
}

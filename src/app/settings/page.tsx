import Sidebar from '@/components/layout/Sidebar'

export default function SettingsPage() {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto p-8">
        <div className="max-w-2xl mx-auto space-y-6">
          <h1 className="text-2xl font-semibold text-white">设置 · 用户记忆</h1>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
            <h3 className="text-sm font-medium text-gray-400">我的档案</h3>
            <div className="space-y-3">
              {[
                { label: '角色', value: '创业者 · 早期验证阶段' },
                { label: '风险偏好', value: '稳健' },
                { label: 'AI 回复风格', value: '先给判断，再给理由' },
              ].map(item => (
                <div key={item.label} className="flex justify-between text-sm">
                  <span className="text-gray-500">{item.label}</span>
                  <span className="text-gray-200">{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
            <h3 className="text-sm font-medium text-gray-400">长期目标</h3>
            <p className="text-sm text-gray-300">超级个体 OS 商业化，12 个月内 MRR ≥ ¥10,000</p>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
            <h3 className="text-sm font-medium text-gray-400">决策记录</h3>
            <div className="space-y-2">
              {[
                { date: '2026-04', type: 'stop', content: '冻结品牌电商增长项目' },
                { date: '2026-04', type: 'continue', content: '确定聚焦三个方向：OS、外贸现金流、外贸系统' },
              ].map((d, i) => (
                <div key={i} className="flex items-start gap-3 text-sm">
                  <span className="text-gray-600 shrink-0">{d.date}</span>
                  <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded
                    ${d.type === 'stop' ? 'bg-red-900/40 text-red-400' : 'bg-green-900/40 text-green-400'}`}>
                    {d.type}
                  </span>
                  <span className="text-gray-300">{d.content}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

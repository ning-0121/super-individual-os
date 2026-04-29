import type { RiskFlag } from '@/lib/ai/decision-engine'

export function RiskBadge({ risk }: { risk: RiskFlag }) {
  return (
    <div className={`flex items-start gap-2 px-3 py-2 rounded-lg border text-xs risk-${risk.severity}`}>
      <span className="shrink-0 mt-0.5">
        {risk.severity === 'high' ? '⚠' : risk.severity === 'medium' ? '◎' : '○'}
      </span>
      <div>
        <span className="font-semibold">{risk.label}</span>
        <p className="opacity-80 mt-0.5 leading-relaxed">{risk.description}</p>
      </div>
    </div>
  )
}

export function RiskDot({ severity }: { severity: RiskFlag['severity'] }) {
  const colors = { high: 'bg-red-400', medium: 'bg-amber-400', low: 'bg-emerald-400' }
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${colors[severity]} mr-1`} />
}

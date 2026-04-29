import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  children: ReactNode
  className?: string
  glow?: boolean
  strong?: boolean
  hover?: boolean
}

export function GlassCard({ children, className, glow, strong, hover }: Props) {
  return (
    <div className={cn(
      strong ? 'glass-strong' : 'glass',
      'rounded-xl',
      glow && 'glow-indigo',
      hover && 'glass-hover cursor-pointer',
      className
    )}>
      {children}
    </div>
  )
}

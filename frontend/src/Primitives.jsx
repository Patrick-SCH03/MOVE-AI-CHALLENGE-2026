// 공통 컴포넌트 — 화면마다 다시 만들면 조금씩 어긋난다. 여기 한 벌뿐이다.

const BTN_STYLES = {
  primary: 'bg-brand text-white active:bg-brand-700 disabled:bg-g300 disabled:text-g500',
  ghost: 'bg-transparent text-g700 active:bg-g100',
  tint: 'bg-brand-50 text-brand active:bg-brand-300/30',
  line: 'bg-white border border-g300 text-g800 active:bg-g50',
  danger: 'bg-dangerbg text-danger active:bg-danger/20',
}

// shrink-0 whitespace-nowrap — flex 줄에서 버튼이 줄바꿈되거나 찌그러지지 않게
export function Button({ kind = 'primary', className = '', children, ...props }) {
  return (
    <button
      className={`shrink-0 whitespace-nowrap rounded-btn px-4 py-3 text-[15px] font-semibold
        transition-colors focus-ring ${BTN_STYLES[kind]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

export function Card({ className = '', children, ...props }) {
  return (
    <div className={`rounded-card bg-white shadow-card p-4 ${className}`} {...props}>
      {children}
    </div>
  )
}

const CHIP_STYLES = {
  brand: 'bg-brand-50 text-brand',
  ok: 'bg-okbg text-ok',
  warn: 'bg-warnbg text-warn',
  danger: 'bg-dangerbg text-danger',
  mute: 'bg-g100 text-g600',
}

export function Chip({ tone = 'mute', className = '', children }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold
      ${CHIP_STYLES[tone]} ${className}`}>
      {children}
    </span>
  )
}

export function Stat({ label, value, sub, className = '' }) {
  return (
    <div className={className}>
      <div className="text-[12px] text-g500">{label}</div>
      <div className="tnum text-[26px] font-bold tracking-[-0.04em] text-g900">{value}</div>
      {sub && <div className="text-[12px] text-g500">{sub}</div>}
    </div>
  )
}

export function SectionHead({ eyebrow, title, className = '' }) {
  return (
    <div className={`mb-2 ${className}`}>
      {eyebrow && <div className="text-[12px] font-semibold text-brand">{eyebrow}</div>}
      <div className="text-[17px] font-bold text-g900">{title}</div>
    </div>
  )
}

export function Spinner({ className = '' }) {
  return (
    <div className={`h-5 w-5 animate-spin rounded-full border-2 border-g300 border-t-brand ${className}`} />
  )
}

export function Skeleton({ className = '' }) {
  return <div className={`animate-pulse rounded-lg bg-g200 ${className}`} />
}

// 확률 막대 — 채널 카드·구간 카드 공용
export function ProbBar({ p, className = '' }) {
  const pct = Math.round((p || 0) * 100)
  const tone = pct >= 90 ? 'bg-ok' : pct >= 70 ? 'bg-brand' : pct >= 40 ? 'bg-warn' : 'bg-danger'
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full bg-g200 ${className}`}>
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

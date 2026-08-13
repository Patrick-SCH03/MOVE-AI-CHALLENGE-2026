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

// 라인 아이콘 세트 — 이모지는 기기마다 렌더가 달라 시연이 흔들린다.
// 탭바와 같은 스트로크 스타일로 화면 전체의 아이콘 언어를 통일한다.
const ICON_PATHS = {
  doc: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
  box: <><path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z" /><path d="M3.5 7.5 12 12l8.5-4.5" /><path d="M12 12v9" /></>,
  boxBig: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M9 12h6" /></>,
  search: <><rect x="3" y="6" width="12" height="11" rx="2" /><path d="M6 10h6M6 13h4" /><circle cx="17" cy="16" r="3.4" /><path d="m19.5 18.5 2 2" /></>,
  runner: <><circle cx="13" cy="4.6" r="2" /><path d="M9 20.5 11 15l-2.4-2 1-4.6 2.6-1 2.8 2.4 3 .6" /><path d="m11.2 12.6 3 2.9 1.4 5" /></>,
  card: <><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M3 10h18" /><path d="M7 15h4" /></>,
  headset: <><path d="M4 13a8 8 0 0 1 16 0" /><rect x="3" y="13" width="4" height="6" rx="1.6" /><rect x="17" y="13" width="4" height="6" rx="1.6" /><path d="M20 19a3 3 0 0 1-3 3h-3" /></>,
  chat: <><path d="M21 12a8 8 0 0 1-8 8H4l2.2-3A8 8 0 1 1 21 12z" /><path d="M8.5 12h.01M12 12h.01M15.5 12h.01" /></>,
}

export function Icon({ name, size = 24, className = '' }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
         strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className}>
      {ICON_PATHS[name]}
    </svg>
  )
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

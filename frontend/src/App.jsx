import { useCallback, useEffect, useState } from 'react'
import CarrierView from './screens/CarrierView'
import ChannelCompare from './screens/ChannelCompare'
import ChatIntake from './screens/ChatIntake'
import History from './screens/History'
import Home from './screens/Home'
import MyTab from './screens/MyTab'
import Onboarding from './screens/Onboarding'
import OpsView from './screens/OpsView'
import Progress from './screens/Progress'

// 화면 이동 규칙 — 뒤로가기는 온 길로 돌아간다.
// 상태를 step 하나로만 들면 목록에서 연 진행 화면에서 뒤로 눌렀을 때
// 지나오지도 않은 단계(비교 → 접수)를 거슬러 올라간다. 그래서 탭과
// '접수 흐름 스택'을 따로 든다 — 목록에서 열면 스택이 [progress] 하나뿐이라
// 뒤로가기가 곧장 목록으로 돌아간다.
// 라인 아이콘 — 코레일톡 탭바 스타일. 이모지는 기기마다 렌더가 달라 시연이 흔들린다
const ICONS = {
  home: <path d="M3 11 12 4l9 7v8a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />,
  history: <><path d="M4 6h16" /><path d="M4 12h16" /><path d="M4 18h10" /></>,
  carrier: <><circle cx="12" cy="5" r="2.2" /><path d="M9 21l2-6-2.5-2 1-5 2.5-1 3 2.5 3 .5" /><path d="M12 12l3 3 1.5 6" /></>,
  my: <><circle cx="12" cy="8" r="3.2" /><path d="M5 20c1.2-3.4 3.8-5 7-5s5.8 1.6 7 5" /></>,
}

const TABS = [
  { id: 'home', label: '홈' },
  { id: 'history', label: '내역' },
  { id: 'carrier', label: '운반자' },
  { id: 'my', label: 'MY' },
]

const NAME_KEY = 'tp_name'
const ONBOARD_KEY = 'tp_onboarded'

export default function App() {
  const view = new URLSearchParams(window.location.search).get('view')
  const [onboarded, setOnboarded] = useState(() => localStorage.getItem(ONBOARD_KEY) === '1')
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) || '')
  const [tab, setTab] = useState('home')
  const [stack, setStack] = useState([])

  const push = useCallback((screen) => setStack((s) => [...s, screen]), [])
  const pop = useCallback(() => setStack((s) => s.slice(0, -1)), [])

  useEffect(() => {
    const onPop = () => setStack((s) => (s.length ? s.slice(0, -1) : s))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  if (view === 'carrier') return <CarrierView standalone />
  if (view === 'ops') return <OpsView />

  if (!onboarded) {
    return (
      <div className="mx-auto min-h-screen max-w-[430px]">
        <Onboarding onStart={(n) => {
          localStorage.setItem(NAME_KEY, n)
          localStorage.setItem(ONBOARD_KEY, '1')
          setName(n)
          setOnboarded(true)
        }} />
      </div>
    )
  }

  const top = stack[stack.length - 1]
  const openIntake = (seed, auto = false) => push({ name: 'intake', seed, auto })

  return (
    <div className="mx-auto min-h-screen max-w-[430px] bg-g100">
      {top ? (
        <FlowScreen screen={top} push={push} pop={pop} resetTo={setStack} />
      ) : (
        <>
          <main className="pb-20">
            {tab === 'home' && <Home onIntake={openIntake} onHistory={() => setTab('history')} />}
            {tab === 'history' && (
              <History
                onOpen={(id) => push({ name: 'progress', orderId: id })}
                onResend={(o) => {
                  let text = `${o.origin}에서 ${o.destination}으로`
                  if (o.item) text += ` ${o.item}`
                  text += ` ${o.deadline}까지`
                  openIntake(text, true)
                }}
              />
            )}
            {tab === 'carrier' && <CarrierView />}
            {tab === 'my' && (
              <MyTab
                name={name}
                onRename={(n) => { localStorage.setItem(NAME_KEY, n); setName(n) }}
                onReset={() => {
                  localStorage.removeItem(NAME_KEY)
                  localStorage.removeItem(ONBOARD_KEY)
                  setName('')
                  setOnboarded(false)
                  setTab('home')
                }}
              />
            )}
          </main>
          <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-[430px] border-t border-g200 bg-white">
            <div className="grid grid-cols-4">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`relative flex flex-col items-center gap-1 pb-2 pt-3 text-[11px] font-semibold
                    ${tab === t.id ? 'text-brand' : 'text-g500'}`}
                >
                  {/* 활성 탭 상단 인디케이터 — 코레일톡 패턴 */}
                  {tab === t.id && <span className="absolute left-1/2 top-0 h-[3px] w-9 -translate-x-1/2 rounded-b bg-brand" />}
                  <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none"
                       stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    {ICONS[t.id]}
                  </svg>
                  {t.label}
                </button>
              ))}
            </div>
          </nav>
        </>
      )}
    </div>
  )
}

function FlowScreen({ screen, push, pop, resetTo }) {
  if (screen.name === 'intake') {
    return (
      <ChatIntake
        seed={screen.seed}
        auto={screen.auto}
        onBack={pop}
        onQuoted={(quote) => push({ name: 'compare', quote })}
      />
    )
  }
  if (screen.name === 'compare') {
    return (
      <ChannelCompare
        quote={screen.quote}
        onBack={pop}
        onAccepted={(r) => resetTo([{ name: 'progress', orderId: r.order.id }])}
      />
    )
  }
  if (screen.name === 'progress') {
    return <Progress orderId={screen.orderId} onBack={pop} />
  }
  return null
}


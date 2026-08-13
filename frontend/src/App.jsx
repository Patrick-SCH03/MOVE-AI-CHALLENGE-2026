import { useCallback, useEffect, useState } from 'react'
import CarrierView from './screens/CarrierView'
import ChannelCompare from './screens/ChannelCompare'
import ChatIntake from './screens/ChatIntake'
import History from './screens/History'
import Home from './screens/Home'
import MyTab from './screens/MyTab'
import Onboarding from './screens/Onboarding'
import Progress from './screens/Progress'

// 화면 이동 규칙 — 뒤로가기는 온 길로 돌아간다.
// 상태를 step 하나로만 들면 목록에서 연 진행 화면에서 뒤로 눌렀을 때
// 지나오지도 않은 단계(비교 → 접수)를 거슬러 올라간다. 그래서 탭과
// '접수 흐름 스택'을 따로 든다 — 목록에서 열면 스택이 [progress] 하나뿐이라
// 뒤로가기가 곧장 목록으로 돌아간다.
const TABS = [
  { id: 'home', label: '홈', icon: '🏠' },
  { id: 'history', label: '내역', icon: '📦' },
  { id: 'carrier', label: '운반자', icon: '🏃' },
  { id: 'my', label: 'MY', icon: '👤' },
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
  if (view === 'ops') return <OpsPlaceholder />

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
                  className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium
                    ${tab === t.id ? 'text-brand' : 'text-g500'}`}
                >
                  <span className="text-[18px] leading-none">{t.icon}</span>
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

function OpsPlaceholder() {
  return (
    <div className="mx-auto flex min-h-screen max-w-[430px] flex-col items-center justify-center gap-2 bg-g100 p-8 text-center">
      <div className="text-[18px] font-bold text-g900">운영자 화면</div>
      <div className="text-[14px] text-g500">P10에서 붙습니다</div>
    </div>
  )
}

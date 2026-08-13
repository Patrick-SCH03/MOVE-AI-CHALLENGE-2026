import { useCallback, useEffect, useState } from 'react'
import Home from './screens/Home'

// 화면 이동 규칙 — 뒤로가기는 온 길로 돌아간다.
// 상태를 step 하나로만 들면 목록에서 연 진행 화면에서 뒤로 눌렀을 때
// 지나오지도 않은 단계를 거슬러 올라간다. 그래서 탭 + 스택(접수 흐름)을 따로 든다.
const TABS = [
  { id: 'home', label: '홈', icon: '🏠' },
  { id: 'history', label: '내역', icon: '📦' },
  { id: 'carrier', label: '운반자', icon: '🏃' },
  { id: 'my', label: 'MY', icon: '👤' },
]

export default function App() {
  const view = new URLSearchParams(window.location.search).get('view')
  const [tab, setTab] = useState('home')
  const [stack, setStack] = useState([])   // 접수 흐름 스택: intake → compare → progress

  const push = useCallback((screen) => setStack((s) => [...s, screen]), [])
  const pop = useCallback(() => setStack((s) => s.slice(0, -1)), [])

  // 브라우저 뒤로가기도 스택을 따른다
  useEffect(() => {
    const onPop = () => setStack((s) => (s.length ? s.slice(0, -1) : s))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  if (view === 'carrier') return <Placeholder title="운반자 화면" note="P8에서 붙습니다" />
  if (view === 'ops') return <Placeholder title="운영자 화면" note="P10에서 붙습니다" />

  const top = stack[stack.length - 1]

  return (
    <div className="mx-auto min-h-screen max-w-[430px] bg-g100">
      {top ? (
        <FlowScreen screen={top} push={push} pop={pop} />
      ) : (
        <>
          <main className="pb-20">
            {tab === 'home' && <Home onIntake={(seed) => push({ name: 'intake', seed })} />}
            {tab === 'history' && <Placeholder title="배송 내역" note="아직 접수한 배송이 없어요" />}
            {tab === 'carrier' && <Placeholder title="운반자" note="운반자 화면은 ?view=carrier 로 열려요" />}
            {tab === 'my' && <Placeholder title="MY" note="로그인 없이 쓰는 시연용 프로필이에요" />}
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

// 접수 흐름 화면 — P7 에서 실제 화면(ChatIntake·ChannelCompare·Progress)으로 교체
function FlowScreen({ screen, pop }) {
  return (
    <div className="p-4">
      <button onClick={pop} className="mb-3 text-[15px] text-g600">‹ 뒤로</button>
      <Placeholder title={screen.name} note="P7에서 구현" />
    </div>
  )
}

function Placeholder({ title, note }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 p-8 text-center">
      <div className="text-[18px] font-bold text-g900">{title}</div>
      <div className="text-[14px] text-g500">{note}</div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { api } from '../api'
import { Card, Chip, Skeleton, Stat } from '../Primitives'

// 자주 보내는 경로 — 접수 도우미에 문장으로 넘어간다
const QUICK_ROUTES = [
  { label: '강남 → 서면', text: '강남에서 서면으로' },
  { label: '마포 → 해운대', text: '마포에서 해운대로' },
  { label: '여의도 → 동대구', text: '여의도에서 대구로' },
]

export default function Home({ onIntake }) {
  const [live, setLive] = useState(null)

  useEffect(() => {
    // 홈 숫자는 전부 /api/live 집계 — 상수로 두면 화면끼리 어긋난다
    api.get('/live').then(setLive).catch(() => setLive({ error: true }))
  }, [])

  return (
    <div className="pb-4">
      {/* 딥블루 헤더 + 오버랩 카드 */}
      <div className="header-gradient px-4 pb-14 pt-6 text-white">
        <div className="text-[13px] font-medium opacity-80">KORAIL KTX 특송</div>
        <h1 className="mt-0.5 text-[24px] font-bold tracking-[-0.02em]">KTX 당일배송</h1>
        <p className="mt-1 text-[14px] leading-5 opacity-90">
          역에 가지 않아도, 오늘 안에 도착해요.<br />
          약속은 숫자로 — 도착 확률을 먼저 보여드려요.
        </p>
      </div>

      <div className="-mt-9 space-y-3 px-4">
        {/* AI 접수 도우미 진입 — 들어간 화면의 제목과 같은 이름 (문과 안이 다르면 길을 잃는다) */}
        <Card
          role="button"
          tabIndex={0}
          onClick={() => onIntake()}
          onKeyDown={(e) => e.key === 'Enter' && onIntake()}
          className="cursor-pointer border border-brand-50 active:bg-brand-50/40"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[20px]">💬</div>
            <div className="min-w-0 flex-1">
              <div className="text-[16px] font-bold text-g900">AI 접수 도우미</div>
              <div className="text-[13px] text-g600">
                "강남에서 서면으로 노트북 오늘 6시까지" 처럼 말해 보세요
              </div>
            </div>
            <div className="shrink-0 text-g400">›</div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {QUICK_ROUTES.map((r) => (
              <button
                key={r.label}
                onClick={(e) => { e.stopPropagation(); onIntake(r.text) }}
                className="rounded-full bg-g100 px-3 py-1.5 text-[13px] font-medium text-g700 active:bg-g200"
              >
                {r.label}
              </button>
            ))}
          </div>
        </Card>

        {/* 오늘 현황 — /api/live */}
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[15px] font-bold text-g900">오늘 현황</div>
            <Chip tone="brand">실시간 집계</Chip>
          </div>
          {!live ? (
            <div className="grid grid-cols-3 gap-3">
              <Skeleton className="h-14" /><Skeleton className="h-14" /><Skeleton className="h-14" />
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <Stat label="오늘 접수" value={live.error ? '–' : `${live.today_orders}건`} />
              <Stat label="운송 중" value={live.error ? '–' : `${live.in_transit}건`} />
              <Stat
                label="주간 정시율"
                value={live.error || live.ontime_rate == null ? '–' : `${(live.ontime_rate * 100).toFixed(1)}%`}
                sub={live.error || !live.week_completed ? '' : `완료 ${live.week_completed}건 기준`}
              />
            </div>
          )}
        </Card>

        {/* 서비스 설명 — 세 구간 확률의 곱 */}
        <Card>
          <div className="text-[15px] font-bold text-g900">확률을 곱해서 약속해요</div>
          <p className="mt-1 text-[13px] leading-5 text-g600">
            집앞 → 출발역 → KTX → 도착역 → 집앞. 세 구간 각각의 성공 확률을 곱한 값이
            그대로 종합 확률이에요. 지어낸 숫자가 아니라 계산 결과예요.
          </p>
        </Card>
      </div>
    </div>
  )
}

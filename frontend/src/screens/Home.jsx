import { useEffect, useState } from 'react'
import { api } from '../api'
import { Card, Skeleton } from '../Primitives'

// 자주 보내는 경로 — 폼을 채우는 칩
const FAVORITES = [
  { label: '강남 · 서면', origin: '강남', destination: '서면' },
  { label: '마포 · 해운대', origin: '마포', destination: '해운대' },
  { label: '여의도 · 동대구', origin: '여의도', destination: '대구' },
]

const NOTICES = [
  { tag: '운영', date: '08.11', body: '매주 화요일 02:00~04:00 정기점검 — 이 시간에는 접수가 중단됩니다' },
  { tag: '안내', date: '08.08', body: '특송 취급역 14개 — 서울 · 용산 · 광명 · 동탄 · 천안아산 · 오송 · 대전 · 동대구 · 경주 · 부산 · 광주송정 · 목포 · 여수엑스포 · 강릉' },
  { tag: '규정', date: '08.02', body: '신고가액 200만원 초과 물품은 시민 운반으로 접수되지 않습니다' },
]

export default function Home({ onIntake, onHistory }) {
  const [live, setLive] = useState(null)
  const [tariff, setTariff] = useState(null)
  const [form, setForm] = useState({ origin: '', destination: '', deadline: '19:00', item: '', value: '' })

  useEffect(() => {
    // 홈 숫자는 전부 집계 API 에서 — 상수로 두면 화면끼리 어긋난다
    api.get('/live').then(setLive).catch(() => setLive({ error: true }))
    api.get('/tariff').then(setTariff).catch(() => {})
  }, [])

  const filled = form.origin && form.destination && form.deadline
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  function submit() {
    if (!filled) return
    let text = `${form.origin}에서 ${form.destination}으로`
    if (form.item) text += ` ${form.item}`
    if (form.value) text += ` ${Number(form.value).toLocaleString()}원짜리`
    text += ` ${form.deadline}까지`
    onIntake(text, true)
  }

  return (
    <div className="pb-4">
      {/* 딥블루 헤더 */}
      <div className="header-gradient px-4 pb-16 pt-5 text-white">
        <div className="flex items-center justify-between">
          <img src="/korail-white.png" alt="KORAIL" className="h-6" />
          <span className="rounded-full border border-white/50 px-3 py-1 text-[12px] font-semibold">당일배송</span>
        </div>
        <h1 className="mt-3 text-[22px] font-bold tracking-[-0.01em]">역에 가지 않고 오늘 안에 보냅니다</h1>
      </div>

      <div className="-mt-11 space-y-3 px-4">
        {/* 접수 폼 카드 */}
        <div className="overflow-hidden rounded-card bg-white shadow-card">
          <div className="p-4">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1 text-center">
                <div className="text-[13px] text-g500">출발지</div>
                <input
                  value={form.origin} onChange={set('origin')} placeholder="선택"
                  className="w-full min-w-0 border-b border-g300 pb-1 text-center text-[22px] font-bold text-g900 placeholder:text-g400 focus:outline-none focus:border-brand"
                />
              </div>
              <button
                onClick={() => setForm((f) => ({ ...f, origin: f.destination, destination: f.origin }))}
                className="mt-4 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-g100 text-[16px] text-g600"
                aria-label="출발지와 도착지 바꾸기"
              >⇄</button>
              <div className="min-w-0 flex-1 text-center">
                <div className="text-[13px] text-g500">도착지</div>
                <input
                  value={form.destination} onChange={set('destination')} placeholder="선택"
                  className="w-full min-w-0 border-b border-g300 pb-1 text-center text-[22px] font-bold text-g900 placeholder:text-g400 focus:outline-none focus:border-brand"
                />
              </div>
            </div>

            <div className="mt-4 space-y-2.5">
              <div className="flex items-center rounded-field bg-g100 px-4 py-3.5">
                <span className="text-[15px] text-g700">도착 기한</span>
                <input
                  type="time" value={form.deadline} onChange={set('deadline')}
                  className="tnum ml-auto bg-transparent text-right text-[20px] font-bold text-g900 focus:outline-none"
                />
                <span className="ml-2 text-[15px] text-g600">까지</span>
              </div>
              <div className="flex items-center rounded-field bg-g100 px-4 py-3.5">
                <span className="shrink-0 text-[15px] text-g700">보낼 물건</span>
                <input
                  value={form.item} onChange={set('item')} placeholder="노트북, 서류…"
                  className="w-full min-w-0 flex-1 bg-transparent text-right text-[15px] text-g900 placeholder:text-g400 focus:outline-none"
                />
              </div>
              <div className="flex items-center rounded-field bg-g100 px-4 py-3.5">
                <span className="shrink-0 text-[15px] text-g700">신고가액</span>
                <input
                  value={form.value} onChange={set('value')} inputMode="numeric"
                  placeholder="선택 · 안 적으면 50만원 한도"
                  className="tnum w-full min-w-0 flex-1 bg-transparent text-right text-[15px] text-g900 placeholder:text-g400 focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              <span className="shrink-0 pt-1 text-[15px] text-warn">★</span>
              {FAVORITES.map((f) => (
                <button
                  key={f.label}
                  onClick={() => setForm((v) => ({ ...v, origin: f.origin, destination: f.destination }))}
                  className="shrink-0 rounded-full bg-g100 px-3.5 py-1.5 text-[13px] font-medium text-g700 active:bg-g200"
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* 하단 CTA — 채워지기 전에는 무엇이 필요한지 보여준다 */}
          <button
            onClick={submit}
            disabled={!filled}
            className={`w-full py-4 text-[16px] font-bold ${filled ? 'bg-brand text-white active:bg-brand-700' : 'bg-g200 text-g500'}`}
          >
            {filled ? '견적 보기' : '출발지 · 도착지 · 물건'}
          </button>
        </div>

        {/* AI 접수 도우미 */}
        <Card
          role="button" tabIndex={0}
          onClick={() => onIntake()}
          onKeyDown={(e) => e.key === 'Enter' && onIntake()}
          className="cursor-pointer active:bg-g50"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[22px]">💬</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[17px] font-bold text-g900">AI 접수 도우미</span>
                <span className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-bold text-white">AI</span>
              </div>
              <div className="mt-0.5 text-[13px] leading-5 text-g600">
                "강남에서 부산 해운대로 노트북 저녁 7시까지" 처럼 한 문장이면 돼요.
              </div>
            </div>
            <div className="shrink-0 text-g400">›</div>
          </div>
        </Card>

        {/* 빠른 메뉴 */}
        <Card>
          <div className="grid grid-cols-4 gap-2">
            {[
              ['📦', '배송 조회', () => onHistory()],
              ['🚶', '운반자 지원', () => { window.location.search = '?view=carrier' }],
              ['💳', '요금 안내', () => document.getElementById('fare-card')?.scrollIntoView({ behavior: 'smooth' })],
              ['🎧', '고객센터', () => {}],
            ].map(([icon, label, fn]) => (
              <button key={label} onClick={fn} className="flex flex-col items-center gap-1.5">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-50/60 text-[24px]">{icon}</span>
                <span className="text-[13px] text-g700">{label}</span>
              </button>
            ))}
          </div>
        </Card>

        {/* 운영 현황 */}
        <Card>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-ok" />
            <span className="text-[16px] font-bold text-g900">운영 현황</span>
          </div>
          {!live ? (
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" />
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[
                [`${live.today_orders ?? '–'}건`, '오늘 접수'],
                [`${live.in_transit ?? '–'}건`, '운송 중'],
                [live.ontime_rate != null ? `${(live.ontime_rate * 100).toFixed(1)}%` : '–', '정시 도착률'],
              ].map(([v, l]) => (
                <div key={l} className="rounded-xl bg-g100 p-3">
                  <div className="tnum text-[22px] font-bold tracking-[-0.03em] text-g900">{v}</div>
                  <div className="mt-0.5 text-[13px] text-g600">{l}</div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* 공지사항 */}
        <Card>
          <div className="text-[17px] font-bold text-g900">공지사항</div>
          <div className="mt-2 divide-y divide-g100">
            {NOTICES.map((n) => (
              <div key={n.date} className="flex gap-3 py-3">
                <span className="h-fit shrink-0 rounded-lg bg-g100 px-2 py-1 text-[12px] font-semibold text-g600">{n.tag}</span>
                <p className="min-w-0 flex-1 text-[14px] leading-6 text-g800">{n.body}</p>
                <span className="tnum shrink-0 text-[13px] text-g500">{n.date}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* 요금 안내 — 숫자는 /api/tariff (단일 출처)에서 */}
        {tariff && (
          <Card id="fare-card">
            <div className="text-center text-[19px] font-bold">
              <span className="text-brand">KTX 당일배송</span> <span className="text-g900">요금 안내</span>
            </div>
            <div className="mt-4 text-[14px] font-semibold text-g700">기본 운임 · 규격별</div>
            <div className="divide-y divide-g100">
              {tariff.tiers.map((t) => (
                <div key={t.name} className="flex items-center py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-semibold text-g900">{t.name}</div>
                    <div className="text-[13px] text-g500">최장변 {t.max_side_cm}cm · 세변합 {t.sum_cm}cm</div>
                  </div>
                  <div className="tnum text-[18px] font-bold text-g900">{t.fare.toLocaleString()}원</div>
                </div>
              ))}
            </div>
            <div className="mt-3 text-[14px] font-semibold text-g700">보내는 방법 · 추가 운임</div>
            <div className="divide-y divide-g100">
              {tariff.channels.map((c) => (
                <div key={c.id} className="flex items-center py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-semibold text-g900">{c.name}</div>
                    <div className="text-[13px] text-g500">{c.door_to_door ? '집앞 → 집앞' : '역 → 역'}</div>
                  </div>
                  <div className="tnum text-[18px] font-bold text-g900">+{c.surcharge.toLocaleString()}원</div>
                </div>
              ))}
            </div>
            <div className="mt-3 space-y-1.5 rounded-xl bg-g50 p-3">
              {tariff.notes.map((n, i) => (
                <p key={i} className="text-[13px] leading-5 text-g600">{n}</p>
              ))}
            </div>
            <p className="mt-2 text-center text-[12px] text-g500">{tariff.disclaimer}</p>
          </Card>
        )}
      </div>
    </div>
  )
}

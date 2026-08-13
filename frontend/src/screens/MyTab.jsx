import { useEffect, useState } from 'react'
import { api } from '../api'
import { Card } from '../Primitives'

export default function MyTab({ name, onRename, onReset, onTerms }) {
  const [live, setLive] = useState(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name || '')

  useEffect(() => {
    api.get('/live').then(setLive).catch(() => {})
  }, [])

  return (
    <div className="pb-4">
      <div className="bg-white px-4 pb-4 pt-5">
        <img src="/korail-blue.png" alt="KORAIL" className="h-6" />
        <h1 className="mt-3 text-[24px] font-bold text-g900">MY</h1>
      </div>

      <div className="space-y-3 p-4">
        <Card>
          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1">
              <div className="text-[13px] text-g500">이름</div>
              {editing ? (
                <div className="mt-1 flex items-center gap-2">
                  <input
                    value={draft} onChange={(e) => setDraft(e.target.value)}
                    className="w-full min-w-0 flex-1 rounded-field border border-g300 px-3 py-2 text-[16px] focus-ring"
                  />
                  <button
                    onClick={() => { onRename(draft.trim()); setEditing(false) }}
                    className="shrink-0 rounded-full bg-brand px-4 py-2 text-[14px] font-semibold text-white"
                  >저장</button>
                </div>
              ) : (
                <div className="text-[24px] font-bold text-g900">{name || '이름 없음'}</div>
              )}
            </div>
            {!editing && (
              <button onClick={() => setEditing(true)} className="shrink-0 rounded-full bg-g100 px-4 py-2 text-[14px] font-semibold text-g700">
                수정
              </button>
            )}
          </div>
          <p className="mt-3 rounded-xl bg-g100 p-3 text-[13px] leading-5 text-g600">
            제안용 프로토타입이라 계정이 없어요. 이름은 이 기기에만 저장됩니다.
          </p>
        </Card>

        <Card>
          <div className="text-[17px] font-bold text-g900">이용 현황</div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[
              [`${live?.total_orders ?? '–'}건`, '전체 접수'],
              [`${live?.total_completed ?? '–'}건`, '완료'],
              [live ? `${(live.total_fare ?? 0).toLocaleString()}원` : '–', '누적 운임'],
            ].map(([v, l]) => (
              <div key={l} className="rounded-xl bg-g100 p-3">
                <div className="tnum break-all text-[18px] font-bold tracking-[-0.03em] text-g900">{v}</div>
                <div className="mt-0.5 text-[13px] text-g600">{l}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="text-[17px] font-bold text-g900">다른 화면으로</div>
          <p className="mt-1 text-[14px] text-g600">이 서비스는 세 사람이 씁니다. 각자 다른 화면을 봐요.</p>
          <a href="?view=carrier" target="_blank" rel="noreferrer"
             className="mt-2 flex items-center justify-between border-b border-g100 py-3">
            <div>
              <div className="text-[16px] font-bold text-g900">운반자 화면</div>
              <div className="text-[13px] text-g500">내 동선에 맞는 요청을 받고 인계해요</div>
            </div>
            <span className="text-g400">›</span>
          </a>
          <a href="?view=ops" target="_blank" rel="noreferrer"
             className="flex items-center justify-between py-3">
            <div>
              <div className="text-[16px] font-bold text-g900">운영자 화면</div>
              <div className="text-[13px] text-g500">열차별 적재 현황과 단계 판정</div>
            </div>
            <span className="text-g400">›</span>
          </a>
        </Card>

        <Card role="button" onClick={onTerms} className="cursor-pointer active:bg-g50">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[16px] font-bold text-g900">약관 · 정책</div>
              <div className="text-[13px] text-g500">이용약관 · 개인정보 처리방침 · 운반자 이용약관</div>
            </div>
            <span className="text-g400">›</span>
          </div>
        </Card>

        <button
          onClick={onReset}
          className="w-full rounded-card bg-white py-4 text-[16px] font-bold text-danger shadow-card active:bg-dangerbg"
        >
          이 기기 데이터 초기화
        </button>

        <Card>
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-g100 px-2 py-1 text-[13px] font-bold text-g700">v1.0</span>
            <span className="text-[15px] font-semibold text-g700">MOVE-AI CHALLENGE 2026</span>
          </div>
          <p className="mt-2 text-[13px] leading-5 text-g500">
            한국철도공사 제안 프로토타입입니다. 공식 서비스가 아니며 운임과 일부 수치는 가정치예요.
          </p>
        </Card>
      </div>
    </div>
  )
}

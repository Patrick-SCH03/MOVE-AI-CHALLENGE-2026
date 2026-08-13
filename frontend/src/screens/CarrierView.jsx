import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { Button, Card, Chip } from '../Primitives'

// 내 운반 요청 — 상단 팀원 4명 빠른 선택.
// 90초 안에 400명 목록을 뒤질 수 없으므로 시연 대상만 바로 고른다.
export default function CarrierView({ standalone = false }) {
  const [team, setTeam] = useState([])
  const [me, setMe] = useState(null)
  const [calls, setCalls] = useState([])
  const [requests, setRequests] = useState({ active: [], earned_today: 0 })
  const [flash, setFlash] = useState('')

  useEffect(() => {
    api.get('/carriers').then((r) => {
      setTeam(r.team)
      setMe(r.team[0]?.id)
    }).catch(() => {})
  }, [])

  const load = useCallback(async () => {
    if (!me) return
    try {
      const [c, q] = await Promise.all([
        api.get(`/carrier/${me}/calls`),
        api.get(`/carrier/${me}/requests`),
      ])
      setCalls(c.calls)
      setRequests(q)
    } catch { /* 폴링 실패는 다음 턴에 복구된다 */ }
  }, [me])

  // 3초 폴링 — WebSocket 금지, 배포가 단순하다
  useEffect(() => {
    load()
    const t = setInterval(load, 3000)
    return () => clearInterval(t)
  }, [load])

  async function respond(call, accept) {
    try {
      await api.post(`/carrier/call/${call.id}/respond`, { accept })
      setFlash(accept ? `${call.from_name} → ${call.to_name} 콜을 수락했어요` : '콜을 거절했어요 — 불이익은 없어요')
      setTimeout(() => setFlash(''), 2500)
      load()
    } catch (e) {
      setFlash(e.message)
    }
  }

  const meInfo = team.find((t) => t.id === me)
  const deposit = meInfo ? meInfo.completed_count * 100 : 0   // 건당 보증금 100원 적립

  return (
    <div className={standalone ? 'mx-auto min-h-screen max-w-[430px] bg-g100 pb-8' : 'pb-4'}>
      <div className="bg-white px-4 pb-4 pt-5">
        <img src="/korail-blue.png" alt="KORAIL" className="h-6" />
        <h1 className="mt-3 text-[24px] font-bold text-g900">내 운반 요청</h1>
      </div>

      <div className="space-y-3 p-4">
        {/* 운반자 선택 (시연용) */}
        <Card>
          <div className="text-[14px] font-semibold text-g600">운반자 선택 (시연용)</div>
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {team.map((t) => (
              <button
                key={t.id}
                onClick={() => setMe(t.id)}
                className={`shrink-0 rounded-full px-4 py-2 text-[15px] font-semibold
                  ${me === t.id ? 'bg-brand text-white' : 'border border-g300 bg-white text-g800'}`}
              >
                {t.name}
              </button>
            ))}
          </div>
          {meInfo && (
            <div className="mt-2 rounded-field bg-g100 px-4 py-3 text-[15px] text-g800">
              {meInfo.name} · {meInfo.type} · 신뢰도 {(meInfo.reliability * 100).toFixed(0)}%
            </div>
          )}
        </Card>

        {/* 프로필 카드 */}
        {meInfo && (
          <Card>
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[22px] font-bold text-g900">{meInfo.name}</div>
                <div className="mt-0.5 text-[14px] text-g500">{meInfo.type} · {meInfo.mode}</div>
              </div>
              <Chip tone="brand" className="!text-[14px]">신뢰도 {(meInfo.reliability * 100).toFixed(0)}%</Chip>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-g100 pt-3">
              <div>
                <div className="text-[13px] text-g500">누적 완료</div>
                <div className="tnum text-[20px] font-bold text-g900">{meInfo.completed_count}건</div>
              </div>
              <div>
                <div className="text-[13px] text-g500">정시 도착률</div>
                <div className="tnum text-[20px] font-bold text-g900">{(meInfo.reliability * 100).toFixed(0)}%</div>
              </div>
              <div>
                <div className="text-[13px] text-g500">받을 보상</div>
                <div className="tnum text-[20px] font-bold text-g900">{requests.earned_today.toLocaleString()}원</div>
              </div>
            </div>
            <p className="mt-3 rounded-xl bg-g100 p-3 text-[13px] leading-5 text-g600">
              신뢰도는 표시용 점수가 아니라 도착 확률 계산에 그대로 들어갑니다. 정시에
              인계할수록 더 좋은 요청을 먼저 받게 돼요. <b>콜을 거절해도 신뢰도는 내려가지 않아요.</b>
            </p>
            <p className="mt-2 rounded-xl border border-dashed border-g300 p-3 text-[13px] leading-5 text-g600">
              <b>외부 계약 전 항목</b> — 본인확인(PASS(모의))과 안심번호 발급은 아직
              <b> 모의</b>입니다. 미확인자에게 콜이 가지 않는 게이트는 실제로 동작합니다.
            </p>
          </Card>
        )}

        {/* 본인 확인 · 적립금 */}
        {meInfo && (
          <Card>
            <div className="flex items-center justify-between">
              <div className="text-[17px] font-bold text-g900">본인 확인</div>
              <Chip tone="ok">확인 완료 · PASS(모의)</Chip>
            </div>
            <p className="mt-1 text-[13px] text-g500">실명과 주민등록번호는 저장하지 않습니다. 연계정보 해시만 보관합니다.</p>
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-g100 pt-3">
              <div>
                <div className="text-[13px] text-g500">내 적립금</div>
                <div className="tnum text-[20px] font-bold text-g900">{deposit.toLocaleString()}원</div>
              </div>
              <div>
                <div className="text-[13px] text-g500">사고 시 내 부담 한도</div>
                <div className="tnum text-[20px] font-bold text-g900">{Math.min(deposit, 50000).toLocaleString()}원</div>
              </div>
            </div>
            <p className="mt-3 rounded-xl bg-g100 p-3 text-[13px] leading-5 text-g600">
              이용자 배상은 회사가 합니다. 고의·중과실일 때만 구상하고, 그 한도도 위
              적립금까지예요. <b>운임에서 적립됩니다. 예치금을 내지 않으셔도 돼요.</b>{' '}
              단체보험 보장한도는 1사고당 3,000,000원입니다.
            </p>
          </Card>
        )}

        {flash && <div className="rounded-xl bg-okbg p-3 text-[14px] text-ok">{flash}</div>}

        {/* 새 요청 */}
        <div className="text-[18px] font-bold text-g900">새 요청</div>
        {calls.length === 0 ? (
          <Card className="py-8 text-center text-[15px] text-g600">지금은 들어온 요청이 없어요.</Card>
        ) : (
          calls.map((c) => (
            <Card key={c.id} className="border border-brand-300">
              <div className="flex items-center gap-2">
                <Chip tone="brand">{c.seq === 1 ? '① 수취' : '③ 배송'}</Chip>
                {/* 수락 전에는 지역까지만 — 상세 주소는 수락 후 공개 */}
                <span className="min-w-0 flex-1 truncate text-[16px] font-bold text-g900">
                  {c.from_name} → {c.to_name}
                </span>
                <span className="tnum shrink-0 text-[14px] font-bold text-warn">{c.remaining_sec}초</span>
              </div>
              <div className="mt-1 text-[13px] text-g500">{c.match_reason}</div>
              <div className="tnum mt-1 text-[16px] font-bold text-g900">보상 {c.reward.toLocaleString()}원</div>
              <div className="mt-3 flex gap-2">
                <Button kind="line" className="flex-1" onClick={() => respond(c, false)}>거절</Button>
                <Button className="flex-1" onClick={() => respond(c, true)}>수락</Button>
              </div>
              <div className="mt-2 text-center text-[12px] text-g500">거절해도 어떤 불이익도 없어요</div>
            </Card>
          ))
        )}

        {/* 수행 중 */}
        <div className="text-[18px] font-bold text-g900">수행 중</div>
        {requests.active.length === 0 ? (
          <Card className="py-8 text-center text-[15px] text-g600">수락한 요청이 없어요.</Card>
        ) : (
          requests.active.map((r) => (
            <Card key={`${r.order_id}-${r.seq}`}>
              <div className="flex items-center gap-2">
                <Chip tone="brand">{r.seq === 1 ? '① 수취' : '③ 배송'}</Chip>
                <span className="min-w-0 flex-1 truncate text-[16px] font-bold text-g900">
                  {r.from_name} → {r.to_name}
                </span>
                <span className="tnum text-[13px] text-g500">{r.start_at}~{r.end_at}</span>
              </div>
              <div className="mt-2 flex items-center justify-between rounded-xl bg-g100 px-3 py-2.5">
                <span className="text-[13px] text-g600">인계 코드</span>
                <span className="tnum text-[20px] font-bold tracking-[0.2em] text-g900">{r.handover_code}</span>
              </div>
              <div className="mt-1.5 text-[12px] text-g500">
                창구·수령인에게 이 코드를 불러 주면 인계가 확정돼요 · 보상 {r.reward.toLocaleString()}원
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}

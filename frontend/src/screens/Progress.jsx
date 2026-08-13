import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { Button, Card, Chip, Spinner } from '../Primitives'

const STEPS = [
  { key: 'ACCEPTED', label: '접수' },
  { key: 'PICKED_UP', label: '수취' },
  { key: 'ON_TRAIN', label: '운송' },
  { key: 'COMPLETED', label: '수령' },
]
const STEP_INDEX = { ACCEPTED: 0, PICKED_UP: 1, ON_TRAIN: 2, COMPLETED: 3 }

export default function Progress({ orderId, onBack }) {
  const [detail, setDetail] = useState(null)
  const [notif, setNotif] = useState(null)
  const [codes, setCodes] = useState({ 1: '', 2: '', 3: '' })
  const [error, setError] = useState('')
  const timerRef = useRef(null)

  const load = useCallback(async () => {
    try {
      const [d, n] = await Promise.all([
        api.get(`/orders/${orderId}`),
        api.get(`/orders/${orderId}/notifications`),
      ])
      setDetail(d)
      setNotif(n)
    } catch (e) {
      setError(e.message)
    }
  }, [orderId])

  // 3초 폴링 — WebSocket 은 쓰지 않는다. 충분하고 배포가 단순하다
  useEffect(() => {
    load()
    timerRef.current = setInterval(load, 3000)
    return () => clearInterval(timerRef.current)
  }, [load])

  if (!detail || !notif) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        {error ? <div className="text-[14px] text-danger">{error}</div> : <Spinner />}
      </div>
    )
  }

  const order = detail.order
  const stepIdx = STEP_INDEX[order.status] ?? 0
  const cancelled = order.status === 'CANCELLED'
  // 요약 카드는 지금 값을 쓴다 — 접수 시점 값을 계속 띄우면 지연이 들어와도
  // 위쪽 숫자가 그대로라 아무 일도 안 일어난 화면이 된다
  const etaNow = notif.eta_now || order.eta
  const probNow = notif.probability_now ?? (order.status === 'COMPLETED' ? null : order.probability)
  // 바뀐 경우에만 이전 값을 취소선으로 — 항상 그리면 없던 변화를 보이게 된다
  const etaChanged = notif.eta_now && notif.eta_now !== order.eta
    && (order.delay_min > 0 || notif.pickup_mode === 'station')

  async function act(fn) {
    setError('')
    try {
      await fn()
      await load()
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div className="min-h-screen pb-8">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-g200 bg-white px-3 py-3">
        <button onClick={onBack} className="px-1 text-[18px] text-g600">‹</button>
        <div className="text-[16px] font-bold text-g900">배송 진행</div>
        <span className="tnum ml-auto text-[12px] text-g500">{order.id}</span>
      </header>

      <div className="space-y-3 p-4">
        {/* 요약 카드 */}
        <Card>
          <div className="flex items-center gap-2">
            <Chip tone={cancelled ? 'danger' : order.status === 'COMPLETED' ? 'ok' : 'brand'}>
              {order.status_label}
            </Chip>
            <span className="text-[13px] text-g600">{order.product} · {order.train_no}</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <div className="text-[12px] text-g500">도착 예정</div>
              <div className="tnum text-[28px] font-bold tracking-[-0.04em] text-g900">
                {etaNow}
                {etaChanged && (
                  <span className="tnum ml-2 text-[15px] font-medium text-g400 line-through">{order.eta}</span>
                )}
              </div>
              <div className="text-[12px] text-g500">데드라인 {order.deadline}</div>
            </div>
            <div>
              <div className="text-[12px] text-g500">성공 확률</div>
              {probNow != null ? (
                <div className="tnum text-[28px] font-bold tracking-[-0.04em] text-g900">
                  {(probNow * 100).toFixed(1)}<span className="text-[15px]">%</span>
                </div>
              ) : (
                <div className="text-[20px] font-bold text-g400">—</div>
              )}
              {order.status === 'COMPLETED' && <div className="text-[12px] text-ok">배송이 완료됐어요</div>}
            </div>
          </div>

          {/* 스텝바 */}
          {!cancelled && (
            <div className="mt-4 flex items-center">
              {STEPS.map((s, i) => (
                <div key={s.key} className="flex flex-1 items-center last:flex-none">
                  <div className="flex flex-col items-center">
                    <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold
                      ${i <= stepIdx ? 'bg-brand text-white' : 'bg-g200 text-g500'}`}>
                      {i + 1}
                    </div>
                    <div className={`mt-1 text-[11px] ${i <= stepIdx ? 'text-brand' : 'text-g500'}`}>{s.label}</div>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className={`mx-1 mb-4 h-0.5 flex-1 ${i < stepIdx ? 'bg-brand' : 'bg-g200'}`} />
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        {error && <div className="rounded-lg bg-dangerbg p-3 text-[13px] text-danger">{error}</div>}

        {/* 지연 주입 (시연) */}
        {!cancelled && order.status !== 'COMPLETED' && (
          <Card>
            <div className="flex items-center justify-between">
              <div className="text-[15px] font-bold text-g900">열차 지연 (시연)</div>
              <span className="text-[11px] text-g500">실제 운영에서는 관제 연동</span>
            </div>
            <div className="mt-2 flex gap-2">
              {[0, 12, 25].map((d) => (
                <Button
                  key={d} kind={order.delay_min === d ? 'primary' : 'line'} className="flex-1 !px-2"
                  onClick={() => act(() => api.post(`/orders/${order.id}/delay`, { delay_min: d }))}
                >
                  {d === 0 ? '정상' : `${d}분 지연`}
                </Button>
              ))}
            </div>
            {/* 왜 안 움직이는지 말한다 — 안 쓰면 버튼이 고장 난 것으로 읽힌다 */}
            {!notif.delay_applies && (
              <div className="mt-2 text-[12px] text-g500">
                지금은 {order.status_label} 단계예요. ①②구간을 넘기면 탑재 상태가 되어 지연이 반영돼요.
              </div>
            )}
            {notif.delay_applies && notif.pickup_mode === 'door' && order.delay_min > 0 && (
              <Button
                kind="tint" className="mt-2 w-full"
                onClick={() => act(() => api.post(`/orders/${order.id}/pickup-mode`, { mode: 'station' }))}
              >
                도착역에서 직접 수령으로 바꾸기
              </Button>
            )}
          </Card>
        )}

        {/* 구간 인계 패널 */}
        {!cancelled && order.status !== 'COMPLETED' && (
          <Card className="space-y-3">
            <div className="text-[15px] font-bold text-g900">구간 인계</div>
            {detail.legs.map((leg) => (
              <div key={leg.seq} className="rounded-xl border border-g200 p-3">
                <div className="flex items-center gap-2 text-[13px]">
                  <span className="min-w-0 flex-1 truncate font-medium text-g800">{leg.label}</span>
                  <span className="shrink-0 text-g600">{leg.carrier_name || leg.train_no}</span>
                  {leg.handed_over ? (
                    <Chip tone="ok">인계 {leg.handed_over_at}</Chip>
                  ) : leg.accepted ? (
                    <Chip tone="brand">대기</Chip>
                  ) : (
                    <Chip tone="warn">수락 대기</Chip>
                  )}
                </div>
                {leg.fallback && leg.fallback_note && (
                  <div className="mt-1.5 text-[12px] text-warn">{leg.fallback_note}</div>
                )}
                {!leg.handed_over && leg.accepted && (
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      value={codes[leg.seq]}
                      onChange={(e) => setCodes((c) => ({ ...c, [leg.seq]: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                      placeholder="6자리 인계 코드" size={6} inputMode="numeric"
                      className="tnum w-full min-w-0 flex-1 rounded-field border border-g300 px-3 py-2.5 text-[16px] focus-ring"
                    />
                    <Button
                      kind="line"
                      disabled={codes[leg.seq].length !== 6}
                      onClick={() => act(async () => {
                        await api.post('/handover', { order_id: order.id, seq: leg.seq, code: codes[leg.seq] })
                        setCodes((c) => ({ ...c, [leg.seq]: '' }))
                      })}
                    >
                      인계
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </Card>
        )}

        {/* 알림 타임라인 */}
        <Card>
          <div className="mb-2 text-[15px] font-bold text-g900">알림</div>
          <div className="space-y-3">
            {[...notif.notifications].reverse().map((n) => (
              <div key={n.seq} className="flex gap-2.5">
                <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-300" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[13px]">
                    <span className="font-semibold text-g900">{n.title}</span>
                    <span className="tnum text-g500">{n.at}</span>
                    {n.probability != null && (
                      <span className={`tnum ml-auto font-semibold
                        ${n.trend === 'down' ? 'text-danger' : n.trend === 'up' ? 'text-ok' : 'text-g700'}`}>
                        {n.trend === 'down' ? '▼' : n.trend === 'up' ? '▲' : ''}
                        {(n.probability * 100).toFixed(1)}%
                      </span>
                    )}
                  </div>
                  <div className="text-[13px] leading-5 text-g600">{n.body}</div>
                  {n.action && (
                    <div className="mt-1 rounded-lg bg-brand-50 p-2 text-[12px] text-brand">{n.action}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* 취소 — 탑재 후에는 서버가 400 으로 막는다 */}
        {!cancelled && stepIdx < 2 && (
          <Button
            kind="danger" className="w-full"
            onClick={() => act(() => api.post(`/orders/${order.id}/cancel`))}
          >
            접수 취소
          </Button>
        )}
      </div>
    </div>
  )
}

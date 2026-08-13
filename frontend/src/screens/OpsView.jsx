import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { Card, Chip, Spinner } from '../components/Primitives'

// 운영자 화면 (?view=ops) — 특송의 운영 단위는 건이 아니라 역이다.
const GRADE_TONE = { '실측': 'ok', '실시간 API': 'brand', '실측 기반 · 변환 가정': 'warn', '가정': 'warn', '가상 데이터': 'mute' }
// 대장 정렬 — 근거가 강한 순서. 서버 순서(주제별)로 두면 등급이 뒤섞여
// "무엇이 실측이고 무엇이 가정인가"를 한눈에 셀 수 없다
const GRADE_ORDER = ['실시간 API', '실측', '실측 기반 · 변환 가정', '가정', '가상 데이터']
const CH_LABEL = { desk: 'KTX특송 창구', locker: '역사 무인함', relay: '시민 운반', fullmile: '기사 방문 픽업' }
const CH_COLOR = { desk: '#1266e5', relay: '#00afdc', locker: '#7c5cff', fullmile: '#f59e0b' }

// embedded=true 면 App 이 헤더를 그려 주므로 자체 헤더를 접는다
export default function OpsView({ embedded = false }) {
  const [board, setBoard] = useState(null)
  const [live, setLive] = useState(null)
  const [prov, setProv] = useState(null)
  const [showAll, setShowAll] = useState(false)
  const [showStations, setShowStations] = useState(false)

  const load = useCallback(() => {
    api.opsBoard().then(setBoard).catch(() => {})
    api.live().then(setLive).catch(() => {})
  }, [])

  useEffect(() => {
    load()
    api.provenance().then(setProv).catch(() => {})
    const t = setInterval(load, 3000)   // 배차 현황 3초 폴링
    return () => clearInterval(t)
  }, [load])

  if (!board) {
    return <div className="flex min-h-screen items-center justify-center"><Spinner /></div>
  }

  const stage = board.today.stage
  const stations = showStations ? board.stations : board.stations.slice(0, 5)

  return (
    <div className={embedded ? "pb-10" : "mx-auto min-h-screen max-w-[520px] bg-g100 pb-10"}>
      {!embedded && (
        <div className="bg-white px-4 pb-4 pt-5">
          <div className="flex items-center gap-2">
            <img src="/korail-blue.png" alt="KORAIL" className="h-6" />
            <span className="rounded-full bg-g900 px-2.5 py-1 text-[12px] font-bold text-white">운영자</span>
            <button onClick={() => window.close()} className="ml-auto text-[15px] text-g600">닫기</button>
          </div>
          <h1 className="mt-3 text-[24px] font-bold text-g900">운영 현황</h1>
          <p className="mt-1 text-[14px] text-g500">코레일 운영자용 화면입니다. 발송인에게는 보이지 않습니다.</p>
        </div>
      )}

      <div className="space-y-3 p-4">
        {/* 정시율 — 확률 엔진이 지금 쓰는 값. 실측(전일 전수 대조)인지
            공시 폴백인지가 첫눈에 보여야 "실측으로 돈다"가 말이 아니라 화면이 된다 */}
        {board.ontime && (
          <Card className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[13px] font-semibold text-brand">확률 엔진</div>
                <div className="text-[20px] font-bold text-g900">KTX 정시율</div>
              </div>
              <Chip tone={board.ontime.source === '실측' ? 'brand' : 'mute'}>
                {board.ontime.source === '실측' ? '전일 실측' : '공시 폴백'}
              </Chip>
            </div>
            <div className="tnum mt-1 text-[36px] font-bold tracking-[-0.04em] text-g900">
              {(board.ontime.rate * 100).toFixed(1)}<span className="text-[18px] font-semibold">%</span>
              <span className="ml-3 text-[15px] font-semibold text-g600">
                지연 시 평균 {board.ontime.delay_mean_min}분
              </span>
            </div>
            <p className="mt-1 text-[13px] text-g500">{board.ontime.detail} · 5분 기준</p>
          </Card>
        )}

        {/* 오늘 물량 */}
        <Card className="p-4">
          <div className="text-[13px] font-semibold text-brand">운영</div>
          <div className="text-[20px] font-bold text-g900">오늘 물량</div>
          <div className="text-[13px] text-g500">기준 {board.as_of}</div>
          <div className="tnum mt-2 text-[36px] font-bold tracking-[-0.04em] text-g900">
            {board.today.total}<span className="text-[18px] font-semibold"> 건 접수</span>
          </div>
          {/* 단계별 적체 막대 */}
          <div className="mt-3 space-y-1.5">
            {[
              ['접수', stage.accepted, 'bg-brand-300'],
              ['수취', stage.picked_up, 'bg-brand'],
              ['운송', stage.on_train, 'bg-accent'],
              ['완료', stage.completed, 'bg-ok'],
            ].map(([label, n, color]) => {
              const max = Math.max(1, stage.accepted, stage.picked_up, stage.on_train, stage.completed)
              return (
                <div key={label} className="flex items-center gap-2">
                  <span className="w-8 shrink-0 text-[13px] text-g600">{label}</span>
                  <div className="h-4 flex-1 overflow-hidden rounded bg-g100">
                    <div className={`h-full rounded ${color}`} style={{ width: `${(n / max) * 100}%` }} />
                  </div>
                  <span className="tnum w-8 shrink-0 text-right text-[13px] font-semibold text-g800">{n}</span>
                </div>
              )
            })}
          </div>

          {/* 역별 현황 */}
          <div className="mt-5 flex items-center justify-between">
            <div className="text-[16px] font-bold text-g900">역별 현황</div>
            <button onClick={() => setShowStations(!showStations)} className="text-[14px] font-semibold text-brand">
              전체 {board.stations.length}역
            </button>
          </div>
          <div className="mt-1 grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-x-3 gap-y-0 text-[14px]">
            <span className="py-2 text-[13px] text-g500">역</span>
            <span className="text-[13px] text-g500">발송</span>
            <span className="text-[13px] text-g500">도착</span>
            <span className="text-right text-[13px] text-g500">다음 마감</span>
            <span className="text-right text-[13px] text-g500">운반자</span>
            {stations.map((s) => (
              <StationRow key={s.name} s={s} />
            ))}
          </div>

          {/* 배차 현황 */}
          <div className="mt-5 text-[16px] font-bold text-g900">배차 현황</div>
          {board.dispatch.ringing.length === 0 ? (
            <p className="mt-1 text-[14px] text-g500">울리는 콜이 없습니다.</p>
          ) : (
            board.dispatch.ringing.map((c, i) => (
              <p key={i} className="mt-1 text-[14px] text-g800">
                {c.carrier_name} · {c.seq === 1 ? '①' : '③'}구간 · {c.rank}순위 · {c.order_id}
              </p>
            ))
          )}
          <div className="tnum mt-2 flex gap-4 text-[13px] text-g600">
            <span>오늘 수락률 {board.dispatch.accept_rate != null ? `${(board.dispatch.accept_rate * 100).toFixed(0)}%` : '—'}</span>
            <span>무응답 만료 <b>{board.dispatch.expired_today}</b></span>
            <span>콜 대기 {board.dispatch.timeout_sec}초</span>
          </div>
        </Card>

        {/* 실적 최근 7일 */}
        {live && (
          <Card className="p-4">
            <div className="text-[13px] font-semibold text-brand">실적</div>
            <div className="text-[20px] font-bold text-g900">최근 7일</div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-g100 p-3">
                <div className="tnum text-[26px] font-bold text-g900">{live.week_completed}건</div>
                <div className="text-[13px] text-g600">완료</div>
              </div>
              <div className="rounded-xl bg-g100 p-3">
                <div className="tnum text-[26px] font-bold text-g900">
                  {live.ontime_rate != null ? `${(live.ontime_rate * 100).toFixed(1)}%` : '—'}
                </div>
                <div className="text-[13px] text-g600">정시 도착률</div>
              </div>
            </div>
            <p className="mt-2 text-[14px] text-g700">지금 <b>{live.in_transit}건</b>이 운송 중입니다.</p>
            <div className="mt-3 text-[15px] font-bold text-g900">채널 비중 (최근 7일)</div>
            <div className="mt-2 flex h-3 overflow-hidden rounded-full bg-g200">
              {Object.entries(live.channel_share).map(([ch, r]) => (
                <div key={ch} style={{ width: `${r * 100}%`, background: CH_COLOR[ch] }} />
              ))}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
              {Object.entries(live.channel_share).map(([ch, r]) => (
                <div key={ch} className="flex items-center gap-1.5 text-[13px]">
                  <span className="h-2 w-2 rounded-full" style={{ background: CH_COLOR[ch] }} />
                  <span className="min-w-0 flex-1 text-g700">{CH_LABEL[ch]}</span>
                  <b className="tnum">{(r * 100).toFixed(0)}%</b>
                </div>
              ))}
            </div>
            {board.recent_completed.length > 0 && (
              <>
                <div className="mt-4 text-[15px] font-bold text-g900">최근 완료</div>
                <div className="divide-y divide-g100">
                  {board.recent_completed.map((r, i) => (
                    <div key={i} className="flex items-center py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="text-[15px] font-semibold text-g900">{r.origin} → {r.destination}</div>
                        <div className="text-[13px] text-g500">{r.item} · {CH_LABEL[r.channel]}</div>
                      </div>
                      <span className="tnum text-[13px] text-g500">{r.hours_ago}시간 전</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>
        )}

        {/* 남은 편성과 잔여 공간 — 아직 출발하지 않은 편성만, 출발 임박 순 */}
        <Card className="p-4">
          <div className="text-[13px] font-semibold text-brand">열차별</div>
          <div className="text-[20px] font-bold text-g900">남은 편성과 잔여 공간</div>
          <div className="text-[13px] text-g500">출발 임박 순 · 서울↔부산 축 {board.trains.length}편</div>
          <div className="mt-3 space-y-2.5">
            {board.trains.slice(0, 6).map((t) => (
              <div key={t.no + t.dep_time} className="rounded-xl border border-g200 p-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-[17px] font-bold text-g900">{t.no}</span>
                  <span className="text-[13px] text-g500">{t.grade}</span>
                  <span className="tnum ml-auto text-[15px] font-bold text-warn">{t.dep_time} 출발</span>
                </div>
                <div className="tnum flex text-[13px] text-g600">
                  <span>{t.dep_station} → {t.arr_station}</span>
                  <span className="ml-auto">접수 마감 {t.cutoff}</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-g100">
                  <div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(1, t.load_pct)}%` }} />
                </div>
                <div className="tnum mt-1.5 flex flex-wrap gap-x-3 text-[13px] text-g600">
                  <span>■ 소상공인 {t.biz}</span>
                  <span>■ 개인 급송 {t.personal}</span>
                  <span>유보 {t.reserved} · 잔여 {t.remaining} / 정원 {t.capacity}</span>
                  <span>적재율 {t.load_pct}%</span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* 배상 재원 */}
        <Card className="p-4">
          <div className="text-[13px] font-semibold text-brand">배상 재원</div>
          <div className="text-[20px] font-bold text-g900">보증금 · 단체보험</div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-g100 p-3">
              <div className="tnum text-[24px] font-bold text-g900">{board.reserve.relay_total}건</div>
              <div className="text-[13px] text-g600">시민 운반 누적</div>
            </div>
            <div className="rounded-xl bg-g100 p-3">
              <div className="tnum text-[24px] font-bold text-g900">{(board.reserve.reserve_total / 10000).toFixed(1)}만원</div>
              <div className="text-[13px] text-g600">적립 총액</div>
            </div>
          </div>
          <div className="tnum mt-3 flex items-center justify-between text-[14px]">
            <span className="text-g700">보험료 적립 {board.reserve.insurance_total.toLocaleString()}원</span>
            <b className="text-ok">예상 배상 {board.reserve.expected_payout.toLocaleString()}원</b>
          </div>
          <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-g200">
            <div className="h-full rounded-full bg-ok"
                 style={{ width: `${Math.min(100, board.reserve.expected_payout / Math.max(1, board.reserve.insurance_total) * 100)}%` }} />
          </div>
          <p className="mt-1.5 text-[13px] text-g600">
            {board.reserve.insurance_total >= board.reserve.expected_payout
              ? '적립한 보험료가 예상 배상액을 덮고 있습니다.'
              : '적립한 보험료가 예상 배상액에 못 미칩니다.'}
          </p>
          <div className="mt-3 divide-y divide-g100 text-[14px]">
            {[
              ['건당 적립', board.reserve.per_case],
              ['1사고당 보장한도', `${board.reserve.coverage_per_accident.toLocaleString()}원 · 신고가액 상한과 동일`],
              ['자기부담금', board.reserve.deductible],
              ['운반자 구상 한도', board.reserve.carrier_recourse_cap],
              ['보증금 부담 주체', '운임 (운반자 예치 없음)'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 py-2.5">
                <span className="shrink-0 text-g600">{k}</span>
                <span className="tnum text-right font-medium text-g900">{v}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 rounded-xl bg-g50 p-3 text-[13px] leading-5 text-g500">{board.reserve.note}</p>
        </Card>

        {/* 근거 — 실측/가정 대장 */}
        {prov && (
          <Card className="p-4">
            <div className="text-[13px] font-semibold text-brand">근거</div>
            <div className="text-[20px] font-bold text-g900">이 화면의 숫자는 어디서 왔나</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {GRADE_ORDER.filter((g) => prov.counts[g]).map((g) => (
                <Chip key={g} tone={GRADE_TONE[g] || 'mute'} className="!text-[13px]">{g} {prov.counts[g]}</Chip>
              ))}
            </div>
            {/* 등급별 묶음 — 접힌 상태에서는 근거가 강한 앞 그룹부터 6건 */}
            {(() => {
              let left = showAll ? Infinity : 6
              return GRADE_ORDER.map((g) => {
                const items = prov.items.filter((it) => it.grade === g).slice(0, Math.max(0, left))
                if (items.length === 0) return null
                left -= items.length
                return (
                  <div key={g} className="mt-3">
                    <div className="flex items-center gap-2">
                      <Chip tone={GRADE_TONE[g] || 'mute'} className="shrink-0">{g}</Chip>
                      <span className="tnum text-[12px] text-g500">{prov.counts[g]}건</span>
                      <div className="h-px flex-1 bg-g100" />
                    </div>
                    <div className="divide-y divide-g100">
                      {items.map((it) => (
                        <div key={it.name} className="py-2.5">
                          <div className="text-[15px] font-semibold leading-5 text-g900">{it.name}</div>
                          <div className="mt-0.5 text-[13px] leading-5 text-g500">{it.source}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })
            })()}
            <button
              onClick={() => setShowAll(!showAll)}
              className="mt-2 w-full rounded-btn bg-g100 py-3 text-[15px] font-semibold text-g800"
            >
              {showAll ? '접기' : `전체 ${prov.items.length}건 보기`}
            </button>
          </Card>
        )}

        {/* 고지 푸터는 App 공통 푸터가 그린다 (이 화면은 항상 App 안에서 뜬다) —
            여기서도 그리면 같은 문구가 두 번 연달아 나온다 (실제로 그랬다) */}
      </div>
    </div>
  )
}

function StationRow({ s }) {
  return (
    <>
      <span className="border-t border-g100 py-2.5 text-[15px] font-semibold text-g900">{s.name}</span>
      <span className="tnum border-t border-g100 py-2.5 text-g700">{s.dep || '—'}</span>
      <span className="tnum border-t border-g100 py-2.5 text-g700">{s.arr || '—'}</span>
      <span className="tnum border-t border-g100 py-2.5 text-right text-g900">
        {s.next_cutoff ? <><b>{s.next_cutoff}</b> <span className="text-[12px] text-g500">· {s.remaining_trains}편</span></> : '마감'}
      </span>
      <span className="tnum border-t border-g100 py-2.5 text-right font-semibold text-g900">{s.carriers_active}</span>
    </>
  )
}

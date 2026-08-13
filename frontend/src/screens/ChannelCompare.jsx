import { useMemo, useState } from 'react'
import { api } from '../api'
import { Button, Card, Chip, ProbBar } from '../Primitives'

// 채널 비교 → 확률 고지 → 동의 → 접수. 고지는 접지 않는다 —
// 사전 고지가 연착 배상 면책 요건이라 배상 한도까지 항상 보여야 한다.
export default function ChannelCompare({ quote, onAccepted, onBack }) {
  const { route: plan, options, intake, screening } = quote
  const feasibleIds = options.filter((c) => c.feasible).map((c) => c.id)
  const [selected, setSelected] = useState(
    options.find((c) => c.badge === '추천')?.id || feasibleIds[0] || null,
  )
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [consents, setConsents] = useState({ notice: false, recipient: false, relay: false })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const isRelay = selected === 'relay'
  const liability = intake.declared_value || 500000
  const ready = consents.notice && consents.recipient && (!isRelay || consents.relay)
    && name.trim() && phone.trim()

  const combinedLine = useMemo(() => {
    if (!plan?.legs) return ''
    const probs = plan.legs.map((l) => (l.probability * 100).toFixed(1))
    return `${probs.join('% × ')}% = ${(plan.combined_probability * 100).toFixed(1)}%`
  }, [plan])

  async function accept() {
    setBusy(true)
    setError('')
    try {
      const r = await api.post('/orders', {
        origin: intake.origin, destination: intake.destination,
        deadline: intake.deadline, item: intake.item,
        declared_value: intake.declared_value, channel: selected,
        recipient_name: name, recipient_phone: phone,
        notice_consent: consents.notice, recipient_consent: consents.recipient,
        relay_consent: consents.relay,
      })
      onAccepted(r)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen pb-8">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-g200 bg-white px-3 py-3">
        <button onClick={onBack} className="px-1 text-[18px] text-g600">‹</button>
        <div className="text-[16px] font-bold text-g900">채널 비교</div>
        <span className="ml-auto text-[11px] text-g500">2/3 선택</span>
      </header>

      <div className="space-y-3 p-4">
        <div className="text-[13px] text-g600">
          {intake.origin} → {intake.destination} · {intake.item || '물품'} · {intake.deadline}까지
        </div>

        {/* 채널 카드 4장 */}
        <div className="space-y-2.5">
          {options.map((c) => (
            <ChannelCard
              key={c.id} card={c}
              selected={selected === c.id}
              onSelect={() => c.feasible && setSelected(c.id)}
            />
          ))}
        </div>

        {/* 3구간 릴레이 카드 — 곱 = 종합을 한 줄로 */}
        {plan?.legs && (
          <Card>
            <div className="mb-2 text-[15px] font-bold text-g900">3구간 릴레이 경로</div>
            <div className="space-y-2">
              {plan.legs.map((leg) => (
                <div key={leg.seq} className="flex items-center gap-2 text-[13px]">
                  <span className="min-w-0 flex-1 truncate text-g700">{leg.label}</span>
                  <span className="shrink-0 font-medium text-g800">
                    {leg.carrier_name || leg.train_no}
                  </span>
                  <span className="tnum shrink-0 text-g500">{leg.start_at}→{leg.end_at}</span>
                  <span className="tnum shrink-0 font-semibold text-g900">
                    {(leg.probability * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
            <div className="tnum mt-2 border-t border-g200 pt-2 text-[13px] font-semibold text-brand">
              {combinedLine}
            </div>
            {plan.legs.some((l) => l.fallback) && (
              <div className="mt-2 rounded-lg bg-warnbg p-2 text-[12px] text-warn">
                {plan.legs.find((l) => l.fallback).fallback_note}
              </div>
            )}
          </Card>
        )}

        {/* 수령인 */}
        <Card className="space-y-2">
          <div className="text-[15px] font-bold text-g900">수령인</div>
          <div className="flex gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="이름"
              className="w-full min-w-0 flex-1 rounded-field border border-g300 px-3 py-2.5 text-[16px] focus-ring" />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="연락처"
              className="w-full min-w-0 flex-1 rounded-field border border-g300 px-3 py-2.5 text-[16px] focus-ring" />
          </div>
        </Card>

        {/* 확률 고지 — 접지 않는다. 배상 한도까지 항상 보인다 */}
        <Card className="border border-brand-50 bg-brand-50/50">
          <div className="text-[14px] font-bold text-g900">확률 고지</div>
          <p className="mt-1 text-[13px] leading-5 text-g700">
            이 배송의 성공 확률은 계산 결과이며 보장이 아니에요. 도착 예정과 확률은 열차
            운행 상황에 따라 달라질 수 있어요. 지연·분실 시 배상 한도는{' '}
            <b className="tnum">{liability.toLocaleString()}원</b>
            {intake.declared_value ? ' (신고가액)' : ' (미신고 기본 한도)'}이에요.
            {screening?.findings?.map((f, i) => f.note && (
              <span key={i}><br />· {f.note}</span>
            ))}
          </p>
        </Card>

        {/* 동의 3종 — 항목을 묶지 않는다(법인 제공과 개인 제공은 다른 동의).
            '모두 동의'는 편의 기능일 뿐, 서버는 항목별로 검증한다 */}
        <Card className="space-y-2.5">
          <Consent
            checked={consents.notice && consents.recipient && (!isRelay || consents.relay)}
            onChange={(v) => setConsents({ notice: v, recipient: v, relay: v })}
            label={<b>모두 동의하기</b>}
          />
          <div className="border-t border-g100 pt-2.5 space-y-2.5">
            <Consent
              checked={consents.notice}
              onChange={(v) => setConsents((c) => ({ ...c, notice: v }))}
              label="위 확률·배상 한도 고지를 확인했어요"
            />
            <Consent
              checked={consents.recipient}
              onChange={(v) => setConsents((c) => ({ ...c, recipient: v }))}
              label="수령인 정보를 배송 목적으로 제공하는 데 동의해요"
            />
            {isRelay && (
              <Consent
                checked={consents.relay}
                onChange={(v) => setConsents((c) => ({ ...c, relay: v }))}
                label="시민 운반자(개인)에게 인계에 필요한 정보 제공에 동의해요"
              />
            )}
          </div>
        </Card>

        {error && <div className="rounded-lg bg-dangerbg p-3 text-[13px] text-danger">{error}</div>}

        <Button className="w-full py-4 text-[16px]" disabled={!ready || busy || !selected} onClick={accept}>
          {busy ? '접수하는 중…' : '이 조건으로 접수하기'}
        </Button>
        {!ready && (
          <div className="text-center text-[12px] text-g500">
            수령인 정보와 동의 항목을 채우면 접수할 수 있어요
          </div>
        )}
      </div>
    </div>
  )
}

function ChannelCard({ card, selected, onSelect }) {
  const [openFare, setOpenFare] = useState(false)
  const dead = !card.feasible
  return (
    <div
      role="button"
      onClick={onSelect}
      className={`rounded-card bg-white p-4 shadow-card transition-all
        ${dead ? 'opacity-55' : 'cursor-pointer'}
        ${selected ? 'ring-2 ring-brand' : ''}`}
    >
      <div className="flex items-center gap-2">
        <div className="text-[15px] font-bold text-g900">{card.name}</div>
        {card.badge && <Chip tone={card.badge === '추천' ? 'brand' : 'ok'}>{card.badge}</Chip>}
        {card.door_to_door && <Chip tone="mute">집앞→집앞</Chip>}
        <div className="tnum ml-auto text-[15px] font-bold text-g900">{card.fare_label}</div>
      </div>

      {dead ? (
        <div className="mt-2 text-[13px] text-g600">{card.blocked_reason}</div>
      ) : (
        <>
          <div className="mt-2 flex items-end gap-2">
            <div className="tnum text-[30px] font-bold leading-none tracking-[-0.04em] text-g900">
              {card.probability_label}<span className="text-[15px]">%</span>
            </div>
            {card.probability_note && (
              <span className="pb-0.5 text-[12px] text-g500">{card.probability_note}</span>
            )}
          </div>
          <ProbBar p={card.probability} className="mt-1.5" />
          <div className="tnum mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-[12px] text-g600">
            <span>접수 마감 {card.cutoff}</span>
            <span>도착 예정 {card.eta}</span>
            <span>{card.train_no}</span>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); setOpenFare(!openFare) }}
            className="mt-1.5 text-[12px] font-medium text-brand"
          >
            {openFare ? '운임 내역 닫기 ▾' : '운임 내역 보기 ▸'}
          </button>
          {openFare && (
            <div className="mt-1 space-y-0.5 border-t border-g100 pt-1.5">
              {card.fare_lines.map((l, i) => (
                <div key={i} className="flex justify-between text-[12px] text-g600">
                  <span>{l.label}</span>
                  <span className="tnum">{l.amount.toLocaleString()}원</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Consent({ checked, onChange, label }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <input
        type="checkbox" checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-5 w-5 shrink-0 accent-[#1266e5]"
      />
      <span className="text-[14px] leading-5 text-g800">{label}</span>
    </label>
  )
}

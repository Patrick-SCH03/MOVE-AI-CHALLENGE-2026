import React, { useEffect, useState } from "react";
import { api, won } from "../api";
import { Chip, Stat } from "../components/Primitives";
import RelayRoute from "../components/RelayRoute";
import CarrierSwap from "../components/CarrierSwap";

/* 2 / 3 — 채널 비교
   이용자가 실제로 고르는 것은 "어느 접수 채널로 KTX에 태울 것인가"다.
   비교 축은 셋뿐이다: 얼마나 확실한가 · 얼마인가 · 언제까지 접수하면 되는가. */

const SORTS = [
  { id: "guarantee", label: "보장 우선" },
  { id: "cheapest", label: "최저가" },
  { id: "latest", label: "가장 늦게 접수" },
];

function Bar({ value }) {
  return (
    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-chip bg-g100">
      <div
        className="h-full rounded-chip transition-[width] duration-200 ease-out"
        style={{
          width: `${Math.max(0, Math.min(1, value)) * 100}%`,
          background: "linear-gradient(90deg, var(--brand) 0%, var(--accent) 100%)",
        }}
      />
    </div>
  );
}


function ChannelCard({ ch, selected, onSelect }) {
  const disabled = !ch.feasible;
  return (
    <button
      onClick={() => !disabled && onSelect(ch.id)}
      disabled={disabled}
      aria-pressed={selected}
      className={`focus-ring w-full rounded-card border-2 bg-card p-4 text-left transition
        ${selected ? "border-brand" : "border-transparent"}
        ${disabled ? "opacity-55" : "active:bg-g100"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <p className="text-[16px] font-bold tracking-[-0.02em] text-ink">{ch.name}</p>
          {ch.badge && <Chip tone={ch.badge === "추천" ? "brand" : "ok"}>{ch.badge}</Chip>}
        </div>
        <div className="shrink-0 text-right">
          <p className="tnum text-[15px] font-bold text-ink">{ch.fare_label}</p>
          {ch.size_tier && (
            <p className="text-[11px] text-g500">규격 {ch.size_tier}</p>
          )}
        </div>
      </div>

      {/* 운임이 어디서 나온 값인지 보여 준다.
          총액만 띄우면 "그래서 왜 이 값인가"에 답이 없다.
          기본 운임은 KTX특송 공시 요율이고, 마지막 줄만 우리가 더한 것이다. */}
      {ch.fare_lines?.length > 1 && (
        <ul className="mt-2 space-y-0.5">
          {ch.fare_lines.map((l, i) => (
            <li key={i} className="tnum flex justify-between text-[12px] text-g600">
              <span className="min-w-0 truncate pr-2">{l.label}</span>
              <span className="shrink-0">{won(l.amount)}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex items-baseline justify-between">
        <p className="tnum text-[34px] font-bold leading-none tracking-[-0.04em] text-ink">
          {disabled ? "—" : ch.probability_label}
          {!disabled && <span className="ml-1 text-[15px] font-bold text-g500">%</span>}
        </p>
        <p className="text-[13px] text-g500">{disabled ? "선택 불가" : ch.probability_note}</p>
      </div>
      <Bar value={disabled ? 0 : ch.probability} />

      {/* 편성을 같이 적는다. 채널마다 도착 후 수령 시간이 달라 **탈 수 있는 열차가
          다르므로**, 같은 구간인데 마감·도착이 다르게 나오는 이유가 여기 있다. */}
      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3">
        <Stat label={ch.train_no ? `접수 마감 · ${ch.train_no}` : "접수 마감"} value={ch.cutoff} />
        <Stat label="도착 예정" value={ch.eta} />
        <Stat label="여유" value={`${ch.slack_min}분`} />
      </div>

      <p
        className={`mt-3 rounded-field px-3 py-2.5 text-[13px] leading-relaxed ${
          disabled ? "bg-dangerbg text-danger" : "bg-g100 text-g600"
        }`}
      >
        {disabled ? ch.blocked_reason || "지금은 선택할 수 없어요." : ch.note}
      </p>
    </button>
  );
}

/* 확률 고지 — 장식이 아니라 약관 요건이다.

   특송서비스 약관 제20조 2항 3호는 연착 시 운임의 25~50% 를 배상하도록 하되,
   "운송 상황에 따라 일부 지연될 수 있음을 사전에 고객에게 고지하였을 경우에는
   배상의 책임이 없음" 이라는 단서를 둔다.

   접수 확정 전에 이 문구가 화면에 있어야 그 요건이 충족된다.
   그래서 접을 수 없고, 접수 버튼과 같은 화면에 있어야 한다. */
function TermsNotice({ terms, declaredValue, open, onToggle }) {
  if (!terms) return null;
  const cap = declaredValue > 0 ? declaredValue : terms.liability_cap_undeclared;
  return (
    <div className="rounded-card border border-line bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-bold text-g700">접수 전 확인해 주세요</p>
        <button
          onClick={onToggle}
          aria-expanded={open}
          className="focus-ring shrink-0 rounded-chip bg-g100 px-2.5 py-1 text-[12px] font-bold text-g700"
        >
          {open ? "접기" : "내용 보기"}
        </button>
      </div>

      {/* 확률 고지는 접지 않는다.
          약관 제20조 ②3 단서는 "지연 가능성을 사전에 고지한 경우" 연착 배상을 면하게
          하는데, 눌러야 보이는 곳에 있으면 고지했다고 보기 어렵다.
          나머지(배상 한도·릴레이 책임·환불)는 접어 둔다 — 길어서 아무도 안 읽는다. */}
      <p className="mt-2 text-[12px] leading-relaxed text-g600">
        {terms.probability?.replace(/\*\*/g, "")}
      </p>
      <p className="tnum mt-1.5 text-[12px] leading-relaxed text-g600">
        손해배상 한도{" "}
        <b className="font-bold text-ink">{won(cap)}</b>
        {" · "}
        {declaredValue > 0 ? "신고가액 기준" : "가액 미신고 기준"}
      </p>

      {open && (
        <ul className="mt-3 space-y-1.5 border-t border-line pt-3 text-[12px] leading-relaxed text-g600">
          <li>&middot; {terms.relay}</li>
          <li>&middot; {terms.refund}</li>
          {terms.claim && <li>&middot; {terms.claim}</li>}
          {terms.liability && <li>&middot; {terms.liability}</li>}
        </ul>
      )}
    </div>
  );
}

/* 동의 — 수령인 정보를 입력하는 사람은 수령인이 아니다.

   발송인이 대신 적으므로 본인 동의가 아니다. 그 구멍을 "알리고 동의를 얻었다"는
   확인으로 메운다(약관 제12조 ④가 송하인에게 수하인 통지 책임을 지우는 것과 같다).

   두 항목을 묶지 않는 이유는 성격이 다르기 때문이다. 시민 운반은 그 정보가
   **개인**에게 간다 — 법인에게 넘기는 것과 같은 동의로 처리할 수 없다.

   문구는 서버가 준다. 화면에 적어 두면 두 화면이 다른 범위를 동의받게 되고,
   사고가 났을 때 무엇에 동의했는지 확정할 수 없다. */
function ConsentBlock({ items, value, onChange, onOpenDoc, allOn }) {
  if (!items?.length) return null;
  const toggleAll = () => {
    const next = { ...value };
    for (const c of items) next[c.id] = !allOn;
    onChange(next);
  };
  return (
    <div className="rounded-card bg-card shadow-card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[15px] font-bold tracking-[-0.02em] text-ink">동의가 필요해요</p>
        {items.length > 1 && (
          <button
            onClick={toggleAll}
            className={`focus-ring shrink-0 rounded-chip px-3 py-1.5 text-[12px] font-bold transition
              ${allOn ? "bg-brand text-white" : "bg-g100 text-g700"}`}
          >
            {allOn ? "전체 해제" : "전체 동의"}
          </button>
        )}
      </div>
      <ul className="mt-3 space-y-3">
        {items.map((c) => {
          const on = !!value[c.id];
          return (
            <li key={c.id}>
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) => onChange({ ...value, [c.id]: e.target.checked })}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--brand)]"
                />
                <span className="min-w-0">
                  <span className="block text-[14px] font-bold leading-snug text-ink">
                    {c.title}
                    <span className="ml-1 text-[12px] font-bold text-brand">필수</span>
                  </span>
                  <span className="mt-1 block text-[12px] leading-relaxed text-g600">
                    {c.body}
                  </span>
                  <span className="mt-1 block text-[11px] text-g500">{c.basis}</span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {onOpenDoc && (
        <div className="mt-3 flex gap-3 border-t border-line pt-3 text-[12px] font-semibold text-g600">
          <button onClick={() => onOpenDoc("service")} className="focus-ring underline">
            이용약관
          </button>
          <button onClick={() => onOpenDoc("privacy")} className="focus-ring underline">
            개인정보 처리방침
          </button>
        </div>
      )}
    </div>
  );
}

/* 배송은 두 사람의 일이다. 받는 사람이 없으면 도착 알림도 갈 곳이 없다.
   다만 접수를 막지는 않는다 — 안 적으면 발송인에게만 알림이 간다. */
function RecipientFields({ value, onChange }) {
  return (
    <div className="rounded-card bg-card shadow-card p-4">
      <p className="text-[15px] font-bold tracking-[-0.02em] text-ink">받는 분</p>
      <p className="mt-1 text-[13px] text-g500">
        입력하시면 도착 알림이 받는 분께도 갑니다. 비워 두셔도 접수돼요.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <input
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          placeholder="이름"
          aria-label="받는 분 이름"
          className="focus-ring min-h-[48px] rounded-field bg-g100 px-3 text-[16px] outline-none placeholder:text-g400"
        />
        <input
          value={value.phone}
          onChange={(e) => onChange({ ...value, phone: e.target.value })}
          placeholder="연락처"
          inputMode="tel"
          aria-label="받는 분 연락처"
          className="tnum focus-ring min-h-[48px] rounded-field bg-g100 px-3 text-[16px] outline-none placeholder:text-g400"
        />
      </div>
    </div>
  );
}

export default function ChannelCompare({
  intake, options, sort, onSort, selected, onSelect,
  recipient, onRecipient, onSubmit, submitting,
  plan, forcedCarriers, onSwapCarrier,
  consents, onConsents, onOpenDoc,
}) {
  const [terms, setTerms] = useState(null);
  const [consentMeta, setConsentMeta] = useState(null);

  useEffect(() => {
    api.terms().then(setTerms).catch(() => {});
    api.consents().then(setConsentMeta).catch(() => {});
  }, []);

  const [openDetail, setOpenDetail] = useState(false);
  const [openTerms, setOpenTerms] = useState(false);
  const chosen = options.find((c) => c.id === selected);

  /* 어떤 동의가 필요한지는 채널과 수령인 입력에 따라 달라진다.
     서버가 같은 규칙으로 한 번 더 막는다 — 화면만 막으면 API 를 직접 부르는 순간
     동의 없이 접수가 된다. */
  const p2p = consentMeta?.person_to_person_channels || [];
  const hasRecipient = !!(recipient?.name?.trim() || recipient?.phone?.trim());
  const needed = (consentMeta?.items || []).filter(
    (c) =>
      c.id === "notice_confirm" ||                                   // 언제나 필요
      (c.id === "recipient_notice" && hasRecipient) ||
      (c.id === "relay_third_party" && p2p.includes(selected))
  );
  const agreed = needed.length > 0 && needed.every((c) => consents?.[c.id]);
  const allOn = needed.length > 0 && agreed;

  return (
    <div>
      <div className="px-5 pt-1">
        <p className="text-[13px] text-g500">
          {intake?.origin} → {intake?.destination} · {intake?.item} 1개
        </p>
        <h2 className="mt-1.5 text-[24px] font-bold leading-[1.35] tracking-[-0.03em] text-ink">
          오늘 {intake?.deadline}까지
          <br />
          도착하려면
        </h2>

        {/* 정렬 — 무엇을 우선할지 고르게 한다 */}
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {SORTS.map((s) => {
            const on = sort === s.id;
            return (
              <button
                key={s.id}
                onClick={() => onSort(s.id)}
                className={`focus-ring shrink-0 rounded-chip px-4 py-2 text-[14px] font-bold transition
                  ${on ? "bg-g900 text-white" : "bg-card text-g600"}`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-3 space-y-3 px-5">
        {options.map((c) => (
          <ChannelCard key={c.id} ch={c} selected={selected === c.id} onSelect={onSelect} />
        ))}
        {/* 시민 운반은 3구간 릴레이다. 구간별 확률이 어떻게 곱해지는지
            궁금해지는 유일한 채널이므로 여기서만 상세를 연다. */}
        {selected === "relay" && plan?.feasible && (
          <div className="rounded-card bg-card shadow-card">
            <button
              onClick={() => setOpenDetail((v) => !v)}
              className="focus-ring flex w-full items-center justify-between px-4 py-4"
            >
              <span className="text-[15px] font-bold text-ink">구간별 확률 자세히 보기</span>
              <span className="text-[13px] font-medium text-g600">{openDetail ? "닫기" : "열기"}</span>
            </button>
            {openDetail && (
              <div className="space-y-3 px-1 pb-1">
                <RelayRoute plan={plan} />
                {onSwapCarrier && (
                  <CarrierSwap plan={plan} forced={forcedCarriers} onChange={onSwapCarrier} />
                )}
              </div>
            )}
          </div>
        )}

        {recipient && onRecipient && (
          <RecipientFields value={recipient} onChange={onRecipient} />
        )}

        <TermsNotice
          terms={terms}
          declaredValue={intake?.declared_value || 0}
          open={openTerms}
          onToggle={() => setOpenTerms((v) => !v)}
        />

        <ConsentBlock
          items={needed}
          value={consents || {}}
          onChange={onConsents}
          onOpenDoc={onOpenDoc}
          allOn={allOn}
        />
      </div>

      {/* 하단 CTA — fixed 가 아니라 sticky 로 둔다.
          모바일에서 키보드가 올라오면 position:fixed 요소가 키보드에 가리거나
          엉뚱한 위치에 붙는다. sticky 는 레이아웃을 따라 움직여 그 문제가 없다. */}
      <div className="sticky bottom-0 z-30 mt-3 bg-bg/95 px-5 pb-[calc(14px+env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto max-w-phone">
          <button
            onClick={onSubmit}
            disabled={!chosen || !chosen.feasible || submitting || !agreed}
            className="focus-ring min-h-[56px] w-full rounded-btn bg-brand text-[17px] font-bold text-white
              transition active:brightness-95 disabled:bg-g200 disabled:text-g400"
          >
            {submitting
              ? "접수 중이에요"
              : !chosen
              ? "채널을 선택해 주세요"
              : !agreed
              ? "위 내용에 동의해 주세요"
              : `${chosen.name}(으)로 접수하기`}
          </button>
        </div>
      </div>
    </div>
  );
}

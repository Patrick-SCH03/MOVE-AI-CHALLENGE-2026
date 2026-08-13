import React from "react";
import { pct, pct1 } from "../api";
import { Card, Chip, SectionHead } from "./Primitives";

/* 간선과 지선을 색으로 나눈다 (DESIGN.md §2 규칙 1).
   ②구간(KTX)은 brand, ①③구간(시민)은 accent. 이 구분이 서비스 구조를 설명한다. */
const legColor = (seq) => (seq === 2 ? "var(--brand)" : "var(--accent)");
const SEQ_MARK = { 1: "①", 2: "②", 3: "③" };

function ModeIcon({ mode, type }) {
  const m = type === "러너" || mode === "러닝" ? "🏃" : mode === "KTX" ? "🚄"
    : mode === "자전거" ? "🚲" : mode === "도보" ? "🚶" : "🚇";
  return <span aria-hidden="true">{m}</span>;
}

/* ── 확률 게이지 ──
   brand → accent 그라데이션. KORAIL 심볼의 색 언어와 동일하다. */
export function ProbabilityGauge({ value, label = "종합 성공확률", sub }) {
  const v = Math.max(0, Math.min(1, value || 0));
  const tone = v >= 0.85 ? "ok" : v >= 0.7 ? "warn" : "danger";
  const toneText = { ok: "안정적입니다", warn: "여유가 크지 않습니다", danger: "접수를 권하지 않습니다" }[tone];

  return (
    <div className="rounded-card bg-brand-50/60 p-4">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[12px] font-semibold text-sub">{label}</p>
          <p className="tnum mt-0.5 text-[34px] font-extrabold leading-none tracking-[-0.03em] text-brand-900">
            {pct1(v)}
          </p>
        </div>
        <Chip tone={tone}>{toneText}</Chip>
      </div>

      <div className="mt-3 h-2.5 w-full overflow-hidden rounded-chip bg-white">
        <div
          className="h-full rounded-chip transition-[width] duration-200 ease-out"
          style={{
            width: `${v * 100}%`,
            background: "linear-gradient(90deg, var(--brand) 0%, var(--accent) 100%)",
          }}
        />
      </div>
      {sub && <p className="mt-2 text-[12px] leading-relaxed text-sub">{sub}</p>}
    </div>
  );
}

/* ── 곱셈 관계 노출 ──
   성공판정기준: "구간별 확률과 종합 확률이 함께 제시되며, 곱셈 관계가 화면에서 확인된다." */
function MultiplyRow({ legs, combined }) {
  return (
    <div className="mt-3 rounded-btn border border-line bg-white px-3 py-2.5">
      <div className="tnum flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-[15px] font-bold">
        {legs.map((l, i) => (
          <React.Fragment key={l.seq}>
            <span style={{ color: legColor(l.seq) }}>{pct1(l.probability)}</span>
            {i < legs.length - 1 && <span className="text-mute">×</span>}
          </React.Fragment>
        ))}
        <span className="text-mute">=</span>
        <span className="text-brand-900">{pct1(combined)}</span>
      </div>
      <p className="mt-1.5 text-center text-[12px] text-sub">
        어느 한 구간이 늦으면 전체가 지연되므로 구간 확률은 곱해집니다
      </p>
    </div>
  );
}

function LegRow({ leg, last }) {
  const color = legColor(leg.seq);
  const who = leg.carrier_name || leg.train_no || "미배정";

  return (
    <li className="relative flex gap-3 pb-4 last:pb-0">
      {/* 연결선 */}
      {!last && (
        <span
          className="absolute left-[15px] top-9 bottom-1 w-0.5"
          style={{ background: "var(--line)" }}
          aria-hidden="true"
        />
      )}

      <div
        className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white ${
          leg.assigned === false ? "pattern-unassigned" : ""
        }`}
        style={{ background: leg.assigned === false ? "var(--mute)" : color }}
      >
        {SEQ_MARK[leg.seq]}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-[15px] font-bold text-ink">
            {leg.from_name} <span className="text-mute">→</span> {leg.to_name}
          </p>
          <span className="tnum shrink-0 text-[15px] font-extrabold" style={{ color }}>
            {pct1(leg.probability)}
          </span>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <Chip tone={leg.seq === 2 ? "brand" : "mute"} icon={<ModeIcon mode={leg.mode} type={leg.carrier_type} />}>
            {who}
            {leg.carrier_type ? ` · ${leg.carrier_type}` : ""}
          </Chip>
          <span className="tnum text-[13px] text-sub">
            {leg.start_at} → {leg.end_at}
          </span>
          {leg.distance_km ? (
            <span className="tnum text-[12px] text-mute">{leg.distance_km}km</span>
          ) : null}
        </div>

        {leg.match_reason && (
          <p className="mt-1 text-[12px] leading-relaxed text-mute">{leg.match_reason}</p>
        )}
        {leg.fallback_note && (
          <p className="mt-1 rounded-btn bg-warnbg px-2 py-1 text-[12px] font-medium text-warn">
            ⚠ {leg.fallback_note}
          </p>
        )}
      </div>
    </li>
  );
}

export default function RelayRoute({ plan }) {
  if (!plan?.feasible) return null;

  return (
    <Card className="p-4">
      <SectionHead eyebrow="STEP 3" title="릴레이 경로 구성" en="Relay route" />

      <div className="mb-3 flex flex-wrap items-center gap-1.5 text-[13px]">
        <Chip tone="brand">{plan.train_no}</Chip>
        <span className="text-sub">
          창구 접수 마감 <b className="tnum text-ink">{plan.desk_cutoff}</b>
        </span>
        <span className="text-mute">·</span>
        <span className="text-sub">
          도착 <b className="tnum text-ink">{plan.eta}</b>
        </span>
        {plan.slack_min > 0 && (
          <span className="tnum text-[12px] text-mute">데드라인까지 {plan.slack_min}분 여유</span>
        )}
      </div>

      <ol className="mt-1">
        {plan.legs.map((l, i) => (
          <LegRow key={l.seq} leg={l} last={i === plan.legs.length - 1} />
        ))}
      </ol>

      <MultiplyRow legs={plan.legs} combined={plan.combined_probability} />

      <div className="mt-3">
        <ProbabilityGauge
          value={plan.combined_probability}
          sub={`몬테카를로 시뮬레이션 ${Number(plan.iterations).toLocaleString("ko-KR")}회 결과입니다.`}
        />
      </div>

      {plan.fallback_used?.length > 0 && (
        <ul className="mt-3 space-y-1">
          {plan.fallback_used.map((f, i) => (
            <li key={i} className="rounded-btn bg-warnbg px-3 py-2 text-[13px] text-warn">
              {f}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

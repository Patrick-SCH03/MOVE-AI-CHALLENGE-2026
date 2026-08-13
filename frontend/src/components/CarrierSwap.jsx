import React, { useEffect, useState } from "react";
import { api } from "../api";
import { Card, Chip, SectionHead } from "./Primitives";

/* 시연 장면 2 — 같은 경로에서 운반자만 교체한다.

   신뢰도는 표시용 지표가 아니라 확률 계산의 입력값이다(기획서 5.2).
   여기서 사람을 바꾸면 구간 확률과 종합 확률이 함께 변한다.
   확률이 고정 수치가 아니라 실제 계산 결과임을 보이는 가장 직관적인 증거다.

   후보 목록은 전체 운반자가 아니라 **AI-2 매칭이 그 구간에 대해 산출한 후보**를 쓴다.
   전체를 나열하면 서울 구간에 부산 운반자가 뜨는 등, 매칭이 동작하지 않는 것처럼 보인다. */

function useLegCandidates(leg) {
  const [list, setList] = useState([]);

  useEffect(() => {
    if (!leg?.from_point || !leg?.to_point) return;
    let alive = true;
    api
      .match({
        from_lat: leg.from_point[0],
        from_lng: leg.from_point[1],
        to_lat: leg.to_point[0],
        to_lng: leg.to_point[1],
        need_at: leg.seq === 1 ? leg.end_at : leg.start_at,
      })
      .then((d) => alive && setList(d.candidates || []))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [leg?.from_point?.[0], leg?.to_point?.[0], leg?.start_at, leg?.end_at, leg?.seq]);

  return list;
}

function LegPicker({ leg, value, onChange }) {
  const candidates = useLegCandidates(leg);
  const eligible = candidates.filter((c) => c.eligible);
  const rejected = candidates.filter((c) => !c.eligible);

  return (
    <div className="rounded-btn border border-line p-3">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-[13px] font-bold text-ink">{leg.label}</p>
        <Chip tone="mute">현재 {leg.carrier_name || "미배정"}</Chip>
      </div>

      <select
        value={value || ""}
        onChange={(e) => onChange(leg.seq, e.target.value || null)}
        className="focus-ring min-h-[48px] w-full rounded-field bg-g100 px-3 text-[16px] outline-none"
      >
        <option value="">자동 배정 (최적 후보)</option>
        {eligible.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} · {c.type} · 신뢰도 {Math.round(c.reliability * 100)}% · 우회 {c.detour_km}km
          </option>
        ))}
        {rejected.length > 0 && (
          <optgroup label="배정 기준 미달 (참고)">
            {rejected.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.type} · 우회 {c.detour_km}km · 시간대 {Math.round(c.time_fit * 100)}%
              </option>
            ))}
          </optgroup>
        )}
      </select>

      {candidates.length === 0 && (
        <p className="mt-1.5 text-[11px] text-mute">이 구간의 후보를 불러오는 중입니다.</p>
      )}
    </div>
  );
}

export default function CarrierSwap({ plan, forced, onChange }) {
  if (!plan?.feasible) return null;
  const legs = plan.legs.filter((l) => l.seq !== 2); // ②구간은 열차라 교체 대상이 아니다

  return (
    <Card className="p-4">
      <SectionHead eyebrow="시연" title="운반자 교체" en="Swap carrier" />
      <p className="mb-3 text-[12px] leading-relaxed text-sub">
        경로는 그대로 두고 사람만 바꿔 보세요. 신뢰도가 확률 계산의 입력값이므로
        구간 확률과 종합 확률이 함께 달라집니다.
      </p>

      <div className="space-y-2">
        {legs.map((leg) => (
          <LegPicker key={leg.seq} leg={leg} value={forced?.[leg.seq]} onChange={onChange} />
        ))}
      </div>
    </Card>
  );
}

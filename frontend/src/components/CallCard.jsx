import React, { useEffect, useState } from "react";
import { won } from "../api";

/* 배차 콜

   목록에서 골라 담는 화면이 아니다. 지금 울리고 있고, 몇 초 안에 답해야 한다.
   그래서 카운트다운이 카드에서 가장 큰 요소다.

   시간이 남아 있다는 사실보다 **줄어들고 있다는 사실**이 행동을 만든다.
   숫자만 두면 안 읽히므로 원형 게이지를 같이 돌린다. */

function Ring({ remaining, total }) {
  const R = 26;
  const C = 2 * Math.PI * R;
  const ratio = Math.max(0, Math.min(1, remaining / (total || 1)));
  const urgent = remaining <= 7;

  return (
    <div className="relative h-[64px] w-[64px] shrink-0">
      <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
        <circle cx="32" cy="32" r={R} fill="none" stroke="var(--g200)" strokeWidth="5" />
        <circle
          cx="32" cy="32" r={R} fill="none"
          stroke={urgent ? "var(--danger)" : "var(--brand)"}
          strokeWidth="5" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - ratio)}
          style={{ transition: "stroke-dashoffset 1s linear" }}
        />
      </svg>
      <span
        className={`tnum absolute inset-0 flex items-center justify-center text-[20px] font-bold ${
          urgent ? "text-danger" : "text-ink"
        }`}
      >
        {remaining}
      </span>
    </div>
  );
}

export default function CallCard({ call, onRespond, busy }) {
  /* 서버가 준 남은 시간을 초 단위로 직접 깎는다.
     폴링 주기(3초)마다 숫자가 튀면 카운트다운으로 안 읽힌다. */
  const [left, setLeft] = useState(call.remaining_sec);

  useEffect(() => setLeft(call.remaining_sec), [call.id, call.remaining_sec]);
  useEffect(() => {
    const t = setInterval(() => setLeft((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(t);
  }, [call.id]);

  return (
    <div className="rounded-card border-2 border-brand bg-card p-4 shadow-pop">
      <div className="flex items-center gap-3">
        <Ring remaining={left} total={call.timeout_sec} />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-bold text-brand">
            운반 요청 {call.rank > 1 && `· ${call.rank}순위로 전달됨`}
          </p>
          <p className="mt-0.5 truncate text-[17px] font-bold tracking-[-0.02em] text-ink">
            {call.from_name} → {call.to_name}
          </p>
          <p className="tnum mt-0.5 text-[13px] text-g600">
            {call.need_at}까지 인계 · {call.item}
          </p>
        </div>
        <p className="tnum shrink-0 text-[17px] font-bold text-brand">{won(call.reward)}</p>
      </div>

      <div className="tnum mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-line pt-2.5 text-[12px] text-g600">
        <span>{call.seq === 1 ? "① 집앞 → 출발역" : "③ 도착역 → 집앞"}</span>
        <span>우회 {call.detour_km}km</span>
        <span className="truncate">{call.route}</span>
      </div>

      <div className="mt-3 grid grid-cols-[1fr_2fr] gap-2">
        <button
          onClick={() => onRespond(call, false)}
          disabled={busy}
          className="focus-ring min-h-[50px] rounded-btn bg-g100 text-[15px] font-bold text-g700 active:bg-g200 disabled:opacity-50"
        >
          거절
        </button>
        <button
          onClick={() => onRespond(call, true)}
          disabled={busy || left <= 0}
          className="focus-ring min-h-[50px] rounded-btn bg-brand text-[16px] font-bold text-white active:brightness-95 disabled:bg-g200 disabled:text-g500"
        >
          {left <= 0 ? "시간 초과" : "수락하기"}
        </button>
      </div>

      <p className="mt-2 text-[12px] leading-relaxed text-g600">{call.match_reason}</p>
    </div>
  );
}

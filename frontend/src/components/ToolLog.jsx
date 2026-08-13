import React, { useState } from "react";
import { SectionHead } from "./Primitives";

/* 도구 호출 로그 (기획서 8.4 · F-11)

   단순 대화형 응답이 아니라 규정 판정·매칭·확률 산출이 실제로 수행되었음을 가시화한다.
   데스크톱은 우측 고정, 모바일은 하단 접이식.

   호출 순서대로 60ms 간격으로 나타난다 — 순차 실행을 보이기 위함이다. */

const AI_COLOR = {
  "AI-1": "var(--brand-900)",
  "AI-2": "var(--brand)",
  "AI-3": "var(--brand-700)",
  "AI-4": "var(--accent)",
  "AI-5": "var(--brand-300)",
};

function Entry({ call, i }) {
  const [open, setOpen] = useState(false);
  const color = AI_COLOR[call.ai] || "var(--mute)";

  return (
    <li className="log-in" style={{ animationDelay: `${i * 60}ms` }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="focus-ring w-full rounded-btn border border-line bg-white px-3 py-2.5 text-left transition hover:bg-g100"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <span className="tnum text-[11px] font-bold text-mute">{String(call.seq).padStart(2, "0")}</span>
          <span
            className="rounded-chip px-1.5 py-0.5 text-[10px] font-bold text-white"
            style={{ background: color }}
          >
            {call.ai}
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">{call.tool}</span>
          <span className="tnum text-[11px] text-mute">{call.elapsed_ms}ms</span>
          <span className={`text-[10px] text-mute transition ${open ? "rotate-180" : ""}`}>▾</span>
        </div>
        {call.note && <p className="mt-1 pl-7 text-[11px] text-mute">{call.note}</p>}
      </button>

      {open && (
        <div className="mt-1 space-y-1.5 rounded-btn bg-[#0f172a] p-2.5 font-mono text-[11px] leading-relaxed">
          <div>
            <span className="text-[#7dd3fc]">in </span>
            <span className="text-[#e2e8f0] break-all">{JSON.stringify(call.input)}</span>
          </div>
          <div>
            <span className="text-[#86efac]">out</span>{" "}
            <span className="text-[#e2e8f0] break-all">{JSON.stringify(call.output)}</span>
          </div>
        </div>
      )}
    </li>
  );
}

export default function ToolLog({ calls, compact }) {
  const [openSheet, setOpenSheet] = useState(false);
  if (!calls?.length) return null;

  const body = (
    <ol className="space-y-1.5">
      {calls.map((c, i) => (
        <Entry key={c.seq} call={c} i={i} />
      ))}
    </ol>
  );

  if (!compact) {
    return (
      <div className="rounded-card bg-card shadow-card p-4">
        <SectionHead eyebrow="AGENT" title="도구 호출 로그" en="Tool call trace" />
        <p className="mb-3 text-[12px] leading-relaxed text-sub">
          에이전트가 호출한 도구와 순서입니다. 각 항목을 누르면 입력과 출력을 볼 수 있습니다.
        </p>
        {body}
      </div>
    );
  }

  /* 모바일 — 하단 접이식 */
  return (
    <>
      <button
        onClick={() => setOpenSheet(true)}
        className="focus-ring flex w-full items-center justify-between rounded-card border border-line bg-card px-4 py-3"
      >
        <span className="flex items-center gap-2 text-[13px] font-semibold text-ink">
          <span className="rounded-chip bg-brand px-1.5 py-0.5 text-[10px] font-bold text-white">
            {calls.length}
          </span>
          도구 호출 로그 보기
        </span>
        <span className="text-[11px] text-mute">
          {calls.map((c) => c.ai).filter((a) => a !== "—").join(" · ")}
        </span>
      </button>

      {openSheet && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={() => setOpenSheet(false)}>
          <div
            className="max-h-[78vh] overflow-y-auto rounded-t-[20px] bg-bg p-4 pb-[calc(16px+env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-chip bg-line" />
            <SectionHead eyebrow="AGENT" title="도구 호출 로그" en="Tool call trace" />
            {body}
          </div>
        </div>
      )}
    </>
  );
}

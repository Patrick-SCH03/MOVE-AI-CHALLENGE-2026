import React, { useEffect, useRef, useState } from "react";
import { won } from "../api";
import { Button, Chip, Spinner, VERDICT } from "../components/Primitives";

/* 1 / 3 — 접수하기
   대화로 받는다. 폼을 채우게 하지 않는다.
   부족한 항목이 있으면 한 번에 하나씩만 되묻는다. */

/* 샘플은 반드시 끝까지 도달하는 것만 둔다.
   눌렀는데 "특송 취급 열차가 없습니다"로 끝나면 그 자리에서 신뢰를 잃는다.
   (시드의 특송 취급 열차는 경부선·전라선 일부 편성뿐이다) */
const SAMPLES = [
  "오늘 저녁 7시까지 부산 서면으로 노트북 도착해야 해", // 결측 재질의 → 조건부 통과
  "강남에서 해운대로 도자기 화병 저녁 8시까지 40만원",   // 포장요건 · 네 채널 모두 선택 가능
  "서울역에서 대전으로 휘발유 한 통 오늘 안에",          // 금지품목 차단
];

function Bubble({ me, children }) {
  return (
    <div className={`flex ${me ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[78%] whitespace-pre-wrap rounded-[18px] px-4 py-2.5 text-[15px] leading-relaxed ${
          me ? "bg-brand text-white" : "bg-g100 text-ink"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

/* 도구 호출은 접힌 한 줄로만 알린다.
   대화 흐름을 끊지 않으면서도 계산이 실제로 돌았음을 보여주기 위함이다. */
function ToolPill({ calls, onOpen }) {
  const ai = calls.filter((c) => c.ai !== "—").length;
  return (
    <button
      onClick={onOpen}
      className="focus-ring flex w-full items-center gap-2 rounded-field border border-line bg-card px-4 py-2.5 text-left"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-ok" />
      <span className="text-[13px] font-medium text-g600">
        도구 {ai}개 호출 완료
      </span>
      <span className="ml-auto text-[12px] text-g500">보기 ›</span>
    </button>
  );
}

/* 규정·포장 판정 — 조항 번호를 칩으로 앞세운다.
   "무엇을 추가로 하면 접수되는가"가 본문이 되어야 한다. */
function ScreenCard({ screening }) {
  const v = VERDICT[screening.verdict] || VERDICT.PASS;
  const headline = {
    PASS: "접수 가능해요",
    CONDITIONAL: "접수 가능해요",
    REVIEW: "확인이 필요해요",
    BLOCKED: "접수할 수 없어요",
  }[screening.verdict];

  return (
    <div className="rounded-card border border-line bg-card p-4">
      <div className="flex items-center gap-2">
        <Chip tone={v.tone}>{v.label}</Chip>
        <p className="text-[16px] font-bold tracking-[-0.02em] text-ink">{headline}</p>
      </div>

      {screening.findings?.length > 0 && (
        <ul className="mt-3 space-y-2.5">
          {screening.findings.map((f, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="mt-0.5 shrink-0 rounded-md bg-brand-50 px-1.5 py-0.5 text-[11px] font-bold text-brand">
                {clauseNo(f.clause)}
              </span>
              <p className="text-[14px] leading-relaxed text-g700">
                {f.guidance || f.clause}
              </p>
            </li>
          ))}
        </ul>
      )}

      {screening.surcharge > 0 && (
        <p className="tnum mt-3 rounded-field bg-g100 px-3 py-2 text-[13px] text-g600">
          할증 {won(screening.surcharge)}이 더해져요.
        </p>
      )}
    </div>
  );
}

/* 안 된다고만 하면 이용자는 될 때까지 시각을 찍어 봐야 한다.
   실제로 가능한 도착 시각을 눌러서 바로 이어갈 수 있게 한다. */
function Suggestions({ items, onPick }) {
  if (!items?.length) return null;
  return (
    <div className="rounded-card border border-line bg-card p-4">
      <p className="text-[14px] font-bold text-ink">이 시각이면 보낼 수 있어요</p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {/* 버튼에는 **누르면 요청될 시각**(데드라인)을 쓴다.
            도착 예정만 크게 띄우고 데드라인을 보내고 있었더니, "16:20 도착"을
            눌렀는데 대화에는 "16:40까지"가 찍혔다. 누른 것과 찍힌 것이 다르면
            그 순간 화면을 못 믿게 된다. 도착 예정은 아래에 작게 붙인다. */}
        {items.map((s) => (
          <button
            key={s.deadline}
            onClick={() => onPick(`${s.deadline}까지`)}
            className="focus-ring rounded-chip bg-brand-50 px-3.5 py-2 text-left active:brightness-95"
          >
            <span className="block text-[14px] font-bold text-brand tnum">
              {s.deadline}까지
            </span>
            <span className="block text-[11px] text-brand/70 tnum">
              {s.eta} 도착
            </span>
          </button>
        ))}
      </div>
      <p className="mt-2.5 text-[12px] leading-relaxed text-g500">
        누르시면 그 시각을 기한으로 다시 계산해 드려요.
      </p>
    </div>
  );
}

function clauseNo(clause = "") {
  const m = clause.match(/제\s*\d+\s*조(\s*\d+\s*항)?/);
  return m ? m[0].replace(/\s+/g, " ") : "규정";
}

export default function ChatIntake({ messages, intake, screening, loading, onSend, toolCalls, onOpenLog }) {
  const [text, setText] = useState("");
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, loading, screening]);

  const submit = (e) => {
    e?.preventDefault();
    const v = text.trim();
    if (!v || loading) return;
    onSend(v);
    setText("");
  };

  return (
    <div className="flex min-h-[calc(100dvh-118px)] flex-col">
      <div className="flex-1 space-y-3 px-5 py-4">
        {messages.length === 0 && (
          <div className="space-y-2">
            {/* 여기가 어디인지 먼저 말한다. 전에는 아무 설명 없이 대화창이 떠서
                이용자가 무엇에 들어왔는지 알 수 없었다. */}
            <div className="mb-3 flex items-start gap-3 rounded-card bg-card p-4 shadow-card">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-tint text-[20px]" aria-hidden="true">
                💬
              </span>
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-[15px] font-bold text-ink">
                  AI 접수 도우미
                  <span className="rounded-chip bg-brand px-1.5 py-0.5 text-[10px] font-bold text-white">AI</span>
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-g600">
                  출발지 · 도착지 · 물건 · 도착 기한을 한 문장으로 말씀하시면
                  보낼 방법을 찾아 드려요. 빠진 게 있으면 하나씩 여쭤봅니다.
                </p>
              </div>
            </div>
            <p className="text-[14px] text-g500">이렇게 요청해보세요</p>
            {SAMPLES.map((s) => (
              <button
                key={s}
                onClick={() => onSend(s)}
                className="focus-ring flex w-full items-center justify-between gap-2 rounded-field bg-card px-4 py-3.5 text-left text-[14px] text-g700 active:bg-g100"
              >
                <span className="truncate">{s}</span>
                <span className="shrink-0 text-g500">›</span>
              </button>
            ))}
          </div>
        )}

        {messages.map((m, i) =>
          m.role === "tools" ? (
            <ToolPill key={i} calls={m.calls} onOpen={onOpenLog} />
          ) : m.role === "screening" ? (
            <ScreenCard key={i} screening={m.screening} />
          ) : m.role === "suggestions" ? (
            <Suggestions key={i} items={m.items} onPick={onSend} />
          ) : (
            <Bubble key={i} me={m.role === "user"}>
              {m.text}
            </Bubble>
          )
        )}

        {/* 처리 단계를 그대로 읊지 않는다.
            이용자가 알고 싶은 건 '무엇을 하는 중인가'가 아니라 '되는가'다. */}
        {loading && (
          <div className="px-1 py-1">
            <Spinner label="보낼 수 있는 방법을 찾고 있어요" />
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* 입력 — 하단 고정 */}
      <div className="sticky bottom-0 bg-bg/95 px-5 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <form onSubmit={submit} className="flex items-center gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="메시지 입력"
            aria-label="메시지 입력"
            size={8}
            className="focus-ring min-h-[50px] w-full min-w-0 flex-1 rounded-chip bg-g100 px-5 text-[16px] outline-none placeholder:text-[14px] placeholder:text-g400"
          />

          <button
            type="submit"
            disabled={loading || !text.trim()}
            aria-label="보내기"
            className="focus-ring flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-full bg-brand text-[20px] text-white disabled:bg-g200 disabled:text-g400"
          >
            ↑
          </button>
        </form>
      </div>
    </div>
  );
}

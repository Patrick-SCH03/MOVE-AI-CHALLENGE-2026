import React, { useEffect, useState } from "react";
import { api, won } from "../api";
import { Chip, Stat } from "../components/Primitives";

/* MY — 내 이용 현황과 설정.

   프로토타입이라 계정이 없다. 그래서 여기서 보여줄 수 있는 것은
   '이 기기에서 만든 접수'의 요약과, 역할 전환뿐이다.
   없는 기능을 있는 척 나열하지 않는다. */

export default function My({ name, onRename, onGoView, onGoLegal, onReset }) {
  const [rows, setRows] = useState(null);
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState(name || "");

  useEffect(() => {
    api.listOrders().then((d) => setRows(d.orders)).catch(() => setRows([]));
  }, []);

  const mine = rows || [];
  const done = mine.filter((r) => r.status === "COMPLETED");
  const spent = done.reduce((s, r) => s + r.fare, 0);

  return (
    <div className="space-y-3 px-5 pb-10">
      <div className="rounded-card bg-card shadow-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12px] font-bold text-g500">이름</p>
            {edit ? (
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="이름"
                className="focus-ring mt-1 min-h-[46px] w-full rounded-field bg-g100 px-3 text-[16px] outline-none"
              />
            ) : (
              <p className="mt-0.5 truncate text-[20px] font-bold tracking-[-0.02em] text-ink">
                {name || "이름 없음"}
              </p>
            )}
          </div>
          <button
            onClick={() => {
              if (edit) onRename(draft.trim());
              setEdit((v) => !v);
            }}
            className="focus-ring shrink-0 rounded-chip bg-g100 px-3 py-2 text-[13px] font-bold text-g700"
          >
            {edit ? "저장" : "수정"}
          </button>
        </div>
        <p className="mt-3 rounded-field bg-g100 px-3 py-2.5 text-[12px] leading-relaxed text-g500">
          제안용 프로토타입이라 계정이 없어요. 이름은 이 기기에만 저장됩니다.
        </p>
      </div>

      <div className="rounded-card bg-card shadow-card p-4">
        <h2 className="text-[16px] font-bold tracking-[-0.02em] text-ink">이용 현황</h2>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Stat variant="tile" label="전체 접수" value={`${mine.length}건`} />
          <Stat variant="tile" label="완료" value={`${done.length}건`} />
          <Stat variant="tile" label="누적 운임" value={won(spent)} />
        </div>
      </div>

      <div className="rounded-card bg-card shadow-card p-4">
        <h2 className="text-[16px] font-bold tracking-[-0.02em] text-ink">다른 화면으로</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-g500">
          이 서비스는 세 사람이 씁니다. 각자 다른 화면을 봐요.
        </p>
        <ul className="mt-3 divide-y divide-line">
          {[
            { id: "carrier", label: "운반자 화면", desc: "내 동선에 맞는 요청을 받고 인계해요" },
            { id: "ops", label: "운영자 화면", desc: "열차별 적재 현황과 단계 판정" },
          ].map((v) => (
            <li key={v.id}>
              <button
                onClick={() => onGoView(v.id)}
                className="focus-ring flex w-full items-center justify-between gap-2 py-3.5 text-left"
              >
                <div className="min-w-0">
                  <p className="text-[15px] font-bold text-ink">{v.label}</p>
                  <p className="mt-0.5 truncate text-[13px] text-g500">{v.desc}</p>
                </div>
                <span className="shrink-0 text-g500">›</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <button
        onClick={onGoLegal}
        className="focus-ring flex w-full items-center justify-between gap-2 rounded-card bg-card shadow-card p-4 text-left"
      >
        <div className="min-w-0">
          <p className="text-[15px] font-bold text-ink">약관 · 정책</p>
          <p className="mt-0.5 text-[13px] text-g500">
            이용약관 · 개인정보 처리방침 · 운반자 이용약관
          </p>
        </div>
        <span className="shrink-0 text-g500">›</span>
      </button>

      <button
        onClick={onReset}
        className="focus-ring w-full rounded-card bg-card shadow-card py-4 text-[15px] font-bold text-danger active:bg-g100"
      >
        이 기기 데이터 초기화
      </button>

      <div className="rounded-card bg-card shadow-card p-4">
        <div className="flex items-center gap-2">
          <Chip tone="mute">v1.0</Chip>
          <p className="text-[13px] text-g500">MOVE-AI CHALLENGE 2026</p>
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-g500">
          한국철도공사 제안 프로토타입입니다. 공식 서비스가 아니며 운임과 일부 수치는 가정치예요.
        </p>
      </div>
    </div>
  );
}


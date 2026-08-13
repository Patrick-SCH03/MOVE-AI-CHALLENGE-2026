import React, { useEffect, useRef, useState } from "react";
import { api } from "../api";

/* 장소 입력 시트

   자기 주소를 그대로 치는 사람이 대부분이다. 목록에서만 고르게 하면
   "우리 집"을 넣을 방법이 없고, 자유 입력만 두면 무엇으로 인식됐는지 알 수 없다.
   그래서 둘 다 둔다 — 검색 결과에서 고르거나, 친 그대로 쓰되
   시스템이 어디로 읽었는지 보여 주고 확인받는다. */

export default function PlacePicker({ title, initial = "", onPick, onClose }) {
  const [q, setQ] = useState(initial);
  const [items, setItems] = useState([]);
  const [resolved, setResolved] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!q.trim()) {
      setItems([]);
      setResolved(null);
      return;
    }
    const t = setTimeout(() => {
      api.places(q)
        .then((d) => {
          setItems(d.items || []);
          setResolved(d.resolved || null);
        })
        .catch(() => {});
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  const typedIsNew = resolved && !items.some((i) => i.name === q.trim());

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={onClose}>
      <div
        className="max-h-[86dvh] overflow-y-auto rounded-t-[22px] bg-card px-5 pb-[calc(16px+env(safe-area-inset-bottom))] pt-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-chip bg-g200" />
        <h2 className="text-[18px] font-bold tracking-[-0.02em] text-ink">{title}</h2>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim()) onPick(q.trim());
          }}
        >
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="주소 · 동 이름 · 역 이름"
            className="focus-ring mt-3 min-h-[52px] w-full rounded-field border border-g200 bg-g100 px-4 text-[16px] outline-none placeholder:text-g500"
          />
        </form>

        {typedIsNew && (
          <button
            onClick={() => onPick(q.trim())}
            className="focus-ring mt-2 flex w-full items-center gap-2 rounded-field bg-brand-50 px-4 py-3 text-left active:brightness-95"
          >
            <span className="min-w-0 flex-1 truncate text-[15px] font-bold text-brand">
              “{q.trim()}” 그대로 쓰기
            </span>
            <span className="shrink-0 text-[12px] font-medium text-brand">{resolved} 기준</span>
          </button>
        )}

        <ul className="mt-2 divide-y divide-line">
          {items.map((it) => (
            <li key={it.name}>
              <button
                onClick={() => onPick(it.name)}
                className="focus-ring flex w-full items-center gap-2 py-3.5 text-left active:bg-g100"
              >
                <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-g800">
                  {it.name}
                </span>
                <span className="shrink-0 rounded-chip bg-g100 px-2 py-0.5 text-[11px] font-bold text-g600">
                  {it.kind}
                </span>
              </button>
            </li>
          ))}
        </ul>

        {!q.trim() && (
          <p className="py-8 text-center text-[13px] leading-relaxed text-g600">
            도로명·지번 주소를 그대로 넣으셔도 돼요.
            <br />
            예) 서울시 강남구 테헤란로 152
          </p>
        )}
        {q.trim() && items.length === 0 && !resolved && (
          <p className="py-8 text-center text-[13px] text-g600">
            찾지 못했어요. 시·구 단위로 적어 주시겠어요?
          </p>
        )}
      </div>
    </div>
  );
}

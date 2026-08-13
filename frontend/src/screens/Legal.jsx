import React, { useEffect, useState } from "react";
import { api } from "../api";
import Markdown from "../components/Markdown";

/* 약관 · 처리방침.

   지금까지 온보딩과 접수 화면에 "이용약관 · 개인정보처리방침"이라는 **글자만** 있고
   눌러도 아무 일이 없었다. 동의는 받는데 무엇에 동의하는지 볼 수 없는 상태였다.
   본문은 서버가 내려준다 — 화면이 들고 있으면 앱을 새로 배포해야 조문이 바뀐다. */

export default function Legal({ docId, onOpen, onBack, audience }) {
  const [list, setList] = useState(null);
  const [doc, setDoc] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.documents(audience).then((d) => setList(d.documents)).catch(() => setList([]));
  }, [audience]);

  useEffect(() => {
    if (!docId) return setDoc(null);
    setDoc(null);
    setErr("");
    api.document(docId).then(setDoc).catch((e) => setErr(e.message));
  }, [docId]);

  if (docId) {
    return (
      <div className="px-5 pb-12">
        <button
          onClick={onBack}
          className="focus-ring -ml-1 py-2 text-[14px] font-semibold text-g600"
        >
          ‹ 약관 목록
        </button>
        {err && (
          <p className="rounded-card bg-dangerbg p-4 text-[13px] text-danger">{err}</p>
        )}
        {!doc && !err && (
          <div className="space-y-2 pt-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-4 animate-pulse rounded-chip bg-g100" />
            ))}
          </div>
        )}
        {/* 본문 첫머리에 제목과 시행일이 이미 있다. 여기서 또 쓰면 두 번 나온다. */}
        {doc && (
          <article className="rounded-card bg-card shadow-card p-5">
            <Markdown text={doc.body} />
          </article>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3 px-5 pb-12">
      <div className="rounded-card bg-card shadow-card p-4">
        <p className="text-[13px] leading-relaxed text-g600">
          제안 프로토타입의 초안입니다. 실제 시행 전에는 법률·노무 검토가 필요합니다.
        </p>
      </div>

      <ul className="divide-y divide-line rounded-card bg-card shadow-card">
        {(list || []).map((d) => (
          <li key={d.id}>
            <button
              onClick={() => onOpen(d.id)}
              className="focus-ring flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
            >
              <div className="min-w-0">
                <p className="text-[15px] font-bold text-ink">{d.title}</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-g500">{d.summary}</p>
              </div>
              <span className="shrink-0 text-g500">›</span>
            </button>
          </li>
        ))}
        {list && list.length === 0 && (
          <li className="px-4 py-6 text-center text-[13px] text-g500">
            문서를 불러오지 못했어요.
          </li>
        )}
      </ul>
    </div>
  );
}

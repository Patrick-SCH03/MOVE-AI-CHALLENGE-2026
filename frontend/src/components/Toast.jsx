import React, { createContext, useCallback, useContext, useState } from "react";

/* 토스트

   alert() 는 브라우저 UI라 서비스 밖으로 이용자를 끌어낸다.
   확인 버튼을 누를 때까지 화면이 멈추고, 모바일에서는 특히 이질적이다.
   실패는 화면 안에서 조용히 알리고, 이용자는 하던 일을 계속할 수 있어야 한다. */

const ToastCtx = createContext(() => {});

export function useToast() {
  return useContext(ToastCtx);
}

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);

  const show = useCallback((message, tone = "info") => {
    const id = Math.random().toString(36).slice(2);
    setItems((v) => [...v, { id, message, tone }]);
    setTimeout(() => setItems((v) => v.filter((x) => x.id !== id)), 3200);
  }, []);

  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 px-5 pb-[calc(20px+env(safe-area-inset-bottom))]"
        role="status"
        aria-live="polite"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className={`toast-in pointer-events-auto w-full max-w-[420px] rounded-field px-4 py-3.5 text-[14px] font-medium leading-relaxed shadow-pop ${
              t.tone === "error"
                ? "bg-danger text-white"
                : t.tone === "success"
                ? "bg-g900 text-white"
                : "bg-g900 text-white"
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

import React from "react";

/* 하단 탭바 — 4탭.

   전에는 코레일톡처럼 가운데에 돌출 '보내기' 버튼을 뒀다. 그런데 코레일톡은
   홈이 대시보드고 돌출 버튼이 예매라는 **다른 화면**으로 간다. 우리는 홈 자체가
   접수 화면이라(폼이 홈 최상단에 있다) 보내기가 갈 곳이 홈밖에 없었다 —
   onSend 와 onTab("home") 이 같은 함수를 부르고 있었다. 목적지가 같은 버튼을
   화면 한가운데에 제일 크게 두면, 그건 기능이 아니라 장식이다.

   덤으로 5칸 중 한 칸이 죽어 있던 것도 사라져 탭 폭이 넓어진다. */

const ICONS = {
  home: (
    <path d="M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5" strokeLinecap="round" strokeLinejoin="round" />
  ),
  history: (
    <>
      <path d="M4 6h16M4 12h16M4 18h10" strokeLinecap="round" />
    </>
  ),
  carrier: (
    <>
      <circle cx="12" cy="7" r="3.2" />
      <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" strokeLinecap="round" />
    </>
  ),
  my: (
    <>
      <circle cx="12" cy="8" r="3.4" />
      <path d="M4.5 20c0-3.9 3.4-6.5 7.5-6.5s7.5 2.6 7.5 6.5" strokeLinecap="round" />
    </>
  ),
};

function Icon({ name, active }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke={active ? "var(--brand)" : "var(--g500)"}
      strokeWidth="1.9"
      aria-hidden="true"
    >
      {ICONS[name]}
    </svg>
  );
}

export default function TabBar({ tab, onTab }) {
  const items = [
    { id: "home", label: "홈" },
    { id: "history", label: "내역" },
    { id: "carrier", label: "운반자" },
    { id: "my", label: "MY" },
  ];

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      aria-label="주요 화면"
    >
      <ul className="mx-auto flex max-w-phone">
        {items.map((it) => (
          <li key={it.id} className="relative flex-1">
            {/* 코레일톡은 선택된 탭 위에 짧은 파란 막대를 둔다.
                색만으로 구분하면 색각 이상에서 어느 탭인지 알 수 없다. */}
            {tab === it.id && (
              <span
                className="absolute left-1/2 top-0 h-[3px] w-9 -translate-x-1/2 rounded-chip bg-brand"
                aria-hidden="true"
              />
            )}
            <button
              onClick={() => onTab(it.id)}
              aria-current={tab === it.id ? "page" : undefined}
              className="focus-ring flex min-h-[58px] w-full flex-col items-center justify-center gap-1"
            >
              <Icon name={it.id} active={tab === it.id} />
              <span
                className={`text-[11px] font-bold ${
                  tab === it.id ? "text-brand" : "text-g500"
                }`}
              >
                {it.label}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

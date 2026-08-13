import React from "react";

/* ── 카드 ──
   토스는 그림자를 거의 쓰지 않는다. 회색 배경 위의 흰 면으로 분리한다. */
export function Card({ children, className = "" }) {
  return <section className={`rounded-card bg-card shadow-card ${className}`}>{children}</section>;
}

export function SectionHead({ eyebrow, title, en }) {
  return (
    <div className="mb-3">
      {eyebrow && (
        <p className="mb-1 text-[12px] font-bold tracking-[0.02em] text-brand">{eyebrow}</p>
      )}
      <h2 className="text-[18px] font-bold tracking-[-0.02em] text-ink">{title}</h2>
      {en && <p className="mt-0.5 text-[12px] font-medium text-g500">{en}</p>}
    </div>
  );
}

/* ── 버튼 ──
   토스: 높이 54, 라운드 14, 굵기 700, 전폭이 기본. */
export function Button({ children, variant = "primary", full, size = "md", className = "", ...rest }) {
  const sizes = {
    md: "min-h-[54px] px-5 text-[16px]",
    sm: "min-h-[44px] px-4 text-[14px]",
  }[size];
  const styles = {
    primary: "bg-brand text-white active:brightness-95 disabled:bg-g200 disabled:text-g400",
    ghost: "bg-g100 text-g700 active:bg-g200",
    tint: "bg-brand-50 text-brand active:brightness-95",
    line: "border border-g200 bg-card text-g700 active:bg-g100",
  }[variant];
  return (
    /* shrink-0 whitespace-nowrap 은 빼면 안 된다.
       입력칸(flex-1) 옆에 두면 버튼이 눌려서 "인계" 가 두 줄로 쪼개지고,
       좌우 패딩까지 그대로 남아 글자가 카드 밖으로 삐져나갔다. 실제로 그랬다. */
    <button
      className={`focus-ring inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap
        rounded-btn font-bold transition disabled:cursor-not-allowed
        ${sizes} ${styles} ${full ? "w-full" : ""} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ── 코레일톡의 화면 어휘 ──
   현행 앱을 이미 쓰는 사람이 우리 화면에서 새로 배울 것이 없어야 한다.
   그 앱이 반복해서 쓰는 다섯 가지를 여기 모아 둔다 — 화면마다 다시 만들면
   같은 요소가 화면마다 조금씩 달라진다. */

/* 가운데 정렬 제목, 앞머리만 파랑.
   "순천역 근처 주차 정보" / "용산역 편의 서비스" — 코레일톡이 섹션마다 쓰는 형태다.
   무엇에 대한 이야기인지(역·구간)를 색으로 먼저 알린다. */
export function KeyTitle({ keyword, children, className = "" }) {
  return (
    <h2 className={`text-center text-[19px] font-bold tracking-[-0.03em] text-ink ${className}`}>
      {keyword && <span className="text-brand">{keyword}</span>}
      {keyword && " "}
      {children}
    </h2>
  );
}

/* 세그먼트 — 옅은 파랑 트랙 위에 선택된 것만 진한 파랑 알약 */
export function Segmented({ items, value, onChange, className = "" }) {
  return (
    <div className={`flex gap-1 rounded-chip bg-tint p-1 ${className}`} role="tablist">
      {items.map((it) => {
        const on = it.id === value;
        return (
          <button
            key={it.id}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(it.id)}
            className={`focus-ring min-h-[42px] flex-1 rounded-chip text-[15px] font-bold transition
              ${on ? "bg-brand text-white shadow-card" : "text-brand"}`}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

/* 필터 칩 줄 — 선택된 것만 채우고 나머지는 테두리만 */
export function ChipRow({ items, value, onChange, className = "" }) {
  return (
    <div className={`flex gap-2 overflow-x-auto pb-1 ${className}`}>
      {items.map((it) => {
        const on = it.id === value;
        return (
          <button
            key={it.id}
            onClick={() => onChange(it.id)}
            aria-pressed={on}
            className={`focus-ring shrink-0 rounded-chip px-4 py-2 text-[14px] font-bold transition
              ${on ? "bg-brand text-white" : "border border-g300 bg-card text-g700 active:bg-g100"}`}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

/* 아이콘 타일 — 옅은 파랑 면 위의 그림.
   shape="tile" 은 둥근 사각형(역 편의 서비스), "circle" 은 원(이동·편의)이다. */
export function IconTile({ emoji, label, shape = "circle", disabled, onClick }) {
  const box =
    shape === "tile"
      ? "h-[74px] w-full rounded-[16px]"
      : "h-[58px] w-[58px] rounded-full";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="focus-ring flex flex-col items-center gap-1.5 disabled:opacity-40"
    >
      <span className={`flex items-center justify-center bg-tint text-[24px] ${box}`} aria-hidden="true">
        {emoji}
      </span>
      <span className={`text-[12px] font-medium ${disabled ? "text-g400" : "text-g700"}`}>
        {label}
      </span>
    </button>
  );
}

/* 숫자 하나를 오른쪽에 붙이는 옅은 파랑 알약 — "잔여 주차 0 / 180" */
export function InfoPill({ label, value }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-field bg-tint px-3 py-2 text-[13px] text-g600">
      {label}
      <b className="tnum font-bold text-brand">{value}</b>
    </span>
  );
}

export function Chip({ tone = "brand", children, icon }) {
  const tones = {
    brand: "bg-brand-50 text-brand",
    ok: "bg-okbg text-ok",
    warn: "bg-warnbg text-warn",
    danger: "bg-dangerbg text-danger",
    mute: "bg-g100 text-g600",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-chip px-2.5 py-1 text-[12px] font-bold ${tones[tone]}`}>
      {icon}
      {children}
    </span>
  );
}



/* 라벨 + 값 한 쌍.
   화면마다 따로 만들다 보니 Stat / Metric / Cell 세 이름으로 같은 것이 세 벌 있었다.
   variant 만 다르므로 하나로 합친다.
     plain  구분선 위에 얹는 값 (배경 없음)
     tile   회색 타일 (숫자를 강조할 때)
     big    큰 숫자 + 단위 */
export function Stat({ label, value, unit, variant = "plain", className = "" }) {
  const box = {
    plain: "",
    tile: "rounded-field bg-g100 px-3 py-2.5",
    big: "rounded-field bg-g100 px-3 py-2.5",
  }[variant];
  const size = variant === "big" ? "text-[20px]" : variant === "tile" ? "text-[17px]" : "text-[15px]";

  return (
    <div className={`${box} ${className}`}>
      {variant === "plain" && <p className="text-[12px] text-g600">{label}</p>}
      <p className={`tnum ${variant === "plain" ? "mt-0.5" : ""} ${size} font-bold tracking-[-0.02em] text-ink`}>
        {value}
        {unit && <span className="ml-0.5 text-[12px] font-bold text-g600">{unit}</span>}
      </p>
      {variant !== "plain" && <p className="mt-0.5 text-[12px] text-g600">{label}</p>}
    </div>
  );
}

export function Spinner({ label }) {
  return (
    <div className="flex items-center gap-2.5 text-[14px] text-g600">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-g200 border-t-brand" />
      {label}
    </div>
  );
}

/* 규격 타일용 라인 아이콘 — 이모지는 기기마다 렌더가 달라 시연이 흔들린다 */
const ICON_PATHS = {
  doc: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
  box: <><path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z" /><path d="M3.5 7.5 12 12l8.5-4.5" /><path d="M12 12v9" /></>,
  boxBig: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M9 12h6" /></>,
};

export function Icon({ name, size = 24, className = "" }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
         strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {ICON_PATHS[name]}
    </svg>
  );
}

export const VERDICT = {
  PASS: { tone: "ok", label: "통과", icon: "✓" },
  CONDITIONAL: { tone: "warn", label: "조건부", icon: "!" },
  REVIEW: { tone: "warn", label: "판단 유보", icon: "?" },
  BLOCKED: { tone: "danger", label: "접수 불가", icon: "×" },
};

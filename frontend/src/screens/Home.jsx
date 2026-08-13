import React, { useEffect, useRef, useState } from "react";
import { api, ro, won } from "../api";
import korailLogo from "../assets/korail-logo.svg";
import { Chip, Icon, IconTile, KeyTitle, Stat } from "../components/Primitives";
import PlacePicker from "../components/PlacePicker";

/* 홈

   운영 중인 물류 서비스의 홈이다. 처음 온 사람에게 사업을 설명하는 자리가 아니라,
   이미 쓰는 사람이 접수하고 상태를 확인하는 자리다.

   그래서 순서가 곧 빈도다.
     접수 → 내 배송 → 빠른 메뉴 → 운영 지표 → 공지 → 요금
   서비스 소개(3구간 구조도, 채널 설명문)는 표지(온보딩)로 옮겼다.

   레이아웃은 코레일톡 개선안의 홈 구조를 따른다 — 딥블루 헤더 위로 겹치는 접수 카드. */

/* 빠른 메뉴 — 코레일톡 '이동·편의'의 아이콘 격자와 같은 형태로 둔다.
   그 앱은 선으로 그린 아이콘이 아니라 색이 있는 그림을 옅은 파랑 원 위에 얹는다.
   같은 자리에 같은 모양이어야 두 화면이 한 앱으로 읽힌다. */
const QUICK = [
  { id: "track", label: "배송 조회", emoji: "📦" },
  /* 열차·적재 현황은 운영자 화면이라 여기서 보내지 않는다 (MY → 다른 화면으로 에서 연다) */
  { id: "carrier", label: "운반자 지원", emoji: "🚶" },
  { id: "fare", label: "요금 안내", emoji: "💳" },
  { id: "help", label: "고객센터", emoji: "🎧" },
];

/* 운영 공지 — 내용은 고정이고 날짜만 흐른다.
   날짜를 상수로 박아 두면 며칠 뒤에는 한 달 전 공지만 걸려 있는 화면이 된다. */
const NOTICES = [
  { tag: "운영", days: 2, text: "매주 화요일 02:00~04:00 정기점검 — 이 시간에는 접수가 중단됩니다" },
  { tag: "안내", days: 5, text: "특송 취급역 14개 — 서울 · 용산 · 광명 · 동탄 · 천안아산 · 오송 · 대전 · 동대구 · 경주 · 부산 · 광주송정 · 목포 · 여수엑스포 · 강릉" },
  { tag: "규정", days: 11, text: "신고가액 200만원 초과 물품은 시민 운반으로 접수되지 않습니다" },
];

/* KTX특송 공시 요율. 규격은 최장변·세변합 중 비싼 등급을 따른다. */
const SIZE_TABLE = [
  { name: "초소형 / 서류", spec: "20cm · 50cm", fare: 5000 },
  { name: "A", spec: "35cm · 80cm", fare: 8000 },
  { name: "B", spec: "50cm · 100cm", fare: 10000 },
  { name: "C", spec: "70cm · 120cm", fare: 14000 },
  { name: "D", spec: "100cm · 160cm", fare: 20000 },
  { name: "특수", spec: "180cm · 200cm", fare: 28000 },
];

const EXTRA_TABLE = [
  { name: "KTX특송 창구", spec: "역 → 역", fare: 1000 },
  { name: "역사 무인택배함", spec: "역 → 역", fare: 1000 },
  { name: "시민 운반", spec: "집앞 → 집앞", fare: 3000 },
  { name: "기사 방문 픽업", spec: "집앞 → 집앞", fare: 7000 },
];

function noticeDate(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

/* 자주 보내는 경로 — 지어낸 목록이 아니라 실제 내역에서 뽑는다 */
function useFavoriteLanes() {
  const [lanes, setLanes] = useState([]);
  useEffect(() => {
    api.listOrders()
      .then((d) => {
        const count = {};
        for (const o of d.orders) {
          if (o.status === "CANCELLED") continue;
          const key = `${o.origin}→${o.destination}`;
          count[key] = (count[key] || 0) + 1;
        }
        setLanes(
          Object.entries(count)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 4)
            .map(([k]) => {
              const [origin, destination] = k.split("→");
              return { origin, destination };
            })
        );
      })
      .catch(() => {});
  }, []);
  return lanes;
}

export default function Home({ onQuote, onTalk, onQuick, activeOrder, onOpenOrder, busy }) {
  const [live, setLive] = useState(null);
  const lanes = useFavoriteLanes();
  const fareRef = useRef(null);

  /* 접수에 필요한 네 가지를 여기서 다 받는다. 그래야 다음 화면이 바로 채널 비교다. */
  const [origin, setOrigin] = useState("");
  const [dest, setDest] = useState("");
  const [picking, setPicking] = useState(null);   // "origin" | "dest" | null
  const [when, setWhen] = useState("19:00");      // 도착 기한
  const [item, setItem] = useState("");
  const [value, setValue] = useState("");

  useEffect(() => {
    api.live().then(setLive).catch(() => {});
  }, []);

  const ready = !!(origin && dest && item.trim());

  /* 폼 값을 한 문장으로 만들어 같은 에이전트에 넘긴다.
     화면만 대화를 건너뛰는 것이고, 파싱·판정·경로·확률 도구는 그대로 다 돈다
     (도구 호출 로그도 그대로 남는다). */
  const begin = () => {
    if (!ready) return;
    // 지역 이름을 won 으로 두면 api 의 won() 을 가린다. 실제로 헷갈렸다.
    const valuePart = value ? ` ${Number(value).toLocaleString("ko-KR")}원짜리` : "";
    onQuote(`${origin}에서 ${dest}${ro(dest)} ${item.trim()}${valuePart} ${when}까지`);
  };

  const quick = (id) => {
    if (id === "fare") {
      // center 로 두면 섹션이 길어 제목이 화면 위로 잘려 나간다. 위쪽에 맞추고
      // scroll-mt 로 여백을 준다.
      fareRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    onQuick(id);
  };

  return (
    <div className="pb-4">
      {/* ── 헤더 ──
          코레일톡과 같은 밝은 파랑 + 오른쪽 위 따뜻한 빛. 짙은 남색으로 두었더니
          같은 회사 앱으로 보이지 않았다. */}
      <div
        className="px-5 pb-14 pt-[calc(14px+env(safe-area-inset-top))]"
        style={{ background: "var(--header)" }}
      >
        <div className="mx-auto max-w-phone">
          <div className="flex items-center gap-2">
            <img
              src={korailLogo}
              alt="KORAIL"
              className="h-[27px] w-auto"
              style={{ filter: "brightness(0) invert(1)" }}
            />
            <span className="ml-auto rounded-chip border border-white/60 px-3 py-1 text-[12px] font-bold text-white">
              당일배송
            </span>
          </div>
          <h1 className="mt-4 text-[22px] font-bold leading-[1.35] tracking-[-0.04em] text-white">
            역에 가지 않고 오늘 안에 보냅니다
          </h1>
          {/* 특일 배지 — 서버가 특일 API(한국천문연구원)로 판정. 공휴일엔
              시민 운반 매칭 가정이 달라진다는 사실을 접수 전에 알린다 */}
          {live?.special_day && (
            <span className="mt-2.5 inline-flex items-center gap-1.5 rounded-chip bg-white/15 px-3 py-1.5 text-[12px] font-bold text-white">
              오늘은 {live.special_day.name} — 시민 운반 매칭에 여유를 더 봐요
            </span>
          )}
        </div>
      </div>

      {/* ── 접수 ── */}
      <div className="mx-auto -mt-10 max-w-phone px-5">
        <div className="overflow-hidden rounded-card bg-card shadow-pop">
          {/* 코레일톡의 출발역/도착역 블록과 같은 구조로 둔다.
              그 앱을 이미 쓰는 사람이 새로 배울 것이 없어야 한다. */}
          <div className="flex items-start gap-2 px-4 pt-4">
            <div className="min-w-0 flex-1">
              <p className="text-center text-[13px] font-medium text-g600">출발지</p>
              <button
                onClick={() => setPicking("origin")}
                className="focus-ring mt-1 flex w-full items-baseline justify-center gap-1 rounded-field py-1 active:bg-g100"
              >
                <span
                  className={`min-w-0 truncate border-b-2 border-g300 text-[21px] font-bold tracking-[-0.03em] ${
                    origin ? "text-ink" : "text-g500"
                  }`}
                >
                  {origin || "선택"}
                </span>
                <span className="shrink-0 text-[14px] text-g500">&rsaquo;</span>
              </button>
            </div>

            <button
              onClick={() => { setOrigin(dest); setDest(origin); }}
              disabled={!origin && !dest}
              aria-label="출발지와 도착지 바꾸기"
              className="focus-ring mt-6 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-white transition active:brightness-95 disabled:bg-g200 disabled:text-g500"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 8h15l-3.5-3.5M20 16H5l3.5 3.5" />
              </svg>
            </button>

            <div className="min-w-0 flex-1">
              <p className="text-center text-[13px] font-medium text-g600">도착지</p>
              <button
                onClick={() => setPicking("dest")}
                className="focus-ring mt-1 flex w-full items-baseline justify-center gap-1 rounded-field py-1 active:bg-g100"
              >
                <span
                  className={`min-w-0 truncate border-b-2 border-g300 text-[21px] font-bold tracking-[-0.03em] ${
                    dest ? "text-ink" : "text-g500"
                  }`}
                >
                  {dest || "선택"}
                </span>
                <span className="shrink-0 text-[14px] text-g500">&rsaquo;</span>
              </button>
            </div>
          </div>

          {/* 코레일톡의 '가는날' 자리. 우리에게는 '언제까지 도착해야 하는가'다. */}
          <div className="mx-4 mt-3 flex items-center gap-3 rounded-field bg-g100 px-4 py-3">
            <span className="shrink-0 text-[13px] font-medium text-g600">도착 기한</span>
            <input
              type="time"
              value={when}
              step={600}
              onChange={(e) => setWhen(e.target.value)}
              className="focus-ring tnum ml-auto bg-transparent text-right text-[16px] font-bold text-ink outline-none"
              aria-label="오늘 몇 시까지 도착해야 하나요"
            />
            <span className="shrink-0 text-[14px] font-bold text-g700">까지</span>
          </div>

          {/* 품목은 접수에 반드시 필요한 값이다. 여기서 안 받으면 다음 화면에서
              챗봇이 "어떤 물품인가요?" 를 묻게 되는데, 폼을 다 채우고 넘어온 사람에게는
              그게 앞뒤가 안 맞는 질문으로 읽힌다. 네 칸이면 접수가 끝난다. */}
          <div className="mx-4 mt-2 flex items-center gap-3 rounded-field bg-g100 px-4 py-3">
            <span className="shrink-0 text-[13px] font-medium text-g600">보낼 물건</span>
            <input
              value={item}
              onChange={(e) => setItem(e.target.value)}
              placeholder="노트북, 서류…"
              aria-label="보낼 물건"
              className="focus-ring ml-auto min-w-0 flex-1 bg-transparent text-right text-[16px] font-bold text-ink outline-none placeholder:font-medium placeholder:text-g400"
            />
          </div>

          <div className="mx-4 mt-2 flex items-center gap-3 rounded-field bg-g100 px-4 py-3">
            <span className="shrink-0 text-[13px] font-medium text-g600">신고가액</span>
            <input
              value={value}
              onChange={(e) => setValue(e.target.value.replace(/[^\d]/g, ""))}
              inputMode="numeric"
              placeholder="선택 · 안 적으면 50만원 한도"
              aria-label="신고가액"
              className="tnum focus-ring ml-auto min-w-0 flex-1 bg-transparent text-right text-[16px] font-bold text-ink outline-none placeholder:text-[13px] placeholder:font-medium placeholder:text-g400"
            />
            {value && <span className="shrink-0 text-[14px] font-bold text-g700">원</span>}
          </div>

          {lanes.length > 0 && (
            <div className="mt-3 flex items-center gap-2 overflow-x-auto px-4 pb-0.5">
              <span className="shrink-0 text-[14px] text-warn" aria-hidden="true">&#9733;</span>
              {lanes.map((l) => (
                <button
                  key={`${l.origin}${l.destination}`}
                  onClick={() => { setOrigin(l.origin); setDest(l.destination); }}
                  className="focus-ring shrink-0 rounded-chip bg-g100 px-3 py-1.5 text-[13px] font-medium text-g700 active:bg-g200"
                >
                  {l.origin} &middot; {l.destination}
                </button>
              ))}
            </div>
          )}

          {/* 코레일톡은 [간편 예매] [열차 조회] 로 나뉜다. 같은 자리에 같은 형태로 둔다. */}
          <div className="mt-4 grid grid-cols-2">
            <button
              onClick={() => quick("fare")}
              className="focus-ring min-h-[54px] bg-brand-700 text-[17px] font-bold text-white transition active:brightness-95"
            >
              요금 안내
            </button>
            <button
              onClick={begin}
              disabled={!ready || busy}
              className="focus-ring min-h-[54px] bg-brand text-[17px] font-bold text-white transition
                active:brightness-95 disabled:bg-g300 disabled:text-white/70"
            >
              {busy ? "찾는 중이에요" : ready ? "보낼 방법 찾기" : "출발지 · 도착지 · 물건"}
            </button>
          </div>
        </div>

        {/* ── AI 접수 도우미 ──
            들어가는 문과 들어간 화면의 이름을 같게 둔다. 문에는 '챗봇',
            안에는 'AI 접수 도우미'라고 쓰여 있으면 같은 곳인지 알 수 없다.
            AI 대화는 **선택지**로 둔다. 전에는 [보내기] 가 곧장 대화창으로 들어가서,
            폼을 다 채운 사람에게 챗봇이 "어떤 물품인가요?" 를 다시 물었다.
            무엇으로 들어가는지도 알 수 없었다 — 버튼에 '보내기' 라고만 쓰여 있었으니까.
            이제 빠른 길은 폼이고, 대화는 이름과 설명을 달고 따로 선다. */}
        <button
          onClick={onTalk}
          className="focus-ring mt-3 flex w-full items-center gap-3 rounded-card bg-card p-4 text-left shadow-card active:bg-g100"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-tint text-[20px]" aria-hidden="true">
            💬
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="text-[15px] font-bold text-ink">AI 접수 도우미</span>
              <span className="rounded-chip bg-brand px-1.5 py-0.5 text-[10px] font-bold text-white">AI</span>
            </span>
            <span className="mt-0.5 block text-[13px] leading-relaxed text-g600">
              &ldquo;강남에서 부산 해운대로 노트북 저녁 7시까지&rdquo; 처럼 한 문장이면 돼요.
            </span>
          </span>
          <span className="shrink-0 text-g500">›</span>
        </button>

        {/* ── 진행 중인 배송 — 다시 들어오는 이유의 대부분이다 ── */}
        {activeOrder && (
          <button
            onClick={onOpenOrder}
            className="focus-ring mt-3 w-full rounded-card bg-card p-4 text-left shadow-card active:bg-g100"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[12px] font-bold text-brand">진행 중인 배송</p>
                <p className="mt-1 truncate text-[17px] font-bold tracking-[-0.02em] text-ink">
                  {activeOrder.origin} → {activeOrder.destination}
                </p>
                <p className="tnum mt-0.5 text-[13px] text-g600">
                  {activeOrder.item} · 도착 예정 {activeOrder.eta}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <Chip tone={activeOrder.status === "COMPLETED" ? "ok" : "brand"}>
                  {activeOrder.status_label}
                </Chip>
                <p className="mt-1.5 text-[13px] text-g500">보기 ›</p>
              </div>
            </div>
          </button>
        )}

        {/* ── 빠른 메뉴 ── */}
        <div className="mt-3 grid grid-cols-4 gap-1 rounded-card bg-card py-4 shadow-card">
          {QUICK.map((q) => (
            <IconTile key={q.id} emoji={q.emoji} label={q.label} onClick={() => quick(q.id)} />
          ))}
        </div>

        {/* ── 운영 현황 ── */}
        <section className="mt-3 rounded-card bg-card p-4 shadow-card">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-ok" />
            </span>
            <h2 className="text-[16px] font-bold tracking-[-0.02em] text-ink">운영 현황</h2>
          </div>

          {/* 불러오는 동안 "—건"을 띄우면 값이 0인 것처럼 읽힌다. 모양만 먼저 보여 준다. */}
          {live ? (
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Stat variant="big" value={live.today_count} unit="건" label="오늘 접수" />
              <Stat variant="big" value={live.in_transit} unit="건" label="운송 중" />
              <Stat
                variant="big"
                value={live.ontime_rate != null ? Math.round(live.ontime_rate * 1000) / 10 : "—"}
                unit="%"
                label="정시 도착률"
              />
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[0, 1, 2].map((i) => <div key={i} className="skeleton h-[62px]" />)}
            </div>
          )}
        </section>

        {/* ── 공지사항 ── */}
        <section className="mt-3 rounded-card bg-card p-4 shadow-card">
          <h2 className="text-[16px] font-bold tracking-[-0.02em] text-ink">공지사항</h2>
          <ul className="mt-1 divide-y divide-line">
            {NOTICES.map((n) => (
              <li key={n.text} className="flex items-start gap-2.5 py-3">
                <span className="mt-px shrink-0 rounded-chip bg-g100 px-2 py-0.5 text-[11px] font-bold text-g600">
                  {n.tag}
                </span>
                <p className="min-w-0 flex-1 text-[14px] leading-relaxed text-g800">{n.text}</p>
                <span className="tnum mt-0.5 shrink-0 text-[12px] text-g500">{noticeDate(n.days)}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* ── 요금 안내 ── */}
        <section ref={fareRef} className="mt-3 scroll-mt-4 rounded-card bg-card p-4 shadow-card">
          {/* 코레일톡이 섹션마다 쓰는 형태 — 가운데 정렬, 앞머리만 파랑 */}
          <KeyTitle keyword="KTX 당일배송" className="mb-3">요금 안내</KeyTitle>

          {/* 대표 규격 3종 타일 — 표보다 먼저 눈에 들어오는 손잡이 */}
          <div className="grid grid-cols-3 gap-2">
            {[
              ["doc", SIZE_TABLE[0]], ["box", SIZE_TABLE[2]], ["boxBig", SIZE_TABLE[4]],
            ].map(([icon, t]) => (
              <div key={t.name} className="flex flex-col items-center rounded-[16px] bg-tint/60 py-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-card text-brand shadow-card">
                  <Icon name={icon} size={22} />
                </span>
                <p className="mt-1.5 text-[13px] font-bold text-ink">{t.name}</p>
                <p className="tnum text-[12px] text-g600">{won(t.fare)}~</p>
              </div>
            ))}
          </div>

          <p className="mt-4 text-[13px] font-bold text-g700">기본 운임 · 규격별</p>
          <ul className="mt-1 divide-y divide-line">
            {SIZE_TABLE.map((c) => (
              <li key={c.name} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-[14px] font-medium text-g800">{c.name}</p>
                  <p className="tnum text-[12px] text-g500">최장변 {c.spec.split(" · ")[0]} · 세변합 {c.spec.split(" · ")[1]}</p>
                </div>
                <p className="tnum shrink-0 text-[15px] font-bold text-ink">{won(c.fare)}</p>
              </li>
            ))}
          </ul>

          <p className="mt-4 text-[13px] font-bold text-g700">보내는 방법 · 추가 운임</p>
          <ul className="mt-1 divide-y divide-line">
            {EXTRA_TABLE.map((c) => (
              <li key={c.name} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-[14px] font-medium text-g800">{c.name}</p>
                  <p className="text-[12px] text-g500">{c.spec}</p>
                </div>
                <p className="tnum shrink-0 text-[15px] font-bold text-ink">+{won(c.fare)}</p>
              </li>
            ))}
          </ul>

          <p className="mt-3 text-[12px] leading-relaxed text-g600">
            할증 — 10kg 초과 5kg당 2,000원 · 장거리 구간 1,000원 ·
            신고가액 50만원 초과 5,000~10,000원.
            <br />
            세변합 200cm · 최장변 180cm · 30kg · 300만원을 넘으면 접수되지 않습니다.
            <br />
            SRT 편성(동탄 출도착)은 소형 화물만, KTX 51·126은 초소형 화물만 실을 수 있어요.
          </p>
        </section>

        <p className="mt-4 text-center text-[12px] leading-relaxed text-g500">
          기본 운임·할증은 KTX특송 공시 요율입니다. 추가 운임은 제안값이에요.
        </p>
      </div>

      {/* 코레일톡 홈 아래쪽의 떠 있는 알약. 스크롤을 내리게 하는 손잡이다 —
          홈이 길어지면 아래에 무엇이 있는지 알 방법이 없다. */}
      <button
        onClick={() => quick("fare")}
        className="focus-ring fixed inset-x-0 bottom-[calc(84px+env(safe-area-inset-bottom))] z-20 mx-auto flex w-fit
          items-center gap-2 rounded-chip border border-brand bg-card px-5 py-2.5 text-[14px]
          font-bold text-ink shadow-pop lg:hidden"
      >
        규격별 요금과 보내는 방법
        <span className="text-brand" aria-hidden="true">&#8964;</span>
      </button>

      {picking && (
        <PlacePicker
          title={picking === "origin" ? "어디에서 보내시나요?" : "어디로 보내시나요?"}
          initial={picking === "origin" ? origin : dest}
          onPick={(v) => {
            (picking === "origin" ? setOrigin : setDest)(v);
            setPicking(null);
          }}
          onClose={() => setPicking(null)}
        />
      )}
    </div>
  );
}

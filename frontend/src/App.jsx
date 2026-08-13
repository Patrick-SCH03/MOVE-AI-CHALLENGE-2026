import React, { useCallback, useEffect, useState } from "react";
import { api, clearSession, loadSession, ro, saveSession } from "./api";
import korailLogo from "./assets/korail-logo.svg";
import ToolLog from "./components/ToolLog";
import TabBar from "./components/TabBar";
import OpsView from "./screens/OpsView";
import Onboarding from "./screens/Onboarding";
import Home from "./screens/Home";
import Legal from "./screens/Legal";
import ChatIntake from "./screens/ChatIntake";
import ChannelCompare from "./screens/ChannelCompare";
import Progress from "./screens/Progress";
import History from "./screens/History";
import CarrierApp from "./screens/CarrierApp";
import My from "./screens/My";
import useMediaQuery from "./useMediaQuery";
import { useToast } from "./components/Toast";

/* 화면 구조

   시작(온보딩)
     └ 홈 ─┬─ [보낼 방법 찾기]  홈 폼 ────────→ 2/3 채널 비교 → 3/3 진행 상황
           └─ [AI 접수 도우미]  1/3 AI 도우미 ─┘
        ├ 내역
        ├ 운반자
        └ MY

   접수하는 길이 둘이고, **기본은 폼이다.**
   전에는 [보내기] 가 곧장 대화창으로 들어갔다. 홈에서 출발지·도착지·기한을 다 채우고
   눌렀는데 챗봇이 "어떤 물품을 보내시나요?" 를 되물었고, 버튼에는 '보내기' 라고만
   쓰여 있어 무엇으로 들어가는지도 알 수 없었다.
   이제 홈에서 네 칸(출발지·도착지·기한·물건)을 다 받아 바로 채널 비교로 간다.
   대화는 이름(AI 접수 도우미)과 설명을 달고 따로 선다 — 값이 빠졌을 때만 여기로 온다.

   역할이 셋이라 화면도 셋이다. 발송인·운반자·운영자는 서로 다른 것을 본다. */

const STEPS = [
  { id: "intake", title: "AI 접수 도우미" },
  { id: "compare", title: "채널 비교" },
  { id: "progress", title: "진행 상황" },
];
const HOME = "home";

const TAB_TITLE = { history: "접수 내역", carrier: "내 운반 요청", my: "MY" };

export default function App() {
  const toast = useToast();
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  const [view, setView] = useState(
    () => new URLSearchParams(location.search).get("view") || "app"
  );
  const [session, setSession] = useState(loadSession);
  const [tab, setTab] = useState("home");
  const [step, setStep] = useState(HOME);
  const [activeOrder, setActiveOrder] = useState(null);
  /* 접수 흐름(1/3 → 2/3) 안에 있는가.
     진행 화면은 두 길로 들어온다 — 방금 접수했거나, 내역·홈 카드에서 열었거나.
     이걸 구분하지 않으면 뒤로가기가 **지나오지도 않은 단계**를 거슬러 올라간다.
     내역에서 건을 열고 뒤로 눌렀더니 채널 비교 → AI 접수 도우미 → 홈 이 나왔다. */
  const [inIntakeFlow, setInIntakeFlow] = useState(false);

  const [messages, setMessages] = useState([]);
  const [result, setResult] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);
  const [sort, setSort] = useState("guarantee");
  const [selected, setSelected] = useState(null);
  const [forced, setForced] = useState({});
  const [recipient, setRecipient] = useState({ name: "", phone: "" });
  const [consents, setConsents] = useState({});
  /* 약관 화면 — null 닫힘 · {doc:null} 목록 · {doc:"service"} 본문.
     탭으로 두지 않는다. 약관은 찾아 들어가는 화면이지 매일 여는 화면이 아니다. */
  const [legal, setLegal] = useState(null);
  const [orderId, setOrderId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [health, setHealth] = useState(null);

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth({ ok: false }));
  }, []);

  /* 새로고침해도 진행 중인 건은 남는다. 다만 곧바로 진행 화면으로 던지지 않고
     홈에 카드로 띄운다 — 앱을 여는 이유가 항상 그 건은 아니다. */
  useEffect(() => {
    if (!session.orderId) return;
    api.getOrder(session.orderId)
      .then((o) => {
        setOrderId(session.orderId);
        setActiveOrder(o.order);
      })
      .catch(() => {
        clearSession();
        setSession(loadSession());
      });
  }, [session.orderId]);

  const goView = (v) => {
    const u = new URL(location.href);
    if (v === "app") u.searchParams.delete("view");
    else u.searchParams.set("view", v);
    window.history.replaceState({}, "", u);
    setView(v);
  };

  const send = useCallback(
    async (utterance) => {
      setMessages((m) => [...m, { role: "user", text: utterance }]);
      setLoading(true);
      try {
        const r = await api.agent({
          utterance,
          history: chatHistory,
          prior: result?.intake || null,
          sort,
        });
        setResult(r);
        setChatHistory((h) => [...h, utterance].slice(-6));

        setMessages((m) => {
          const next = [...m, { role: "tools", calls: r.tool_calls }];
          /* 규정은 통과했는데 경로를 못 만든 경우 판정 카드를 띄우면
             "접수 가능해요" 아래에 실패 메시지가 붙어 모순으로 읽힌다. */
          const screenIsTheReason =
            r.stage !== "BLOCKED" || r.screening?.verdict === "BLOCKED";
          if (r.screening && screenIsTheReason) {
            next.push({ role: "screening", screening: r.screening });
          }
          next.push({ role: "bot", text: r.message });
          /* 막다른 길에서는 빠져나갈 시각을 함께 준다 */
          if (r.suggestions?.length) {
            next.push({ role: "suggestions", items: r.suggestions });
          }
          return next;
        });

        if (r.stage === "QUOTED") {
          const first = r.options.find((o) => o.feasible);
          setSelected(first?.id ?? null);
          setTimeout(() => setStep("compare"), 550);
        }
      } catch (e) {
        setMessages((m) => [...m, { role: "bot", text: e.message }]);
      } finally {
        setLoading(false);
      }
    },
    [chatHistory, result, sort]
  );

  const changeSort = async (s) => {
    setSort(s);
    const i = result?.intake;
    if (!i?.origin) return;
    try {
      const r = await api.agent({
        utterance: `${i.origin}에서 ${i.destination}${ro(i.destination)} ${i.item} ${i.deadline}까지`,
        prior: i,
        sort: s,
      });
      setResult(r);
    } catch { /* 정렬 실패는 화면을 막지 않는다 */ }
  };

  /* 시연 장면 2 — 같은 경로에서 운반자만 바꾼다 */
  const swapCarrier = async (seq, carrierId) => {
    const next = { ...forced };
    if (carrierId) next[seq] = carrierId;
    else delete next[seq];
    setForced(next);

    const i = result?.intake;
    if (!i?.origin) return;
    try {
      const r = await api.agent({
        utterance: `${i.origin}에서 ${i.destination}${ro(i.destination)} ${i.item} ${i.deadline}까지`,
        prior: i,
        sort,
        force_carriers: Object.keys(next).length ? next : null,
      });
      setResult(r);
    } catch { /* 교체 실패는 화면을 막지 않는다 */ }
  };

  const submitOrder = async () => {
    const i = result?.intake;
    if (!i || !selected) return;
    setSubmitting(true);
    try {
      const o = await api.createOrder({
        origin: i.origin,
        destination: i.destination,
        deadline: i.deadline,
        item: i.item,
        declared_value: i.declared_value || 0,
        channel: selected,
        recipient_name: recipient.name,
        recipient_phone: recipient.phone,
        notice_consent: !!consents.notice_confirm,
        recipient_consent: !!consents.recipient_notice,
        relay_consent: !!consents.relay_third_party,
        force_carriers: Object.keys(forced).length ? forced : null,
      });
      setOrderId(o.order.id);
      setActiveOrder(o.order);
      setSession(saveSession({ orderId: o.order.id }));
      // 접수가 끝나면 흐름도 끝난다. 뒤로가기가 채널 비교로 돌아가 봐야
      // 이미 접수된 건을 다시 고를 수는 없다.
      setInIntakeFlow(false);
      setStep("progress");
      toast("접수됐어요. 진행 상황을 알림으로 보내드릴게요.", "success");
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const resetFlow = () => {
    setMessages([]); setResult(null); setChatHistory([]);
    setSelected(null); setForced({}); setRecipient({ name: "", phone: "" });
    /* 동의는 건마다 다시 받는다. 남겨 두면 다음 건이 자동으로 동의된 것이 된다 —
       그 순간 "받았다"는 기록만 남고 실제로 확인한 사람은 없게 된다. */
    setConsents({});
  };

  const goHome = () => {
    resetFlow();
    setTab("home");
    setStep(HOME);
    setInIntakeFlow(false);
  };

  /* 뒤로가기 — **온 길로 돌아간다.**
     접수 흐름 안이면 한 단계 앞으로, 아니면 열었던 목록(내역·홈)으로. */
  const goBack = () => {
    if (inIntakeFlow && idx > 0) return setStep(STEPS[idx - 1].id);
    if (step === "progress") return setStep(HOME);   // tab 이 곧 온 길이다
    goHome();
  };

  const startSend = (seedUtterance) => {
    resetFlow();
    setTab("home");
    setStep("intake");
    setInIntakeFlow(true);
    if (seedUtterance) setTimeout(() => send(seedUtterance), 80);
  };

  /* 홈에서 폼을 다 채우고 온 경우 — 대화 화면을 거치지 않는다.
     같은 에이전트를 부르되 결과가 나오면 바로 채널 비교로 간다.
     빠진 값이 있어서 되묻기가 필요할 때만 대화로 넘긴다 (그때는 물어볼 게 실제로 있다). */
  const quoteDirect = async (utterance) => {
    resetFlow();
    setTab("home");
    setInIntakeFlow(true);
    setLoading(true);
    try {
      const r = await api.agent({ utterance, sort });
      setResult(r);
      setMessages([
        { role: "user", text: utterance },
        { role: "tools", calls: r.tool_calls },
        ...(r.screening ? [{ role: "screening", screening: r.screening }] : []),
        { role: "bot", text: r.message },
        ...(r.suggestions?.length ? [{ role: "suggestions", items: r.suggestions }] : []),
      ]);
      if (r.stage === "QUOTED") {
        setSelected(r.options.find((o) => o.feasible)?.id ?? null);
        setStep("compare");
      } else {
        setStep("intake");   // 되물어야 하거나 접수가 막힌 경우
      }
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  /* 내역에서 건을 연다. **탭을 내역에 그대로 둔다** —
     홈으로 옮기면 하단 탭이 홈을 가리키고, 뒤로가기도 홈으로 가 버린다.
     목록에서 들어갔으면 목록으로 나와야 한다. */
  const openOrder = (id) => {
    setOrderId(id);
    setSession(saveSession({ orderId: id }));
    api.getOrder(id).then((o) => setActiveOrder(o.order)).catch(() => {});
    setTab("history");
    setInIntakeFlow(false);
    setStep("progress");
  };

  /* 같은 조건으로 다시 보내기 — 대화를 처음부터 시키지 않는다 */
  const reorder = (row) => {
    const parts = [
      `${row.origin}에서 ${row.destination}${ro(row.destination)}`,
      row.item,
      row.declared_value ? `${row.declared_value.toLocaleString("ko-KR")}원짜리` : "",
      `${row.deadline}까지`,
    ].filter(Boolean);
    startSend(parts.join(" "));
  };

  const onQuick = (id) => {
    // 탭을 옮길 때 step 을 같이 되돌린다. 안 그러면 진행 화면을 보던 중에
    // '배송 조회'를 눌러도 그 진행 화면이 그대로 남는다.
    setStep(HOME);
    setInIntakeFlow(false);
    if (id === "track") return setTab("history");
    if (id === "carrier") return setTab("carrier");
    toast("고객센터는 준비 중이에요.");
  };

  const onboarded = !!session.onboarded;
  const inFlow = step !== HOME;
  const idx = STEPS.findIndex((s) => s.id === step);

  /* 약관은 어느 화면에서든 열릴 수 있다 — 온보딩에서도, 접수 직전에도.
     같은 화면을 두 벌 만들지 않도록 라우팅보다 먼저 가로챈다. */
  const legalScreen = legal && (
    <div className="min-h-dvh bg-bg">
      <header className="sticky top-0 z-20 border-b border-line bg-card">
        <div className="mx-auto flex max-w-phone items-center gap-2 px-5 pb-3 pt-[calc(12px+env(safe-area-inset-top))] lg:max-w-[1180px]">
          <img src={korailLogo} alt="KORAIL" className="h-[25px] w-auto" />
          <h1 className="ml-1 text-[17px] font-bold tracking-[-0.02em] text-ink">약관 · 정책</h1>
          <button
            onClick={() => setLegal(null)}
            className="focus-ring ml-auto text-[13px] font-semibold text-g500"
          >
            닫기
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-phone pt-3 lg:max-w-[1180px]">
        <Legal
          docId={legal.doc}
          audience={view === "carrier" ? "carrier" : undefined}
          onOpen={(id) => setLegal({ doc: id })}
          onBack={() => setLegal({ doc: null })}
        />
      </main>
    </div>
  );
  if (legalScreen) return legalScreen;

  /* ── 온보딩 ── */
  if (view === "app" && !onboarded) {
    return (
      <Onboarding
        onStart={(name) => setSession(saveSession({ onboarded: true, name }))}
        onLegal={(id) => setLegal({ doc: id })}
      />
    );
  }

  /* ── 본문 ── */
  const appBody =
    tab === "home"
      ? step === HOME
        ? <Home
            onQuote={quoteDirect}
            onTalk={() => startSend()}
            onQuick={onQuick}
            busy={loading}
            activeOrder={activeOrder}
            onOpenOrder={() => setStep("progress")}
          />
        : step === "intake"
        ? <ChatIntake
            messages={messages}
            intake={result?.intake}
            screening={result?.screening}
            loading={loading}
            onSend={send}
            toolCalls={result?.tool_calls}
            onOpenLog={() => setLogOpen(true)}
          />
        : step === "compare"
        ? <ChannelCompare
            intake={result?.intake}
            options={result?.options || []}
            sort={sort}
            onSort={changeSort}
            selected={selected}
            onSelect={setSelected}
            recipient={recipient}
            onRecipient={setRecipient}
            onSubmit={submitOrder}
            submitting={submitting}
            plan={result?.route}
            forcedCarriers={forced}
            onSwapCarrier={swapCarrier}
            consents={consents}
            onConsents={setConsents}
            onOpenDoc={(id) => setLegal({ doc: id })}
          />
        : <Progress orderId={orderId} onCancelled={() => {}} />
      : tab === "history"
      ? step === "progress"
        ? <Progress orderId={orderId} onCancelled={() => {}} />
        : <History onOpen={openOrder} onReorder={reorder} />
      : tab === "carrier"
      ? <CarrierApp />
      : <My
          name={session.name}
          onRename={(n) => setSession(saveSession({ name: n }))}
          onGoView={goView}
          onGoLegal={() => setLegal({ doc: null })}
          onReset={() => {
            clearSession();
            localStorage.removeItem("timeproof.carrier");
            setSession({});
            setOrderId(null);
            setActiveOrder(null);
            goHome();
          }}
        />;

  const body =
    view === "ops" ? <OpsView embedded />
    : view === "carrier" ? <CarrierApp />
    : appBody;

  /* 홈은 자체 딥블루 헤더를 갖는다. 그 위에 흰 헤더를 또 얹지 않는다. */
  const showWhiteHeader = view !== "app" || tab !== "home" || inFlow;

  return (
    <div className="min-h-dvh">
      {showWhiteHeader && (
        <header className="sticky top-0 z-20 border-b border-line bg-card">
          <div className="mx-auto flex max-w-phone items-center gap-2 px-5 pb-2 pt-[calc(12px+env(safe-area-inset-top))] lg:max-w-[1180px]">
            <img src={korailLogo} alt="KORAIL" className="h-[25px] w-auto" />
            {view !== "app" && (
              <span className="ml-2 rounded-chip bg-g900 px-2 py-0.5 text-[11px] font-bold text-white">
                {view === "ops" ? "운영자" : "운반자"}
              </span>
            )}
            {view !== "app" && (
              <button
                onClick={() => goView("app")}
                className="focus-ring ml-auto text-[13px] font-semibold text-g500"
              >
                닫기
              </button>
            )}
          </div>

          {view === "app" && inFlow && (
            <div className="mx-auto flex max-w-phone items-center gap-2 px-5 pb-3 lg:max-w-[1180px]">
              <button
                onClick={goBack}
                aria-label="뒤로"
                className="focus-ring -ml-1 px-1 text-[18px] text-g600"
              >
                ‹
              </button>
              <h1 className="text-[20px] font-bold tracking-[-0.03em] text-ink">
                {STEPS[idx].title}
              </h1>
              {/* 단계 표시는 접수 흐름 안에서만. 내역에서 연 건에 '3 / 3' 이
                  붙으면 하지도 않은 단계를 지나온 것처럼 읽힌다. */}
              <span className="tnum ml-auto text-[13px] font-medium text-g500">
                {inIntakeFlow ? `${idx + 1} / ${STEPS.length}` : ""}
              </span>
              <button onClick={goHome} className="focus-ring text-[13px] font-semibold text-g600">
                처음으로
              </button>
            </div>
          )}

          {view === "app" && !inFlow && tab !== "home" && (
            <div className="mx-auto max-w-phone px-5 pb-3 lg:max-w-[1180px]">
              <h1 className="text-[20px] font-bold tracking-[-0.03em] text-ink">
                {TAB_TITLE[tab]}
              </h1>
            </div>
          )}

          {view !== "app" && (
            <div className="mx-auto max-w-phone px-5 pb-3 lg:max-w-[1180px]">
              <h1 className="text-[20px] font-bold tracking-[-0.03em] text-ink">
                {view === "ops" ? "운영 현황" : "내 운반 요청"}
              </h1>
              <p className="mt-1 text-[13px] text-g500">
                {view === "ops"
                  ? "코레일 운영자용 화면입니다. 발송인에게는 보이지 않습니다."
                  : "원래 가시던 길에 얹히는 구간만 제안돼요."}
              </p>
            </div>
          )}
        </header>
      )}

      <main className="mx-auto max-w-phone pb-[calc(76px+env(safe-area-inset-bottom))] lg:max-w-[1180px] lg:pb-0">
        {view !== "app" ? (
          body
        ) : isDesktop ? (
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,360px)] gap-6 px-2 py-2">
            <div key={tab + step} className="screen-in min-w-0">{body}</div>
            <aside className="pr-4 pt-2">
              <div className="sticky top-24">
                {result?.tool_calls?.length ? (
                  <ToolLog calls={result.tool_calls} />
                ) : (
                  <div className="rounded-card bg-card shadow-card p-4 text-[13px] leading-relaxed text-g500">
                    접수를 시작하면 에이전트가 호출한 도구와 순서가 여기에 기록돼요.
                  </div>
                )}
              </div>
            </aside>
          </div>
        ) : (
          <div key={tab + step} className="screen-in">{body}</div>
        )}

        {view !== "app" && (
          <footer className="px-5 py-8 text-center text-[12px] leading-relaxed text-g500">
            MOVE-AI CHALLENGE 2026 · 한국철도공사 제안 프로토타입
            <br />
            공식 서비스가 아니며, 운임과 일부 수치는 가정치입니다.
          </footer>
        )}
      </main>

      {view === "app" && (
        <TabBar
          /* 접수 흐름 중에는 어느 탭도 아니다. 내역에서 연 진행 화면은
             여전히 '내역'이므로 그때는 탭이 켜져 있어야 한다. */
          tab={inIntakeFlow ? "" : tab}
          onTab={(t) => {
            resetFlow();
            setStep(HOME);
            setInIntakeFlow(false);
            setTab(t);
          }}
        />
      )}

      {logOpen && !isDesktop && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40"
          onClick={() => setLogOpen(false)}
        >
          <div
            className="max-h-[80dvh] overflow-y-auto rounded-t-[22px] bg-bg p-4 pb-[calc(16px+env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-chip bg-g200" />
            {result?.tool_calls?.length ? <ToolLog calls={result.tool_calls} /> : null}
          </div>
        </div>
      )}

      {/* 시연 모드 띠는 사용자 요청으로 뺐다. 기준 시각이 고정돼 있다는 사실 자체는
          GET /api/health 의 demo_time 으로 계속 확인할 수 있다. */}

      {health && !health.ok && (
        <div className="fixed inset-x-0 bottom-0 z-40 bg-danger px-4 py-2 text-center text-[13px] text-white">
          서버에 연결할 수 없어요. 백엔드가 실행 중인지 확인해 주세요.
        </div>
      )}
    </div>
  );
}

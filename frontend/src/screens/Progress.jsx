import React, { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { ampm, api, pct, won } from "../api";
import korailLogo from "../assets/korail-logo.svg";
import { Button, Chip, Spinner } from "../components/Primitives";
import { useToast } from "../components/Toast";

/* 3 / 3 — 진행 상황

   접수하고 끝나는 서비스는 없다. 여기서 이용자가 할 수 있어야 하는 것:
     · 지금 어디쯤인지 안다
     · 알림이 제시한 대안을 실제로 실행한다
     · 필요하면 취소한다
     · 받는 사람에게 넘긴다 */

const STEPS = [
  { id: "ACCEPTED", label: "접수" },
  { id: "PICKED_UP", label: "수취" },
  { id: "ON_TRAIN", label: "운송" },
  { id: "COMPLETED", label: "수령" },
];

const ARROW = { up: "▲", down: "▼" };

function Stepper({ status }) {
  const idx = STEPS.findIndex((s) => s.id === status);
  const done = status === "COMPLETED";
  return (
    <div className="flex items-center gap-1">
      {STEPS.map((s, i) => {
        const on = i <= idx;
        return (
          <React.Fragment key={s.id}>
            <div className="flex flex-col items-center gap-1">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                  on ? "bg-brand text-white" : "bg-g200 text-g600"
                }`}
              >
                {on && (i < idx || done) ? "✓" : i + 1}
              </span>
              <span className={`text-[11px] font-bold ${on ? "text-brand" : "text-g500"}`}>
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <span className={`mb-4 h-0.5 flex-1 ${i < idx ? "bg-brand" : "bg-g200"}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function Trend({ value, trend }) {
  const tone = trend === "down" ? "text-danger" : trend === "up" ? "text-ok" : "text-g600";
  return (
    <div className="mt-3 border-t border-line pt-3">
      <div className="flex items-center gap-1.5">
        <span className="text-[13px] text-g500">성공확률</span>
        <span className={`tnum text-[17px] font-bold ${tone}`}>{pct(value)}</span>
        {ARROW[trend] && <span className={`text-[12px] ${tone}`}>{ARROW[trend]}</span>}
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-chip bg-g100">
        <div
          className="h-full rounded-chip transition-[width] duration-300 ease-out"
          style={{
            width: `${value * 100}%`,
            background:
              trend === "down"
                ? "var(--danger)"
                : "linear-gradient(90deg, var(--brand), var(--accent))",
          }}
        />
      </div>
    </div>
  );
}

/* 알림이 제시한 대안은 눌러서 실행할 수 있어야 한다.
   계산해서 제안만 하고 실행 수단이 없으면 그 계산은 장식이 된다. */
function NotificationCard({ n, onAct, acting }) {
  const actionable = n.type === "DELAY" && n.action;
  return (
    <li className="rounded-card bg-card shadow-card p-4">
      <div className="flex items-center gap-2">
        <img src={korailLogo} alt="" className="h-[13px] w-auto" aria-hidden="true" />
        <p className="text-[15px] font-bold tracking-[-0.02em] text-ink">{n.title}</p>
        <span className="tnum ml-auto text-[12px] text-g500">{n.at}</span>
      </div>

      <p className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed text-g700">{n.body}</p>

      {n.probability != null && <Trend value={n.probability} trend={n.trend} />}

      {n.action && (
        <div
          className={`mt-3 rounded-field px-3.5 py-3 ${
            actionable ? "bg-dangerbg" : "bg-brand-50"
          }`}
        >
          <p
            className={`text-[14px] font-medium leading-relaxed ${
              actionable ? "text-danger" : "text-brand"
            }`}
          >
            {n.action}
          </p>
          {actionable && (
            <Button
              size="sm"
              full
              className="mt-2.5"
              onClick={onAct}
              disabled={acting}
            >
              {acting ? "바꾸는 중" : "도착역에서 직접 받을게요"}
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

function QR({ text, size = 120 }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && text) {
      QRCode.toCanvas(ref.current, text, {
        width: size,
        margin: 1,
        color: { dark: "#191F28", light: "#FFFFFF" },
      }).catch(() => {});
    }
  }, [text, size]);
  return <canvas ref={ref} className="rounded-field" aria-label="인계 QR 코드" />;
}

function HandoverRow({ orderId, leg, onDone }) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [openQR, setOpenQR] = useState(false);

  const submit = async () => {
    setBusy(true);
    setErr("");
    try {
      await api.handover({ order_id: orderId, seq: leg.seq, code: code.trim() });
      setCode("");
      onDone();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="border-t border-line py-3 first:border-t-0 first:pt-0">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-bold text-ink">{leg.label}</p>
          <p className="tnum truncate text-[12px] text-g500">
            {leg.carrier_name || leg.train_no} · {leg.start_at} → {leg.end_at}
          </p>
        </div>
        {leg.handed_over ? (
          <Chip tone="ok">완료</Chip>
        ) : leg.fallback ? (
          <Chip tone="brand">대체 경로</Chip>
        ) : leg.accepted ? (
          <Chip tone="mute">대기</Chip>
        ) : (
          <Chip tone="warn">수락 대기</Chip>
        )}
      </div>

      {/* 시민이 아니라 기사가 가게 된 구간은 그 이유를 말한다.
          이름만 '픽업 기사'로 바뀌면 이용자는 자기가 고른 것이 언제 왜
          바뀌었는지 알 수 없다. */}
      {leg.fallback && leg.fallback_note && !leg.handed_over && (
        <p className="mt-2 rounded-field bg-brand-50 px-3 py-2 text-[12px] leading-relaxed text-brand">
          {leg.fallback_note}
        </p>
      )}

      {!leg.handed_over && leg.accepted && (
        <>
          <div className="mt-2.5 flex gap-2">
            {/* min-w-0 · size=6 을 빼면 안 된다.
                input 은 기본 크기(약 20자)를 갖고 있고 flex 항목의 min-width 는
                auto 라서, flex-1 을 줘도 그 아래로 줄지 않는다. 좁은 화면
                (320px)이나 글자 크기를 키운 기기에서 줄 전체가 카드보다 넓어지고
                오른쪽의 '인계' 버튼이 카드 밖으로 밀려났다 — 실제로 그랬다. */}
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              size={6}
              placeholder="6자리 인계 코드"
              className="tnum focus-ring min-h-[46px] w-full min-w-0 flex-1 rounded-field bg-g100 px-3 text-[16px] tracking-[0.2em] outline-none placeholder:tracking-normal placeholder:text-g400"
            />
            <Button size="sm" onClick={submit} disabled={busy || code.length !== 6}>
              {busy ? "확인" : "인계"}
            </Button>
          </div>
          <button
            onClick={() => setOpenQR((v) => !v)}
            className="focus-ring mt-2 text-[13px] font-semibold text-brand"
          >
            {openQR ? "QR 닫기" : "QR 보기"}
          </button>
          {openQR && (
            <div className="mt-2 flex items-center gap-3 rounded-field bg-g100 p-3">
              <QR text={`${orderId}:${leg.seq}:${leg.handover_code}`} />
              <div className="min-w-0">
                <p className="text-[12px] leading-relaxed text-g500">
                  양측이 서로의 QR을 스캔합니다. 스캔이 어려우면 아래 코드를 입력하세요.
                </p>
                <p className="tnum mt-1.5 text-[22px] font-bold tracking-[0.15em] text-ink">
                  {leg.handover_code}
                </p>
              </div>
            </div>
          )}
          {err && (
            <p className="mt-2 rounded-field bg-dangerbg px-3 py-2 text-[13px] text-danger">{err}</p>
          )}
        </>
      )}
    </li>
  );
}

export default function Progress({ orderId, onCancelled }) {
  const toast = useToast();
  const [order, setOrder] = useState(null);
  const [notif, setNotif] = useState(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [showHandover, setShowHandover] = useState(false);
  const [err, setErr] = useState("");

  const refresh = useCallback(async () => {
    if (!orderId) return;
    try {
      const [o, n] = await Promise.all([api.getOrder(orderId), api.notifications(orderId)]);
      setOrder(o);
      setNotif(n);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    setLoading(true);
    refresh();
  }, [refresh]);

  const toStationPickup = async () => {
    setActing(true);
    try {
      await api.setPickupMode(orderId, "station");
      await refresh();
      toast("도착역 직접 수령으로 바꿨어요.", "success");
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setActing(false);
    }
  };

  const simulateDelay = async (d) => {
    await api.setDelay(orderId, d);
    const n = await api.notifications(orderId);
    setNotif(n);
    setOrder(await api.getOrder(orderId));
    // 확률과 도착 예정이 함께 움직이는 것을 눈으로 보게 한다.
    // 전에는 값만 조용히 바뀌어서 버튼이 죽은 줄 알았다.
    if (!n.delay_applies) {
      toast("탑재 이후부터 반영돼요. ①②구간 인계를 마쳐 주세요.");
    } else if (d === 0) {
      toast("지연을 되돌렸어요.");
    } else {
      toast(
        `${d}분 지연 · 도착 예정 ${n.eta_now}` +
          (n.probability_now != null ? ` · 성공확률 ${pct(n.probability_now)}` : ""),
        n.probability_now != null && n.probability_now < 0.85 ? "error" : "success"
      );
    }
  };

  const cancel = async () => {
    if (!confirm("접수를 취소할까요? 부과된 운임은 없습니다.")) return;
    try {
      await api.cancelOrder(orderId, "이용자 요청");
      await refresh();
      onCancelled?.();
      toast("접수를 취소했어요.");
    } catch (e) {
      toast(e.message, "error");
    }
  };

  if (!orderId) {
    return (
      <div className="px-5 py-16 text-center">
        <p className="text-[16px] font-bold text-ink">아직 접수한 건이 없어요</p>
        <p className="mt-2 text-[14px] text-g500">접수를 마치면 진행 상황이 여기에 표시돼요.</p>
      </div>
    );
  }

  if (loading && !order) {
    return (
      <div className="px-5 py-10">
        <Spinner label="불러오는 중이에요" />
      </div>
    );
  }
  if (!order) return null;

  const o = order.order;
  const dispatch = o.dispatch;
  const cancelled = o.status === "CANCELLED";

  /* 요약 카드는 '지금 값'을 쓴다. 접수 시점 값과 다르면 둘을 나란히 보인다 —
     무엇이 어떻게 바뀌었는지가 화면에서 읽혀야 지연 시뮬레이션이 의미를 갖는다. */
  const etaNow = notif?.eta_now || o.eta;
  const pNow = notif?.probability_now ?? null;
  const pTrend =
    pNow == null || Math.abs(pNow - o.probability) < 0.005
      ? null
      : pNow > o.probability
        ? "up"
        : "down";
  const late = etaNow > o.deadline;   // "HH:MM" 은 문자열 비교로 시각 순서가 맞다
  /* 접수 때 값을 함께 보이는 건 **무슨 일이 있었을 때만**이다.
     계획의 도착 예정과 탑재 후 재계산은 원래 몇 분 다를 수 있는데(계획은 그 건의
     ③구간 실소요, 재계산은 채널 표준 수령시간), 그걸 취소선으로 보이면
     아무 일도 없었는데 무언가 바뀐 것처럼 읽힌다. */
  const etaChanged =
    etaNow !== o.eta && ((notif?.delay_min ?? 0) > 0 || o.pickup_mode === "station");

  return (
    <div className="space-y-3 px-5 pb-10">
      {/* 상태 요약 */}
      <div className="rounded-card bg-card shadow-card p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="tnum text-[13px] text-g500">{o.id}</p>
            <p className="mt-0.5 truncate text-[18px] font-bold tracking-[-0.02em] text-ink">
              {o.origin} → {o.destination}
            </p>
          </div>
          <Chip tone={cancelled ? "danger" : o.status === "COMPLETED" ? "ok" : "brand"}>
            {o.status_label}
          </Chip>
        </div>

        {!cancelled && (
          <div className="mt-4">
            <Stepper status={o.status} />
          </div>
        )}

        {/* 배차가 진행 중이면 그 사실을 보인다.
            "운반자를 찾는 중"이라고만 쓰면 멈춘 화면처럼 보인다.
            지금 누구에게 요청이 가 있고 몇 번째인지를 그대로 말한다. */}
        {!cancelled && dispatch && (dispatch.ringing.length > 0 || dispatch.accepted.length > 0) && (
          <div className="mt-3 rounded-field bg-brand-50 px-3 py-2.5">
            {dispatch.ringing.map((c) => (
              <p key={c.id} className="flex items-center gap-2 text-[13px] text-brand">
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-brand" />
                </span>
                <b className="font-bold">{c.seq === 1 ? "①구간" : "③구간"}</b>
                <span className="min-w-0 truncate">
                  {c.carrier_name} 님에게 요청 중
                  {c.rank > 1 && ` (${c.rank}번째 후보)`}
                </span>
                <span className="tnum ml-auto shrink-0 font-bold">{c.remaining_sec}초</span>
              </p>
            ))}
            {dispatch.accepted.map((c) => (
              <p key={c.id} className="tnum text-[13px] text-g700">
                <b className="font-bold text-ok">✓</b>{" "}
                {c.seq === 1 ? "①구간" : "③구간"} {c.carrier_name} 님이 수락했어요
              </p>
            ))}
            {dispatch.attempts > 0 && dispatch.ringing.length > 0 && (
              <p className="mt-1 text-[12px] text-g600">
                {dispatch.attempts}명이 지나갔어요. 다음 순위로 계속 요청됩니다.
              </p>
            )}
          </div>
        )}

        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3">
          <div>
            <p className="text-[12px] text-g500">도착 예정</p>
            {/* 접수 때 값이 아니라 **다시 계산된 값**을 띄운다. 지연이 들어와도
                위쪽 숫자가 그대로면 아무 일도 안 일어난 화면이 된다. */}
            <p className="tnum mt-0.5 text-[15px] font-bold text-ink">
              {etaChanged ? (
                <>
                  <span className="mr-1 text-[13px] font-medium text-g400 line-through">{o.eta}</span>
                  <span className={late ? "text-danger" : "text-ink"}>{etaNow}</span>
                </>
              ) : (
                etaNow
              )}
            </p>
          </div>
          <div>
            <p className="text-[12px] text-g500">도착 기한</p>
            {/* 홈 폼의 시간 입력(오후 7:00)과 같은 표기 — 화면마다 24시간제가
                섞이면 같은 시각이 다른 값처럼 읽힌다 */}
            <p className="tnum mt-0.5 text-[15px] font-bold text-ink">{ampm(o.deadline)} 까지</p>
          </div>
          <div>
            <p className="text-[12px] text-g500">운임</p>
            <p className="tnum mt-0.5 text-[15px] font-bold text-ink">{won(o.fare)}</p>
          </div>
        </div>

        {/* 성공확률은 이 서비스가 파는 것이다. 진행 화면에도 항상 지금 값이 있어야 한다. */}
        {pNow != null && !cancelled && <Trend value={pNow} trend={pTrend} />}

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <Chip tone="mute">{o.product}</Chip>
          <Chip tone={o.pickup_mode === "station" ? "brand" : "mute"}>
            {o.pickup_mode === "station" ? "도착역 직접 수령" : "수령지까지 배달"}
          </Chip>
          {o.recipient_name && <Chip tone="mute">받는 분 {o.recipient_name}</Chip>}
        </div>

        {cancelled && (
          <p className="mt-3 rounded-field bg-dangerbg px-3 py-2.5 text-[13px] text-danger">
            취소된 접수입니다. ({o.cancelled_reason})
          </p>
        )}
      </div>

      {err && (
        <div className="rounded-card bg-dangerbg px-4 py-3 text-[13px] text-danger">{err}</div>
      )}

      {/* 알림 */}
      <ul className="space-y-3">
        {notif?.notifications.map((n) => (
          <NotificationCard key={n.seq} n={n} onAct={toStationPickup} acting={acting} />
        ))}
      </ul>

      {/* 인계 */}
      {!cancelled && (
        <div className="rounded-card bg-card shadow-card p-4">
          <button
            onClick={() => setShowHandover((v) => !v)}
            className="focus-ring flex w-full items-center justify-between"
          >
            <span className="text-[15px] font-bold text-ink">구간 인계</span>
            <span className="text-[13px] font-medium text-g600">{showHandover ? "닫기" : "열기"}</span>
          </button>
          {showHandover && (
            <ul className="mt-3">
              {order.legs.map((l) => (
                <HandoverRow key={l.seq} orderId={o.id} leg={l} onDone={refresh} />
              ))}
            </ul>
          )}
        </div>
      )}

      {/* 되돌리기 */}
      {o.can_cancel && (
        <button
          onClick={cancel}
          className="focus-ring w-full rounded-card bg-card shadow-card py-4 text-[15px] font-bold text-danger active:bg-g100"
        >
          접수 취소
        </button>
      )}

      {/* 시연 — 관제에서 들어올 지연을 손으로 넣는다 */}
      {!cancelled && o.status !== "COMPLETED" && (
        <div className="rounded-card bg-card shadow-card p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[15px] font-bold tracking-[-0.02em] text-ink">열차 지연 (시연)</p>
            <p className="shrink-0 text-[11px] text-g500">실제 운영에서는 관제 연동</p>
          </div>
          <div className="mt-3 flex gap-2">
            {[0, 12, 25].map((d) => (
              <button
                key={d}
                onClick={() => simulateDelay(d)}
                className={`focus-ring min-h-[46px] flex-1 rounded-field text-[14px] font-bold transition ${
                  (notif?.delay_min ?? 0) === d
                    ? "bg-brand text-white"
                    : "border border-g300 bg-card text-ink active:bg-g100"
                }`}
              >
                {d === 0 ? "정상" : `${d}분 지연`}
              </button>
            ))}
          </div>
          {/* 지연은 탑재 이후에만 확률을 움직인다 — 아직 열차에 실리지도 않았는데
              열차가 늦었다고 할 수는 없다. 그 사실을 말하지 않으면 버튼이 고장 난
              것처럼 보인다. 실제로 그렇게 읽혔다. */}
          {notif && !notif.delay_applies && (
            <p className="mt-2.5 text-[12px] leading-relaxed text-g600">
              지금은 <b className="font-bold">{o.status_label}</b> 단계예요. ①②구간을 넘기면
              탑재 상태가 되어 지연이 반영돼요.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

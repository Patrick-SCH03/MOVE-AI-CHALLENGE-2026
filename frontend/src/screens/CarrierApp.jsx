import React, { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { api, won } from "../api";
import { Button, Chip, Spinner, Stat } from "../components/Primitives";
import CallCard from "../components/CallCard";

/* 운반자 화면 (?view=carrier)

   시민 운반자는 배송을 찾아다니지 않는다. '어차피 가는 길'에 얹히는 구조이므로
   자기 동선에 맞는 건만 제안받고, 수락 여부만 정한다.
   그래서 이 화면에는 '검색'도 '배차 대기'도 없다. 제안과 수락뿐이다. */

/* 시연에 이름이 나오는 네 명. 강남↔서울역(①)과 부산역↔부전동(③)을 맡는다.
   같은 동선·같은 시간대인데 신뢰도만 다른 쌍이라, 바꿔 끼우면 확률이 움직이는 것이
   그대로 보인다. seed/carriers.py 의 CARRIERS 와 같은 순서다. */
const DEMO_CARRIERS = [
  { id: "C001", name: "조민재" },
  { id: "C037", name: "김성민" },
  { id: "C023", name: "현민채" },
  { id: "C038", name: "김나은" },
];

export default function CarrierApp() {
  const [carriers, setCarriers] = useState([]);
  const [cid, setCid] = useState(() => localStorage.getItem("timeproof.carrier") || "C001");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [calls, setCalls] = useState([]);

  useEffect(() => {
    api.carriers().then((d) => setCarriers(d.carriers)).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      setData(await api.carrierRequests(cid));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [cid]);

  useEffect(() => {
    localStorage.setItem("timeproof.carrier", cid);
    load();
  }, [cid, load]);

  /* 콜은 몇 초 안에 사라진다. 화면을 열어 두면 계속 확인해야 한다.
     WebSocket 을 쓰지 않는 이유는 배포 안정성이다 — 3초 폴링으로 충분하다. */
  useEffect(() => {
    let alive = true;
    const tick = () =>
      api.carrierCalls(cid)
        .then((d) => alive && setCalls(d.calls || []))
        .catch(() => {});
    tick();
    const t = setInterval(tick, 3000);
    return () => { alive = false; clearInterval(t); };
  }, [cid]);

  const respond = async (call, accept) => {
    setBusy(call.id);
    setErr("");
    try {
      const d = await api.callRespond(call.id, accept);
      setCalls(d.calls || []);
      await load();
    } catch (e) {
      setErr(e.message);
      api.carrierCalls(cid).then((d) => setCalls(d.calls || [])).catch(() => {});
    } finally {
      setBusy("");
    }
  };

  const act = async (r, accept) => {
    setBusy(`${r.order_id}:${r.seq}`);
    try {
      setData(await api.carrierAccept({
        order_id: r.order_id, seq: r.seq, carrier_id: cid, accept,
      }));
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy("");
    }
  };

  const handover = async (r, code) => {
    setBusy(`${r.order_id}:${r.seq}`);
    setErr("");
    try {
      await api.handover({ order_id: r.order_id, seq: r.seq, code, actor: data.carrier.name });
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy("");
    }
  };

  const c = data?.carrier;
  const pending = data?.requests.filter((r) => !r.accepted) || [];
  const active = data?.requests.filter((r) => r.accepted && !r.handed_over) || [];
  const done = data?.requests.filter((r) => r.handed_over) || [];

  return (
    <div className="space-y-3 px-5 pb-10">
      {/* 울리는 콜이 가장 위다. 지금 답해야 하는 것이 하나뿐이기 때문이다. */}
      {calls.map((call) => (
        <CallCard key={call.id} call={call} onRespond={respond} busy={busy === call.id} />
      ))}

      {/* 누구로 볼지 (시연용) */}
      <div className="rounded-card bg-card shadow-card p-4">
        <label className="text-[12px] font-bold text-g500" htmlFor="carrier-pick">
          운반자 선택 (시연용)
        </label>

        {/* 콜은 90초 뒤 다음 순위로 넘어간다. 그 안에 420명짜리 목록을 굴려
            사람을 찾는 것은 불가능하다 — 시연에 쓰는 네 명은 버튼으로 둔다. */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {DEMO_CARRIERS.map((x) => (
            <button
              key={x.id}
              onClick={() => setCid(x.id)}
              aria-pressed={cid === x.id}
              className={`focus-ring rounded-chip px-3 py-1.5 text-[13px] font-bold transition
                ${cid === x.id
                  ? "bg-brand text-white"
                  : "border border-g300 bg-card text-g700 active:bg-g100"}`}
            >
              {x.name}
            </button>
          ))}
        </div>

        <select
          id="carrier-pick"
          value={cid}
          onChange={(e) => setCid(e.target.value)}
          className="focus-ring mt-2 min-h-[48px] w-full rounded-field bg-g100 px-3 text-[16px] outline-none"
        >
          {carriers.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name} · {x.type} · 신뢰도 {Math.round(x.reliability * 100)}%
            </option>
          ))}
        </select>
      </div>

      {c && (
        <div className="rounded-card bg-card shadow-card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[18px] font-bold tracking-[-0.02em] text-ink">{c.name}</p>
              <p className="tnum mt-0.5 text-[13px] text-g500">
                {c.type} · {c.mode} · {c.active_from}~{c.active_to}
              </p>
            </div>
            <Chip tone="brand">신뢰도 {Math.round(c.reliability * 100)}%</Chip>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3">
            <Stat label="누적 완료" value={`${c.completed_count}건`} />
            <Stat label="정시 도착률" value={`${Math.round(c.ontime_rate * 100)}%`} />
            <Stat label="받을 보상" value={won(data.pending_reward)} />
          </div>

          <p className="mt-3 rounded-field bg-g100 px-3 py-2.5 text-[12px] leading-relaxed text-g500">
            신뢰도는 표시용 점수가 아니라 도착 확률 계산에 그대로 들어갑니다.
            정시에 인계할수록 더 좋은 요청을 먼저 받게 돼요.
            <b className="font-bold text-g700"> 콜을 거절해도 신뢰도는 내려가지 않아요.</b>
          </p>

          {/* 계약이 필요한 부분은 화면에서 밝힌다. 되는 것처럼 두면
              심사에서 한 번 걸렸을 때 나머지 숫자까지 같이 의심받는다. */}
          {(data?.external?.identity?.simulated ||
            data?.external?.safe_number?.simulated) && (
            <p className="mt-2 rounded-field border border-dashed border-g300 px-3 py-2.5 text-[12px] leading-relaxed text-g500">
              <b className="font-bold text-g700">외부 계약 전 항목</b> —
              본인확인({data.external.identity.provider})과
              안심번호 발급은 아직 <b className="font-bold text-g700">모의</b>입니다.
              미확인자에게 콜이 가지 않는 게이트와, 번호의 유효기간·회수·이력은
              실제로 동작합니다.
            </p>
          )}
        </div>
      )}

      {/* 운반자가 실제로 묻는 것은 둘이다 — "내가 자격이 있나", "사고 나면 얼마를 무나".
          약관에 써 두는 것만으로는 답이 되지 않는다. 숫자로 화면에 있어야 한다. */}
      {data?.identity && (
        <div className="rounded-card bg-card shadow-card p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[15px] font-bold tracking-[-0.02em] text-ink">본인 확인</p>
            <Chip tone={data.identity.verified ? "ok" : "warn"}>
              {data.identity.verified ? `확인 완료 · ${data.identity.method}` : "미확인"}
            </Chip>
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-g500">{data.identity.note}</p>

          {data.protection && (
            <>
              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-line pt-3">
                <Stat label="내 적립금" value={won(data.protection.deposit)} />
                <Stat label="사고 시 내 부담 한도" value={won(data.protection.recourse_cap)} />
              </div>
              <p className="mt-3 rounded-field bg-g100 px-3 py-2.5 text-[12px] leading-relaxed text-g600">
                이용자 배상은 회사가 합니다. 고의·중과실일 때만 구상하고, 그 한도도
                위 적립금까지예요.{" "}
                <b className="font-bold text-g700">{data.protection.paid_by}</b>{" "}
                단체보험 보장한도는 1사고당 {won(data.protection.policy_limit)}입니다.
              </p>
            </>
          )}
        </div>
      )}

      {err && <div className="rounded-card bg-dangerbg px-4 py-3 text-[13px] text-danger">{err}</div>}

      {loading && !data ? (
        <div className="py-8"><Spinner label="불러오는 중이에요" /></div>
      ) : (
        <>
          <Section title="새 요청" count={pending.length} empty="지금은 들어온 요청이 없어요.">
            {pending.map((r) => (
              <RequestCard
                key={`${r.order_id}-${r.seq}`}
                r={r}
                busy={busy === `${r.order_id}:${r.seq}`}
                onAccept={() => act(r, true)}
                onReject={() => act(r, false)}
              />
            ))}
          </Section>

          <Section title="수행 중" count={active.length} empty="수락한 요청이 없어요.">
            {active.map((r) => (
              <ActiveCard
                key={`${r.order_id}-${r.seq}`}
                r={r}
                busy={busy === `${r.order_id}:${r.seq}`}
                onHandover={(code) => handover(r, code)}
                simulated={data?.external?.safe_number?.simulated}
              />
            ))}
          </Section>

          {done.length > 0 && (
            <Section title="완료" count={done.length}>
              {done.map((r) => (
                <div
                  key={`${r.order_id}-${r.seq}`}
                  className="flex items-center justify-between rounded-card bg-card shadow-card px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-bold text-ink">
                      {r.from_name} → {r.to_name}
                    </p>
                    <p className="tnum text-[12px] text-g500">{r.order_id}</p>
                  </div>
                  <div className="text-right">
                    <Chip tone="ok">인계 완료</Chip>
                    <p className="tnum mt-1 text-[13px] font-bold text-ink">{won(r.reward)}</p>
                  </div>
                </div>
              ))}
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function Section({ title, count, empty, children }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 px-1">
        <h2 className="text-[15px] font-bold text-ink">{title}</h2>
        {count > 0 && (
          <span className="tnum rounded-chip bg-brand px-1.5 py-0.5 text-[11px] font-bold text-white">
            {count}
          </span>
        )}
      </div>
      {count === 0 ? (
        empty ? <p className="rounded-card bg-card shadow-card px-4 py-5 text-center text-[13px] text-g600">{empty}</p> : null
      ) : (
        <div className="space-y-2">{children}</div>
      )}
    </div>
  );
}

function RequestCard({ r, busy, onAccept, onReject }) {
  return (
    <div className="rounded-card bg-card shadow-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[16px] font-bold tracking-[-0.02em] text-ink">
            {r.from_name} → {r.to_name}
          </p>
          <p className="tnum mt-0.5 text-[13px] text-g500">
            {r.start_at} → {r.end_at} · {r.item}
          </p>
        </div>
        <p className="tnum shrink-0 text-[18px] font-bold text-brand">{won(r.reward)}</p>
      </div>

      <p className="mt-2.5 rounded-field bg-g100 px-3 py-2.5 text-[13px] leading-relaxed text-g600">
        원래 가시던 길에 얹히는 구간이에요. 목적지를 바꾸지 않아도 됩니다.
        {r.privacy_note && (
          <span className="mt-1 block text-[12px] text-g500">{r.privacy_note}</span>
        )}
      </p>

      <div className="mt-3 grid grid-cols-[1fr_2fr] gap-2">
        <Button size="sm" variant="ghost" onClick={onReject} disabled={busy}>
          거절
        </Button>
        <Button size="sm" onClick={onAccept} disabled={busy}>
          {busy ? "처리 중" : "수락하기"}
        </Button>
      </div>
    </div>
  );
}

/* 인계 QR — 발송인 화면(Progress)과 같은 내용을 인코딩한다.
   양측이 서로의 QR을 스캔하고, 카메라가 어려우면 코드를 부른다. */
function QR({ text, size = 108 }) {
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

function ActiveCard({ r, busy, onHandover, simulated }) {
  const [code, setCode] = useState("");
  const [openQR, setOpenQR] = useState(false);
  return (
    <div className="rounded-card bg-card shadow-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[16px] font-bold tracking-[-0.02em] text-ink">
            {r.from_name} → {r.to_name}
          </p>
          <p className="tnum mt-0.5 text-[13px] text-g500">
            {r.order_id} · {r.item} · {r.end_at}까지
          </p>
        </div>
        <p className="tnum shrink-0 text-[16px] font-bold text-brand">{won(r.reward)}</p>
      </div>

      {/* 수령인 연락처는 실번호가 아니라 안심번호다. 인계가 끝나면 회수되어
          이 칸 자체가 사라진다 — 화면에서만 가리는 것이 아니라 실제로 끊긴다. */}
      {r.recipient_contact && (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-field bg-g100 px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-[12px] font-bold text-g500">받는 분</p>
            <p className="tnum mt-0.5 text-[14px] font-bold text-ink">
              {r.recipient_name} · {r.recipient_contact}
            </p>
          </div>
          {/* 통신사 계약 전이라 발급은 모의다. 실발급처럼 보이게 두면
              우리가 한 일을 부풀리는 것이 된다 — 수명 관리는 실제로 동작한다. */}
          <span className="shrink-0 rounded-chip bg-card px-2 py-1 text-[11px] font-bold text-g600">
            안심번호{simulated ? " · 모의" : ""}
          </span>
        </div>
      )}

      <div className="mt-3 rounded-field bg-brand-50 px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[12px] font-bold text-brand">내 인계 코드</p>
            <p className="tnum mt-0.5 text-[22px] font-bold tracking-[0.15em] text-brand">
              {r.handover_code}
            </p>
          </div>
          <button
            onClick={() => setOpenQR((v) => !v)}
            className="focus-ring shrink-0 rounded-chip bg-card px-2.5 py-1 text-[12px] font-bold text-brand"
          >
            {openQR ? "QR 닫기" : "QR 보기"}
          </button>
        </div>
        {openQR && (
          <div className="mt-2 flex items-center gap-3">
            <QR text={`${r.order_id}:${r.seq}:${r.handover_code}`} />
            <p className="text-[12px] leading-relaxed text-g600">
              양측이 서로의 QR을 스캔합니다.
              <br />
              스캔이 어려우면 코드를 불러 주세요.
            </p>
          </div>
        )}
        <p className="mt-1 text-[12px] leading-relaxed text-g600">
          창구 직원에게 이 번호를 보여주시면 인계가 기록돼요.
        </p>
      </div>

      <div className="mt-2.5 flex gap-2">
        {/* min-w-0 · size=6 — 발송인 화면(Progress)과 같은 이유다.
            input 의 기본 크기 때문에 flex-1 이 줄지 못해 좁은 화면에서
            옆의 '인계' 버튼이 카드 밖으로 밀린다. */}
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          size={6}
          placeholder="상대방 코드 입력"
          className="tnum focus-ring min-h-[46px] w-full min-w-0 flex-1 rounded-field bg-g100 px-3 text-[16px] tracking-[0.2em] outline-none placeholder:tracking-normal placeholder:text-g400"
        />
        <Button size="sm" onClick={() => onHandover(code)} disabled={busy || code.length !== 6}>
          {busy ? "확인" : "인계"}
        </Button>
      </div>
    </div>
  );
}


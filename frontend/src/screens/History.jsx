import React, { useEffect, useState } from "react";
import { ampm, api, pct, won } from "../api";
import { Chip, Spinner } from "../components/Primitives";

/* 접수 내역

   실제 물류 앱 사용의 상당 부분은 '지난번 그 조건으로 또 보내기'다.
   내역이 없으면 매번 처음부터 말해야 하고, 그러면 서비스가 아니라 데모가 된다. */

const TONE = {
  COMPLETED: "ok",
  CANCELLED: "danger",
  ON_TRAIN: "brand",
  PICKED_UP: "brand",
  ACCEPTED: "mute",
};

/* 내역은 쌓인다. 200건을 한 번에 그리면 스크롤이 4만 픽셀이 되고,
   찾으려는 한 건에 닿지 못한다. 상태로 좁히고 끊어서 보여 준다. */
const FILTERS = [
  { id: "all", label: "전체", match: () => true },
  { id: "active", label: "진행 중", match: (r) => !["COMPLETED", "CANCELLED"].includes(r.status) },
  { id: "done", label: "완료", match: (r) => r.status === "COMPLETED" },
  { id: "cancelled", label: "취소", match: (r) => r.status === "CANCELLED" },
];
const PAGE = 10;

/* 기본 정렬 — 진행 중 → 완료 → 취소.
   접수 시각 역순으로만 두면 지금 손을 써야 하는 건이 완료된 200여 건 사이에
   묻힌다. 내역을 여는 이유의 대부분은 '지금 가고 있는 그 건'이다.

   판정은 필터와 같은 함수를 쓴다. 여기에 상태 이름을 다시 적으면 FILTERS 를
   고칠 때 한쪽만 고쳐진 채 목록 순서가 어긋난다.
   (세 갈래가 서로 배타적이고 전부를 덮으므로 항상 하나에 걸린다) */
const SORT_ORDER = ["active", "done", "cancelled"];
const groupOf = (r) =>
  SORT_ORDER.findIndex((id) => FILTERS.find((f) => f.id === id).match(r));

export default function History({ onOpen, onReorder }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState("all");
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    api.listOrders()
      .then((d) => setRows(d.orders))
      .catch((e) => setErr(e.message));
  }, []);

  if (err) {
    return <div className="mx-5 rounded-card bg-dangerbg px-4 py-3 text-[13px] text-danger">{err}</div>;
  }
  if (!rows) {
    return <div className="px-5 py-10"><Spinner label="불러오는 중이에요" /></div>;
  }
  if (rows.length === 0) {
    return (
      <div className="px-5 py-16 text-center">
        <p className="text-[16px] font-bold text-ink">아직 보낸 내역이 없어요</p>
        <p className="mt-2 text-[14px] text-g500">첫 접수를 하면 여기에 쌓여요.</p>
      </div>
    );
  }

  // sort 는 안정 정렬이므로 그룹 안에서는 서버가 준 순서(접수 시각 역순)가 유지된다.
  // 한 갈래만 보는 탭에서는 전부 같은 그룹이라 아무것도 바뀌지 않는다.
  const matched = rows
    .filter(FILTERS.find((f) => f.id === filter).match)
    .sort((a, b) => groupOf(a) - groupOf(b));
  const shown = matched.slice(0, limit);

  return (
    <div className="space-y-2 px-5 pb-10">
      <div className="sticky top-[92px] z-10 -mx-5 flex gap-1.5 overflow-x-auto bg-bg px-5 pb-2.5 pt-0.5">
        {FILTERS.map((f) => {
          const n = rows.filter(f.match).length;
          const on = f.id === filter;
          return (
            <button
              key={f.id}
              onClick={() => { setFilter(f.id); setLimit(PAGE); }}
              className={`focus-ring shrink-0 rounded-chip px-3.5 py-2 text-[13px] font-bold transition
                ${on ? "bg-g900 text-white" : "border border-g200 bg-card text-g700 active:bg-g100"}`}
            >
              {f.label} <span className="tnum font-medium opacity-70">{n}</span>
            </button>
          );
        })}
      </div>

      {shown.length === 0 && (
        <p className="rounded-card bg-card px-4 py-8 text-center text-[14px] text-g600 shadow-card">
          해당하는 내역이 없어요.
        </p>
      )}

      {shown.map((r) => (
        <div key={r.id} className="rounded-card bg-card shadow-card p-4">
          <button
            onClick={() => onOpen(r.id)}
            className="focus-ring w-full text-left"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[16px] font-bold tracking-[-0.02em] text-ink">
                  {r.origin} → {r.destination}
                </p>
                <p className="tnum mt-0.5 text-[13px] text-g500">
                  {r.item} · {r.id}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <Chip tone={TONE[r.status] || "mute"}>{r.status_label}</Chip>
                <p className="tnum mt-1.5 text-[14px] font-bold text-ink">{won(r.fare)}</p>
              </div>
            </div>

            <div className="tnum mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-line pt-2.5 text-[12px] text-g500">
              <span>{r.product}</span>
              <span>도착 {r.eta}</span>
              <span>도착 기한 {ampm(r.deadline)} 까지</span>
              {r.status !== "CANCELLED" && <span>확률 {pct(r.probability)}</span>}
              {r.recipient_name && <span>받는 분 {r.recipient_name}</span>}
            </div>
          </button>

          <button
            onClick={() => onReorder(r)}
            className="focus-ring mt-3 w-full rounded-field bg-g100 py-2.5 text-[14px] font-bold text-g700 active:bg-g200"
          >
            같은 조건으로 다시 보내기
          </button>
        </div>
      ))}

      {matched.length > shown.length && (
        <button
          onClick={() => setLimit((n) => n + PAGE)}
          className="focus-ring w-full rounded-card border border-g200 bg-card py-3.5 text-[14px] font-bold text-g700 active:bg-g100"
        >
          더 보기 <span className="tnum font-medium text-g500">
            {shown.length} / {matched.length}
          </span>
        </button>
      )}
    </div>
  );
}

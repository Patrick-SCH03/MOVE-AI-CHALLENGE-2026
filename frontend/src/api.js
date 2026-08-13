/* 개발에서는 Vite 프록시가 /api 를 백엔드로 넘긴다(vite.config.js).
   배포에는 그 프록시가 없으므로 백엔드 주소를 직접 가리켜야 한다.
   Vercel 환경변수 VITE_API_BASE 에 Railway 주소를 넣는다. 예) https://xxx.up.railway.app
   비워 두면 같은 오리진으로 간주한다. */
const BASE = `${(import.meta.env.VITE_API_BASE || "").replace(/\/$/, "")}/api`;

async function req(path, { method = "GET", body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.detail || `요청에 실패했습니다 (${res.status})`);
  return data;
}

export const api = {
  health: () => req("/health"),
  agent: (payload) => req("/agent", { method: "POST", body: payload }),
  route: (payload) => req("/route", { method: "POST", body: payload }),
  carriers: () => req("/carriers"),
  match: (payload) => req("/match", { method: "POST", body: payload }),
  live: () => req("/live"),
  opsBoard: () => req("/ops/board"),
  provenance: () => req("/provenance"),
  terms: () => req("/terms"),
  consents: () => req("/consents"),
  documents: (audience) => req(`/documents${audience ? `?audience=${audience}` : ""}`),
  document: (id) => req(`/documents/${id}`),
  places: (q) => req(`/places?q=${encodeURIComponent(q)}`),

  // 주문
  createOrder: (payload) => req("/orders", { method: "POST", body: payload }),
  getOrder: (id) => req(`/orders/${id}`),
  listOrders: () => req("/orders"),
  cancelOrder: (id, reason) => req(`/orders/${id}/cancel`, { method: "POST", body: { reason } }),
  setPickupMode: (id, mode) => req(`/orders/${id}/pickup-mode`, { method: "POST", body: { mode } }),
  setDelay: (id, delay_min) => req(`/orders/${id}/delay`, { method: "POST", body: { delay_min } }),
  notifications: (id) => req(`/orders/${id}/notifications`),

  // 인계·증명
  handover: (payload) => req("/handover", { method: "POST", body: payload }),
  proof: (id) => req(`/proof/${id}`),

  // 운반자
  carrierRequests: (cid) => req(`/carrier/${cid}/requests`),
  carrierAccept: (payload) => req("/carrier/accept", { method: "POST", body: payload }),
  carrierCalls: (cid) => req(`/carrier/${cid}/calls`),
  callRespond: (callId, accept) =>
    req(`/carrier/call/${callId}/respond`, { method: "POST", body: { accept } }),
};

/* 받침에 따라 '로/으로'가 갈린다.
   주소를 그대로 받기 시작하면서 끝 글자가 무엇일지 알 수 없게 됐다.
   "해운대구으로"는 사람이 쓴 문장으로 읽히지 않는다. */
export function ro(word) {
  const s = (word || "").trim();
  if (!s) return "로";
  const c = s.charCodeAt(s.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return "로";
  const jong = (c - 0xac00) % 28;
  return jong === 0 || jong === 8 ? "로" : "으로";   // 받침 없음 또는 ㄹ
}

export const won = (n) => `${Number(n || 0).toLocaleString("ko-KR")}원`;
export const pct = (p) => `${Math.round((p || 0) * 100)}%`;

/* 곱셈 관계를 화면에 보이는 곳에서는 정수 반올림을 쓰면 안 된다.
   99.8% × 98.5% × 100% = 98.3% 인데 정수로 끊으면 100 × 99 × 100 = 98 이 되어
   산수가 틀린 것처럼 보인다. 소수 첫째 자리까지 쓴다. */
export const pct1 = (p) => {
  const v = (p || 0) * 100;
  return `${(Math.round(v * 10) / 10).toFixed(1)}%`;
};

/* ── 세션 유지 ──
   새로고침하면 전부 사라지는 앱은 서비스로 느껴지지 않는다.
   진행 중인 접수번호와 역할은 로컬에 남긴다. */
const KEY = "timeproof.session";

export function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}

export function saveSession(patch) {
  const next = { ...loadSession(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch { /* 저장 실패해도 앱은 계속 동작해야 한다 */ }
  return next;
}

/* 절대시각은 "지금 벌어지는 일"로 읽히지 않는다.
   12분 전이라고 써야 서비스가 돌아가고 있다는 감각이 생긴다. */
export function relativeTime(iso) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Math.floor((Date.now() - t) / 1000);
  if (diff < 60) return "방금";
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  const d = Math.floor(diff / 86400);
  return d === 1 ? "어제" : `${d}일 전`;
}

export function clearSession() {
  try {
    localStorage.removeItem(KEY);
  } catch { /* noop */ }
}

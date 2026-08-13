// API 베이스 — 로컬 dev 는 vite 프록시(/api → 127.0.0.1:8020)라 빈 값,
// Vercel 빌드에서는 VITE_API_BASE(Railway 주소)가 빌드 타임에 박힌다.
const BASE = `${(import.meta.env.VITE_API_BASE || '').replace(/\/$/, '')}/api`

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    // 서버는 {detail: "사람이 읽는 한국어"} 로 실패를 말한다
    throw new Error(data.detail || `요청에 실패했어요 (${res.status})`)
  }
  return data
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
}

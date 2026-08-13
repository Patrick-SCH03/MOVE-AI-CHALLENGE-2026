import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { Card, Chip, Icon, Spinner } from '../Primitives'

// AI 접수 도우미 — 홈의 진입 카드와 같은 이름. 문과 안의 이름이 다르면 길을 잃는다.
// 예시 3번(휘발유)은 금지품 차단 시연용 — 눌러 보면 즉시 BLOCKED 카드가 나온다.
const EXAMPLES = [
  '오늘 저녁 7시까지 부산 서면으로 노트북 도착해야 해',
  '강남에서 해운대로 도자기 화병 저녁 8시까지 40만원',
  '서울역에서 대전으로 휘발유 한 통 오늘 안에',
]

export default function ChatIntake({ seed, auto, onQuoted, onBack, onHome }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState(seed || '')
  const [busy, setBusy] = useState(false)
  const [prior, setPrior] = useState(null)
  const historyRef = useRef([])
  const bottomRef = useRef(null)
  const autoSentRef = useRef(false)

  // 홈 폼·다시 보내기에서 문장이 완성돼 들어오면 바로 보낸다
  useEffect(() => {
    if (auto && seed && !autoSentRef.current) {
      autoSentRef.current = true
      send(seed)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, seed])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, busy])

  async function send(text) {
    const utterance = (text ?? input).trim()
    if (!utterance || busy) return
    setInput('')
    setBusy(true)
    setMessages((m) => [...m, { role: 'me', text: utterance }])
    try {
      const r = await api.post('/agent', {
        utterance, history: historyRef.current, prior,
      })
      historyRef.current = [...historyRef.current, utterance].slice(-6)
      setPrior(r.intake)
      if (r.stage === 'BLOCKED') {
        setMessages((m) => [...m, { role: 'bot', text: r.message, blocked: r.screening, tools: r.tool_calls }])
      } else if (r.stage === 'ASK') {
        setMessages((m) => [...m, {
          role: 'bot', text: r.message, tools: r.tool_calls,
          suggestions: r.suggestions || [],
        }])
      } else {
        setMessages((m) => [...m, { role: 'bot', text: r.message, tools: r.tool_calls }])
        // 0.5초 뒤 채널 비교로 — 답이 찍히는 것을 보고 넘어가야 흐름이 읽힌다
        setTimeout(() => onQuoted(r), 500)
      }
    } catch (e) {
      setMessages((m) => [...m, { role: 'bot', text: e.message }])
    } finally {
      setBusy(false)
    }
  }

  const empty = messages.length === 0

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 bg-white px-4 pb-3 pt-5">
        <img src="/korail-blue.png" alt="KORAIL" className="h-6" />
        <div className="mt-2 flex items-center gap-2">
          <button onClick={onBack} className="px-1 text-[20px] text-g600">‹</button>
          <div className="text-[20px] font-bold text-g900">AI 접수 도우미</div>
          <div className="ml-auto flex items-center gap-3">
            <span className="tnum text-[14px] text-g500">1 / 3</span>
            <button onClick={onHome} className="text-[15px] font-medium text-g700">처음으로</button>
          </div>
        </div>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto p-4 pb-28">
        {/* 첫 화면 — 인트로 카드 + 예시 */}
        <Card>
          <div className="flex items-start gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand">
              <Icon name="chat" size={26} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[18px] font-bold text-g900">AI 접수 도우미</span>
                <span className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-bold text-white">AI</span>
              </div>
              <p className="mt-1 text-[15px] leading-7 text-g700">
                출발지 · 도착지 · 물건 · 도착 기한을 한 문장으로 말씀하시면 보낼 방법을
                찾아 드려요. 빠진 게 있으면 하나씩 여쭤봅니다.
              </p>
            </div>
          </div>
        </Card>

        {empty && (
          <>
            <div className="pt-1 text-[15px] text-g600">이렇게 요청해보세요</div>
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => send(ex)}
                className="flex w-full items-center gap-2 rounded-card bg-white p-5 text-left shadow-card active:bg-g50"
              >
                <span className="min-w-0 flex-1 text-[16px] text-g900">{ex}</span>
                <span className="shrink-0 text-g400">›</span>
              </button>
            ))}
          </>
        )}

        {messages.map((m, i) => (
          <MessageBubble key={i} msg={m} onSuggest={(s) => send(`${s.deadline}까지로 해주세요`)} />
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-[13px] text-g500">
            <Spinner /> 확인하고 있어요…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 입력 바 — 원형 ↑ 전송 버튼 */}
      <div className="fixed inset-x-0 bottom-0 z-10 mx-auto max-w-[430px] border-t border-g200 bg-white p-3">
        <div className="flex items-center gap-2">
          {/* flex 줄 안의 input — w-full min-w-0 flex-1 없으면 320px 에서 버튼이 밀려난다 */}
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="메시지 입력"
            className="w-full min-w-0 flex-1 rounded-full bg-g100 px-5 py-3.5 text-[16px] placeholder:text-g500 focus-ring"
          />
          <button
            onClick={() => send()}
            disabled={busy || !input.trim()}
            aria-label="보내기"
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[20px] font-bold
              ${input.trim() && !busy ? 'bg-brand text-white active:bg-brand-700' : 'bg-g200 text-g500'}`}
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  )
}

function MessageBubble({ msg, onSuggest }) {
  if (msg.role === 'me') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-brand px-3.5 py-2.5 text-[15px] text-white">
          {msg.text}
        </div>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <div className={`max-w-[85%] rounded-2xl rounded-bl-md px-3.5 py-2.5 text-[15px]
        ${msg.blocked ? 'border border-danger/30 bg-dangerbg text-g900' : 'bg-white text-g900 shadow-card'}`}>
        {msg.text}
        {msg.blocked && msg.blocked.findings?.[0]?.clause && (
          <div className="mt-2 border-t border-danger/20 pt-2 text-[12px] text-g600">
            근거: {msg.blocked.findings[0].clause}
          </div>
        )}
      </div>
      {/* 불가 시 제안 칩 — 누르면 요청될 시각(데드라인)을 크게, 도착 예정은 작게.
          반대로 하면 누른 것과 다른 값이 채팅에 찍힌다 */}
      {msg.suggestions?.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {msg.suggestions.map((s) => (
            <button
              key={s.deadline}
              onClick={() => onSuggest(s)}
              className="rounded-xl border border-brand-300 bg-brand-50 px-3 py-2 text-left active:bg-brand-300/30"
            >
              <div className="tnum text-[16px] font-bold text-brand">{s.deadline}까지</div>
              <div className="tnum text-[11px] text-g600">{s.train_no} · 도착 {s.eta}</div>
            </button>
          ))}
        </div>
      )}
      {msg.tools?.length > 0 && <ToolLog tools={msg.tools} />}
    </div>
  )
}

// 도구 호출 로그 — AI 활용 증거. 접을 수 있는 패널
function ToolLog({ tools }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="max-w-[85%]">
      <button onClick={() => setOpen(!open)} className="text-[12px] font-medium text-brand">
        {open ? '▾' : '▸'} AI 도구 호출 {tools.length}건
      </button>
      {open && (
        <Card className="mt-1 space-y-1.5 !p-3">
          {tools.map((t) => (
            <div key={t.seq} className="flex items-center gap-2 text-[12px]">
              <Chip tone={t.ai === '도구' ? 'mute' : 'brand'} className="shrink-0">{t.ai}</Chip>
              <span className="min-w-0 flex-1 truncate text-g700">{t.tool}</span>
              <span className="tnum shrink-0 text-g500">{t.elapsed_ms}ms</span>
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}

import { useState } from 'react'
import { Card } from '../Primitives'
import { TERMS } from '../terms'

// 약관 · 정책 — 전문을 화면에서 그대로 읽는다. 각 문서 머리에
// '제안 프로토타입 초안'임이 명시돼 있다.
export default function TermsView({ onBack, initial = 'service' }) {
  const [tab, setTab] = useState(initial)
  const doc = TERMS.find((t) => t.id === tab) || TERMS[0]

  return (
    <div className="min-h-screen pb-8">
      <div className="sticky top-0 z-10 bg-white px-4 pb-3 pt-5">
        <img src="/korail-blue.png" alt="KORAIL" className="h-6" />
        <div className="mt-3 flex items-center gap-2">
          <button onClick={onBack} className="px-1 text-[20px] text-g600">‹</button>
          <h1 className="text-[20px] font-bold text-g900">약관 · 정책</h1>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {TERMS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`shrink-0 rounded-full px-4 py-2 text-[14px] font-semibold
                ${tab === t.id ? 'bg-g900 text-white' : 'bg-g100 text-g700'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4">
        <Card className="!p-5">
          <Markdown text={doc.body} />
        </Card>
      </div>
    </div>
  )
}

// 약관 표시에 필요한 만큼만 렌더하는 초소형 마크다운 — 외부 파서를 넣지 않는다
function Markdown({ text }) {
  const lines = text.split('\n')
  const out = []
  let i = 0
  let key = 0

  const flushTable = (rows) => {
    const cells = rows.map((r) => r.split('|').slice(1, -1).map((c) => c.trim()))
    const body = cells.filter((r) => !r.every((c) => /^-+$/.test(c)))
    return (
      <div key={key++} className="my-3 overflow-x-auto">
        <table className="w-full text-[13px]">
          <tbody>
            {body.map((r, ri) => (
              <tr key={ri} className={ri === 0 ? 'bg-g50 font-semibold' : 'border-t border-g100'}>
                {r.map((c, ci) => (
                  <td key={ci} className="px-2 py-2 align-top leading-5 text-g800"><Inline s={c} /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith('| ') || line.startsWith('|-')) {
      const rows = []
      while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++])
      out.push(flushTable(rows))
      continue
    }
    if (line.startsWith('> ')) {
      const quote = []
      while (i < lines.length && lines[i].startsWith('>')) quote.push(lines[i++].replace(/^>\s?/, ''))
      out.push(
        <div key={key++} className="my-3 rounded-xl bg-brand-50/60 p-3 text-[13px] leading-6 text-g700">
          {quote.map((q, qi) => <p key={qi}><Inline s={q} /></p>)}
        </div>,
      )
      continue
    }
    if (line.startsWith('# ')) {
      out.push(<h1 key={key++} className="text-[20px] font-bold text-g900"><Inline s={line.slice(2)} /></h1>)
    } else if (line.startsWith('## ')) {
      out.push(<h2 key={key++} className="mt-5 text-[16px] font-bold text-g900"><Inline s={line.slice(3)} /></h2>)
    } else if (line.startsWith('### ')) {
      out.push(<h3 key={key++} className="mt-4 text-[14px] font-bold text-g800"><Inline s={line.slice(4)} /></h3>)
    } else if (/^-{3,}$/.test(line.trim())) {
      out.push(<hr key={key++} className="my-4 border-g200" />)
    } else if (/^\s*[-*]\s/.test(line) || /^\s*\d+\.\s/.test(line)) {
      out.push(
        <p key={key++} className="my-1 pl-4 text-[14px] leading-6 text-g800">
          <Inline s={line.replace(/^\s*[-*]\s/, '· ').trim()} />
        </p>,
      )
    } else if (line.trim()) {
      out.push(<p key={key++} className="my-2 text-[14px] leading-6 text-g800"><Inline s={line} /></p>)
    }
    i++
  }
  return out
}

function Inline({ s }) {
  // **굵게** 만 처리 — 약관 문서가 쓰는 유일한 인라인 서식이다
  const parts = s.split(/\*\*(.+?)\*\*/g)
  return parts.map((p, i) => (i % 2 ? <b key={i} className="text-g900">{p}</b> : p))
}

import React from "react";

/* 약관 본문 렌더러.

   약관 하나 보여 주자고 마크다운 라이브러리를 넣지 않는다. 번들이 커지고,
   그 라이브러리는 우리가 쓰지 않는 문법(코드 하이라이트·이미지·HTML)까지 들고 온다.
   본문에 실제로 쓰인 것은 제목·문단·목록·표·인용·굵게, 여섯 가지뿐이다.

   서버가 내려주는 우리 문서만 렌더링한다. 원문 HTML 은 해석하지 않는다. */

function Inline({ text }) {
  // **굵게** 와 `코드` 만 처리한다. 조항 번호·금액 강조와 예시 값에만 쓰인다.
  const parts = String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith("**") && p.endsWith("**")) {
          return <b key={i} className="font-bold text-ink">{p.slice(2, -2)}</b>;
        }
        if (p.startsWith("`") && p.endsWith("`") && p.length > 2) {
          return (
            <code key={i} className="rounded bg-g100 px-1 py-0.5 text-[12px] text-g700">
              {p.slice(1, -1)}
            </code>
          );
        }
        return <React.Fragment key={i}>{p}</React.Fragment>;
      })}
    </>
  );
}

function Table({ rows }) {
  const [head, ...body] = rows;
  return (
    // 표는 자기 안에서만 가로로 흐른다. 페이지가 통째로 밀리면 읽을 수 없다.
    <div className="my-3 overflow-x-auto">
      <table className="w-full min-w-[420px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-line">
            {head.map((c, i) => (
              <th key={i} className="px-2 py-2 text-left font-bold text-g700">
                <Inline text={c} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((r, i) => (
            <tr key={i} className="border-b border-line/60">
              {r.map((c, j) => (
                <td key={j} className="px-2 py-2 align-top leading-relaxed text-g600">
                  <Inline text={c} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const cells = (line) =>
  line.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

export default function Markdown({ text }) {
  const lines = String(text || "").split("\n");
  const out = [];
  let i = 0;
  let key = 0;

  const flushList = (items, ordered) => {
    const Tag = ordered ? "ol" : "ul";
    out.push(
      <Tag
        key={key++}
        className={`my-2 space-y-1.5 pl-5 text-[14px] leading-relaxed text-g600 ${
          ordered ? "list-decimal" : "list-disc"
        }`}
      >
        {items.map((t, n) => (
          <li key={n}><Inline text={t} /></li>
        ))}
      </Tag>
    );
  };

  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();

    if (!t) { i++; continue; }

    if (t === "---") {
      out.push(<hr key={key++} className="my-5 border-line" />);
      i++; continue;
    }

    if (t.startsWith("#")) {
      const level = t.match(/^#+/)[0].length;
      const body = t.replace(/^#+\s*/, "");
      const cls = {
        1: "mt-1 mb-3 text-[22px] font-bold tracking-[-0.03em] text-ink",
        2: "mt-6 mb-2 text-[17px] font-bold tracking-[-0.02em] text-ink",
        3: "mt-4 mb-1.5 text-[15px] font-bold text-ink",
      }[Math.min(level, 3)];
      out.push(<p key={key++} className={cls}><Inline text={body} /></p>);
      i++; continue;
    }

    if (t.startsWith("|")) {
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const r = lines[i].trim();
        // |---|---| 구분선은 데이터가 아니다
        if (!/^\|[\s:|-]+\|$/.test(r)) rows.push(cells(r));
        i++;
      }
      if (rows.length) out.push(<Table key={key++} rows={rows} />);
      continue;
    }

    if (t.startsWith(">")) {
      const buf = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        buf.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      out.push(
        <blockquote
          key={key++}
          className="my-3 rounded-field border-l-[3px] border-brand bg-g100 px-3 py-2.5 text-[13px] leading-relaxed text-g600"
        >
          <Inline text={buf.join(" ")} />
        </blockquote>
      );
      continue;
    }

    const bullet = /^[-*]\s+/;
    const numbered = /^\d+\.\s+/;
    if (bullet.test(t) || numbered.test(t)) {
      const ordered = numbered.test(t);
      const re = ordered ? numbered : bullet;
      const items = [];
      while (i < lines.length) {
        const cur = lines[i].trim();
        if (re.test(cur)) {
          items.push(cur.replace(re, ""));
          i++;
        } else if (cur && /^\s{2,}/.test(lines[i]) && items.length) {
          // 들여쓴 줄은 앞 항목의 이어짐이다
          items[items.length - 1] += " " + cur.replace(bullet, "");
          i++;
        } else break;
      }
      flushList(items, ordered);
      continue;
    }

    const buf = [];
    while (i < lines.length && lines[i].trim() &&
           !/^[#>|]|^[-*]\s|^\d+\.\s|^---$/.test(lines[i].trim())) {
      buf.push(lines[i].trim());
      i++;
    }
    out.push(
      <p key={key++} className="my-2 text-[14px] leading-relaxed text-g600">
        <Inline text={buf.join(" ")} />
      </p>
    );
  }

  return <div>{out}</div>;
}

import { useState } from 'react'

// 첫 진입 — 로그인 화면 (데모). 실제 인증은 없다: 입력은 어디에도 저장·전송되지
// 않는 보여주기식이고, 간편 로그인을 누르면 바로 들어간다. 하단에 프로토타입
// 고지를 항상 남겨 실제 코레일 로그인 페이지와 구분한다.
export default function Onboarding({ onStart }) {
  const [id, setId] = useState('')
  const [pw, setPw] = useState('')
  const [remember, setRemember] = useState(true)
  const [auto, setAuto] = useState(false)

  const login = () => onStart(id.trim())

  return (
    <div className="flex min-h-screen flex-col bg-white px-6 pb-8 pt-6">
      <div className="flex items-center justify-between">
        <h1 className="text-[26px] font-bold text-g900">로그인</h1>
        {/* 닫기 = 로그인 없이 둘러보기 */}
        <button onClick={() => onStart('')} aria-label="닫기"
                className="p-1 text-[22px] leading-none text-g800">✕</button>
      </div>

      <div className="mt-8 space-y-3">
        <input
          value={id} onChange={(e) => setId(e.target.value)}
          placeholder="회원번호, 휴대폰 번호 또는 이메일"
          className="w-full rounded-2xl border border-g400 px-5 py-6 text-[17px] placeholder:text-g500 focus-ring"
        />
        <input
          type="password" value={pw} onChange={(e) => setPw(e.target.value)}
          placeholder="비밀번호"
          className="w-full rounded-2xl border border-g400 px-5 py-6 text-[17px] placeholder:text-g500 focus-ring"
        />
      </div>

      <div className="mt-5 flex items-center gap-8">
        <label className="flex cursor-pointer items-center gap-2.5">
          <CheckBox checked={remember} onChange={setRemember} />
          <span className="text-[17px] text-g900">기억하기</span>
        </label>
        <label className="flex cursor-pointer items-center gap-2.5">
          <CheckBox checked={auto} onChange={setAuto} />
          <span className="text-[17px] text-g900">자동로그인</span>
        </label>
      </div>

      <button
        onClick={login}
        disabled={!id || !pw}
        className={`mt-6 w-full rounded-2xl py-6 text-[18px] font-semibold
          ${id && pw ? 'bg-brand text-white active:bg-brand-700' : 'bg-g100 text-g400'}`}
      >
        로그인
      </button>

      <div className="mt-6 flex items-center justify-center gap-3 text-[16px] text-g800">
        <button>회원번호 찾기</button>
        <span className="text-g300">|</span>
        <button>비밀번호 찾기</button>
        <span className="text-g300">|</span>
        <button className="font-semibold text-brand">회원가입</button>
      </div>

      <div className="mt-12 flex items-center gap-4">
        <div className="h-px flex-1 bg-g300" />
        <span className="text-[14px] text-g600">또는</span>
        <div className="h-px flex-1 bg-g300" />
      </div>

      {/* 데모: 간편 로그인 = 바로 로그인 */}
      <button
        onClick={login}
        className="mt-8 w-full rounded-xl border border-g800 py-6 text-[20px] font-bold text-g900 active:bg-g50"
      >
        간편 로그인
      </button>

      {/* 소셜 로그인 — 각 사 공식 에셋·컬러 규격. 데모라 누르면 바로 로그인된다 */}
      <div className="mt-8 flex items-center justify-center gap-5">
        <button onClick={login} aria-label="네이버로 로그인"
                className="h-14 w-14 overflow-hidden rounded-full">
          <img src="/login-naver.png" alt="" className="h-full w-full object-cover" />
        </button>
        <button onClick={login} aria-label="카카오로 로그인"
                className="h-14 w-14 overflow-hidden rounded-full bg-[#fee500]">
          <img src="/login-kakao.png" alt="" className="h-full w-full object-cover" />
        </button>
        <button onClick={login} aria-label="Apple로 로그인"
                className="flex h-14 w-14 items-center justify-center rounded-full border border-g300 bg-white">
          <img src="/login-apple.png" alt="" className="h-8 w-8 object-contain" />
        </button>
        <button onClick={login} aria-label="Google로 로그인" className="h-14 w-14">
          <img src="/login-google.png" alt="" className="h-full w-full object-contain" />
        </button>
      </div>

      <p className="mt-auto pt-10 text-center text-[13px] leading-5 text-g500">
        제안용 프로토타입 데모 화면입니다. 입력은 저장·전송되지 않아요.<br />
        MOVE-AI CHALLENGE 2026 · 한국철도공사 제안 · 공식 서비스가 아닙니다.
      </p>
    </div>
  )
}

function CheckBox({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`flex h-9 w-9 items-center justify-center rounded-lg border text-[18px] font-bold
        ${checked ? 'border-brand bg-brand text-white' : 'border-g400 bg-white text-transparent'}`}
    >
      ✓
    </button>
  )
}

import { useEffect, useState } from 'react'
import { api } from '../api'

// 첫 진입 — 블루 히어로 + 로그인 시트 (데모).
// 실제 인증은 없다: 입력은 어디에도 저장·전송되지 않는 보여주기식이고,
// 간편 로그인·소셜 버튼을 누르면 바로 들어간다. 하단 프로토타입 고지를 항상
// 남겨 실제 코레일 로그인 페이지와 구분한다.
export default function Onboarding({ onStart }) {
  const [id, setId] = useState('')
  const [pw, setPw] = useState('')
  const [remember, setRemember] = useState(true)
  const [auto, setAuto] = useState(false)
  const [live, setLive] = useState(null)

  useEffect(() => {
    api.get('/live').then(setLive).catch(() => {})
  }, [])

  const login = () => onStart(id.trim())

  return (
    <div className="header-gradient flex min-h-screen flex-col text-white">
      {/* 히어로 */}
      <div className="px-6 pb-10 pt-10">
        <img src="/korail-white.png" alt="KORAIL" className="h-8" />
        <h1 className="mt-7 text-[38px] font-bold leading-[1.15] tracking-[-0.02em]">
          KTX<br />당일배송
        </h1>
        <p className="mt-3 text-[17px] opacity-90">역에 가지 않고 오늘 안에 보냅니다</p>
        {live && (
          <div className="tnum mt-6 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2.5 text-[15px]">
            <span className="h-1.5 w-1.5 rounded-full bg-white" />
            오늘 {live.today_orders}건 접수
            {live.ontime_rate != null && <> · 정시 도착률 {(live.ontime_rate * 100).toFixed(1)}%</>}
          </div>
        )}
      </div>

      {/* 로그인 시트 */}
      <div className="flex-1 rounded-t-[28px] bg-white px-6 pb-8 pt-7 text-g900">
        <div className="space-y-2.5">
          <input
            value={id} onChange={(e) => setId(e.target.value)}
            placeholder="회원번호, 휴대폰 번호 또는 이메일"
            className="w-full rounded-2xl border border-g300 px-4 py-4 text-[16px] placeholder:text-g500 focus-ring"
          />
          <input
            type="password" value={pw} onChange={(e) => setPw(e.target.value)}
            placeholder="비밀번호"
            className="w-full rounded-2xl border border-g300 px-4 py-4 text-[16px] placeholder:text-g500 focus-ring"
          />
        </div>

        <div className="mt-4 flex items-center gap-7">
          <label className="flex cursor-pointer items-center gap-2">
            <CheckBox checked={remember} onChange={setRemember} />
            <span className="text-[15px] text-g900">기억하기</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <CheckBox checked={auto} onChange={setAuto} />
            <span className="text-[15px] text-g900">자동로그인</span>
          </label>
        </div>

        <button
          onClick={login}
          disabled={!id || !pw}
          className={`mt-4 w-full rounded-2xl py-4 text-[17px] font-bold
            ${id && pw ? 'bg-brand text-white active:bg-brand-700' : 'bg-g100 text-g400'}`}
        >
          로그인
        </button>

        <div className="mt-4 flex items-center justify-center gap-3 text-[14px] text-g700">
          <button>회원번호 찾기</button>
          <span className="text-g300">|</span>
          <button>비밀번호 찾기</button>
          <span className="text-g300">|</span>
          <button className="font-semibold text-brand">회원가입</button>
        </div>

        <div className="mt-6 flex items-center gap-4">
          <div className="h-px flex-1 bg-g200" />
          <span className="text-[13px] text-g500">또는</span>
          <div className="h-px flex-1 bg-g200" />
        </div>

        {/* 데모: 간편 로그인 = 바로 로그인 */}
        <button
          onClick={login}
          className="mt-5 w-full rounded-xl border border-g800 py-4 text-[17px] font-bold text-g900 active:bg-g50"
        >
          간편 로그인
        </button>

        {/* 소셜 로그인 — 각 사 공식 배포 에셋과 지정 규격을 따른다. 누르면 바로 로그인.
            네이버: 공식 아이콘 버튼(그린 #03C75A) · 카카오: 컨테이너 #FEE500 + 공식 심볼
            애플: HIG 검정 버튼 + 흰 로고 · 구글: 공식 원형(흰 배경 · 획 #747775) */}
        <div className="mt-5 flex items-center justify-center gap-5">
          <button onClick={login} aria-label="네이버로 로그인"
                  className="h-[52px] w-[52px] overflow-hidden rounded-full">
            <img src="/login-naver.png" alt="" className="h-full w-full object-cover" />
          </button>
          <button onClick={login} aria-label="카카오로 로그인"
                  className="h-[52px] w-[52px] overflow-hidden rounded-full bg-[#fee500]">
            <img src="/login-kakao.png" alt="" className="h-full w-full object-cover" />
          </button>
          <button onClick={login} aria-label="Apple로 로그인"
                  className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-black">
            <img src="/login-apple-white.png" alt="" className="h-7 w-7 object-contain" />
          </button>
          <button onClick={login} aria-label="Google로 로그인" className="h-[52px] w-[52px]">
            <img src="/login-google.png" alt="" className="h-full w-full object-contain" />
          </button>
        </div>

        <button onClick={() => onStart('')} className="mt-5 w-full text-center text-[15px] font-semibold text-g700">
          로그인 없이 둘러보기
        </button>

        <p className="mt-5 border-t border-g100 pt-4 text-center text-[12px] leading-5 text-g500">
          제안용 프로토타입 데모 화면입니다. 입력은 저장·전송되지 않아요.<br />
          MOVE-AI CHALLENGE 2026 · 한국철도공사 제안 · 공식 서비스가 아닙니다.
        </p>
      </div>
    </div>
  )
}

function CheckBox({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`flex h-7 w-7 items-center justify-center rounded-md border text-[15px] font-bold
        ${checked ? 'border-brand bg-brand text-white' : 'border-g400 bg-white text-transparent'}`}
    >
      ✓
    </button>
  )
}

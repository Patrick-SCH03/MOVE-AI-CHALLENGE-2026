import { useEffect, useState } from 'react'
import { api } from '../api'

// 첫 진입 — 로그인이 아니라 이름 하나만 묻는다.
// KORAIL 로고 옆에 비밀번호 입력을 두면 실제 로그인 페이지와 구분되지 않는다.
export default function Onboarding({ onStart }) {
  const [name, setName] = useState('')
  const [live, setLive] = useState(null)

  useEffect(() => {
    api.get('/live').then(setLive).catch(() => {})
  }, [])

  return (
    <div className="header-gradient flex min-h-screen flex-col text-white">
      <div className="flex-1 px-6 pt-10">
        <img src="/korail-white.png" alt="KORAIL" className="h-8" />
        <h1 className="mt-8 text-[40px] font-bold leading-[1.15] tracking-[-0.02em]">
          KTX<br />당일배송
        </h1>
        <p className="mt-4 text-[17px] opacity-90">역에 가지 않고 오늘 안에 보냅니다</p>
        {live && (
          <div className="tnum mt-8 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2.5 text-[15px]">
            <span className="h-1.5 w-1.5 rounded-full bg-white" />
            오늘 {live.today_orders}건 접수
            {live.ontime_rate != null && <> · 정시 도착률 {(live.ontime_rate * 100).toFixed(1)}%</>}
          </div>
        )}
      </div>

      <div className="rounded-t-[28px] bg-white px-6 pb-8 pt-7 text-g900">
        <label className="text-[14px] font-semibold">이름</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="알림에 표시할 이름 (선택)"
          className="mt-2 w-full rounded-field bg-g100 px-4 py-4 text-[16px] focus-ring"
        />
        <button
          onClick={() => onStart(name.trim())}
          className="mt-4 w-full rounded-btn bg-brand py-4 text-[17px] font-bold text-white active:bg-brand-700"
        >
          시작하기
        </button>
        <button onClick={() => onStart('')} className="mt-4 w-full text-[16px] font-semibold text-g800">
          이름 없이 둘러보기
        </button>
        <div className="mt-6 flex items-center justify-center gap-3 border-t border-g200 pt-5 text-[14px] text-g700">
          <span>이용약관</span><span className="text-g300">|</span>
          <span>개인정보처리방침</span><span className="text-g300">|</span>
          <span className="text-g500">고객센터</span>
        </div>
        <p className="mt-3 text-center text-[13px] leading-5 text-g500">
          제안용 프로토타입이라 로그인이 없습니다. 이름은 이 기기에만 저장돼요.<br />
          MOVE-AI CHALLENGE 2026 · 한국철도공사 제안 · 공식 서비스가 아닙니다.
        </p>
      </div>
    </div>
  )
}

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      // 회색은 반드시 평평한 키 — 중첩(g:{100:…})으로 두면 Tailwind 가 g-100 으로
      // 클래스명을 만들어 코드 전체의 g100 이 조용히 무시된다 (실제로 당한 사고)
      colors: {
        g50: '#f9fafb', g100: '#f2f4f6', g200: '#e5e8eb', g300: '#d1d6db',
        g400: '#b0b8c1', g500: '#8b95a1', g600: '#6b7684', g700: '#4e5968',
        g800: '#333d4b', g900: '#191f28',
        brand: {
          DEFAULT: '#1266e5', 900: '#0b47a8', 700: '#0d55c8',
          300: '#8ab8f5', 50: '#eaf2fe', ci: '#0066b2',
        },
        accent: '#00afdc',
        ok: '#0f9d58', okbg: '#eaf7f0',
        warn: '#d97706', warnbg: '#fdf4e7',
        danger: '#e5342b', dangerbg: '#fdeeed',
      },
      borderRadius: { card: '20px', btn: '14px', field: '12px' },
      boxShadow: {
        card: '0 1px 2px rgba(25,31,40,.05),0 6px 16px -10px rgba(25,31,40,.18)',
      },
      fontFamily: {
        sans: ['Pretendard', '-apple-system', 'Malgun Gothic', 'Noto Sans KR', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

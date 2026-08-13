/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          900: "var(--brand-900)",
          700: "var(--brand-700)",
          DEFAULT: "var(--brand)",
          300: "var(--brand-300)",
          50: "var(--brand-50)",
        },
        accent: "var(--accent)",
        /* 로고 전용 CI 파랑. 액션 파랑(brand)과 다르다 — 코레일톡도 둘을 나눠 쓴다. */
        ci: "var(--brand-ci)",
        /* 아이콘 타일·세그먼트 트랙에 깔리는 옅은 파랑 면 */
        tint: "var(--brand-50)",
        /* 회색은 평평한 키로 둔다.
           중첩({ g: { 100: … })으로 쓰면 Tailwind 가 g-100 으로 이름을 만들어
           코드 전체가 쓰는 g100 클래스는 아예 생성되지 않는다 — 조용히 무시된다. */
        g50: "var(--g50)", g100: "var(--g100)", g200: "var(--g200)",
        g300: "var(--g300)", g400: "var(--g400)", g500: "var(--g500)",
        g600: "var(--g600)", g700: "var(--g700)", g800: "var(--g800)",
        g900: "var(--g900)",
        ink: "var(--ink)",
        sub: "var(--sub)",
        mute: "var(--mute)",
        card: "var(--card)",
        line: "var(--line)",
        bg: "var(--bg)",
        ok: "var(--ok)",
        okbg: "var(--ok-bg)",
        warn: "var(--warn)",
        warnbg: "var(--warn-bg)",
        danger: "var(--danger)",
        dangerbg: "var(--danger-bg)",
      },
      borderRadius: {
        card: "var(--r-card)",
        btn: "var(--r-btn)",
        field: "var(--r-field)",
        chip: "var(--r-chip)",
      },
      boxShadow: { pop: "var(--shadow-pop)", card: "var(--shadow-card)" },
      fontFamily: { sans: ["var(--font)"] },
      maxWidth: { phone: "430px" },
    },
  },
  plugins: [],
};

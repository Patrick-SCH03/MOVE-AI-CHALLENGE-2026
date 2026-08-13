import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 로컬 dev 에서는 /api 를 백엔드로 프록시 — VITE_API_BASE 가 비어 있어도 동작한다.
// 배포에서는 VITE_API_BASE(Railway 주소)가 빌드 타임에 박힌다.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8020',
    },
  },
})

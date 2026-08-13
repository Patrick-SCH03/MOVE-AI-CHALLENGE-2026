import { useEffect, useState } from "react";

/* 모바일과 데스크톱 레이아웃을 CSS(hidden/lg:block)로만 나누면 두 트리가 모두
   DOM에 남는다. 컴포넌트가 두 번 마운트되어 API도 두 번 호출된다.
   레이아웃 분기는 렌더 단계에서 한다.

   matchMedia의 change 이벤트만 믿지 않는다. 임베디드 웹뷰나 개발자도구의
   뷰포트 강제 변경에서는 change가 발생하지 않는 경우가 있어, resize를 함께 듣고
   매번 현재 값을 다시 읽는다. */
export default function useMediaQuery(query) {
  const read = () =>
    typeof window !== "undefined" && window.matchMedia(query).matches;

  const [matches, setMatches] = useState(read);

  useEffect(() => {
    const mq = window.matchMedia(query);
    const sync = () => setMatches(mq.matches);

    sync();
    mq.addEventListener("change", sync);
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    return () => {
      mq.removeEventListener("change", sync);
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
    };
  }, [query]);

  return matches;
}

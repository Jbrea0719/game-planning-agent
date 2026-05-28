"use client";

// 디바이스 감지 훅
// - 화면 폭 768px 미만 = 모바일
// - URL 쿼리 ?view=mobile / ?view=desktop 로 강제 가능 (개발·테스트용)
// - SSR 안전: 초기값은 null로 시작 후 mount 시점에 결정 (hydration 충돌 방지)

import { useEffect, useState } from "react";

const MOBILE_BREAKPOINT = 768;

export function useIsMobile(): boolean | null {
  // null = 아직 판정 전 (SSR/초기 hydration)
  const [isMobile, setIsMobile] = useState<boolean | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // URL 쿼리로 강제 (개발 편의용)
    const params = new URLSearchParams(window.location.search);
    const forced = params.get("view");
    if (forced === "mobile") { setIsMobile(true); return; }
    if (forced === "desktop") { setIsMobile(false); return; }

    // 화면 폭 기준
    const check = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    check();

    // 리사이즈·회전 시 자동 재판정
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  return isMobile;
}

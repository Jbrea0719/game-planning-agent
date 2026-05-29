"use client";

// 디바이스 감지 + 강제 모드 훅
// - 화면 폭 768px 미만 = 자동 모바일
// - URL 쿼리 ?view=mobile-ios | mobile-android | mobile | desktop 로 강제 가능
// - mobile-ios / mobile-android는 PC에서도 모바일 뷰 + 해당 프레임 비율로 렌더링
// - SSR 안전: 초기값 null

import { useEffect, useState } from "react";

const MOBILE_BREAKPOINT = 768;

export type FrameKind = "ios" | "android" | null;

export interface DeviceMode {
  isMobile: boolean | null;     // null = 판정 전
  frameKind: FrameKind;          // PC에서 강제 모바일 뷰일 때 디바이스 프레임 종류
}

export function useIsMobile(): boolean | null {
  return useDeviceMode().isMobile;
}

export function useDeviceMode(): DeviceMode {
  const [mode, setMode] = useState<DeviceMode>({ isMobile: null, frameKind: null });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const forced = params.get("view");

    // 강제 모드
    if (forced === "mobile-ios") { setMode({ isMobile: true, frameKind: "ios" }); return; }
    if (forced === "mobile-android") { setMode({ isMobile: true, frameKind: "android" }); return; }
    if (forced === "mobile") { setMode({ isMobile: true, frameKind: null }); return; }
    if (forced === "desktop") { setMode({ isMobile: false, frameKind: null }); return; }

    // 자동 감지 (화면 폭 기준)
    const check = () => setMode({
      isMobile: window.innerWidth < MOBILE_BREAKPOINT,
      frameKind: null,
    });
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  return mode;
}

// 디바이스 프레임 비율 (PC에서 모바일 뷰 미리보기용)
export const DEVICE_FRAMES = {
  ios: { width: 390, height: 844, label: "iPhone 14 (390×844)" },
  android: { width: 412, height: 915, label: "Android (412×915)" },
} as const;

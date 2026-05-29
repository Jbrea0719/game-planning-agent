import type { MetadataRoute } from "next";

// PWA 매니페스트 — 홈 화면 설치 시 주소창 없이 전체화면(standalone)으로 실행
// Next가 app/manifest.ts를 자동 감지해 <link rel="manifest">를 넣어줌
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "조던 — 게임 기획 AI",
    short_name: "조던",
    description: "영웅수집형 게임 기획 전문가 AI",
    start_url: "/chat",
    scope: "/",
    display: "standalone", // 전체화면 (브라우저 주소창·툴바 숨김)
    orientation: "portrait",
    background_color: "#0a0e1a", // 스플래시·로딩 배경
    theme_color: "#0a0e1a", // 상태바 색
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

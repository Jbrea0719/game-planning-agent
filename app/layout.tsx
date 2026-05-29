import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// 메타데이터 — 앱 이름·설명 + iOS 홈 화면(PWA) 설정
export const metadata: Metadata = {
  title: "Jordan - Game Design",
  description: "영웅수집형 게임 기획 전문가 AI — 분석 · 설계 · 검토 파이프라인",
  // iOS: 홈 화면에 추가하면 주소창 없이 전체화면(standalone)으로 실행
  appleWebApp: {
    capable: true,
    title: "조던",
    statusBarStyle: "black", // 다크 테마에 맞춰 상태바 검정 (글자 겹침 없음)
  },
};

// 뷰포트 — 상태바 색 (Next 16에선 themeColor를 viewport로 분리해서 export)
export const viewport: Viewport = {
  themeColor: "#0a0e1a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* 한글 웹폰트 Pretendard — 전 기기에서 동일한 글자로 통일 (CDN, 필요한 글자만 동적 로드) */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          as="style"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

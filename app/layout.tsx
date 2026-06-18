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
      // 테마 선적용 스크립트가 첫 페인트 전에 data-theme 을 바꾸므로
      // 서버 HTML과 차이가 생김 → 의도된 동작이라 하이드레이션 경고 억제
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* 테마(스킨) 선적용 — 첫 페인트 전에 저장된 테마를 입혀 깜빡임(FOUC) 방지 */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var k=localStorage.getItem('jordan-theme');var bar={dark:'#0a0e1a',light:'#eaf0f8',sepia:'#e7dcc4',ocean:'#06161d'};if(k&&k!=='dark'&&bar[k]){document.documentElement.setAttribute('data-theme',k);var m=document.querySelector('meta[name="theme-color"]');if(!m){m=document.createElement('meta');m.setAttribute('name','theme-color');document.head.appendChild(m);}m.setAttribute('content',bar[k]);}}catch(e){}})();`,
          }}
        />
        {/* 한글 웹폰트 Pretendard — 전 기기에서 동일한 글자로 통일 (CDN, 필요한 글자만 동적 로드) */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          as="style"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
        {/* 한글 고정폭 글꼴 — 코드블록·UI 프레임의 한글이 영문 2칸으로 딱 맞아 박스 정렬이 깨지지 않음 */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Nanum+Gothic+Coding:wght@400;700&display=swap"
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

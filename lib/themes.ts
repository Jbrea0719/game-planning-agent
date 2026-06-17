// 앱 테마(스킨) 정의 — 단일 출처(single source of truth).
//   - id: <html data-theme="id"> 에 들어가는 값 (globals.css 의 [data-theme="id"] 와 일치)
//   - swatch: 전환기 미리보기용 대표 색 3종 (배경 / 강조 / 텍스트)
// 새 스킨 추가: globals.css 에 [data-theme="새이름"] 블록 + 아래 배열에 한 줄 추가하면 끝.

export type ThemeId = "dark" | "light" | "sepia" | "ocean";

export interface ThemeDef {
  id: ThemeId;
  label: string;        // 화면에 보일 한글 이름
  emoji: string;
  statusbar: string;    // 모바일 PWA 상태바 색
  swatch: [string, string, string]; // [배경, 강조, 텍스트]
}

export const THEMES: ThemeDef[] = [
  { id: "dark",  label: "다크 실버", emoji: "🌑", statusbar: "#0a0e1a", swatch: ["#0d1525", "#c0c8d8", "#e0e8f0"] },
  { id: "light", label: "라이트",    emoji: "☀️", statusbar: "#eaf0f8", swatch: ["#f3f6fc", "#3b6ef5", "#1b2433"] },
  { id: "sepia", label: "세피아",    emoji: "📜", statusbar: "#e7dcc4", swatch: ["#efe6d4", "#a9703b", "#3a2f23"] },
  { id: "ocean", label: "딥오션",    emoji: "🌊", statusbar: "#06161d", swatch: ["#0a2230", "#4fd6c9", "#d6eef2"] },
];

export const DEFAULT_THEME: ThemeId = "dark";
export const THEME_STORAGE_KEY = "jordan-theme";

export function isThemeId(v: unknown): v is ThemeId {
  return typeof v === "string" && THEMES.some((t) => t.id === v);
}

// 테마 적용 — data-theme 설정 + 상태바(theme-color) 동기화 + 저장
export function applyTheme(id: ThemeId) {
  if (typeof document === "undefined") return;
  const def = THEMES.find((t) => t.id === id) ?? THEMES[0];
  // 기본(dark)은 속성 제거 → :root 기본값 사용
  if (def.id === DEFAULT_THEME) document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", def.id);
  // 모바일 상태바 색
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", def.statusbar);
  try { localStorage.setItem(THEME_STORAGE_KEY, def.id); } catch {}
}

export function getStoredTheme(): ThemeId {
  if (typeof localStorage === "undefined") return DEFAULT_THEME;
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeId(v) ? v : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

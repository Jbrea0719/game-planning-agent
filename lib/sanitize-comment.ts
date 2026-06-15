// 댓글 리치텍스트 화이트리스트 새니타이저 (볼드·폰트크기·폰트색상만 허용)
// 사용자가 만든 HTML을 그대로 렌더하면 XSS 위험 → 허용 태그·스타일만 남기고 전부 escape.

export const FONT_MIN = 13;  // 현재 댓글 크기 = 최소
export const FONT_MAX = 22;  // 과하지 않은 최대
export const FONT_SIZES = [13, 16, 19, 22];

// 허용 색상 팔레트 (기본 = 색 없음)
export const COMMENT_COLORS = [
  { name: "기본", value: "" },
  { name: "빨강", value: "#e5484d" },
  { name: "파랑", value: "#5b9bd5" },
  { name: "초록", value: "#46a758" },
  { name: "골드", value: "#d9a441" },
  { name: "회색", value: "#9aa4b2" },
];

const COLOR_RE = /^#[0-9a-fA-F]{3,8}$|^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/;

function safeStyle(el: HTMLElement): string {
  const out: string[] = [];
  const color = (el.style.color || "").trim();
  if (color && COLOR_RE.test(color)) out.push(`color:${color}`);
  const fs = (el.style.fontSize || "").trim();
  const m = fs.match(/^(\d+(?:\.\d+)?)px$/);
  if (m) {
    let n = Math.round(parseFloat(m[1]));
    n = Math.max(FONT_MIN, Math.min(FONT_MAX, n));
    out.push(`font-size:${n}px`);
  }
  const fw = (el.style.fontWeight || "").trim();
  if (fw === "bold" || (parseInt(fw, 10) >= 600)) out.push("font-weight:bold");
  return out.join(";");
}

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// HTML 입력 → 허용된 태그/스타일만 남긴 안전한 HTML 반환
export function sanitizeCommentHtml(html: string): string {
  if (typeof window === "undefined" || !html) return "";
  const tpl = document.createElement("template");
  tpl.innerHTML = html;

  function walk(node: Node): string {
    let res = "";
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        res += escapeText(child.textContent || "");
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        const tag = el.tagName;
        if (tag === "BR") { res += "<br>"; return; }
        const inner = walk(el);
        if (tag === "B" || tag === "STRONG") {
          res += `<b>${inner}</b>`;
        } else if (tag === "SPAN" || tag === "FONT") {
          const st = safeStyle(el);
          res += st ? `<span style="${st}">${inner}</span>` : inner;
        } else if (tag === "DIV" || tag === "P") {
          res += inner + "<br>";  // 블록 → 줄바꿈 보존
        } else {
          res += inner;  // 그 외 태그는 벗겨내고 내용만
        }
      }
    });
    return res;
  }

  return walk(tpl.content).replace(/(<br>\s*)+$/, "").trim();
}

// 태그가 전혀 없는 평문인지 (옛 댓글 호환 — 평문은 줄바꿈 보존해 텍스트로 렌더)
export function isPlainText(s: string): boolean {
  return !/<[a-z!/][\s\S]*>/i.test(s);
}

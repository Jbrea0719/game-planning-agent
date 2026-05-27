// 기획서 내보내기 유틸 — DocumentView에서 추출
// MD / TXT / HTML / PDF 4가지 포맷 지원

import { marked } from "marked";

export function safeName(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, "_").trim() || "design_doc";
}

export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// 마크다운 → 깔끔한 HTML 문서 (printMode면 인쇄 친화 스타일 추가)
export function buildHtmlDoc(title: string, bodyHtml: string, printMode = false): string {
  const escTitle = title.replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] ?? c));
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escTitle}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  body {
    font-family: -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", "맑은 고딕", sans-serif;
    line-height: 1.7;
    color: #1a1a1a;
    max-width: 820px;
    margin: 0 auto;
    padding: 48px 32px;
    background: #fff;
  }
  h1 { font-size: 28px; margin: 0 0 24px; padding-bottom: 12px; border-bottom: 2px solid #333; }
  h2 { font-size: 22px; margin: 36px 0 14px; padding-bottom: 8px; border-bottom: 1px solid #ccc; }
  h3 { font-size: 18px; margin: 28px 0 10px; color: #333; }
  h4 { font-size: 15px; margin: 22px 0 8px; color: #555; }
  p { margin: 10px 0; }
  ul, ol { margin: 10px 0; padding-left: 28px; }
  li { margin: 4px 0; }
  strong { color: #000; }
  em { color: #444; }
  code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; font-size: 0.92em; font-family: "SF Mono", Consolas, monospace; }
  pre { background: #f5f5f5; padding: 14px; border-radius: 6px; overflow-x: auto; }
  pre code { background: transparent; padding: 0; }
  blockquote { border-left: 4px solid #999; padding: 4px 16px; margin: 14px 0; color: #555; background: #fafafa; }
  table { border-collapse: collapse; width: 100%; margin: 14px 0; }
  th, td { border: 1px solid #ccc; padding: 8px 12px; text-align: left; }
  th { background: #f0f0f0; font-weight: 600; }
  a { color: #0066cc; }
  hr { border: none; border-top: 1px solid #ccc; margin: 28px 0; }
  .footer { margin-top: 48px; padding-top: 14px; border-top: 1px solid #ccc; color: #888; font-size: 11px; text-align: center; }
  ${printMode ? `
    @page { size: A4; margin: 18mm 16mm; }
    @media print {
      body { padding: 0; max-width: none; }
      h1, h2, h3 { page-break-after: avoid; }
      pre, blockquote, table { page-break-inside: avoid; }
    }
  ` : ""}
</style>
</head>
<body>
${bodyHtml}
<div class="footer">조던 — 게임 기획 전문가 · ${new Date().toLocaleString("ko-KR")}</div>
</body>
</html>`;
}

export interface DocForExport {
  title: string;
  content_markdown: string;
}

export function downloadMD(doc: DocForExport) {
  const blob = new Blob([doc.content_markdown], { type: "text/markdown;charset=utf-8" });
  triggerDownload(blob, `${safeName(doc.title)}.md`);
}

export function downloadTXT(doc: DocForExport) {
  const text = doc.content_markdown
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "• ")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/!\[(.*?)\]\((.+?)\)/g, "[$1]")
    .replace(/\[(.+?)\]\((.+?)\)/g, "$1")
    .replace(/^---+$/gm, "━━━━━━━━━━━━━━━━━━");
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  triggerDownload(blob, `${safeName(doc.title)}.txt`);
}

export function downloadHTML(doc: DocForExport) {
  const bodyHtml = marked.parse(doc.content_markdown, { async: false }) as string;
  const html = buildHtmlDoc(doc.title, bodyHtml);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  triggerDownload(blob, `${safeName(doc.title)}.html`);
}

// PDF: 새 창에서 HTML 띄우고 자동 print() → 사용자가 "PDF로 저장" 선택
export function downloadPDF(doc: DocForExport): boolean {
  const bodyHtml = marked.parse(doc.content_markdown, { async: false }) as string;
  const html = buildHtmlDoc(doc.title, bodyHtml, true);
  const win = window.open("", "_blank", "width=900,height=1200");
  if (!win) return false;  // 호출자가 팝업 차단 알림 처리
  win.document.write(html);
  win.document.close();
  setTimeout(() => {
    try { win.focus(); win.print(); } catch (err) { console.error("PDF 인쇄 실패:", err); }
  }, 400);
  return true;
}

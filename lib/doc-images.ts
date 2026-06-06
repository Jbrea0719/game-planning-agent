// 기획서 자동 이미지 — 클라이언트·서버 공용 순수 헬퍼 (React 없음)
//
// 자동 삽입한 이미지/다이어그램은 <!--J_IMG--> ~ <!--/J_IMG--> 주석 마커로 감싼다.
// → 다시 생성할 때 기존 자동 이미지만 깔끔히 걷어내고 새로 넣을 수 있음 (사용자가 직접 쓴 본문은 보존).
// → 본문 렌더(ReactMarkdown)에서는 HTML 주석이 표시되지 않아 화면엔 이미지/다이어그램만 보임.

export const J_IMG_START = "<!--J_IMG-->";
export const J_IMG_END = "<!--/J_IMG-->";

// 이미지 후보 한 항목 (적용 전 미리보기 단계에서 사용)
export type DocImageItem = {
  key: string;
  heading: string;            // 삽입될 섹션 헤딩 (본문에 그대로 존재하는 문자열)
  type: "diagram" | "mockup";
  alt: string;
  mermaid?: string;           // diagram
  prompt?: string;            // mockup (이미지 생성 프롬프트)
  imageUrl?: string;          // mockup (Gemini 생성 후 저장된 서빙 URL: /api/img/<id>)
  regenerating?: boolean;     // diagram 재생성 진행 중 (UI용)
  generating?: boolean;       // mockup 이미지 생성 진행 중 (UI용)
  genFailed?: boolean;        // mockup 이미지 생성 실패 (UI용)
};

// 자동 삽입된 이미지 블록(마커 포함)을 모두 제거 — 사용자가 쓴 본문은 그대로
export function stripJordanImages(md: string): string {
  const re = new RegExp(`\\n*${J_IMG_START}[\\s\\S]*?${J_IMG_END}`, "g");
  return md.replace(re, "");
}

// 한 항목을 마커로 감싼 마크다운 블록으로 변환
export function buildImageBlock(item: DocImageItem): string {
  if (item.type === "diagram" && item.mermaid) {
    return `${J_IMG_START}\n\`\`\`mermaid\n${item.mermaid}\n\`\`\`\n${J_IMG_END}`;
  }
  if (item.type === "mockup" && item.imageUrl) {
    return `${J_IMG_START}\n![${item.alt}](${item.imageUrl})\n${J_IMG_END}`;
  }
  return "";
}

// 깨끗한 본문에 항목들을 각 헤딩 바로 아래로 삽입
// (문서 등장 순서 내림차순으로 뒤에서부터 삽입해 앞쪽 인덱스가 밀리지 않도록)
export function insertImages(cleanMarkdown: string, items: DocImageItem[]): string {
  const ordered = items
    .map((it) => ({ it, idx: cleanMarkdown.indexOf(it.heading) }))
    .filter((x) => x.idx !== -1)
    .sort((a, b) => b.idx - a.idx);

  let out = cleanMarkdown;
  for (const { it, idx } of ordered) {
    const block = buildImageBlock(it);
    if (!block) continue;
    const lineEnd = out.indexOf("\n", idx + it.heading.length);
    const at = lineEnd === -1 ? out.length : lineEnd + 1;
    out = out.slice(0, at) + `\n${block}\n` + out.slice(at);
  }
  return out;
}

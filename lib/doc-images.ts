// 기획서 자동 이미지 — 클라이언트·서버 공용 순수 헬퍼 (React 없음)
//
// 자동 삽입은 마커 없이 순수 마크다운(```mermaid``` 코드블록 / ![](/api/img/..) 이미지)으로 넣는다.
// → 재생성 시에는 mermaid 코드블록·/api/img 이미지를 걷어내고 새로 넣는다 (이 앱에선 둘 다 자동 생성만 사용).
// → 사용자가 직접 쓴 본문이나 화면설계 첨부(다른 URL)는 건드리지 않음.
// (이전엔 <!--J_IMG--> 주석 마커를 썼으나, ReactMarkdown이 주석을 글자로 노출해서 폐기)

const LEGACY_START = "<!--J_IMG-->";
const LEGACY_END = "<!--/J_IMG-->";

// 기존 문서에 남은 마커 글자만 제거 (다이어그램/이미지 내용은 유지) — 정리용
export function removeMarkers(md: string): string {
  return md
    .replace(/<!--\/?J_IMG-->/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

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

// 자동 삽입 이미지 제거 — 재실행 시 깨끗한 본문 확보
// (구버전 마커 블록 + mermaid 코드블록 + /api/img 자동 이미지 모두 제거. 사용자 본문/외부 첨부는 보존)
export function stripJordanImages(md: string): string {
  return md
    // 구버전 마커로 감싼 블록 통째 제거 (잔존 문서 대응)
    .replace(new RegExp(`\\n*${LEGACY_START}[\\s\\S]*?${LEGACY_END}`, "g"), "")
    // mermaid 코드블록 (이 앱에선 자동 생성 다이어그램만 mermaid 사용)
    .replace(/\n*```mermaid[\s\S]*?```/g, "")
    // 자동 생성 목업 이미지 (서빙 URL이 /api/img/ 로 시작)
    .replace(/\n*!\[[^\]]*\]\(\/api\/img\/[^)]*\)/g, "")
    // 남은 마커 잔재 제거
    .replace(/<!--\/?J_IMG-->/g, "")
    .replace(/\n{3,}/g, "\n\n");
}

// 한 항목을 순수 마크다운 블록으로 변환 (마커 없음)
export function buildImageBlock(item: DocImageItem): string {
  if (item.type === "diagram" && item.mermaid) {
    return `\`\`\`mermaid\n${item.mermaid}\n\`\`\``;
  }
  if (item.type === "mockup" && item.imageUrl) {
    return `![${item.alt}](${item.imageUrl})`;
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

// 기획서 본문 텍스트 정규화.
// 정민님 지시(2026-06-24): 기획서에 긴 줄표(— em dash, ― 막대)를 쓰지 말고
// 일반 하이픈(-)으로 통일. 모델(조던)이 한국어 문장에서 자주 — 를 쓰므로,
// 프롬프트 지시와 별개로 출력물에 강제 치환을 한 번 더 걸어 보장한다.
//
// 대상 문자:
//   U+2014 em dash       —  (가장 흔함)
//   U+2015 horizontal bar ―  (— 와 시각적으로 동일, 한글 문서에서 종종 쓰임)
// → 모두 일반 하이픈(-)으로 치환. (en dash U+2013 은 숫자 범위 등에서 의미가 있어 건드리지 않음)
export function normalizeDashes(text: string): string {
  if (!text) return text;
  return text.replace(/[—―]/g, "-");
}

// 기획서 보일러플레이트 섹션 제거 — 정민님 지시(2026-06-24):
// '기획 바이블 교차 검증(결과)'·'다음 단계(TODO)' 섹션은 기획서에 쓰지 않는다.
// 헤딩(#~######) 텍스트에 '교차 검증' 또는 '다음 단계'가 있으면, 그 헤딩부터
// 같거나 상위 레벨의 다음 헤딩 전까지(하위 소제목 포함) 통째로 제거한다.
const REVIEW_SECTION_RE = /교차\s*검증|다음\s*단계/;
export function stripReviewSections(md: string): string {
  if (!md) return md;
  const lines = md.split("\n");
  const out: string[] = [];
  let skipLevel = 0;   // >0 이면 이 레벨 이하 헤딩을 만날 때까지 스킵
  let inFence = false;
  for (const line of lines) {
    const t = line.trimStart();
    if (t.startsWith("```")) { inFence = !inFence; if (skipLevel === 0) out.push(line); continue; }
    if (inFence) { if (skipLevel === 0) out.push(line); continue; }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      if (skipLevel > 0) {
        if (level <= skipLevel) skipLevel = 0;   // 스킵 종료 — 아래에서 이 헤딩 자체를 재검사
        else continue;                            // 하위 헤딩 → 계속 스킵
      }
      const text = h[2].replace(/[*_`~]/g, "");
      if (REVIEW_SECTION_RE.test(text)) { skipLevel = level; continue; }
      out.push(line);
      continue;
    }
    if (skipLevel > 0) continue;
    out.push(line);
  }
  // 끝부분 정리: 과한 빈 줄 축소 + 꼬리 구분선/공백 제거
  let res = out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
  res = res.replace(/(?:\n\s*(?:-{3,}|━{2,}|={3,}|\*{3,})\s*)+$/g, "").trimEnd();
  return res ? res + "\n" : res;
}

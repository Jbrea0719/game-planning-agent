// 이미지 첨부 "의도 태그 + 메모" (Feature H)
//
// 유사 게임 이미지를 그냥 첨부하면 조던이 "무엇을 봐야 할지" 몰라 답이 흐려진다.
// 첨부 시 분석 관점을 태그로 찍고 메모를 달면, 그 지침을 질문 앞에 붙여 모델 시야를 좁힌다.

export interface ImageIntentTag {
  key: string;
  label: string;
}

// 분석 관점 태그 (다중 선택)
export const IMAGE_INTENT_TAGS: ImageIntentTag[] = [
  { key: "layout", label: "레이아웃·배치" },
  { key: "color", label: "색감·톤" },
  { key: "info", label: "정보구조·위계" },
  { key: "effect", label: "연출·이펙트" },
  { key: "bm", label: "BM·과금동선" },
  { key: "flow", label: "사용자 동선·UX" },
];

// 선택된 태그 + 메모 → 질문 앞에 붙일 지침 텍스트 (없으면 빈 문자열)
export function buildImageIntentPrefix(tags: string[], memo: string, hasAnnotation: boolean): string {
  const labels = tags
    .map(k => IMAGE_INTENT_TAGS.find(t => t.key === k)?.label)
    .filter(Boolean) as string[];
  const memoText = memo.trim();
  if (labels.length === 0 && !memoText && !hasAnnotation) return "";

  const lines: string[] = ["[첨부 이미지 분석 지침]"];
  if (labels.length > 0) lines.push(`- 다음 관점에 집중해서 분석·평가해줘: ${labels.join(", ")}`);
  if (memoText) lines.push(`- 사용자 메모(이미지에서 특히 봐야 할 점): ${memoText}`);
  if (hasAnnotation) lines.push("- 이미지에 빨간 표시(동그라미·선)가 있으면 그 영역을 우선해서 설명해줘.");
  lines.push("");
  return lines.join("\n");
}

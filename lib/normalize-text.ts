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

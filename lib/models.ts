// Anthropic 모델 선택 중앙화
// 한 곳에서 관리해서 추후 모델 교체 시 일관성 확보
//
// 비용 vs 품질 트레이드오프:
// - 사용자가 직접 보는 결과물(최종 답변·기획서) = Opus 4.7 (최고 품질)
// - 내부 단계(라우터·분석·검토·맥락 카드 등) = Sonnet 4.5 또는 Haiku (속도·비용 우선)

export const MODEL = {
  // 사용자 직접 노출 — 최고 품질 필요
  FINAL_ANSWER: "claude-opus-4-7" as const,    // 조던 최종 답변 (사용자가 읽는 핵심)
  DOC_WRITING:  "claude-opus-4-7" as const,    // 기획서 작성·수정·자동 생성

  // 내부 단계 — 속도·비용 우선
  ANALYSIS:     "claude-sonnet-4-5" as const,  // 웹 검색 분석, 검토(critic)
  EXPANSION:    "claude-sonnet-4-5" as const,  // 자세한 답변 확장, 맥락 카드 갱신
  TITLE:        "claude-sonnet-4-5" as const,  // 짧은 제목 생성
  ROUTER:       "claude-haiku-4-5" as const,   // 라우터(질문 분류) — 가장 저렴

  // 폴백
  DEFAULT:      "claude-sonnet-4-5" as const,
};

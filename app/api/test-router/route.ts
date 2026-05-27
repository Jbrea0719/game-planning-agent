// 라우터 테스트 엔드포인트 — 다양한 샘플 질문으로 라우팅 정확도 검증
// 사용: /api/test-router  (기본 20개 샘플 질문 자동 테스트)
//      /api/test-router?q=원하는질문  (단일 질문 테스트)
//
// 같은 프로세스에서 classifyQuestion을 직접 호출 (Vercel 인증 보호 우회)

import { classifyQuestion, type RouteDecision } from "../router/route";

const TEST_CASES: { question: string; expected: string }[] = [
  // 게임 사실 질문
  { question: "세나리 5월 14일 업데이트 정보 알려줘", expected: "sena_rebirth + 웹" },
  { question: "원신 가챠 천장 시스템이 뭐야?", expected: "general factual + 웹 (원신 KB 없음)" },
  { question: "AFK Arena 영웅 등급 체계 정리해줘", expected: "factual + 웹" },

  // 유저 반응
  { question: "세나리 칼헤론 유저 반응 어때?", expected: "sena_rebirth + 웹, 디시 검색 필요" },
  { question: "원신 최근 패치 유저 평가 어때?", expected: "웹 + factual" },

  // 비교 질문
  { question: "원신과 스타레일 가챠 시스템 비교해줘", expected: "comparison, 다중 게임" },
  { question: "세나리와 에픽세븐 BM 차이점이 뭐야?", expected: "comparison" },

  // 조던 자문
  { question: "내 게임의 영웅 등급 체계 어떻게 설계해야 할까?", expected: "design_consultation, 조던 자문" },
  { question: "영웅수집형 게임에서 신규 유저 유입 방안 추천", expected: "design_consultation" },
  { question: "내가 만들고 있는 게임의 BM 좀 평가해줘", expected: "design_consultation" },

  // 일반론·트렌드
  { question: "요즘 영웅수집형 게임 시장 트렌드는 어때?", expected: "웹 + 일반론" },
  { question: "MOBA 장르 BM 변화 추세는?", expected: "웹 + factual" },

  // 시간 키워드
  { question: "이번 주 신규 출시 게임 있어?", expected: "웹 필수" },
  { question: "오늘 세나리 점검 있었어?", expected: "sena_rebirth + 웹" },

  // 모호한 질문
  { question: "재미있는 영웅수집형 게임 추천해줘", expected: "opinion + 조던 자문" },
  { question: "가챠 게임은 다 똑같지 않아?", expected: "opinion + 조던 자문" },

  // 후속 질문 (맥락 의존)
  { question: "그럼 그건 어떻게 봐?", expected: "맥락 의존, 신뢰도 낮음" },
  { question: "더 자세히 알려줘", expected: "이전 맥락 유지" },

  // 일반 코딩·개발
  { question: "Vercel에서 API 라우트 만드는 법", expected: "조던 영역 아님, 낮은 신뢰도" },

  // 명확한 사실+의견 혼합
  { question: "세나리 1주년 업데이트 내용 + 유저들 평가", expected: "sena_rebirth + 웹 + 디시, mixed" },
];

async function runOne(question: string, contextCard?: string): Promise<RouteDecision | { error: string }> {
  try {
    return await classifyQuestion(question, contextCard);
  } catch (e) {
    return { error: String(e) };
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const singleQuestion = url.searchParams.get("q");

  // 단일 질문 모드
  if (singleQuestion) {
    const decision = await runOne(singleQuestion);
    return Response.json({ question: singleQuestion, decision });
  }

  // 전체 샘플 테스트 모드 (병렬 호출)
  const results = await Promise.all(
    TEST_CASES.map(async tc => {
      const decision = await runOne(tc.question);
      return { question: tc.question, expected: tc.expected, decision };
    })
  );

  return Response.json({
    description: "라우터 정확도 테스트 — 20개 샘플 질문",
    instruction: "각 'decision'을 'expected'와 비교해서 적절히 분류되는지 확인",
    total: results.length,
    results,
  });
}

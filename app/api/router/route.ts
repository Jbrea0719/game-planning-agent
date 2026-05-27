// 라우터 에이전트 — 통합 게임 에이전트의 두뇌
// 사용자 질문을 분석해 다음 단계(KB 검색 / 웹 검색 / 조던 자문)를 결정
//
// 입력: 질문 + 직전 맥락
// 출력: 라우팅 결정 (어느 게임 KB? 웹 필요? 조던 자문?)
// 모델: Haiku 4.5 (빠름·저렴, 질문당 약 1원)

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// 등록된 게임 목록 (KB 보유 여부)
// 게임 추가 시 여기에 등록 → 라우터가 인식 가능
const REGISTERED_GAMES: { id: string; names: string[]; has_kb: boolean }[] = [
  {
    id: "sena_rebirth",
    names: ["세븐나이츠 리버스", "세나리", "세반리", "seven knights reverse"],
    has_kb: false,  // Week 2에 KB 구축 예정. 그 전엔 false → 웹 검색으로 폴백
  },
  // Week 5+ 다른 게임 추가 시 여기에:
  // { id: "genshin", names: ["원신", "genshin"], has_kb: true },
];

// 라우터 출력 타입
export interface RouteDecision {
  target_games: string[];                // 게임 ID 배열 (없으면 빈 배열)
  needs_web_search: boolean;             // 최신·실시간 정보 필요?
  needs_jordan_consulting: boolean;      // 조던 자문(설계·기획·평가)?
  question_type: "factual" | "opinion" | "comparison" | "design_consultation" | "mixed";
  confidence: number;                    // 0~1
  reasoning: string;                     // 디버깅용
}

type Message = { role: "user" | "assistant"; content: string };

const SYSTEM_PROMPT = `당신은 게임 기획 챗봇의 질문 분류기예요. 사용자 질문을 분석해서 어떤 데이터·자원이 필요한지 JSON으로만 답변하세요.

[등록된 게임 목록]
${REGISTERED_GAMES.map(g => `- ${g.id}: ${g.names.join(", ")} (KB ${g.has_kb ? "있음" : "없음"})`).join("\n")}

[출력 형식 — JSON만 출력. 다른 텍스트 절대 추가하지 말 것]
{
  "target_games": ["게임_id"] 또는 [],
  "needs_web_search": true 또는 false,
  "needs_jordan_consulting": true 또는 false,
  "question_type": "factual" | "opinion" | "comparison" | "design_consultation" | "mixed",
  "confidence": 0~1 사이 숫자,
  "reasoning": "한 문장 설명"
}

[분류 규칙]

target_games:
- 질문 또는 맥락에 등록된 게임 이름이 명시 → 해당 게임의 id 배열
- 비교 질문이면 여러 게임 id
- 일반 질문(특정 게임 없음) → 빈 배열 []
- "세븐나이츠"만 단독으로 언급되면 "세븐나이츠"(원작)이지 "세나리"가 아님. 정확히 매칭.

needs_web_search:
- 다음 키워드가 있으면 true: "최근", "이번 주", "이번 달", "오늘", "어제", "방금", "지금", "신규", "출시 예정", "패치", "업데이트"
- 게임의 KB가 없으면(has_kb=false) 항상 true (KB 못 쓰니 웹 검색으로 보완)
- 시간 무관한 일반 설계론·이론 질문이면 false

needs_jordan_consulting:
- 다음 표현이 있으면 true: "어떻게 설계", "어떻게 만들면", "내 게임", "내가 만들고 있는", "평가해줘", "조언", "추천", "어떤 게 좋을까", "기획", "구조 분석"
- 단순 사실 확인(언제, 누가, 몇 개)이면 false

question_type:
- factual: 단순 사실 확인 (날짜·이름·수치)
- opinion: 평가·체감·반응 (유저 반응 등)
- comparison: 두 게임 이상 비교
- design_consultation: 기획·설계 자문
- mixed: 위 여러 개 섞임

confidence:
- 게임 매칭 명확 + 의도 명확 → 0.9~1.0
- 게임 매칭 모호 또는 의도 추측 → 0.5~0.8
- 거의 모르겠음 → 0~0.5 (이 경우 안전한 폴백)

reasoning: "왜 이렇게 판단했는지" 한국어 한 문장`;

export async function POST(request: Request) {
  try {
    const { question, contextCard, recentMessages } = (await request.json()) as {
      question: string;
      contextCard?: string;
      recentMessages?: Message[];
    };

    if (!question || typeof question !== "string") {
      return Response.json({ error: "question 필수" }, { status: 400 });
    }

    // 맥락 구성
    const contextSection = contextCard ? `\n\n[대화 맥락 카드]\n${contextCard}` : "";
    const recentSection = recentMessages && recentMessages.length > 0
      ? `\n\n[직전 교환]\n${recentMessages.slice(-2).map(m =>
          `${m.role === "user" ? "질문" : "답변"}: ${m.content.slice(0, 200)}`
        ).join("\n")}`
      : "";

    const userContent = `${contextSection}${recentSection}\n\n[현재 질문]\n${question}`;

    const res = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    });

    // JSON 추출
    const text = res.content
      .filter(b => b.type === "text")
      .map(b => (b as Anthropic.TextBlock).text)
      .join("")
      .trim();

    // JSON 파싱 (Haiku가 가끔 ```json 같은 펜스를 추가할 수 있어 정제)
    const cleaned = text
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    let decision: RouteDecision;
    try {
      decision = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error("[router] JSON 파싱 실패:", parseErr, "원문:", text);
      // 안전한 폴백: 조던 자문 + 웹 검색
      decision = {
        target_games: [],
        needs_web_search: true,
        needs_jordan_consulting: true,
        question_type: "mixed",
        confidence: 0,
        reasoning: "라우터 JSON 파싱 실패 — 안전 폴백",
      };
    }

    return Response.json(decision);
  } catch (err) {
    console.error("[router] 오류:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

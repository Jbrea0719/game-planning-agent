import Anthropic from "@anthropic-ai/sdk";
import { buildDecisionContext } from "@/lib/decision-context";

// 기획서 작성 시스템 프롬프트
// 핵심 변경: 선택된 대화 = 본문(중심 데이터),
//           기획 바이블 = 교차 검증 기준 (전체 누적 자산)
const DOC_SYSTEM_PROMPT = `당신은 영웅수집형 모바일 게임 기획서 작성 전문가입니다.

[입력 구성]
1. **본문 대화** — 사용자가 선택한 대화 구간. 이번 기획서의 주제·세부 결정의 1차 근거.
2. **기획 바이블** — 이 프로젝트에서 지금까지 누적된 전체 결정·검토 사항. 모든 기획에 일관되게 적용돼야 하는 기준 자산.

[작성 절차]
1단계 — 본문 대화에서 이번 기획서에 들어갈 핵심 결정·세부 사양을 추출한다.
2단계 — 추출한 내용을 **기획 바이블 전체와 반드시 교차 검증**한다.
  • 일치하는 항목 → 본문에 자연스럽게 통합한다.
  • 충돌하는 항목 → 본문 대화를 우선하되, "⚠️ 기획 바이블과 차이: [원래 결정] → [이번 변경]"으로 명시한다.
  • 본문 대화에 없지만 기획 바이블에 명시된 관련 기준 → "참고: 기획 바이블 기준 [내용]"으로 보강한다.
3단계 — 위 결과를 토대로 실무 기획서를 작성한다.

[작성 원칙]
- 본문 대화에서 논의된 내용을 빠짐없이 반영.
- 구체적인 수치·예시는 그대로 포함.
- 불분명한 부분은 "추후 논의 필요" 또는 "TBD"로 표시.
- 실무에서 바로 사용 가능한 수준.
- 마크다운 형식.

[기획서 구조]
# [주제] 기획서

## 1. 개요
- 목적 및 배경
- 핵심 컨셉 한 줄 요약

## 2. 핵심 메커니즘
- 주요 시스템 설명
- 동작 방식

## 3. 상세 설계
- 세부 규칙 및 조건
- 수치/확률 (논의된 경우)

## 4. 밸런스 및 유저 경험
- 밸런스 기준
- 유저 관점에서의 경험

## 5. 수익화 연계
- BM 연결 포인트
- 과금 유도 구조

## 6. 리스크 및 고려사항
- 잠재적 문제점
- 대안 방안

## 7. 기획 바이블 교차 검증 결과
- 본 기획서와 일치하는 바이블 항목
- 충돌하여 이번에 갱신된 항목 (⚠️ 표시)
- 바이블에서 추가로 보강된 기준

## 8. 다음 단계 (TODO)
- 추가 논의 필요 항목
- 구체화 필요 항목`;

type Message = { role: "user" | "assistant"; content: string };

export async function POST(request: Request) {
  try {
    const { messages, project_id } = (await request.json()) as {
      messages: Message[];
      project_id?: string;
    };

    if (!messages || messages.length === 0) {
      return Response.json({ error: "대화 내용이 없습니다" }, { status: 400 });
    }

    // 본문 대화 정리
    const conversationText = messages
      .map((m) => `[${m.role === "user" ? "질문" : "조던"}] ${m.content}`)
      .join("\n\n");

    // 기획 바이블 전체 로드 (anchor 무시 — 전체 자산이 교차 검증 기준)
    let bibleText = "";
    if (project_id) {
      try {
        bibleText = await buildDecisionContext(project_id, 500, null);
      } catch (err) {
        console.error("[api/document] 기획 바이블 로드 실패:", err);
      }
    }

    // 유저 메시지: 본문 + 바이블 명시 구분
    const userContent = bibleText
      ? `아래 입력을 토대로 게임 기획서를 작성해주세요.\n\n` +
        `=== 1. 본문 대화 (이번 기획서의 중심 데이터) ===\n${conversationText}\n\n` +
        `=== 2. 기획 바이블 (전체 누적 기준 — 반드시 교차 검증) ===\n${bibleText}`
      : `아래 대화 내용을 바탕으로 게임 기획서를 작성해주세요.\n(기획 바이블 항목은 아직 없습니다)\n\n${conversationText}`;

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const stream = await client.messages.stream({
      model: "claude-sonnet-4-5",
      max_tokens: 8192,
      system: DOC_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    });

    const readable = new ReadableStream({
      async start(controller) {
        for await (const chunk of stream) {
          if (
            chunk.type === "content_block_delta" &&
            chunk.delta.type === "text_delta"
          ) {
            controller.enqueue(new TextEncoder().encode(chunk.delta.text));
          }
        }
        controller.close();
      },
    });

    return new Response(readable, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (error) {
    console.error("[api/document] 오류:", error);
    return new Response(`오류: ${String(error)}`, { status: 500 });
  }
}

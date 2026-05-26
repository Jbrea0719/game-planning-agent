import Anthropic from "@anthropic-ai/sdk";

const DOC_SYSTEM_PROMPT = `당신은 영웅수집형 모바일 게임 기획서 작성 전문가입니다.
주어진 대화 내용을 분석해서 전문적인 게임 기획서를 작성하세요.

기획서 작성 원칙:
- 대화에서 논의된 내용을 빠짐없이 반영하세요.
- 구체적인 수치나 예시가 대화에 있으면 그대로 포함하세요.
- 불분명한 부분은 "추후 논의 필요" 또는 "TBD"로 표시하세요.
- 실무에서 바로 사용 가능한 수준으로 작성하세요.
- 마크다운 형식으로 작성하세요.

기획서 구조:
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

## 7. 다음 단계 (TODO)
- 추가 논의 필요 항목
- 구체화 필요 항목`;

type Message = { role: "user" | "assistant"; content: string };

export async function POST(request: Request) {
  try {
    const { messages } = (await request.json()) as { messages: Message[] };

    if (!messages || messages.length === 0) {
      return Response.json({ error: "대화 내용이 없습니다" }, { status: 400 });
    }

    // 대화 내용을 하나의 텍스트로 정리
    const conversationText = messages
      .map((m) => `[${m.role === "user" ? "질문" : "조던"}] ${m.content}`)
      .join("\n\n");

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const stream = await client.messages.stream({
      model: "claude-sonnet-4-5",
      max_tokens: 8192,
      system: DOC_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `아래 대화 내용을 바탕으로 게임 기획서를 작성해주세요.\n\n${conversationText}`,
        },
      ],
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

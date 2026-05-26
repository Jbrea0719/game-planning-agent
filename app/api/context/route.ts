import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: Request) {
  try {
    const { question, answer, existingContext } = (await request.json()) as {
      question: string;
      answer: string;
      existingContext: string;
    };

    const res = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 120,
      system: `대화 맥락 카드를 업데이트하는 역할이에요.
반드시 아래 형식 3줄로만 답하세요. 다른 말 일절 없이.

논의 게임: [게임 풀네임. 없으면 "미정"]
주제: [현재 논의 중인 주제, 20자 이내]
방향: [최근 결론 또는 다음 논의 방향, 30자 이내]`,
      messages: [
        {
          role: "user",
          content: `기존 맥락 카드:\n${existingContext || "(없음)"}

최신 교환:
질문: ${question.slice(0, 300)}
답변: ${answer.slice(0, 400)}

위 교환을 반영해서 맥락 카드를 업데이트해줘.`,
        },
      ],
    });

    const context = res.content
      .filter((b) => b.type === "text")
      .map((b) => (b as Anthropic.TextBlock).text)
      .join("")
      .trim();

    return Response.json({ context });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
}

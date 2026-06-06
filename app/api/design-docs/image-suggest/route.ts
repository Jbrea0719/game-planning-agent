// 기획서 자동 이미지 — 위치·종류 후보 제안
// POST { content } → { suggestions: [{ heading, type, alt, mermaid?, prompt? }] }
// diagram = 흐름/구조 (Mermaid), mockup = UI 화면 (이미지 생성 프롬프트)

import Anthropic from "@anthropic-ai/sdk";
import { MODEL } from "@/lib/models";
import { stripJordanImages } from "@/lib/doc-images";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: Request) {
  try {
    const { content } = (await request.json()) as { content: string };
    if (!content) return Response.json({ suggestions: [] });

    // 이미 자동 삽입된 이미지는 빼고 깨끗한 본문으로 분석 (헤딩 매칭 정확도 ↑)
    const base = stripJordanImages(content).slice(0, 5000);

    const msg = await client.messages.create({
      model: MODEL.ANALYSIS,
      max_tokens: 1500,
      messages: [
        {
          role: "user",
          content: `다음 게임 기획서를 읽고, 시각 자료가 있으면 이해를 크게 도울 섹션을 3~5개 골라줘.
각 섹션을 두 종류 중 하나로 처리해:

- diagram: 게임 루프·시스템 흐름·구조·확률 관계처럼 "흐름이나 구조"를 보여줄 때 (Mermaid)
- mockup: UI 화면·게임 플레이·유저 경험처럼 "실제 화면"이 필요할 때 (AI 이미지)

아래 JSON 배열 형식으로만 응답해. 다른 텍스트는 절대 쓰지 마.

diagram 예시:
{"heading":"## 2. 시스템 구조","type":"diagram","alt":"상성 순환 구조","mermaid":"graph LR\\n  육체 --> 정신\\n  정신 --> 초월\\n  초월 --> 육체"}

mockup 예시:
{"heading":"## 4. 밸런스 및 유저 경험","type":"mockup","alt":"영웅 선택 화면","prompt":"mobile RPG hero collection screen UI, dark fantasy theme, 3x3 character cards with rarity borders, gacha button, Korean mobile game screenshot, professional game design, dark blue background"}

규칙:
- heading은 본문에 실제로 있는 헤딩 문자열과 정확히 일치해야 함 (## 포함, 글자 그대로).
- Mermaid: graph TD/LR 또는 sequenceDiagram만, 노드 텍스트에 따옴표·꺾쇠 금지, \\n으로 줄바꿈(실제 줄바꿈 금지), 한글 가능.
- mockup prompt: 구체적 UI 요소를 영어로 상세히, "mobile game screenshot / dark fantasy / professional game design" 포함.

기획서:
${base}`,
        },
      ],
    });

    const text = msg.content[0].type === "text" ? msg.content[0].text : "";
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return Response.json({ suggestions: [] });

    const suggestions = JSON.parse(jsonMatch[0]);
    return Response.json({ suggestions });
  } catch (error) {
    console.error("[image-suggest] 오류:", error);
    return Response.json({ suggestions: [] });
  }
}

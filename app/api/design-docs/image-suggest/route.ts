// 기획서 자동 이미지 — 위치·종류 후보 제안
// POST { content } → { suggestions: [{ heading, type, alt, mermaid?, prompt? }] }
// diagram = 흐름/구조 (Mermaid, 고품질 스타일 적용) / mockup = UI 화면 (Gemini 이미지 프롬프트)

import Anthropic from "@anthropic-ai/sdk";
import { MODEL } from "@/lib/models";
import { stripJordanImages } from "@/lib/doc-images";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Mermaid 고품질 작성 가이드 (다이어그램 품질 핵심)
const MERMAID_GUIDE = `Mermaid 고품질 규칙:
- flowchart TD(세로) 또는 flowchart LR(가로)을 기본 사용. 순환/관계는 LR.
- 단순 박스 나열 금지. 의미 있는 구조로: 관련 노드는 subgraph로 묶고, 분기는 마름모{}, 단계는 사각형[], 시작/끝은 둥근([])로.
- 엣지에 의미 라벨을 달 것 (예: -->|승리| ).
- 반드시 아래 다크테마 스타일을 포함하고 노드에 class를 부여해 색을 입힐 것:
  classDef accent fill:#1e3a5f,stroke:#7dd3fc,stroke-width:2px,color:#e0e8f0;
  classDef warm fill:#3a2a4f,stroke:#c4a3ff,stroke-width:2px,color:#e0e8f0;
  classDef good fill:#173a2e,stroke:#6ee7b7,stroke-width:2px,color:#e0e8f0;
  classDef neutral fill:#0d1525,stroke:#c0c8d8,stroke-width:1.5px,color:#c0c8d8;
- 노드 6~12개 수준으로 충분히 구체적으로. 기획서 내용을 실제로 반영.
- 노드 텍스트에 따옴표/꺾쇠/괄호() 금지(대괄호[] 안 텍스트엔 () 쓰지 말 것). 한글 가능.
- 전체를 \\n으로 줄바꿈한 한 줄 문자열로 (실제 줄바꿈 금지).`;

export async function POST(request: Request) {
  try {
    const { content } = (await request.json()) as { content: string };
    if (!content) return Response.json({ suggestions: [] });

    const base = stripJordanImages(content).slice(0, 6000);

    const msg = await client.messages.create({
      model: MODEL.DOC_WRITING, // 다이어그램 품질 위해 Opus
      max_tokens: 3000,
      messages: [
        {
          role: "user",
          content: `다음 게임 기획서를 읽고, 시각 자료가 있으면 이해를 크게 도울 섹션을 3~5개 골라 고품질 이미지를 설계해줘.
각 섹션을 두 종류 중 하나로:

- diagram: 게임 루프·시스템 흐름·구조·확률/상성 관계처럼 "흐름이나 구조" (Mermaid)
- mockup: UI 화면·게임 플레이·유저 경험처럼 "실제 화면 시안" (AI 이미지)

JSON 배열로만 응답 (다른 텍스트 금지):
[
  {"heading":"## 2. 시스템 구조","type":"diagram","alt":"상성 순환 구조","mermaid":"flowchart LR\\n  육체[육체]:::accent --> |압도| 정신[정신]:::warm\\n  정신 --> |간파| 초월[초월]:::good\\n  초월 --> |초월| 육체\\n  classDef accent fill:#1e3a5f,stroke:#7dd3fc,stroke-width:2px,color:#e0e8f0;\\n  classDef warm fill:#3a2a4f,stroke:#c4a3ff,stroke-width:2px,color:#e0e8f0;\\n  classDef good fill:#173a2e,stroke:#6ee7b7,stroke-width:2px,color:#e0e8f0;"},
  {"heading":"## 4. 유저 경험","type":"mockup","alt":"영웅 선택 화면","prompt":"mobile RPG hero collection screen UI, dark fantasy theme, 3x3 character cards with rarity borders gold silver bronze, element icons, gacha pull button, Korean mobile game screenshot, clean professional game UI, dark blue background, high detail"}
]

${MERMAID_GUIDE}

mockup prompt 규칙: 구체적 UI 요소를 영어로 상세히, "mobile game screenshot / UI / dark fantasy / professional game design / high detail" 포함. 기획서 내용과 직접 관련된 화면.

heading은 본문에 실제로 있는 헤딩과 정확히 일치 (## 포함, 글자 그대로).

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

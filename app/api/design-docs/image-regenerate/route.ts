// 기획서 자동 이미지 — 단일 다이어그램 재생성 (고품질 Mermaid)
// POST { type, heading, content } → { alt, mermaid }
// (mockup은 클라이언트에서 새 이미지를 다시 생성하므로 보통 diagram만 호출)

import Anthropic from "@anthropic-ai/sdk";
import { MODEL } from "@/lib/models";
import { stripJordanImages } from "@/lib/doc-images";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MERMAID_GUIDE = `Mermaid 고품질 규칙:
- flowchart TD 또는 LR(순환/관계). 단순 박스 나열 금지 — subgraph 묶기, 분기 마름모{}, 시작/끝 둥근([]).
- 엣지에 의미 라벨. 노드 6~12개로 구체적으로, 기획서 내용 반영.
- 반드시 아래 다크테마 스타일 포함 + 노드에 class 부여:
  classDef accent fill:#1e3a5f,stroke:#7dd3fc,stroke-width:2px,color:#e0e8f0;
  classDef warm fill:#3a2a4f,stroke:#c4a3ff,stroke-width:2px,color:#e0e8f0;
  classDef good fill:#173a2e,stroke:#6ee7b7,stroke-width:2px,color:#e0e8f0;
  classDef neutral fill:#0d1525,stroke:#c0c8d8,stroke-width:1.5px,color:#c0c8d8;
- 노드 텍스트에 따옴표/꺾쇠/() 금지, 한글 가능. 전체를 \\n으로 줄바꿈한 한 줄로(실제 줄바꿈 금지).`;

export async function POST(request: Request) {
  try {
    const { type, heading, content } = (await request.json()) as {
      type: "diagram" | "mockup";
      heading: string;
      content: string;
    };
    if (!type || !heading) return Response.json({ error: "type, heading 필요" }, { status: 400 });

    const base = stripJordanImages(content ?? "").slice(0, 4000);

    const instruction =
      type === "diagram"
        ? `"${heading}" 섹션에 들어갈 게임 기획 다이어그램을 새로 만들어줘. 이전과 다른 구조/표현으로, 고품질로.
아래 JSON으로만 응답 (다른 텍스트 금지):
{"alt":"설명(한국어 15자 이내)","mermaid":"flowchart TD\\n  A[시작]:::accent --> B{조건}\\n  ..."}
${MERMAID_GUIDE}`
        : `"${heading}" 섹션에 들어갈 게임 UI 화면 이미지 프롬프트를 새로 만들어줘. 이전과 다른 화면 구성/앵글로.
아래 JSON으로만 응답 (다른 텍스트 금지):
{"alt":"설명(한국어 15자 이내)","prompt":"detailed English prompt: mobile game screenshot, UI, dark fantasy, professional game design, high detail, ..."}`;

    const msg = await client.messages.create({
      model: MODEL.DOC_WRITING, // 품질 위해 Opus
      max_tokens: 1500,
      messages: [{ role: "user", content: `${instruction}\n\n참고용 기획서 일부:\n${base}` }],
    });

    const text = msg.content[0].type === "text" ? msg.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return Response.json({ error: "파싱 실패" }, { status: 500 });

    return Response.json(JSON.parse(jsonMatch[0]));
  } catch (error) {
    console.error("[image-regenerate] 오류:", error);
    return Response.json({ error: String(error) }, { status: 500 });
  }
}

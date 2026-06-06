// 기획서 자동 이미지 — 단일 항목 재생성 (다이어그램용)
// POST { type, heading, content } → { alt, mermaid } 또는 { alt, prompt }
// (mockup은 클라이언트에서 seed만 바꿔 즉시 재생성하므로 보통 diagram만 호출)

import Anthropic from "@anthropic-ai/sdk";
import { MODEL } from "@/lib/models";
import { stripJordanImages } from "@/lib/doc-images";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: Request) {
  try {
    const { type, heading, content } = (await request.json()) as {
      type: "diagram" | "mockup";
      heading: string;
      content: string;
    };
    if (!type || !heading) return Response.json({ error: "type, heading 필요" }, { status: 400 });

    const base = stripJordanImages(content ?? "").slice(0, 3000);

    const instruction =
      type === "diagram"
        ? `"${heading}" 섹션에 들어갈 게임 기획 다이어그램을 새로 만들어줘. 이전과 다른 구조/표현으로.
아래 JSON으로만 응답 (다른 텍스트 금지):
{"alt":"설명(한국어 15자 이내)","mermaid":"graph TD\\n  A[노드] --> B[노드]"}
Mermaid 규칙: graph TD/LR 또는 sequenceDiagram만, 노드 텍스트에 따옴표·꺾쇠 금지, \\n으로 줄바꿈(실제 줄바꿈 금지), 한글 가능.`
        : `"${heading}" 섹션에 들어갈 게임 UI 화면 이미지 프롬프트를 새로 만들어줘. 이전과 다른 화면 구성/앵글로.
아래 JSON으로만 응답 (다른 텍스트 금지):
{"alt":"설명(한국어 15자 이내)","prompt":"detailed English prompt: mobile game screenshot, dark fantasy, professional game design, ..."}`;

    const msg = await client.messages.create({
      model: MODEL.ANALYSIS,
      max_tokens: 700,
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

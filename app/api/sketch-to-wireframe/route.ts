// 손그림 스케치 → 깔끔한 와이어프레임 (Feature L)
// POST /api/sketch-to-wireframe { imageBase64, mime, note? }
//   → { html: 단일 HTML 와이어프레임, critique: 기획 관점 비평 }
//
// 종이/태블릿에 대충 그린 레이아웃을 촬영 → Opus(vision)가 의도를 읽어
// 정돈된 와이어프레임 HTML로 변환 + 강점/개선점/빠진 요소 비평.

import Anthropic from "@anthropic-ai/sdk";
import { MODEL } from "@/lib/models";
import { buildAbsoluteRulesContext } from "@/lib/absolute-rules-context";

const SYSTEM_PROMPT = `당신은 영웅수집형 모바일 게임 UI/UX 전문가입니다.
사용자가 손으로 그린 화면 스케치(사진)를 줍니다. 두 가지를 만드세요.

1) 스케치의 의도를 살린 **정돈된 와이어프레임**을 단일 HTML로.
[기술 제약]
- HTML5 + Tailwind CSS(CDN) + 인라인 스타일만. JavaScript 금지(정적).
- 외부 이미지·폰트 URL 금지 — placeholder 박스나 이모지(🦸⚔️🛡️💎) 활용.
- <head>에 <script src="https://cdn.tailwindcss.com"></script> + viewport meta 포함.
- 모바일 화면이면 폭 ~390px 프레임, 다크 톤(#1a1a2e 계열) 기본.
- 와이어프레임답게 회색 톤 위주, 영역·계층이 분명하게. 스케치에 있는 요소 배치를 충실히 반영.

2) 기획 관점 **비평**(한국어, 200~400자): 스케치의 강점 / 개선점 / 빠진 요소(예: 뒤로가기, 재화 표시, 빈 상태).

[반환 형식 — 정확히 이 구조로, 다른 텍스트 없이]
__WIREFRAME_HTML__
<!DOCTYPE html> ... </html>
__CRITIQUE__
(비평 텍스트)`;

export async function POST(request: Request) {
  try {
    const { imageBase64, mime, note } = (await request.json()) as {
      imageBase64?: string;
      mime?: string;
      note?: string;
    };
    if (!imageBase64) {
      return Response.json({ error: "이미지 필수" }, { status: 400 });
    }
    const mt = (mime || "image/png") as "image/png" | "image/jpeg" | "image/gif" | "image/webp";

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const absoluteRules = await buildAbsoluteRulesContext();
    const res = await client.messages.create({
      model: MODEL.FINAL_ANSWER,  // Opus — vision + 시안 품질
      max_tokens: 7000,
      system: (absoluteRules ? absoluteRules + "\n\n" : "") + SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mt, data: imageBase64 } },
            { type: "text", text: `이 손그림 스케치를 와이어프레임으로 정돈해주세요.${note?.trim() ? `\n\n[추가 메모] ${note.trim()}` : ""}` },
          ],
        },
      ],
    });

    const text = res.content
      .filter(b => b.type === "text")
      .map(b => (b as Anthropic.TextBlock).text)
      .join("")
      .trim();

    // 마커 분리
    const htmlMatch = text.match(/__WIREFRAME_HTML__([\s\S]*?)__CRITIQUE__/);
    const critMatch = text.match(/__CRITIQUE__([\s\S]*)$/);
    let html = (htmlMatch?.[1] ?? "").trim();
    const critique = (critMatch?.[1] ?? "").trim();

    // 코드블록 방어
    html = html.replace(/^```html\s*\n?/, "").replace(/\n?```$/, "").trim();

    if (!html.includes("<html") && !html.includes("<!DOCTYPE")) {
      return Response.json({ error: "와이어프레임 생성 실패 — HTML 아님" }, { status: 500 });
    }

    return Response.json({ success: true, html, critique });
  } catch (err) {
    console.error("[sketch-to-wireframe] 오류:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

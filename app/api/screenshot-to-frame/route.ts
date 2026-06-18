// 스크린샷 → 텍스트(ASCII) UI 프레임 (Feature: 레퍼런스 화면을 텍스트 와이어프레임으로)
// POST /api/screenshot-to-frame { imageBase64, mime, note? }
//   → { frame: 박스문자 UI 프레임 텍스트, notes: 구성 메모 }
//
// 게임/앱 화면 스크린샷을 Opus(vision)가 읽어, 박스 드로잉 문자로 된
// 편집 가능한 텍스트 UI 프레임으로 옮긴다. 사용자가 레퍼런스를 베이스로
// 프레임을 잡고 직접 수정하는 용도.

import Anthropic from "@anthropic-ai/sdk";
import { MODEL } from "@/lib/models";

const SYSTEM_PROMPT = `당신은 모바일 게임 UI를 "텍스트(ASCII) 와이어프레임"으로 옮기는 전문가입니다.
사용자가 게임/앱 화면 스크린샷을 줍니다. 그 화면의 레이아웃 구조를 고정폭 박스 드로잉 문자로 표현한 텍스트 UI 프레임을 만드세요.

[작성 규칙]
- 박스 드로잉 문자(┌ ─ ┐ │ └ ┘ ├ ┤ ┬ ┴ ┼)로 영역과 계층을 그립니다.
- 화면을 위→아래 순서(상단바 → 본문 → 하단바)로 영역을 나눠 배치합니다.
- 각 영역에 한글 라벨을 답니다. 실제 텍스트가 읽히면 그대로 쓰고, 아니면 역할 라벨로 표기 (예: "닉네임 Lv.45", "[전투 시작]", "재화: 💎 1,200").
- 버튼은 [대괄호], 아이콘은 어울리는 이모지(🔙 ⚙️ ⭐ 💎 🛡️ ⚔️ 📅 🔔 등)를 활용합니다.
- 리스트·그리드는 반복 구조로 표현하고, 슬롯은 □ 또는 [아이콘]으로 나타냅니다.
- 전체 폭은 고정폭 기준 약 54~64칸으로 일정하게 맞춰 세로 정렬이 깨지지 않게 합니다.
- 고정폭 글꼴 기준으로 칸을 맞춥니다(한글은 2칸 폭 가정). 너무 빽빽하지 않게 여백을 둡니다.

[반환 형식 — 정확히 이 구조로, 다른 텍스트 없이]
__FRAME__
(여기에 박스 드로잉 UI 프레임만. 마크다운 코드펜스(\`\`\`) 금지)
__NOTES__
(한국어 1~3줄: 이 화면의 구성 의도와, 사용자가 바꿀 만한 수정 포인트 제안)`;

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

    const res = await client.messages.create({
      model: MODEL.FINAL_ANSWER, // Opus — vision + 레이아웃 이해
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mt, data: imageBase64 } },
            { type: "text", text: `이 화면 스크린샷을 텍스트 UI 프레임으로 옮겨주세요.${note?.trim() ? `\n\n[추가 메모/지시] ${note.trim()}` : ""}` },
          ],
        },
      ],
    });

    const text = res.content
      .filter((b) => b.type === "text")
      .map((b) => (b as Anthropic.TextBlock).text)
      .join("")
      .trim();

    // 마커 분리
    const frameMatch = text.match(/__FRAME__([\s\S]*?)__NOTES__/);
    const notesMatch = text.match(/__NOTES__([\s\S]*)$/);
    let frame = (frameMatch?.[1] ?? text).trim();
    const notes = (notesMatch?.[1] ?? "").trim();

    // 혹시 코드펜스로 감쌌으면 제거
    frame = frame.replace(/^```[a-z]*\s*\n?/i, "").replace(/\n?```$/i, "").trim();

    if (!frame) {
      return Response.json({ error: "프레임 생성 실패" }, { status: 500 });
    }

    return Response.json({ success: true, frame, notes });
  } catch (err) {
    console.error("[screenshot-to-frame] 오류:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

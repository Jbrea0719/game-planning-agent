// AI mockup 생성 — 자연어 설명을 HTML + Tailwind 시안으로 변환
// POST /api/mockup/generate { description, refineFrom? }
//   description: "캐릭터 컬렉션 화면, 3x4 그리드 카드..."
//   refineFrom?: 기존 mockup HTML (수정 요청 시)

import Anthropic from "@anthropic-ai/sdk";
import { MODEL } from "@/lib/models";

const SYSTEM_PROMPT = `당신은 영웅수집형 모바일 게임 UI 시안 전문가입니다.

[작업]
사용자의 자연어 화면 설명을 받아 **단일 HTML 파일**로 시안을 만들어 반환합니다.

[기술 제약]
- HTML5 + Tailwind CSS (CDN으로 로드) + 인라인 스타일만 사용
- JavaScript 절대 사용 X (정적 시안)
- 외부 이미지·폰트 URL 사용 금지 (대신 placeholder 박스나 이모지 활용)
- 한 파일로 완결: <!DOCTYPE html>부터 </html>까지 전체

[디자인 가이드]
- **사용자 메시지의 "[화면 종류·사이즈]" 섹션을 반드시 따르세요** (전체화면/부분시안/사이즈 명시)
- 다크 모드 기본 (#1a1a2e 같은 진한 배경) — 사용자가 다른 톤 요구하면 그에 맞춤
- 영웅 카드·메뉴·재화 표시 등 게임 UI 일반 패턴 활용
- placeholder 캐릭터는 이모지(🦸‍♂️ 🦸‍♀️ ⚔️ 🛡️) 또는 회색 박스 + "캐릭터 이미지"
- **부분 시안**일 때는 단일 컴포넌트만 — 전체 페이지 만들지 말 것
- **풀스크린 시안**일 때는 명시된 가로×세로 비율 정확히 맞춤

[필수 포함]
- <head>에 Tailwind CDN: <script src="https://cdn.tailwindcss.com"></script>
- viewport meta tag
- 흰 배경 X — 게임 분위기 살리기

[반환 형식]
- 순수 HTML만, 마크다운 코드블록(\`\`\`) 사용 금지
- 추가 설명·주석 없이 HTML 한 덩어리만`;

export async function POST(request: Request) {
  try {
    const { description, refineFrom } = (await request.json()) as {
      description: string;
      refineFrom?: string;
    };
    if (!description?.trim()) {
      return Response.json({ error: "설명 필수" }, { status: 400 });
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const userContent = refineFrom
      ? `[기존 시안]\n${refineFrom}\n\n[수정 요청]\n${description.trim()}\n\n위 시안을 수정 요청대로 갱신해서 전체 HTML을 반환하세요.`
      : `다음 화면을 만들어주세요:\n\n${description.trim()}`;

    const res = await client.messages.create({
      model: MODEL.FINAL_ANSWER,  // Opus 4.7 (시안 품질 중요)
      max_tokens: 6000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    });

    let html = res.content
      .filter(b => b.type === "text")
      .map(b => (b as Anthropic.TextBlock).text)
      .join("")
      .trim();

    // 혹시 코드블록으로 감싸져 나오면 벗기기
    html = html.replace(/^```html\s*\n?/, "").replace(/\n?```$/, "");

    if (!html.includes("<html") && !html.includes("<!DOCTYPE")) {
      return Response.json({ error: "HTML 생성 실패 — 응답이 HTML 아님" }, { status: 500 });
    }

    return Response.json({ success: true, html });
  } catch (err) {
    console.error("[mockup/generate] 오류:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

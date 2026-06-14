// 바이블 일관성 검사 (Feature C)
//
// 목적: 조던의 새 답변이 "지금까지 누적된 기획 결정사항(바이블)"과 모순되는지 검사.
// 대화가 길어지면 사용자가 과거 결정을 잊고 상충되는 방향으로 흘러가기 쉬운데,
// 이를 답변 직후 자동 감지해 경고한다.
//
// 흐름:
//   1. buildDecisionContext()로 누적 결정사항 텍스트 확보 (재사용)
//   2. Haiku에게 "새 답변이 기존 결정과 모순되는가?" 판정 요청 → JSON
//   3. 모순 목록 반환 (없으면 빈 배열)
//
// 비용: Haiku 1회 ≈ 약 1~3원. 결정사항이 하나도 없으면 호출 자체를 건너뜀.

import Anthropic from "@anthropic-ai/sdk";
import { MODEL } from "./models";
import { buildDecisionContext } from "./decision-context";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface BibleConflict {
  existing: string;   // 기존 결정사항(바이블) 내용
  newClaim: string;   // 새 답변에서 이와 충돌하는 부분
  reason: string;     // 왜 모순인지 한 줄 설명
  severity: "high" | "low";  // high=직접 모순, low=느슨한 긴장
}

// ── 메인 검사 함수 ───────────────────────────────────────────────────
export async function checkBibleConsistency(opts: {
  userQuery: string;
  jordanAnswer: string;
  anchorTime?: string | null;
}): Promise<BibleConflict[]> {
  try {
    // 1. 누적 결정사항 텍스트 (없으면 검사 불필요)
    const bible = await buildDecisionContext(undefined, 200, opts.anchorTime ?? null);
    if (!bible || bible.trim().length === 0) return [];

    // 2. Haiku 판정
    const systemPrompt = `당신은 게임 기획의 "일관성 검사관"입니다.
[기존 결정사항(바이블)]과 [조던의 새 답변]을 비교해, 새 답변이 기존 결정과 **모순되는 부분만** 찾아내세요.

판정 규칙:
- 직접 모순(예: 기존 "피로도 시스템 없음" ↔ 새 답변 "피로도 회복 아이템 추가")만 high.
- 느슨한 긴장(방향이 약간 어긋남)은 low.
- 단순히 새로운 주제이거나, 기존 결정을 더 구체화·확장하는 것은 모순이 아님 → 제외.
- 애매하면 보고하지 말 것(거짓 경보 최소화). 확실한 것만.

반드시 아래 JSON만 출력(설명·코드펜스 금지):
{"conflicts":[{"existing":"기존 결정 내용","newClaim":"새 답변의 충돌 부분","reason":"왜 모순인지 한 줄","severity":"high|low"}]}
모순이 없으면 {"conflicts":[]}`;

    const userPrompt = `[기존 결정사항(바이블)]
${bible}

[사용자 질문]
${opts.userQuery}

[조던의 새 답변]
${opts.jordanAnswer.slice(0, 8000)}`;

    const resp = await client.messages.create({
      model: MODEL.ROUTER,  // Haiku — 저렴·빠름
      max_tokens: 1200,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map(b => b.text)
      .join("");

    const conflicts = parseConflicts(text);
    // 최대 5건으로 제한(과다 경고 방지)
    return conflicts.slice(0, 5);
  } catch (err) {
    console.error("[consistency-checker] 검사 실패:", err);
    return [];
  }
}

// JSON 파싱 — 코드펜스·잡텍스트 방어
function parseConflicts(raw: string): BibleConflict[] {
  try {
    let t = raw.trim();
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) t = fence[1].trim();
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start === -1 || end === -1) return [];
    const obj = JSON.parse(t.slice(start, end + 1));
    if (!obj || !Array.isArray(obj.conflicts)) return [];
    return obj.conflicts
      .filter((c: unknown): c is BibleConflict => {
        const o = c as Record<string, unknown>;
        return !!o && typeof o.existing === "string" && typeof o.newClaim === "string";
      })
      .map((c: BibleConflict) => ({
        existing: c.existing,
        newClaim: c.newClaim,
        reason: typeof c.reason === "string" ? c.reason : "",
        severity: c.severity === "high" ? "high" : "low",
      }));
  } catch {
    return [];
  }
}

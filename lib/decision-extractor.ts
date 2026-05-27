// 결정사항 자동 추출 시스템
//
// 흐름:
//   1. 사용자 질문 + 조던 답변을 Haiku에게 분석 요청
//   2. "결정된 사항이 있나?" 판단 → JSON 배열로 추출
//   3. 각 결정에 가장 적합한 sub_category_id 자동 매칭
//   4. Supabase decisions 테이블에 자동 INSERT (is_auto_extracted=true)
//
// 비용: Haiku 1회 호출 ≈ 약 1~3원

import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "./supabase";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// 단일 프로젝트 고정 ID (Phase A — 추후 변경)
const DEFAULT_PROJECT_ID = "00000000-0000-0000-0000-000000000001";

// ── 카테고리 캐시 (5분 TTL) ──────────────────────────────────────────
interface SubCategoryInfo {
  id: string;
  name_ko: string;
  area_name: string | null;
  main_category_id: string;
}

let cachedCategories: SubCategoryInfo[] | null = null;
let cachedAt = 0;
const CACHE_TTL = 5 * 60 * 1000;

async function getCachedCategories(): Promise<SubCategoryInfo[]> {
  const now = Date.now();
  if (cachedCategories && now - cachedAt < CACHE_TTL) return cachedCategories;

  const { data, error } = await supabase
    .from("sub_categories")
    .select("id, name_ko, area_name, main_category_id")
    .eq("is_active", true);

  if (error) {
    console.error("[decision-extractor] 카테고리 조회 실패:", error.message);
    return cachedCategories ?? [];
  }
  cachedCategories = (data as SubCategoryInfo[]) ?? [];
  cachedAt = now;
  return cachedCategories;
}

// ── 추출 결과 타입 ───────────────────────────────────────────────────
export interface ExtractedDecision {
  content: string;
  sub_category_id: string | null;
  confidence: "decided" | "review" | "tentative";
  reasoning: string;
}

// ── 메인 추출 함수 ───────────────────────────────────────────────────
export async function extractDecisions(
  userQuery: string,
  jordanAnswer: string
): Promise<ExtractedDecision[]> {
  const categories = await getCachedCategories();
  if (categories.length === 0) return [];

  // 카테고리 리스트를 프롬프트용으로 정리 (이름 + ID + 영역)
  const categoryList = categories
    .map(c => {
      const areaPrefix = c.area_name ? `[${c.area_name}] ` : `[${categoryDisplayName(c.main_category_id)}] `;
      return `- ${c.id}: ${areaPrefix}${c.name_ko}`;
    })
    .join("\n");

  const systemPrompt = `당신은 게임 기획 대화에서 "결정사항"을 추출하는 분류기예요.

[추출 기준]
다음 같은 명시적 결정만 추출:
- 사용자가 "X로 가자", "Y로 결정", "Z 적용", "이 방향으로" 같이 명확히 선택한 경우
- 조던 답변에 동의·확정한 경우 (예: "추천대로 OK", "그렇게 하자")
- 사용자가 직접 제시한 새 결정 (예: "BM은 가챠 + 패스로 갈게")

[추출하지 말 것]
- 단순 정보 조회·질문 (예: "원신의 가챠는?")
- 조던의 자문·조언만 있고 사용자가 결정 안 한 경우
- 검토 중·논의 중인 안건 (다만 confidence='review'로 추출 가능)
- 일반론·이론 설명

[카테고리 매칭]
각 결정에 가장 적합한 sub_category_id 1개 선택. 모르겠으면 null.
아래 카테고리 목록에서만 골라야 함 (정확한 ID 사용):

${categoryList}

[신뢰도]
- decided: 사용자가 명확히 결정·확정
- review: 검토 중이거나 잠정 결정
- tentative: 추정·추측 단계

[출력 형식 — JSON 배열만 출력. 다른 텍스트 절대 추가 금지]
[
  {
    "content": "결정 내용 한 문장 (간결하게, 30~80자)",
    "sub_category_id": "카테고리 ID" 또는 null,
    "confidence": "decided" | "review" | "tentative",
    "reasoning": "왜 이 결정으로 판단했는지 한 문장"
  }
]

결정이 없으면 빈 배열 [] 반환.`;

  const userContent = `[사용자 질문]
${userQuery.slice(0, 1500)}

[조던 답변]
${jordanAnswer.slice(0, 3000)}

위 대화에서 사용자가 결정한 사항을 JSON 배열로 추출하세요.`;

  try {
    const res = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    });

    const text = res.content
      .filter(b => b.type === "text")
      .map(b => (b as Anthropic.TextBlock).text)
      .join("")
      .trim();

    // JSON 추출
    const cleaned = text
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
    const jsonStr = jsonMatch ? jsonMatch[0] : cleaned;

    const parsed = JSON.parse(jsonStr) as ExtractedDecision[];
    if (!Array.isArray(parsed)) return [];

    // 유효성 검사 + 카테고리 ID 검증
    const validIds = new Set(categories.map(c => c.id));
    return parsed
      .filter(d => d && typeof d.content === "string" && d.content.trim().length > 0)
      .map(d => ({
        content: d.content.trim().slice(0, 200),
        sub_category_id: d.sub_category_id && validIds.has(d.sub_category_id) ? d.sub_category_id : null,
        confidence: ["decided", "review", "tentative"].includes(d.confidence) ? d.confidence : "decided",
        reasoning: typeof d.reasoning === "string" ? d.reasoning.slice(0, 200) : "",
      }));
  } catch (err) {
    console.error("[decision-extractor] 추출 실패:", err);
    return [];
  }
}

// ── 자동 저장 함수 ───────────────────────────────────────────────────
export async function extractAndSaveDecisions(opts: {
  userQuery: string;
  jordanAnswer: string;
  sessionId?: string;
  pairId?: string;
  nickname?: string;
}): Promise<number> {
  const decisions = await extractDecisions(opts.userQuery, opts.jordanAnswer);
  if (decisions.length === 0) return 0;

  const rows = decisions.map(d => ({
    project_id: DEFAULT_PROJECT_ID,
    sub_category_id: d.sub_category_id,
    content: d.content,
    context: d.reasoning,
    confidence: d.confidence,
    source_message_pair_id: opts.pairId ?? null,
    source_session_id: opts.sessionId ?? null,
    is_auto_extracted: true,
    created_by_nickname: opts.nickname ?? null,
  }));

  const { error } = await supabase.from("decisions").insert(rows);
  if (error) {
    console.error("[decision-extractor] 저장 실패:", error.message);
    return 0;
  }
  console.log(`[decision-extractor] ${decisions.length}개 결정사항 자동 등록`);
  return decisions.length;
}

// ── 헬퍼: 대카테고리 ID → 한국어 이름 ─────────────────────────────────
function categoryDisplayName(mainId: string): string {
  switch (mainId) {
    case "outgame": return "아웃게임";
    case "ingame": return "인게임";
    case "graphic": return "그래픽";
    case "sound": return "사운드";
    case "design_principle": return "디자인 원칙";
    default: return mainId;
  }
}

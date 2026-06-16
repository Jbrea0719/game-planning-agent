// 기획서 AI 분류 제안 시스템
//
// 용도:
//   새로 생성된 기획서(또는 분류 안 된 기획서)의 제목·내용을 읽고,
//   "현재 카테고리 트리"에서 가장 맞는 위치(대/중/소)를 AI가 제안한다.
//
// 흐름:
//   1. 기획서 제목 + 내용 일부 + 현재 sub_categories 트리(최신)를 받는다
//   2. Haiku에게 "이 기획서를 어느 카테고리에 넣을지" 질의
//   3. 제안(suggestion)만 돌려준다 — DB에 바로 적용하지 않음 (사용자 검토 후 적용)
//
// 결정사항 분류기(lib/decision-reclassifier.ts)와 같은 원칙: AI는 제안만, 적용은 사람이.
// 주의: 카테고리는 방금 변경됐을 수 있으므로 캐시 없이 매번 최신 조회.

import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "./supabase";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── 입출력 타입 ──────────────────────────────────────────────────────
export interface CategorySuggestion {
  // 카테고리 적용에 필요한 3종 (없으면 null = 미분류 제안)
  main_id: string | null;
  area_code: string | null;
  sub_id: string | null;
  label: string | null;       // "대 > 영역 > 소" 사람이 읽는 라벨
  reasoning: string;          // 왜 이 카테고리인지 한 문장
}

interface SubCategoryInfo {
  id: string;
  name_ko: string;
  area_code: string | null;
  area_name: string | null;
  main_category_id: string;
}

// ── 최신 카테고리 조회 (캐시 없음) ───────────────────────────────────
async function fetchCurrentCategories(): Promise<SubCategoryInfo[]> {
  const { data, error } = await supabase
    .from("sub_categories")
    .select("id, name_ko, area_code, area_name, main_category_id")
    .eq("is_active", true);
  if (error) {
    console.error("[doc-categorizer] 카테고리 조회 실패:", error.message);
    return [];
  }
  return (data as SubCategoryInfo[]) ?? [];
}

// 대카테고리 ID → 한국어 이름 맵 (main_categories 테이블에서 최신 조회)
// 정민님이 직접 만든 커스텀 대카테고리(예: main_1781268209386_vjzcn)도 실제 이름이 나오도록.
async function fetchMainNames(): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from("main_categories")
    .select("id, name_ko");
  if (error) {
    console.error("[doc-categorizer] 대카테고리 조회 실패:", error.message);
    return new Map();
  }
  return new Map(((data as { id: string; name_ko: string }[]) ?? []).map(m => [m.id, m.name_ko]));
}

// 구 체계 하드코딩 이름 — 테이블에 없을 때만 쓰는 폴백
function legacyMainName(mainId: string): string {
  switch (mainId) {
    case "g_outgame": return "게임 외부 설계";
    case "g_base": return "베이스";
    case "g_growth": return "성장";
    case "g_system": return "게임 시스템";
    case "g_content": return "콘텐츠";
    case "g_art": return "아트";
    case "outgame": return "아웃게임";
    case "ingame": return "인게임";
    case "graphic": return "그래픽";
    case "sound": return "사운드";
    case "design_principle": return "디자인 원칙";
    default: return mainId;
  }
}

// 대카테고리 ID → 표시 이름: 테이블 이름 우선, 없으면 구 체계 폴백, 그래도 없으면 ID 그대로.
function mainDisplayName(mainId: string, names: Map<string, string>): string {
  return names.get(mainId) ?? legacyMainName(mainId);
}

// 소카테고리 → 사람이 읽는 라벨 ("대 > 영역 > 소")
function buildLabel(c: SubCategoryInfo, names: Map<string, string>): string {
  const main = mainDisplayName(c.main_category_id, names);
  return c.area_name ? `${main} > ${c.area_name} > ${c.name_ko}` : `${main} > ${c.name_ko}`;
}

// ── 메인: 기획서 1개에 대한 카테고리 제안 ────────────────────────────
export async function suggestDocumentCategory(
  title: string,
  contentExcerpt: string,
): Promise<CategorySuggestion> {
  const empty: CategorySuggestion = { main_id: null, area_code: null, sub_id: null, label: null, reasoning: "" };

  const [cats, mainNames] = await Promise.all([fetchCurrentCategories(), fetchMainNames()]);
  if (cats.length === 0) return empty; // 분류할 카테고리가 없으면 제안 불가

  // 프롬프트용 카테고리 목록 (ID + 대 + 영역 + 이름)
  const categoryList = cats
    .map(c => {
      const main = mainDisplayName(c.main_category_id, mainNames);
      const prefix = c.area_name ? `${main} / ${c.area_name}` : main;
      return `- ${c.id}: [${prefix}] ${c.name_ko}`;
    })
    .join("\n");

  const systemPrompt = `당신은 게임 "기획서"를 카테고리에 배치하는 분류기예요.

[작업]
아래 [카테고리 목록]만 보고, 이 기획서에 가장 잘 맞는 sub_category_id 1개를 골라요.
- 내용상 어디에도 안 맞으면 null (미분류로 둠).
- 반드시 아래 목록에 있는 정확한 ID만 사용. 없는 ID 지어내기 금지.

[카테고리 목록]
${categoryList}

[출력 형식 — JSON 객체 1개만. 다른 텍스트 절대 추가 금지]
{ "sub_category_id": "카테고리 ID 또는 null", "reasoning": "왜 이 카테고리인지 한 문장 (20자 내외)" }`;

  const userContent = `[기획서 제목]
${title}

[기획서 내용 일부]
${contentExcerpt.slice(0, 1500)}

이 기획서를 가장 맞는 카테고리에 배치하는 JSON 객체를 출력하세요.`;

  try {
    const res = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 300,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    });

    const text = res.content
      .filter(b => b.type === "text")
      .map(b => (b as Anthropic.TextBlock).text)
      .join("")
      .trim();

    const cleaned = text
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : cleaned;

    const parsed = JSON.parse(jsonStr) as { sub_category_id: string | null; reasoning?: string };

    const validIds = new Set(cats.map(c => c.id));
    const sid = parsed.sub_category_id && validIds.has(parsed.sub_category_id) ? parsed.sub_category_id : null;
    const reasoning = typeof parsed.reasoning === "string" ? parsed.reasoning.slice(0, 100) : "";

    if (!sid) return { ...empty, reasoning };

    const chosen = cats.find(c => c.id === sid)!;
    return {
      main_id: chosen.main_category_id,
      area_code: chosen.area_code ?? null,
      sub_id: chosen.id,
      label: buildLabel(chosen, mainNames),
      reasoning,
    };
  } catch (err) {
    console.error("[doc-categorizer] 분류 제안 실패:", err);
    return empty;
  }
}

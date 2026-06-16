// 결정사항 AI 재분류 시스템
//
// 용도:
//   카테고리 구조가 바뀌었을 때(특히 소카테고리 삭제로 미분류가 생겼을 때),
//   각 결정사항의 내용을 읽고 "현재 카테고리 트리"에서 가장 맞는 위치를 AI가 제안한다.
//
// 흐름:
//   1. 재분류할 결정사항 목록 + 현재 sub_categories 트리(최신)를 받는다
//   2. Haiku에게 "각 결정을 어느 카테고리에 넣을지" 일괄 질의
//   3. 제안(proposal)만 돌려준다 — DB에 바로 적용하지 않음 (사용자 검토 후 적용)
//
// 주의: 카테고리는 방금 변경됐을 수 있으므로 캐시를 쓰지 않고 매번 최신 조회.
// 비용: Haiku 호출 (결정사항 25개당 1회) ≈ 수 원.

import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "./supabase";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// 한 번의 AI 호출에 넣을 결정사항 최대 개수 (토큰·정확도 균형)
const BATCH_SIZE = 25;

// ── 입출력 타입 ──────────────────────────────────────────────────────
export interface ReclassifyInput {
  id: string;
  content: string;
  context?: string | null;
  current_sub_category_id?: string | null;
}

export interface ReclassifyProposal {
  id: string;
  content: string;
  current_sub_category_id: string | null;
  current_label: string | null;       // "영역 > 소카테고리" 형태 (없으면 null = 미분류)
  proposed_sub_category_id: string | null;
  proposed_label: string | null;
  reasoning: string;                   // 왜 이 카테고리로 제안했는지 한 문장
  changed: boolean;                    // 기존과 달라졌는지 (UI에서 강조용)
}

interface SubCategoryInfo {
  id: string;
  name_ko: string;
  area_name: string | null;
  main_category_id: string;
}

// ── 최신 카테고리 조회 (캐시 없음) ───────────────────────────────────
async function fetchCurrentCategories(): Promise<SubCategoryInfo[]> {
  const { data, error } = await supabase
    .from("sub_categories")
    .select("id, name_ko, area_name, main_category_id")
    .eq("is_active", true);
  if (error) {
    console.error("[reclassifier] 카테고리 조회 실패:", error.message);
    return [];
  }
  return (data as SubCategoryInfo[]) ?? [];
}

// ── 헬퍼: 대카테고리 ID → 한국어 이름 맵 (main_categories 테이블에서 최신 조회) ──
// 정민님이 직접 만든 커스텀 대카테고리도 실제 이름이 나오도록.
async function fetchMainNames(): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from("main_categories")
    .select("id, name_ko");
  if (error) {
    console.error("[reclassifier] 대카테고리 조회 실패:", error.message);
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

// 소카테고리 ID → 사람이 읽는 라벨 ("영역 > 소" 또는 "대 > 소")
function buildLabelMap(cats: SubCategoryInfo[], names: Map<string, string>): Map<string, string> {
  const m = new Map<string, string>();
  for (const c of cats) {
    const prefix = c.area_name ?? mainDisplayName(c.main_category_id, names);
    m.set(c.id, `${prefix} > ${c.name_ko}`);
  }
  return m;
}

// ── 한 배치 재분류 ───────────────────────────────────────────────────
async function reclassifyBatch(
  batch: ReclassifyInput[],
  cats: SubCategoryInfo[],
  labelMap: Map<string, string>,
  mainNames: Map<string, string>
): Promise<Map<string, { sub_category_id: string | null; reasoning: string }>> {
  // 프롬프트용 카테고리 목록 (ID + 영역 + 이름)
  const categoryList = cats
    .map(c => {
      const prefix = c.area_name ?? mainDisplayName(c.main_category_id, mainNames);
      return `- ${c.id}: [${prefix}] ${c.name_ko}`;
    })
    .join("\n");

  // 프롬프트용 결정사항 목록 (인덱스로 식별)
  const decisionList = batch
    .map((d, i) => {
      const cur = d.current_sub_category_id ? (labelMap.get(d.current_sub_category_id) ?? "알 수 없음") : "미분류";
      const ctx = d.context ? ` (맥락: ${d.context.slice(0, 100)})` : "";
      return `${i}. [현재: ${cur}] ${d.content.slice(0, 200)}${ctx}`;
    })
    .join("\n");

  const systemPrompt = `당신은 게임 기획 "결정사항"을 카테고리에 배치하는 분류기예요.

[작업]
아래 [카테고리 목록]만 보고, 각 결정사항에 가장 잘 맞는 sub_category_id 1개를 골라요.
- 내용상 어디에도 안 맞으면 null (미분류로 둠).
- 반드시 아래 목록에 있는 정확한 ID만 사용. 없는 ID 지어내기 금지.

[카테고리 목록]
${categoryList}

[출력 형식 — JSON 배열만. 다른 텍스트 절대 추가 금지]
[
  { "index": 0, "sub_category_id": "카테고리 ID 또는 null", "reasoning": "왜 이 카테고리인지 한 문장 (15자 내외)" }
]

모든 결정사항(index 0부터)에 대해 한 줄씩 반드시 포함하세요.`;

  const userContent = `[결정사항 목록]
${decisionList}

각 결정사항을 가장 맞는 카테고리에 배치하는 JSON 배열을 출력하세요.`;

  try {
    const res = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 2000,
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
    const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
    const jsonStr = jsonMatch ? jsonMatch[0] : cleaned;

    const parsed = JSON.parse(jsonStr) as Array<{
      index: number;
      sub_category_id: string | null;
      reasoning?: string;
    }>;

    const validIds = new Set(cats.map(c => c.id));
    const result = new Map<string, { sub_category_id: string | null; reasoning: string }>();
    if (Array.isArray(parsed)) {
      for (const p of parsed) {
        const target = batch[p.index];
        if (!target) continue;
        const sid = p.sub_category_id && validIds.has(p.sub_category_id) ? p.sub_category_id : null;
        result.set(target.id, {
          sub_category_id: sid,
          reasoning: typeof p.reasoning === "string" ? p.reasoning.slice(0, 100) : "",
        });
      }
    }
    return result;
  } catch (err) {
    console.error("[reclassifier] 배치 재분류 실패:", err);
    return new Map();
  }
}

// ── 메인: 결정사항 재분류 제안 ───────────────────────────────────────
// 반환: 입력 순서대로 제안 목록 (AI가 판단 못 한 항목은 기존 값 유지로 채움)
export async function reclassifyDecisions(decisions: ReclassifyInput[]): Promise<ReclassifyProposal[]> {
  if (decisions.length === 0) return [];

  const [cats, mainNames] = await Promise.all([fetchCurrentCategories(), fetchMainNames()]);
  if (cats.length === 0) return [];   // 분류할 카테고리가 없으면 제안 불가
  const labelMap = buildLabelMap(cats, mainNames);

  // 배치로 쪼개 병렬 호출
  const batches: ReclassifyInput[][] = [];
  for (let i = 0; i < decisions.length; i += BATCH_SIZE) {
    batches.push(decisions.slice(i, i + BATCH_SIZE));
  }
  const batchResults = await Promise.all(
    batches.map(b => reclassifyBatch(b, cats, labelMap, mainNames))
  );
  // 합치기
  const merged = new Map<string, { sub_category_id: string | null; reasoning: string }>();
  for (const r of batchResults) for (const [k, v] of r) merged.set(k, v);

  return decisions.map(d => {
    const cur = d.current_sub_category_id ?? null;
    const ai = merged.get(d.id);
    // AI가 판단 못 했으면 기존 값 유지
    const proposed = ai ? ai.sub_category_id : cur;
    return {
      id: d.id,
      content: d.content,
      current_sub_category_id: cur,
      current_label: cur ? (labelMap.get(cur) ?? null) : null,
      proposed_sub_category_id: proposed,
      proposed_label: proposed ? (labelMap.get(proposed) ?? null) : null,
      reasoning: ai?.reasoning ?? "",
      changed: proposed !== cur,
    };
  });
}

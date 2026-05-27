// 결정사항 트래커 → 조던 답변 컨텍스트 변환
//
// 매 답변마다 누적된 결정사항을 시스템 프롬프트에 포함시켜
// 대화가 길어져도 조던이 이전 결정들과 일관된 답변을 하도록.

import { supabase } from "./supabase";

const DEFAULT_PROJECT_ID = "00000000-0000-0000-0000-000000000001";

interface DecisionRow {
  id: string;
  sub_category_id: string | null;
  content: string;
  confidence: string;
  created_at: string;
}

interface CategoryInfo {
  id: string;
  name_ko: string;
  area_name: string | null;
  main_category_id: string;
}

interface MainCategoryInfo {
  id: string;
  name_ko: string;
}

// ── 결정사항 컨텍스트 빌드 ──────────────────────────────────────────
// 누적된 결정사항을 카테고리별로 그룹핑한 텍스트 반환
// 토큰 비용 관리: 최대 80개까지만 포함 (최신순)
export async function buildDecisionContext(
  projectId: string = DEFAULT_PROJECT_ID,
  maxItems: number = 80
): Promise<string> {
  try {
    // 1. 결정사항 조회 (최신순)
    const { data: decRaw } = await supabase
      .from("decisions")
      .select("id, sub_category_id, content, confidence, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(maxItems);

    const decisions = (decRaw ?? []) as DecisionRow[];
    if (decisions.length === 0) return "";

    // 2. 카테고리 정보 조회 (캐시 활용 가능하지만 단순화)
    const { data: subRaw } = await supabase
      .from("sub_categories")
      .select("id, name_ko, area_name, main_category_id");
    const { data: mainRaw } = await supabase
      .from("main_categories")
      .select("id, name_ko");

    const subMap = new Map<string, CategoryInfo>();
    for (const s of (subRaw ?? []) as CategoryInfo[]) subMap.set(s.id, s);
    const mainMap = new Map<string, MainCategoryInfo>();
    for (const m of (mainRaw ?? []) as MainCategoryInfo[]) mainMap.set(m.id, m);

    // 3. 카테고리별 그룹핑 (main → area → 결정사항)
    // 그룹 키: "{main_ko} > {area_name}" 또는 "{main_ko}"
    const groups = new Map<string, { entries: { content: string; status: string }[] }>();
    for (const d of decisions) {
      const sub = d.sub_category_id ? subMap.get(d.sub_category_id) : null;
      const mainName = sub ? mainMap.get(sub.main_category_id)?.name_ko ?? "기타" : "(카테고리 미지정)";
      const groupKey = sub?.area_name
        ? `${mainName} > ${sub.area_name} > ${sub.name_ko}`
        : sub
          ? `${mainName} > ${sub.name_ko}`
          : mainName;

      if (!groups.has(groupKey)) groups.set(groupKey, { entries: [] });
      groups.get(groupKey)!.entries.push({
        content: d.content,
        status: statusIcon(d.confidence),
      });
    }

    // 4. 텍스트 빌드
    const lines: string[] = [
      `[지금까지 누적된 기획 결정사항 — 총 ${decisions.length}개]`,
      `※ 사용자가 본 게임 기획에서 이미 결정·검토한 사항들입니다. 답변 시 일관성을 유지하세요.`,
      ``,
    ];
    for (const [groupKey, { entries }] of groups) {
      lines.push(`### ${groupKey}`);
      for (const e of entries) {
        lines.push(`  ${e.status} ${e.content}`);
      }
      lines.push("");
    }

    if (decisions.length === maxItems) {
      lines.push(`(가장 최근 ${maxItems}개만 표시 — 더 오래된 결정사항은 트래커에서 확인 가능)`);
    }

    return lines.join("\n");
  } catch (err) {
    console.error("[decision-context] 빌드 실패:", err);
    return "";
  }
}

function statusIcon(confidence: string): string {
  if (confidence === "decided") return "✅";
  if (confidence === "review") return "🔍";
  if (confidence === "tentative") return "⚪";
  return "•";
}

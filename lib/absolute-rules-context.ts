// 절대 규칙(게임 헌법) → 프롬프트 주입용 컨텍스트
//
// 기획 바이블(가변 결정)보다 상위. 모든 답변·기획서 생성 시 최상단에 주입해
// 조던이 게임의 불변 전제(가로형/턴제/다IP콜라보 등)를 절대 어기지 않게 한다.

import { supabase } from "./supabase";

const DEFAULT_PROJECT_ID = "00000000-0000-0000-0000-000000000001";

// 절대 규칙 텍스트 블록 (없으면 빈 문자열). 테이블 미생성 시에도 안전.
export async function buildAbsoluteRulesContext(projectId: string = DEFAULT_PROJECT_ID): Promise<string> {
  try {
    const { data, error } = await supabase
      .from("absolute_rules")
      .select("content, sort_order, created_at")
      .eq("project_id", projectId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error || !data || data.length === 0) return "";

    const lines = [
      "[★★★ 게임 절대 규칙 (헌법) — 가장 먼저·반드시 준수 ★★★]",
      "아래는 이 게임을 관통하는 불변 전제입니다. 기획 바이블의 어떤 결정보다도 우선합니다.",
      "답변·기획서·시안 작성 시 이 규칙을 절대 위반하지 마세요. 위반하는 제안은 스스로 걸러내세요.",
      "",
    ];
    data.forEach((r, i) => lines.push(`${i + 1}. ${(r as { content: string }).content}`));
    lines.push("");
    lines.push("※ 위 규칙과 충돌하는 방향(예: 세로형 UI 제안 등)은 절대 내지 마세요. 규칙에 맞춰 자문하세요.");
    return lines.join("\n");
  } catch (err) {
    console.error("[absolute-rules-context] 빌드 실패:", err);
    return "";
  }
}

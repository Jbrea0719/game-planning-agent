// 변경 히스토리(activity log) 기록 헬퍼
// 조던 기능(결정사항·카테고리)·기획서의 추가/수정/삭제를 activity_log 테이블에 1행씩 남긴다.
//
// ⚠️ 절대 원본 동작을 깨뜨리지 않는다:
//   - 모든 에러를 try/catch로 삼킴 (console.error만) → 로깅 실패가 메인 작업을 막지 않음
//   - 테이블이 아직 없어도 안전 (insert 에러를 무시)

import { supabase } from "@/lib/supabase";

export interface ActivityEntry {
  scope: "jordan" | "doc";              // 큰 분류 (탭)
  action: "create" | "update" | "delete"; // 동작
  entity?: string;                      // 'decision' | 'category' | 'doc' 등 세부 종류
  title?: string;                       // 사람이 읽는 대상 이름/요약
  detail?: string;                      // 부가 설명(선택)
  target_id?: string;                   // 연결 대상 id(느슨한 참조)
  nickname?: string;                    // 작업자 닉네임(있을 때만)
}

// 기획서 본문(마크다운)에서 "어떤 기획서인지" 한 줄 요약을 뽑는다 (히스토리 부가설명용).
// LLM 없이 휴리스틱 — 제목·헤딩·이미지·표 기호를 걷어내고 첫 의미 있는 문장을 ~70자로.
export function oneLineSummary(markdown?: string | null): string | undefined {
  if (!markdown) return undefined;
  for (const raw of markdown.split(/\r?\n/)) {
    let line = raw.trim();
    if (!line || line.startsWith("#")) continue;               // 빈 줄·헤딩(제목) skip
    if (line.startsWith("|") || line.startsWith("```")) continue; // 표·코드블록 skip
    line = line
      .replace(/^[-*>\s]+/, "")                                 // 리스트·인용 기호
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")                     // 이미지
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")                  // 링크 → 텍스트만
      .replace(/[*_`~]/g, "")                                   // 강조 기호
      .replace(/\s+/g, " ")
      .trim();
    if (line.length < 4) continue;
    const sentence = line.split(/(?<=[.!?。])\s/)[0] ?? line;   // 첫 문장
    return sentence.length > 70 ? sentence.slice(0, 68) + "…" : sentence;
  }
  return undefined;
}

// 한 건의 변경 이력을 기록. 실패해도 throw하지 않음.
export async function logActivity(entry: ActivityEntry): Promise<void> {
  try {
    const { error } = await supabase.from("activity_log").insert({
      scope: entry.scope,
      action: entry.action,
      entity: entry.entity ?? null,
      // 긴 제목은 잘라서 저장 (목록 표시용)
      title: entry.title ? entry.title.slice(0, 200) : null,
      detail: entry.detail ?? null,
      target_id: entry.target_id ?? null,
      nickname: entry.nickname ?? null,
    });
    if (error) {
      // 테이블 미존재 등 — 로깅은 부가 기능이라 조용히 넘어감
      console.error("[activity-log] 기록 실패(무시):", error.message);
    }
  } catch (err) {
    console.error("[activity-log] 예외(무시):", err);
  }
}

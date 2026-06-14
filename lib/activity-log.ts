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

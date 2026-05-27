// 기획서 백업 헬퍼
// - createBackup: 수정 전 본문을 design_doc_backups에 INSERT
// - cleanupExpired: 7일 지난 백업 자동 삭제 (lazy — 백업 생성 시마다 호출)

import { supabase } from "./supabase";

export interface BackupInput {
  doc_id: string;
  project_id?: string | null;
  title: string;
  content_markdown: string;
  reason?: string;
  instruction?: string | null;
  nickname?: string | null;
}

export async function createBackup(input: BackupInput): Promise<void> {
  try {
    await supabase.from("design_doc_backups").insert({
      doc_id: input.doc_id,
      project_id: input.project_id ?? null,
      title: input.title,
      content_markdown: input.content_markdown,
      reason: input.reason ?? "수정 전 자동 백업",
      instruction: input.instruction ?? null,
      created_by_nickname: input.nickname ?? null,
    });
    // 백업 생성 후 만료된 백업 lazy cleanup (실패해도 백업 자체는 성공)
    await cleanupExpiredBackups();
  } catch (err) {
    console.error("[doc-backup] 백업 실패:", err);
  }
}

export async function cleanupExpiredBackups(): Promise<void> {
  try {
    await supabase
      .from("design_doc_backups")
      .delete()
      .lt("expires_at", new Date().toISOString());
  } catch (err) {
    console.error("[doc-backup] 만료 정리 실패:", err);
  }
}

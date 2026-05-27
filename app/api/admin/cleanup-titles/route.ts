// 일회성 관리자 도구: 기존 기획서 제목 끝의 "기획서" 접미사 제거
// GET /api/admin/cleanup-titles
//
// 안전 장치: 변경되는 항목만 UPDATE, 변경 전후 제목을 응답에 포함

import { supabase } from "@/lib/supabase";

export async function GET() {
  try {
    const { data: docs, error } = await supabase
      .from("design_docs")
      .select("id, title");

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    const changes: Array<{ id: string; before: string; after: string }> = [];

    for (const doc of docs ?? []) {
      const original = doc.title as string;
      if (!original) continue;
      const cleaned = original
        .replace(/\s*기획서\s*$/, "")
        .replace(/\s*기획\s*$/, "")
        .trim();
      if (cleaned && cleaned !== original) {
        const { error: updErr } = await supabase
          .from("design_docs")
          .update({ title: cleaned })
          .eq("id", doc.id);
        if (!updErr) {
          changes.push({ id: doc.id, before: original, after: cleaned });
        }
      }
    }

    return Response.json({
      success: true,
      total_scanned: docs?.length ?? 0,
      updated: changes.length,
      changes,
    });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

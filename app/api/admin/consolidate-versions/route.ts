// 일회성: 같은 family에 여러 버전이 있으면 최신만 남기고 나머지 삭제
// 버전 개념 제거에 따른 데이터 정리
// GET /api/admin/consolidate-versions

import { supabase } from "@/lib/supabase";

export async function GET() {
  try {
    const { data: docs, error } = await supabase
      .from("design_docs")
      .select("id, doc_family_id, version_no")
      .order("version_no", { ascending: false });

    if (error) return Response.json({ error: error.message }, { status: 500 });

    const families = new Map<string, { keep: string; remove: string[] }>();
    for (const d of docs ?? []) {
      const fid = (d.doc_family_id as string) ?? (d.id as string);
      if (!families.has(fid)) {
        families.set(fid, { keep: d.id as string, remove: [] });
      } else {
        families.get(fid)!.remove.push(d.id as string);
      }
    }

    const toRemove: string[] = [];
    const summary: Array<{ family: string; kept: string; removed: number }> = [];
    for (const [fid, { keep, remove }] of families) {
      if (remove.length > 0) {
        toRemove.push(...remove);
        summary.push({ family: fid, kept: keep, removed: remove.length });
      }
    }

    if (toRemove.length > 0) {
      const { error: delErr } = await supabase
        .from("design_docs")
        .delete()
        .in("id", toRemove);
      if (delErr) return Response.json({ error: delErr.message }, { status: 500 });
    }

    return Response.json({
      success: true,
      families_consolidated: summary.length,
      docs_deleted: toRemove.length,
      details: summary,
    });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

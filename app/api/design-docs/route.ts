// 기획서 목록·생성 API (생성은 /generate 별도, 여기는 목록만)
// GET /api/design-docs?project_id=...  → 모든 버전 메타 정보 목록

import { supabase } from "@/lib/supabase";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const projectId = url.searchParams.get("project_id");
    if (!projectId) {
      return Response.json({ error: "project_id 필수" }, { status: 400 });
    }

    // 본문(content_markdown)은 제외하고 메타만 조회 (목록 화면 빠르게)
    const { data, error } = await supabase
      .from("design_docs")
      .select("id, project_id, doc_family_id, version_no, title, status, changes_summary, created_by_nickname, created_at, archived_at")
      .eq("project_id", projectId)
      .order("version_no", { ascending: false });

    if (error) {
      console.error("[design-docs] 조회 실패:", error.message);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ docs: data ?? [] });
  } catch (err) {
    console.error("[design-docs] 오류:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

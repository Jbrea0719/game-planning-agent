// 대본 목록·생성 API
// GET  /api/scripts        → 모든 대본 메타(본문 제외) 목록, 최신 수정순
// POST /api/scripts        → 새 대본 생성 (body: { title?, content? }) → 생성된 대본 반환

import { supabase } from "@/lib/supabase";

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("scripts")
      .select("id, title, status, created_at, updated_at")
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("[scripts] 목록 조회 실패:", error.message);
      return Response.json({ error: error.message }, { status: 500 });
    }
    return Response.json({ scripts: data ?? [] });
  } catch (err) {
    console.error("[scripts] 오류:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const title = (body.title ?? "제목 없는 대본").toString();
    const content = (body.content ?? "").toString();

    const { data, error } = await supabase
      .from("scripts")
      .insert({ title, content })
      .select("id, title, content, status, created_at, updated_at")
      .single();

    if (error) {
      console.error("[scripts] 생성 실패:", error.message);
      return Response.json({ error: error.message }, { status: 500 });
    }
    return Response.json({ script: data });
  } catch (err) {
    console.error("[scripts] 오류:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

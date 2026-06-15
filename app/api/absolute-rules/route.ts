// 절대 규칙(게임 헌법) API — 바이블보다 상위 레이어
// GET 목록 / POST 추가 / PATCH 수정 / DELETE 삭제
// 테이블 미생성 시에도 앱이 죽지 않게 GET은 빈 배열로 폴백(마이그레이션 020 적용 전 안전).

import { supabase } from "@/lib/supabase";

const DEFAULT_PROJECT_ID = "00000000-0000-0000-0000-000000000001";

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("absolute_rules")
      .select("id, content, sort_order, created_at")
      .eq("project_id", DEFAULT_PROJECT_ID)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) {
      console.error("[absolute-rules] 목록 실패(테이블 미생성?):", error.message);
      return Response.json({ rules: [] });
    }
    return Response.json({ rules: data ?? [] });
  } catch (err) {
    return Response.json({ rules: [], error: String(err) });
  }
}

export async function POST(request: Request) {
  try {
    const { content, nickname } = (await request.json()) as { content?: string; nickname?: string };
    const c = content?.trim();
    if (!c) return Response.json({ error: "내용 필수" }, { status: 400 });

    // 맨 뒤 순서로 추가
    const { data: maxRow } = await supabase
      .from("absolute_rules")
      .select("sort_order")
      .eq("project_id", DEFAULT_PROJECT_ID)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextOrder = ((maxRow?.sort_order as number | undefined) ?? 0) + 1;

    const { data, error } = await supabase
      .from("absolute_rules")
      .insert({ project_id: DEFAULT_PROJECT_ID, content: c, sort_order: nextOrder, created_by_nickname: nickname ?? null })
      .select("id, content, sort_order, created_at")
      .single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ rule: data });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { id, content } = (await request.json()) as { id?: string; content?: string };
    if (!id) return Response.json({ error: "id 필수" }, { status: 400 });
    const c = content?.trim();
    if (!c) return Response.json({ error: "내용 필수" }, { status: 400 });
    const { error } = await supabase
      .from("absolute_rules")
      .update({ content: c, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { id } = (await request.json()) as { id?: string };
    if (!id) return Response.json({ error: "id 필수" }, { status: 400 });
    const { error } = await supabase.from("absolute_rules").delete().eq("id", id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

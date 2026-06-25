// 기획서 목록·생성 API
// GET  /api/design-docs?project_id=...  → 모든 버전 메타 정보 목록
// POST /api/design-docs { project_id, title, category_* , nickname } → 빈(작성 예정) 기획서 1개 생성
//      (카테고리 관리에서 소카테고리 아래에 기획서 단위를 바로 추가하는 용도)

import { supabase } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      project_id?: string;
      title?: string;
      category_main_id?: string | null;
      category_area_code?: string | null;
      category_sub_id?: string | null;
      nickname?: string;
    };
    if (!body.project_id || !body.title?.trim()) {
      return Response.json({ error: "project_id, title 필수" }, { status: 400 });
    }
    const { data, error } = await supabase
      .from("design_docs")
      .insert({
        project_id: body.project_id,
        title: body.title.trim(),
        content_markdown: "",
        status: "planned", // 빈 placeholder — 열어서 작성하면 draft로 채워짐
        category_main_id: body.category_main_id ?? null,
        category_area_code: body.category_area_code ?? null,
        category_sub_id: body.category_sub_id ?? null,
        created_by_nickname: body.nickname ?? null,
        changes_summary: "카테고리에서 추가한 빈 기획서",
      })
      .select()
      .single();
    if (error) {
      console.error("[design-docs] 생성 실패:", error.message);
      return Response.json({ error: error.message }, { status: 500 });
    }
    return Response.json({ doc: data });
  } catch (err) {
    console.error("[design-docs] 생성 오류:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const projectId = url.searchParams.get("project_id");
    if (!projectId) {
      return Response.json({ error: "project_id 필수" }, { status: 400 });
    }

    // 본문(content_markdown)은 제외하고 메타만 조회 (목록 화면 빠르게)
    const BASE_COLS = "id, project_id, title, status, changes_summary, created_by_nickname, created_at, archived_at, category_main_id, category_area_code, category_sub_id";

    // sort_order(드래그 순서) 포함해서 조회. 마이그레이션 014 적용 전이면 컬럼이 없어 에러 →
    // sort_order 없이 재조회(목록이 깨지지 않도록 방어). 정렬은 클라이언트가 그룹별로 처리.
    let data: unknown[] | null = null;
    let error: { message: string } | null = null;

    const primary = await supabase
      .from("design_docs")
      .select(`${BASE_COLS}, sort_order`)
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    data = primary.data;
    error = primary.error;

    if (error && /sort_order/i.test(error.message)) {
      const fallback = await supabase
        .from("design_docs")
        .select(BASE_COLS)
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      data = fallback.data;
      error = fallback.error;
    }

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

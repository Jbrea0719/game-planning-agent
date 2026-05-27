// 결정사항 CRUD API — 목록 조회 + 생성
// GET  /api/decisions?project_id=...  → 프로젝트의 모든 결정사항 + 카테고리별 카운트
// POST /api/decisions                 → 새 결정사항 추가 (수동 입력)

import { supabase } from "@/lib/supabase";

interface DecisionRow {
  id: string;
  project_id: string;
  sub_category_id: string | null;
  content: string;
  context: string | null;
  confidence: string;
  source_message_pair_id: string | null;
  source_session_id: string | null;
  is_auto_extracted: boolean;
  created_by_nickname: string | null;
  created_at: string;
  updated_at: string;
  updated_by_nickname: string | null;
}

interface SubCategoryRow {
  id: string;
  main_category_id: string;
}

// ─── GET: 결정사항 조회 + 카테고리별 카운트 ─────────────────────────
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const projectId = url.searchParams.get("project_id");
    if (!projectId) {
      return Response.json({ error: "project_id 필수" }, { status: 400 });
    }

    // 1. 결정사항 조회
    const { data: decisions, error: decErr } = await supabase
      .from("decisions")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (decErr) {
      console.error("[decisions] 조회 실패:", decErr.message);
      return Response.json({ error: decErr.message }, { status: 500 });
    }

    const rows = (decisions ?? []) as DecisionRow[];

    // 2. sub_category → main_category 매핑 (카운트용)
    const { data: subCats } = await supabase
      .from("sub_categories")
      .select("id, main_category_id");
    const subToMain = new Map<string, string>();
    for (const s of (subCats ?? []) as SubCategoryRow[]) {
      subToMain.set(s.id, s.main_category_id);
    }

    // 3. 카운트 집계
    const bySubCategory: Record<string, number> = {};
    const byMainCategory: Record<string, number> = {};
    for (const r of rows) {
      if (r.sub_category_id) {
        bySubCategory[r.sub_category_id] = (bySubCategory[r.sub_category_id] ?? 0) + 1;
        const mainId = subToMain.get(r.sub_category_id);
        if (mainId) byMainCategory[mainId] = (byMainCategory[mainId] ?? 0) + 1;
      }
    }

    return Response.json({
      decisions: rows,
      counts: {
        total: rows.length,
        by_main_category: byMainCategory,
        by_sub_category: bySubCategory,
      },
    });
  } catch (err) {
    console.error("[decisions] 오류:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

// ─── POST: 결정사항 추가 ─────────────────────────────────────────────
interface CreateBody {
  project_id: string;
  sub_category_id?: string | null;
  content: string;
  context?: string | null;
  confidence?: "decided" | "review" | "tentative";
  source_message_pair_id?: string | null;
  source_session_id?: string | null;
  is_auto_extracted?: boolean;
  nickname?: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateBody;

    if (!body.project_id || !body.content) {
      return Response.json({ error: "project_id, content 필수" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("decisions")
      .insert({
        project_id: body.project_id,
        sub_category_id: body.sub_category_id ?? null,
        content: body.content,
        context: body.context ?? null,
        confidence: body.confidence ?? "decided",
        source_message_pair_id: body.source_message_pair_id ?? null,
        source_session_id: body.source_session_id ?? null,
        is_auto_extracted: body.is_auto_extracted ?? false,
        created_by_nickname: body.nickname ?? null,
      })
      .select()
      .single();

    if (error) {
      console.error("[decisions] 생성 실패:", error.message);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ decision: data });
  } catch (err) {
    console.error("[decisions] 오류:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

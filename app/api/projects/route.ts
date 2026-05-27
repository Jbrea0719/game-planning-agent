// 프로젝트 조회·생성 API
// GET  /api/projects                    → 활성 프로젝트 목록
// GET  /api/projects?id=...             → 특정 프로젝트 상세
// POST /api/projects { name, description, nickname } → 새 프로젝트 생성

import { supabase } from "@/lib/supabase";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const projectId = url.searchParams.get("id");

    if (projectId) {
      // 특정 프로젝트 상세
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("id", projectId)
        .maybeSingle();
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ project: data });
    }

    // 전체 활성 프로젝트
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .neq("status", "archived")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[projects] 조회 실패:", error.message);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ projects: data ?? [] });
  } catch (err) {
    console.error("[projects] 오류:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      name: string;
      description?: string;
      metadata?: Record<string, unknown>;
      nickname?: string;
    };

    if (!body.name) {
      return Response.json({ error: "name 필수" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("projects")
      .insert({
        name: body.name,
        description: body.description ?? null,
        metadata: body.metadata ?? null,
        created_by_nickname: body.nickname ?? null,
      })
      .select()
      .single();

    if (error) {
      console.error("[projects] 생성 실패:", error.message);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ project: data });
  } catch (err) {
    console.error("[projects] 오류:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

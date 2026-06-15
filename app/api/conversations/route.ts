// 대화방(conversations) CRUD — 병렬 작업용 다중 대화방
// GET    ?session_id=        → 대화방 목록 (최근 활동순)
// POST   {session_id,title?,adopt_orphans?} → 새 방 (adopt_orphans면 미배정 기존 메시지 흡수)
// PATCH  {id,title}          → 이름 변경
// DELETE {id}               → 방 + 그 방 메시지 삭제

import { supabase } from "@/lib/supabase";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("session_id");
  if (!sessionId) return Response.json({ error: "session_id 필요" }, { status: 400 });

  // 1차: 새 상태 컬럼까지 포함해 조회 (마이그레이션 018 이후)
  const withState = await supabase
    .from("conversations")
    .select("id, title, created_at, updated_at, context_anchor_pair_id, context_anchor_time, reference_doc_ids, agent_context, writing_doc_id")
    .eq("session_id", sessionId)
    .order("updated_at", { ascending: false });

  if (!withState.error) {
    return Response.json({ conversations: withState.data ?? [] });
  }

  // 컬럼이 아직 없는 경우(마이그레이션 전) → 기존 컬럼만으로 폴백해 목록이 깨지지 않게
  const msg = withState.error.message ?? "";
  const isMissingColumn = /context_anchor|reference_doc_ids|agent_context|writing_doc_id/.test(msg);
  if (!isMissingColumn) {
    return Response.json({ error: msg }, { status: 500 });
  }
  const { data, error } = await supabase
    .from("conversations")
    .select("id, title, created_at, updated_at")
    .eq("session_id", sessionId)
    .order("updated_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ conversations: data ?? [] });
}

export async function POST(request: Request) {
  const { session_id, title, adopt_orphans, adopt_into } = (await request.json()) as {
    session_id: string;
    title?: string;
    adopt_orphans?: boolean;  // 기존(대화방 미배정) 메시지를 새로 만드는 이 방으로 흡수
    adopt_into?: string;      // 새로 만들지 않고, 미배정 메시지를 이 기존 방 id로 흡수 (복구용)
  };
  if (!session_id) return Response.json({ error: "session_id 필요" }, { status: 400 });

  // 복구 모드: 미배정(conversation_id NULL) 메시지를 지정 방으로 흡수 (생성 X)
  if (adopt_into) {
    const { data: adopted, error: adErr } = await supabase
      .from("messages")
      .update({ conversation_id: adopt_into })
      .eq("session_id", session_id)
      .is("conversation_id", null)
      .select("id");
    if (adErr) return Response.json({ error: adErr.message }, { status: 500 });
    return Response.json({ adopted: (adopted ?? []).length });
  }

  const { data, error } = await supabase
    .from("conversations")
    .insert({ session_id, title: title || "새 대화" })
    .select("id, title, created_at, updated_at")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  if (adopt_orphans) {
    // 이 세션의 conversation_id 없는(기존) 메시지를 새 방으로 편입 → 기존 대화 보존
    await supabase
      .from("messages")
      .update({ conversation_id: data.id })
      .eq("session_id", session_id)
      .is("conversation_id", null);
  }

  return Response.json({ conversation: data });
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as {
    id: string;
    title?: string;
    context_anchor_pair_id?: string | null;
    context_anchor_time?: string | null;
    reference_doc_ids?: string[] | null;
    agent_context?: string | null;
    writing_doc_id?: string | null;
  };
  const { id } = body;
  if (!id) return Response.json({ error: "id 필요" }, { status: 400 });

  // 항상 존재하는(마이그레이션 전에도 안전한) 필드만 따로 모음 — 폴백용
  const baseUpdate: Record<string, unknown> = {};
  // 상태 컬럼(마이그레이션 018 이후에만 존재) — 본문에 있을 때만 부분 갱신
  const stateUpdate: Record<string, unknown> = {};

  if ("title" in body) {
    baseUpdate.title = (body.title ?? "").trim() || "새 대화";
    baseUpdate.updated_at = new Date().toISOString();  // 이름 변경 시 활동 시각 갱신(기존 동작 유지)
  }
  if ("context_anchor_pair_id" in body) stateUpdate.context_anchor_pair_id = body.context_anchor_pair_id;
  if ("context_anchor_time" in body) stateUpdate.context_anchor_time = body.context_anchor_time;
  if ("reference_doc_ids" in body) stateUpdate.reference_doc_ids = body.reference_doc_ids;  // 배열 → jsonb 그대로
  if ("agent_context" in body) stateUpdate.agent_context = body.agent_context;
  if ("writing_doc_id" in body) stateUpdate.writing_doc_id = body.writing_doc_id;  // 이 방이 채울 planned 기획서 id

  const fullUpdate = { ...baseUpdate, ...stateUpdate };
  if (Object.keys(fullUpdate).length === 0) return Response.json({ success: true });

  // 1차: 상태 컬럼 포함 갱신
  const first = await supabase.from("conversations").update(fullUpdate).eq("id", id);
  if (!first.error) return Response.json({ success: true });

  // 상태 컬럼이 없어서 실패한 경우 → 항상 존재하는 필드만으로 재시도(없으면 그냥 ok). 선택적 컬럼 때문에 500 내지 않음
  const msg = first.error.message ?? "";
  const isMissingColumn = /context_anchor|reference_doc_ids|agent_context|writing_doc_id/.test(msg);
  if (!isMissingColumn) return Response.json({ error: msg }, { status: 500 });

  if (Object.keys(baseUpdate).length === 0) return Response.json({ success: true });
  const retry = await supabase.from("conversations").update(baseUpdate).eq("id", id);
  if (retry.error) return Response.json({ error: retry.error.message }, { status: 500 });
  return Response.json({ success: true });
}

export async function DELETE(request: Request) {
  const { id } = (await request.json()) as { id: string };
  if (!id) return Response.json({ error: "id 필요" }, { status: 400 });
  // 방의 메시지 먼저 삭제 후 방 삭제
  await supabase.from("messages").delete().eq("conversation_id", id);
  const { error } = await supabase.from("conversations").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}

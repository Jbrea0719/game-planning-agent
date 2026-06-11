// 채팅 첨부 이미지 업로드 — POST /api/chat-image
// 클라이언트가 보낸 base64 이미지를 doc_images 테이블에 저장하고 id 반환.
// 저장된 이미지는 기존 /api/img/<id> 라우트로 서빙됨 (인프라 재활용).
// 반환된 id는 (1) 메시지 행의 image_id로 저장되어 재진입 시 재표시,
//            (2) /api/agent에 전달되어 조던(Opus)이 이미지를 보고 답변하는 데 사용됨.

import { supabase } from "@/lib/supabase";

const ALLOWED_MIME = ["image/png", "image/jpeg", "image/gif", "image/webp"];

export async function POST(request: Request) {
  try {
    const { session_id, mime, data } = (await request.json()) as {
      session_id?: string;
      mime: string;   // 예: image/png
      data: string;   // base64 (data URL 접두사 없이 순수 base64)
    };

    if (!data || !mime) {
      return Response.json({ error: "mime·data 필수" }, { status: 400 });
    }
    if (!ALLOWED_MIME.includes(mime)) {
      return Response.json({ error: `지원하지 않는 형식: ${mime}` }, { status: 400 });
    }
    // 대략적 용량 가드 (base64 길이 기준 ~7MB) — 너무 큰 이미지 차단
    if (data.length > 7_000_000) {
      return Response.json({ error: "이미지가 너무 큽니다 (최대 약 5MB)" }, { status: 413 });
    }

    const { data: row, error } = await supabase
      .from("doc_images")
      .insert({
        doc_id: session_id ? `chat:${session_id}` : "chat",  // 정리용 느슨한 참조
        mime,
        data,
        prompt: "[채팅 첨부 이미지]",
      })
      .select("id")
      .single();

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ id: row.id });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

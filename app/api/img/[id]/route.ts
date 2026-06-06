// 저장된 이미지 서빙 — GET /api/img/<id> → 이미지 바이트 반환
// doc_images 테이블의 base64를 디코딩해 image로 응답 (브라우저 캐시 허용)

import { supabase } from "@/lib/supabase";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { data, error } = await supabase
      .from("doc_images")
      .select("mime, data")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return new Response("Not found", { status: 404 });

    const bytes = Buffer.from(data.data, "base64");
    return new Response(bytes, {
      headers: {
        "Content-Type": data.mime || "image/png",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (err) {
    return new Response(String(err), { status: 500 });
  }
}

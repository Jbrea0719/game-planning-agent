import { supabase } from "@/lib/supabase";

export async function GET() {
  const checks: Record<string, string> = {};

  // 1. 환경변수 확인
  checks.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ? "✅ 설정됨" : "❌ 없음";
  checks.NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID ? "✅ 설정됨" : "❌ 없음 (한국 웹 검색 비활성)";
  checks.NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET ? "✅ 설정됨" : "❌ 없음 (한국 웹 검색 비활성)";
  checks.TAVILY_API_KEY = process.env.TAVILY_API_KEY ? "✅ 설정됨 (폴백용)" : "⚠️ 없음 (폴백 비활성)";
  checks.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
    ? `✅ ${process.env.NEXT_PUBLIC_SUPABASE_URL}`
    : "❌ 없음";
  checks.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ? `✅ ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.slice(0, 20)}...`
    : "❌ 없음";

  // 2. Supabase 실제 연결 테스트
  try {
    const { data, error } = await supabase
      .from("messages")
      .select("id")
      .limit(1);
    if (error) {
      checks.supabase_connection = `❌ 오류: ${error.message}`;
    } else {
      checks.supabase_connection = `✅ 연결 성공 (messages 테이블 응답: ${JSON.stringify(data)})`;
    }
  } catch (e) {
    checks.supabase_connection = `❌ 예외: ${String(e)}`;
  }

  return Response.json(checks, { status: 200 });
}

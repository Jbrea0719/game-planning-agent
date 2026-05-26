// 네이버 라운지 본문 추출 진단
// 사용: /api/test-lounge?url=https://game.naver.com/lounge/sena_rebirth/board/feed
// 라운지 페이지에서 Tavily Extract가 실제 게시글 본문을 가져올 수 있는지 확인

import { tavily } from "@tavily/core";

const DEFAULT_URLS = [
  // 공지사항 목록 페이지 추정 URL들
  "https://game.naver.com/lounge/sena_rebirth/home",
  "https://game.naver.com/lounge/sena_rebirth/board/feed",
  "https://game.naver.com/lounge/sena_rebirth/board/notice",
  "https://game.naver.com/lounge/sena_rebirth/board/news",
];

export async function GET(request: Request) {
  const url = new URL(request.url);
  const targetUrl = url.searchParams.get("url");
  const apiKey = process.env.TAVILY_API_KEY;

  if (!apiKey) {
    return Response.json({ error: "TAVILY_API_KEY 미설정" }, { status: 500 });
  }

  const tv = tavily({ apiKey });
  const urlsToTest = targetUrl ? [targetUrl] : DEFAULT_URLS;

  const results: Record<string, unknown> = {};

  for (const u of urlsToTest) {
    try {
      const res = await (tv as unknown as {
        extract: (urls: string[], opts?: { extractDepth?: string }) => Promise<{
          results: Array<{ url: string; rawContent?: string; raw_content?: string }>;
          failedResults?: Array<{ url: string; error?: string }>;
          failed_results?: Array<{ url: string; error?: string }>;
        }>;
      }).extract([u], { extractDepth: "advanced" });

      const successItem = res.results?.[0];
      const failed = res.failedResults ?? res.failed_results ?? [];

      if (successItem) {
        const content = successItem.rawContent ?? successItem.raw_content ?? "";
        results[u] = {
          status: "✅ 추출 성공",
          content_length: content.length,
          first_500_chars: content.slice(0, 500),
          last_300_chars: content.slice(-300),
        };
      } else {
        results[u] = {
          status: "❌ 추출 실패",
          failed_info: failed[0] ?? "unknown",
        };
      }
    } catch (e) {
      results[u] = { status: "❌ 예외 발생", error: String(e) };
    }
  }

  return Response.json({
    description: "Tavily Extract가 네이버 라운지 페이지에서 본문을 가져올 수 있는지 진단",
    instruction: "content_length가 충분히 크고(>1000), first_500_chars에 실제 공지/게시글 내용이 보이면 라운지 직접 추출 방식 가능",
    results,
  });
}

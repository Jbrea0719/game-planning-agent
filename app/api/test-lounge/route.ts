// 직접 fetch 본문 추출 진단 (Tavily Extract 대체 검증용)
// 사용:
//   /api/test-lounge                     — 라운지 기본 URL들 자동 테스트
//   /api/test-lounge?url=https://...     — 특정 URL 테스트

const DEFAULT_URLS = [
  "https://game.naver.com/lounge/sena_rebirth/home",
  "https://game.naver.com/lounge/sena_rebirth/board/feed",
  "https://gall.dcinside.com/mgallery/board/lists/?id=sevennightsrebirth",
  "https://namu.wiki/w/%EC%84%B8%EB%B8%90%EB%82%98%EC%9D%B4%EC%B8%A0%20%EB%A6%AC%EB%B2%84%EC%8A%A4",
  "https://www.inven.co.kr/board/sena",
];

async function fetchAndExtract(url: string): Promise<{ length: number; first: string; last: string } | { error: string }> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "ko-KR,ko;q=0.9",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };

    const html = await res.text();
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    let content = bodyMatch ? bodyMatch[1] : html;

    content = content
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
      .replace(/<header[\s\S]*?<\/header>/gi, " ")
      .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&[a-z#0-9]+;/gi, " ")
      .replace(/\s+/g, " ")
      .trim();

    return {
      length: content.length,
      first: content.slice(0, 400),
      last: content.slice(-200),
    };
  } catch (e) {
    return { error: String(e) };
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const target = url.searchParams.get("url");
  const urls = target ? [target] : DEFAULT_URLS;

  const results: Record<string, unknown> = {};
  for (const u of urls) {
    results[u] = await fetchAndExtract(u);
  }

  return Response.json({
    instruction: "length > 1000이고 first에 실제 콘텐츠가 보이면 성공. SPA(JS 렌더링)는 length 작거나 메뉴만 보임.",
    results,
  });
}

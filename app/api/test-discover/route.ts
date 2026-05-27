// 도메인 자동 발견 테스트
// 사용: /api/test-discover?game=세나리
//      /api/test-discover?game=에버소울&id=eversoul
// 결과: 발견된 도메인 + 캐시 여부

import { ensureGameDomains } from "@/lib/domain-discovery";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const gameName = url.searchParams.get("game");
  const gameId = url.searchParams.get("id") || gameName?.toLowerCase().replace(/\s+/g, "_");

  if (!gameName || !gameId) {
    return Response.json({
      error: "쿼리 파라미터 필수: game=게임명 (선택: id=내부ID)",
      example: "/api/test-discover?game=에버소울&id=eversoul",
    }, { status: 400 });
  }

  const startTime = Date.now();
  const result = await ensureGameDomains(gameId, [gameName]);
  const elapsed = Date.now() - startTime;

  return Response.json({
    game_name: gameName,
    game_id: gameId,
    from_cache: result.fromCache,
    elapsed_ms: elapsed,
    domain_count: result.domains.length,
    domains_by_tier: {
      official: result.domains.filter(d => d.tier === "official"),
      press: result.domains.filter(d => d.tier === "press"),
      wiki: result.domains.filter(d => d.tier === "wiki"),
      community: result.domains.filter(d => d.tier === "community"),
    },
    raw_domains: result.domains,
  });
}

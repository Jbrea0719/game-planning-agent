// 도메인 발견 테스트 (수동 큐레이션 우선 + 캐시 + 자동 발견)
//
// 사용:
//   /api/test-discover?game=세나리                    — game_id 자동 추정
//   /api/test-discover?game=에버소울&id=eversoul       — game_id 명시
//   /api/test-discover?game=세나리&force_auto=true     — 수동 큐레이션 무시하고 자동 발견 강제

import { ensureGameDomains, manualToDiscovered } from "@/lib/domain-discovery";

// GAME_COMMUNITIES와 동일한 구조 — 수동 큐레이션 매칭용
// 향후 game-planning-agent/app/api/agent/route.ts의 GAME_COMMUNITIES와 통합 예정
const MANUAL_CURATION: Record<string, { officialUrlFilters: string[]; officialDomains: string[]; dcGalleryId?: string }> = {
  sena_rebirth: {
    officialDomains: ["game.naver.com", "inven.co.kr", "cafe.naver.com"],
    officialUrlFilters: [
      "game.naver.com/lounge/sena_rebirth",
      "inven.co.kr/board/sena",
      "inven.co.kr/webzine/news/?news",
      "cafe.naver.com/baedon",
      "trees.gamemeca.com",
      "sports.naver.com/esports",
      "newsworks.co.kr/news",
      "namu.wiki/w/세븐나이츠%20리버스",
      "namu.wiki/w/세븐나이츠 리버스",
    ],
    dcGalleryId: "sevennightsrebirth",
  },
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const gameName = url.searchParams.get("game");
  const gameId = url.searchParams.get("id") || gameName?.toLowerCase().replace(/\s+/g, "_");
  const forceAuto = url.searchParams.get("force_auto") === "true";

  if (!gameName || !gameId) {
    return Response.json({
      error: "쿼리 파라미터 필수: game=게임명 (선택: id=내부ID, force_auto=true)",
      example: "/api/test-discover?game=에버소울&id=eversoul",
    }, { status: 400 });
  }

  const manual = MANUAL_CURATION[gameId] ?? null;

  const startTime = Date.now();
  // force_auto=true면 수동 + 캐시 둘 다 건너뛰고 자동 발견 강제
  const result = await ensureGameDomains(gameId, [gameName], {
    manualCuration: manual,
    skipManual: forceAuto,
    skipCache: forceAuto,
  });
  const elapsed = Date.now() - startTime;

  return Response.json({
    game_name: gameName,
    game_id: gameId,
    source: result.source,  // "manual" | "cache" | "auto" | "empty"
    elapsed_ms: elapsed,
    domain_count: result.domains.length,
    domains_by_tier: {
      official: result.domains.filter(d => d.tier === "official"),
      press: result.domains.filter(d => d.tier === "press"),
      wiki: result.domains.filter(d => d.tier === "wiki"),
      community: result.domains.filter(d => d.tier === "community"),
    },
    raw_domains: result.domains,
    note: result.source === "manual"
      ? "수동 검증된 도메인 사용 (가장 신뢰도 높음)"
      : result.source === "cache"
        ? "자동 발견 후 캐시된 도메인 재사용"
        : result.source === "auto"
          ? "Claude 웹 검색으로 자동 발견 (캐시에 저장됨)"
          : "발견 실패",
  });
}

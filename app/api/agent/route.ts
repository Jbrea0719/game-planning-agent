import Anthropic from "@anthropic-ai/sdk";
import { tavily } from "@tavily/core";
import { supabase } from "@/lib/supabase";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── 게임별 커뮤니티 설정 ──
// officialDomains: Tavily includeDomains에 넘길 공식 커뮤니티 도메인
// officialPathHint: 도메인 내 특정 경로 식별자 — 쿼리에 포함해 정확도 향상
//   (Tavily includeDomains은 도메인 레벨만 필터링, 경로 레벨 필터링 불가)
// dcQueryHint: DC 마이너갤 검색 시 쿼리에 추가할 갤러리 식별 키워드
// 긴 이름(정확한 게임명)이 앞에 위치해야 매칭 우선순위가 올바르게 동작함
type GameCommunity = {
  officialDomains: string[];
  officialPathHint?: string;  // forum.netmarble.com 등 대형 도메인 경로 식별자
  dcQueryHint?: string;
};
const GAME_COMMUNITIES: Record<string, GameCommunity> = {
  "세븐나이츠 리버스": {
    officialDomains: ["game.naver.com"],
    officialPathHint: "sena_rebirth",  // game.naver.com/lounge/sena_rebirth 경로 특정
    dcQueryHint: "sevennightsrebirth",
  },
  "세나리":  {
    officialDomains: ["game.naver.com"],
    officialPathHint: "sena_rebirth",
    dcQueryHint: "sevennightsrebirth",
  },
  "세반리":  {
    officialDomains: ["game.naver.com"],
    officialPathHint: "sena_rebirth",
    dcQueryHint: "sevennightsrebirth",
  },
  "seven knights reverse": {
    officialDomains: ["game.naver.com"],
    officialPathHint: "sena_rebirth",
    dcQueryHint: "sevennightsrebirth",
  },
  "세븐나이츠2":   { officialDomains: ["cafe.naver.com/7knights2", "7knights2.nexon.com"] },
  "세븐나이츠":    { officialDomains: ["cafe.naver.com/7knights", "7knights.nexon.com"] },
  "afk arena":     { officialDomains: ["afkarena.fandom.com", "lilith.com"] },
  "afk2":          { officialDomains: ["afkarena.fandom.com", "lilith.com"] },
  "서머너즈워":    { officialDomains: ["cafe.naver.com/summonerswar", "summonerswar.com"] },
  "니케":          { officialDomains: ["cafe.naver.com/nikkegg", "nikke.nexon.com"] },
  "에픽세븐":      { officialDomains: ["cafe.naver.com/epicseven", "epic7global.com"] },
  "원신":          { officialDomains: ["cafe.naver.com/genshinkr", "genshin.hoyoverse.com"] },
  "붕괴 스타레일": { officialDomains: ["cafe.naver.com/starrailkr", "hsr.hoyoverse.com"] },
  "스타레일":      { officialDomains: ["cafe.naver.com/starrailkr", "hsr.hoyoverse.com"] },
  "아크나이츠":    { officialDomains: ["cafe.naver.com/arknightskr", "arknights.global"] },
  "fgo":           { officialDomains: ["cafe.naver.com/fategrandorder", "fate-go.jp"] },
  "블루아카이브":  { officialDomains: ["cafe.naver.com/bluearchivekorea", "bluearchive.nexon.com"] },
};

// Tavily 인스턴스 생성 (API key 없으면 null)
function getTavily() {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return null;
  return tavily({ apiKey });
}

type TavilyResult = { answer?: string; results: Array<{ title: string; url: string; content?: string }> };

// 검색 결과 포맷팅 (AI에게 넘길 상세 텍스트)
function formatResults(source: string, res: TavilyResult): string {
  if (!res.results || res.results.length === 0) return `[${source}] 검색 결과 없음`;
  const answer = res.answer ? `요약: ${res.answer}\n` : "";
  const items = res.results
    .map((r, i) => `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.content?.slice(0, 250) ?? ""}`)
    .join("\n\n");
  return `[${source}]\n${answer}${items}`;
}

// 검색 결과 URL 요약 (스트림 노출용 — 어떤 페이지를 찾았는지 육안 확인)
function summarizeUrls(source: string, res: TavilyResult): string {
  if (!res.results || res.results.length === 0) return `  ⚠️ ${source}: 결과 없음`;
  return res.results.map(r => `  ✓ [${source}] ${r.url}`).join("\n");
}

// ── 게임별 3채널 병렬 검색 (나무위키 + 디시 마이너갤 + 공식 커뮤니티) ──
async function searchGameInfo(
  gameName: string,
  topic: string,
  onProgress?: (text: string) => void
): Promise<string> {
  const tv = getTavily();
  if (!tv) return `[검색 불가] TAVILY_API_KEY 미설정 — 내부 지식으로 대체`;

  const query = `${gameName} ${topic}`;

  // 게임 커뮤니티 설정 찾기 — 긴 키(정확한 게임명) 우선 매칭
  const lowerGame = gameName.toLowerCase().trim();
  const community = Object.entries(GAME_COMMUNITIES)
    .filter(([key]) => lowerGame.includes(key) || key.includes(lowerGame))
    .sort((a, b) => b[0].length - a[0].length) // 더 긴(정확한) 키 우선
    [0]?.[1] ?? null;

  const officialDomains = community?.officialDomains ?? [];

  // 공식 커뮤니티 쿼리: 경로 힌트를 포함해 대형 도메인 내 특정 섹션으로 좁힘
  // 예) "세븐나이츠 리버스 sena_rebirth 최신 업데이트"
  const officialQuery = community?.officialPathHint
    ? `${gameName} ${community.officialPathHint} ${topic}`
    : query;

  // DC 검색 쿼리: 갤러리 ID를 포함해 해당 갤러리로 좁힘
  // 예) "sevennightsrebirth 최근 업데이트"
  const dcQuery = community?.dcQueryHint
    ? `${community.dcQueryHint} ${topic}`
    : query;

  // 3개 소스 병렬 검색
  const [namuRes, dcRes, officialRes] = await Promise.allSettled([
    // 1. 나무위키
    tv.search(query, {
      maxResults: 3,
      searchDepth: "basic",
      includeDomains: ["namu.wiki"],
    }),

    // 2. 디시인사이드 마이너갤 (갤러리 ID 포함 쿼리)
    tv.search(dcQuery, {
      maxResults: 3,
      searchDepth: "basic",
      includeDomains: ["gall.dcinside.com"],
    }),

    // 3. 공식 커뮤니티 (경로 힌트 포함 쿼리 + 도메인 필터)
    officialDomains.length > 0
      ? tv.search(officialQuery, {
          maxResults: 3,
          searchDepth: "advanced",
          includeAnswer: true,
          includeDomains: officialDomains,
        })
      : tv.search(`${gameName} 공식 ${topic}`, {
          maxResults: 3,
          searchDepth: "advanced",
          includeAnswer: true,
        }),
  ]);

  // 찾은 URL을 스트림에 출력 — 실제로 맞는 페이지를 가져오는지 즉시 확인 가능
  const urlLines = [
    namuRes.status === "fulfilled" ? summarizeUrls("나무위키", namuRes.value) : `  ⚠️ 나무위키: 오류`,
    dcRes.status === "fulfilled" ? summarizeUrls("디시", dcRes.value) : `  ⚠️ 디시: 오류`,
    officialRes.status === "fulfilled" ? summarizeUrls("공식", officialRes.value) : `  ⚠️ 공식: 오류`,
  ].join("\n");
  onProgress?.(`\n${urlLines}\n`);

  const namuResult = namuRes.status === "fulfilled" ? formatResults("나무위키", namuRes.value) : `[나무위키] 검색 오류`;
  const dcResult = dcRes.status === "fulfilled" ? formatResults("디시인사이드 마이너갤", dcRes.value) : `[디시인사이드] 검색 오류`;
  const officialResult = officialRes.status === "fulfilled" ? formatResults("공식 커뮤니티/홈페이지", officialRes.value) : `[공식 커뮤니티] 검색 오류`;

  return `=== ${gameName} — ${topic} ===\n\n${[namuResult, dcResult, officialResult].join("\n\n")}`;
}

// ── 일반 키워드 검색 (게임명 특정 없을 때 보조용) ──
async function searchGeneral(query: string): Promise<string> {
  const tv = getTavily();
  if (!tv) return `[검색 불가] TAVILY_API_KEY 미설정`;
  try {
    const res = await tv.search(query, {
      maxResults: 5,
      searchDepth: "advanced",
      includeAnswer: true,
    });
    return formatResults("일반 검색", res);
  } catch (err) {
    return `검색 오류: ${String(err)}`;
  }
}

// ════════════════════════════════════════
// 에이전트 1: 분석 에이전트
// 역할: 질문과 관련된 게임들을 3채널(나무위키/디시/공식)로 실시간 검색 후 비교 분석
// ════════════════════════════════════════
async function analyzeAgent(
  userQuery: string,
  contextCard: string = "",        // 롤링 맥락 카드 (항상 3줄, 크기 고정)
  recentMessages: { role: string; content: string }[] = [],  // 직전 2개 메시지 (즉각 follow-up용)
  onProgress?: (text: string) => void  // 검색 진행상황을 스트림에 실시간 출력
): Promise<string> {

  // 도구 정의: 게임별 3채널 검색 + 일반 검색
  const tools: Anthropic.Tool[] = [
    {
      name: "search_game",
      description: "특정 게임의 정보를 나무위키, 디시인사이드 마이너갤러리, 공식 커뮤니티/홈페이지 3곳에서 동시에 검색합니다",
      input_schema: {
        type: "object" as const,
        properties: {
          game_name: {
            type: "string",
            description: "검색할 게임 이름 (예: 원신, 서머너즈워, 세븐나이츠, 니케 등)",
          },
          topic: {
            type: "string",
            description: "검색할 주제 (예: 가챠 시스템, 수익화 구조, 유저 반응, 밸런스 패치 등)",
          },
        },
        required: ["game_name", "topic"],
      },
    },
    {
      name: "search_general",
      description: "게임 기획 트렌드, 업계 동향 등 특정 게임에 국한되지 않는 일반 정보를 검색합니다",
      input_schema: {
        type: "object" as const,
        properties: {
          query: {
            type: "string",
            description: "검색어",
          },
        },
        required: ["query"],
      },
    },
  ];

  // ① 롤링 맥락 카드 (크기 고정 ~150자 — 어떤 게임/주제인지 항상 파악 가능)
  const contextSection = contextCard
    ? `\n\n[대화 맥락 카드 — 현재 무엇을 논의 중인지]\n${contextCard}\n`
    : "";

  // ② 직전 메시지 2개 (즉각 follow-up 대응용 — "그게 뭐야?", "좀더 설명해줘" 등)
  const recentSection = recentMessages.length > 0
    ? `\n[직전 교환]\n${recentMessages.slice(-2).map(m =>
        `${m.role === "user" ? "질문" : "조던"}: ${m.content.slice(0, 200)}`
      ).join("\n")}\n`
    : "";

  let messages: Anthropic.MessageParam[] = [{
    role: "user",
    content: `다음 게임 기획 질문을 분석해줘. search_game 도구로 실제 데이터를 검색해서 수집해줘.${contextSection}${recentSection}
[현재 질문]
${userQuery}

검색 원칙:
- 맥락 카드에 게임명이 있으면 → 그 게임 풀네임으로 search_game 검색
- 현재 질문에 게임명이 명시된 경우 → 해당 풀네임으로 검색 (카드보다 현재 질문 우선)
- 여러 게임 비교가 필요한 경우만 여러 번 검색, 그 외엔 해당 게임 1개 집중 검색
- 게임명 절대 축약하거나 다른 게임으로 바꾸지 말 것`
  }];

  let allSearchResults = "";

  const analyzeSystemPrompt = `당신은 영웅수집형 게임 분석 전문 에이전트예요.
사용자의 게임 기획 질문에 대해 반드시 search_game 도구를 먼저 호출해서 실제 데이터를 수집하세요.
도구를 호출하기 전에 텍스트를 출력하지 마세요. 검색 먼저, 설명은 나중에.

참고 게임: AFK Arena/AFK2, 세븐나이츠 리버스, 세븐나이츠2, 세븐나이츠, 서머너즈워, 니케, 에픽세븐, 원신, 붕괴:스타레일, 아크나이츠, FGO, 블루아카이브

분석 원칙:
- 특정 게임이 명시된 경우 → 그 게임 풀네임으로만 search_game 검색 (다른 게임으로 바꾸지 않음)
- 게임명은 반드시 원래 이름 그대로 사용 (예: "세븐나이츠 리버스" → "세븐나이츠 리버스"로 검색, "세븐나이츠"로 축약 금지)
- 비교 분석이 명시적으로 필요한 경우만 여러 게임 검색
- 나무위키(개요/시스템), 디시 마이너갤(실유저 반응), 공식 커뮤니티(최신 정보) 순으로 참고
- 검색 결과가 없거나 부족하면 search_general로 보완`;

  // 도구 호출 루프 (최대 4턴 — 게임당 1번씩 여러 게임 검색 가능)
  for (let turn = 0; turn < 4; turn++) {
    const res = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 2000,
      system: analyzeSystemPrompt,
      tools,
      // 첫 턴: tool_choice "any" → 반드시 도구 호출 강제 (텍스트만 생성하는 오동작 방지)
      // 이후 턴: 자유롭게 end_turn 허용 (추가 검색 또는 종료 선택)
      ...(turn === 0 ? { tool_choice: { type: "any" as const } } : {}),
      messages,
    });

    if (res.stop_reason === "end_turn") {
      const textContent = res.content
        .filter(b => b.type === "text")
        .map(b => (b as Anthropic.TextBlock).text)
        .join("");
      return allSearchResults
        ? `[수집된 실시간 데이터]\n${allSearchResults}\n\n[분석 메모]\n${textContent}`
        : textContent;
    }

    if (res.stop_reason === "tool_use") {
      const toolBlocks = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      messages.push({ role: "assistant", content: res.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const tb of toolBlocks) {
        let result = "";
        if (tb.name === "search_game") {
          const { game_name, topic } = tb.input as { game_name: string; topic: string };
          // 검색 대상을 스트림에 실시간 출력 — 어떤 게임/주제를 검색했는지 육안 확인 가능
          onProgress?.(`   📌 **${game_name}** — ${topic} 검색 중...\n`);
          result = await searchGameInfo(game_name, topic, onProgress);
        } else if (tb.name === "search_general") {
          const { query } = tb.input as { query: string };
          result = await searchGeneral(query);
        }
        allSearchResults += `\n${result}\n`;
        toolResults.push({ type: "tool_result", tool_use_id: tb.id, content: result });
      }
      messages.push({ role: "user", content: toolResults });
    } else {
      break;
    }
  }

  // 루프 종료 시 마지막 텍스트 추출
  const lastAssistant = [...messages].reverse().find(m => m.role === "assistant");
  if (lastAssistant && Array.isArray(lastAssistant.content)) {
    const text = lastAssistant.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map(b => b.text)
      .join("");
    return text || allSearchResults || "분석 완료";
  }
  return allSearchResults || "분석 완료";
}

// ════════════════════════════════════════
// 에이전트 2: 설계 에이전트
// 역할: 조던의 10가지 철학에 기반해 구체적 설계안 도출
// ════════════════════════════════════════
async function designAgent(userQuery: string, analysisResult: string): Promise<string> {
  const res = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 2000,
    system: `당신은 10년 경력의 게임 설계 전문 에이전트예요. 다음 철학을 기준으로 구체적인 설계안을 만들어요:

[조던의 10가지 게임 설계 철학]
1. 단순함이 먼저다 — 코어 루프는 3단계 이내, 튜토리얼 없이도 이해 가능
2. Easy to Play Hard to Master — 진입 장벽 낮게, 숙련도 보상 확실하게
3. 성장 체감이 핵심 — 매 세션마다 눈에 보이는 성장, 수치 상승 만족감
4. 하드코어 유저를 위한 출구 — PvP, 레이드, 길드전 등 경쟁 채널 반드시 확보
5. 커뮤니티가 수명이다 — 길드, 채팅, 공동 목표가 이탈 방지의 핵심
6. 편의성 타협 불가 — 자동 전투, 빠른 진행, 반복 최소화
7. UI/UX 트렌드 준수 — 현재 Top100 게임 UI 벤치마킹 필수
8. 글로벌 설계 기본 — 현지화, 문화 다양성, 글로벌 서버 구조
9. 전략성은 단순한 틀 안에 — 속성 상성, 진형, 역할(탱/딜/힐) 삼각형 기본
10. 장기 PLC 처음부터 설계 — 1년치 콘텐츠 로드맵, 시즌제, 메타 교체 계획

참고 분석 데이터 (실시간 수집):
${analysisResult}

설계 원칙:
- 추상적 방향이 아닌 구체적 수치와 구조로 제안해요
- "이렇게 하면 좋겠다" 가 아니라 "이렇게 만들어라" 형식
- 구현 가능성과 개발 리소스 현실성 반영
- 출력은 구체적 설계안, 2000토큰 이내`,
    messages: [{
      role: "user",
      content: `원래 질문: ${userQuery}\n\n위 실시간 분석 데이터를 바탕으로 조던의 10가지 철학에 기반한 구체적인 설계안을 도출해줘.`
    }],
  });

  return res.content.filter(b => b.type === "text").map(b => (b as Anthropic.TextBlock).text).join("");
}

// ════════════════════════════════════════
// 에이전트 3: 검토 에이전트
// 역할: 베테랑 디렉터 시각으로 설계안 검토
// ════════════════════════════════════════
async function criticAgent(
  userQuery: string,
  designResult: string
): Promise<{ approved: boolean; feedback: string }> {
  const res = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1500,
    system: `당신은 모바일 영웅수집형 게임을 20년간 직접 만들어온 현직 디렉터예요.
AFK Arena/AFK2, 세븐나이츠 시리즈, 서머너즈워, 니케, 에픽세븐, 원신, 붕괴:스타레일, 아크나이츠, FGO, 블루아카이브 —
이 게임들의 출시 전후, 성공과 실패, 유저 반응, 운영 사고까지 몸으로 겪었어요.

지금 당신은 팀 기획자가 가져온 설계안을 검토하고 있어요.
형식이나 항목에 얽매이지 말고, **이 설계안에서 실제로 문제가 될 것들**만 골라 말해줘요.

[피드백 원칙]
- 고정된 검토 항목 없음. 질문의 맥락에서 진짜 위험한 것, 빠진 것, 오해하기 쉬운 것만 짚어요.
- 참고 게임 중 유사 사례가 있으면 반드시 인용해요. "원신이 2.x 버전에 이걸 했다가...", "서머너즈워가 초기에 이 실수를 했는데..." 식으로요.
- 영웅수집형 장르 특유의 함정 — 가챠 피로도, 메타 고착, 고과금 의존, 신규 유저 진입 장벽, 초월 인플레이션 등 — 설계에 숨어있으면 반드시 짚어요.
- "이건 괜찮네요"처럼 무의미한 칭찬 생략. 진짜 보완이 필요한 것만.
- 기획자에게 말하듯 써요. 딱딱한 보고서 아니고, 직접 대화하는 것처럼.
- 굵게(**) 강조는 핵심 포인트에만.

[출력 형식]
첫 줄에 "APPROVED" 또는 "NEEDS_IMPROVEMENT" 한 단어만 쓰고 빈 줄 하나 후,
피드백 본문을 자유롭게 써요.

- 지적 항목은 2~4개 사이로. 많다고 좋은 게 아니에요 — 진짜 중요한 것만.
- 각 항목은 제목 없이, 문단 형태로 써요. 자연스럽게 이어지는 디렉터 말투로.
- 마지막에 한 줄: "→ 지금 당장 수정해야 할 건 [핵심 1가지]예요." 로 끝내요.
- 전체 600자 이내.`,
    messages: [{
      role: "user",
      content: `기획자가 가져온 질문과 설계안이에요. 검토해주세요.\n\n[질문]\n${userQuery}\n\n[설계안]\n${designResult}`,
    }],
  });

  const feedback = res.content.filter(b => b.type === "text").map(b => (b as Anthropic.TextBlock).text).join("");
  const approved = feedback.trim().startsWith("APPROVED");
  return { approved, feedback };
}

// ════════════════════════════════════════
// 파이프라인: 검색 + 분석 → 조던 최종 답변
// ════════════════════════════════════════
async function runMultiAgentPipeline(
  userQuery: string,
  contextCard: string,
  recentMessages: { role: string; content: string }[],
  onChunk: (text: string) => void,
  detailed = false
): Promise<string> {

  // ── 검색 + 분석 (롤링 카드 + 직전 2개로 맥락 파악)
  onChunk(`\n🔍 **검색 중** — 나무위키, 디시, 공식 커뮤니티 검색 중...\n`);
  // onChunk를 onProgress로 전달 → 검색 대상(게임명/주제)이 스트림에 실시간 노출됨
  const analysisResult = await analyzeAgent(userQuery, contextCard, recentMessages, onChunk);
  onChunk(`✅ 검색 완료\n\n---\n\n`);

  // ── 조던 말투로 최종 답변 생성
  onChunk(`__JORDAN_ANSWER_START__`);

  const combinedContext = `[실시간 검색 데이터]\n${analysisResult}`;

  // 공통 시스템 프롬프트 앞부분 (검색 결과 활용 지시 포함)
  const baseSystemPrompt = `당신의 이름은 조던(Jordan)이에요. 영웅수집형 모바일 게임 기획 전문가 AI예요.
10년 이상 현장에서 게임을 만들어온 베테랑 디렉터의 시선으로 답변해요.
직설적이고 실무 중심으로, "이 구조는 이래서 망합니다"처럼 솔직하게 말해줘요.

[중요 — 검색 데이터 활용]
당신은 방금 실시간 웹 검색 에이전트를 통해 나무위키, 디시인사이드, 공식 커뮤니티 데이터를 수집했어요.
사용자 메시지에 포함된 [실시간 검색 데이터]를 반드시 활용해서 답변하세요.
절대로 "실시간 검색 기능이 없어요", "최신 정보를 알 수 없어요" 같은 말을 하지 마세요.
검색 결과가 충분하면 구체적 수치·이름·날짜를 그대로 인용하세요.
검색 결과가 부족하거나 "검색 결과 없음"인 경우에만 "정확한 데이터 확인이 어려워요"라고 짧게 언급하고, 알고 있는 범위 내에서 답변하세요.

말투:
- "~이에요", "~거든요", "~죠" 같은 친근한 말투를 사용해요
- 핵심 단어는 **굵게** 강조해요
- 불확실한 내용은 "제 견해로는" 이라고 명시해요`;

  const finalRes = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: detailed ? 8192 : 500,
    system: detailed
      ? `${baseSystemPrompt}

[절대 규칙 — 자세한 답변]
- 반드시 3000자 이내의 완결된 답변을 작성해요. 3000자를 절대 초과하지 마세요.
- 답변은 반드시 완결된 문장으로 끝나야 해요. 절대로 단어나 문장 중간에서 잘리면 안 돼요.
- 헤더(#), 목록(-, •), 표 등 구조가 도움된다면 자유롭게 사용해요.
- 만약 3000자로는 전달해야 할 내용의 50% 미만밖에 커버하지 못한다고 판단되면:
  1) 3000자 이내의 핵심 요약을 먼저 완결성 있게 작성하고 (반드시 완결된 문장으로 끝낼 것)
  2) 바로 다음 줄에 __NEEDS_FULL__ 을 단독으로 작성하고
  3) 그 아래에 전체 답변을 이어서 작성해요 (10000자 이내, 반드시 완결된 문장으로 끝낼 것)
- 50% 이상 커버 가능하면 __NEEDS_FULL__ 없이 3000자 이내로만 작성해요.`
      : `${baseSystemPrompt}

[절대 규칙 — 일반 답변]
- 반드시 500자 이내로 작성해요. 500자를 절대 초과하지 마세요. 어떤 질문에도 예외 없어요.
- 답변은 반드시 완결된 문장으로 끝나야 해요.
- 헤더(#), 목록(-, •, 번호), 표 등 마크다운 구조를 절대 사용하지 마세요. 순수 대화체 문장으로만 작성해요.
- 항목별 세부 나열 금지. 질문 전체를 3~5문장으로 압축 요약해요.
- 자세한 답변의 전체 내용을 조감하는 한 문단이어야 해요.`,
    messages: [{
      role: "user",
      content: `사용자 질문: ${userQuery}\n\n다음 실시간 검색 데이터를 바탕으로 위 질문에 조던의 말투로 답변해줘:\n\n${combinedContext}`
    }],
  });

  const finalText = finalRes.content
    .filter(b => b.type === "text")
    .map(b => (b as Anthropic.TextBlock).text)
    .join("");

  onChunk(finalText);

  // 토큰 한도로 잘린 경우 클라이언트에 알림
  if (finalRes.stop_reason === "max_tokens") {
    onChunk("__TRUNCATED__");
  }

  return finalText;
}

// ── POST 핸들러 ──
type Message = { role: "user" | "assistant"; content: string };

export async function POST(request: Request) {
  try {
    const { messages, session_id, pair_id, detailed, agentContext } = (await request.json()) as {
      messages: Message[];
      session_id?: string;
      pair_id?: string;
      detailed?: boolean;
      agentContext?: string;  // 롤링 맥락 카드 (클라이언트에서 관리)
    };

    const userMessage = messages[messages.length - 1];
    // 직전 2개 메시지 (즉각 follow-up용 — 롤링 카드와 역할 구분)
    const recentMessages = messages.slice(-3, -1);

    const readable = new ReadableStream({
      async start(controller) {
        const encode = (text: string) =>
          controller.enqueue(new TextEncoder().encode(text));
        try {
          const assistantText = await runMultiAgentPipeline(
            userMessage.content,
            agentContext ?? "",
            recentMessages,
            encode,
            detailed
          );
          // Supabase에 대화 저장
          if (session_id && pair_id) {
            const { error: dbError } = await supabase.from("messages").insert([
              { session_id, pair_id, role: "user", content: userMessage.content, universes: "게임기획", is_deleted: false },
              { session_id, pair_id, role: "assistant", content: assistantText, universes: "게임기획", is_deleted: false },
            ]);
            if (dbError) {
              console.error("[agent] Supabase 저장 실패:", dbError.message, dbError.code);
            } else {
              console.log("[agent] Supabase 저장 성공:", session_id, pair_id);
            }
          } else {
            console.warn("[agent] session_id 또는 pair_id 없음 — 저장 건너뜀");
          }
        } catch (err) {
          encode(`오류가 발생했어요: ${String(err)}`);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (error) {
    return new Response(`오류: ${String(error)}`, { status: 500 });
  }
}

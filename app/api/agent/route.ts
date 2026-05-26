import Anthropic from "@anthropic-ai/sdk";
import { tavily } from "@tavily/core";
import { supabase } from "@/lib/supabase";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── 참고 게임 데이터베이스 ──
const GAME_DATABASE = `
[참고 게임 데이터베이스 — 에이전트 내부 지식]

AFK Arena / AFK2 (릴리스 게임즈):
- AFK(Away From Keyboard) 메카닉: 오프라인 방치 수익 시스템, 접속 빈도 낮은 유저 잔존율 극대화
- 영웅 등급: E~A~S~SS~SSS급 상향 구조, 등급별 스킬 해금
- 수익화: 월정액(문라이트 케이크), 시즌 패스, 영웅 소환(배너), 성유물 가챠
- 핵심 루프: 방치 → 재화 수집 → 영웅 강화 → 스테이지 진행 → 반복

세븐나이츠 시리즈 (넷마블넥서스):
- 콜라보 전략: 마블, 원피스, DC 등 IP 콜라보로 신규 유입
- PvP 구조: 아레나(실시간 PvP), 길드전(7v7)
- 성장 단계: 각성 → 초월 → 럭키 각성 (장기 성장 곡선 설계)
- 수익화: 루비 가챠, 패스 상품, 코스튬

서머너즈워 (컴투스):
- 던전 시스템: 카이로스 던전 13종 (다양한 성장 재화 분산)
- 룬 시스템: 6부위 장비, 세트 효과, 전략 다양성의 핵심
- 레이드: 길드 콘텐츠, 협력 보상
- 메타 사이클: 분기별 신규 몬스터 → 메타 교란 → 과금 유도

니케: 승리의 여신 (시프트업):
- 세계관: 포스트 아포칼립스, 기계 적군 "랩처"와의 전쟁
- 캐릭터 정체성: 각 니케별 개별 스토리, 관계성, 배경 서사
- 수집 동기: 캐릭터 스킨, 우정도 시스템, 오디오 콘텐츠
- 수익화: 가챠(SSR 2%), 아웃포스트 패스, 프리미엄 패스

에픽세븐 (슈퍼크리에이티브):
- 아트 퀄리티: 라이브 2D 애니메이션, 고퀄 일러스트
- 스토리 활용: 챕터별 메인 스토리, 각 캐릭터 사이드 스토리
- 장기 운영: 시즌 콘텐츠, 이벤트 스토리로 월드 빌딩 확장
- 전투: 턴제 + 속도 스탯 기반 선공 시스템

원신 (호요버스):
- 오픈 월드: 지역별 스토리, 탐험, 수집 요소
- 가챠 구조: 소프트 천장(74번), 하드 천장(90번), 보장 시스템
- PLC 설계: 버전 6주 업데이트 사이클, 신규 캐릭터/지역 추가
- 수익화: 결정(가챠재화), 배틀패스, 웰킨문 월정액

붕괴:스타레일 (호요버스):
- 턴제 전략: 원소 상성, 카운터 시스템
- 메타 사이클: 이고현전(PvE 도전) 중심 컨텐츠 순환
- 캐릭터 설계: 패스(스킬 트리), 광추(전용 장비) 시스템

아크나이츠 (하이퍼그리프):
- 타워 디펜스 전략: 오퍼레이터 배치, 라인 설계
- 니치 타겟팅: 전략 게이머, 로어 덕후 특화
- 수익화: 가챠(6성 2%), 스킨, 이벤트 패스

FGO (딜라이트웍스/アニプレックス):
- IP 활용: 타입문 세계관, 역사/신화 영웅 의인화
- 스토리 몰입도: 중편 소설 수준의 챕터 스토리
- 수익화: 성배(재화) 가챠, 이벤트 파밍

블루아카이브 (넥슨게임즈):
- IP 구축: 고유 세계관 "키보토스", 학원 배경
- 스토리 몰입도: 코믹+시리어스 혼합 서사
- 수익화: 가챠(3%), 학교 방문 이벤트, 총력전(레이드) 중심
`;

// ── Tavily 검색 (보조 수단) ──
async function runSearch(query: string): Promise<string> {
  const apiKey = process.env.TAVILY_API_KEY;
  // API key가 없으면 내부 지식만 사용
  if (!apiKey) return `[내부 지식 활용] "${query}" 관련 검색 생략 — 게임 데이터베이스 기반으로 분석`;
  try {
    const tv = tavily({ apiKey });
    const res = await tv.search(query, { maxResults: 5, searchDepth: "advanced", includeAnswer: true });
    const answer = res.answer ? `요약: ${res.answer}\n\n` : "";
    const results = res.results
      .map((r, i) => `${i + 1}. ${r.title}\n${r.content?.slice(0, 300)}`)
      .join("\n\n");
    return answer + results;
  } catch (err) {
    return `검색 오류: ${String(err)}`;
  }
}

// ════════════════════════════════════════
// 에이전트 1: 분석 에이전트
// 역할: 참고 게임들과 비교하며 질문의 핵심을 분석
// ════════════════════════════════════════
async function analyzeAgent(userQuery: string): Promise<string> {
  const tools: Anthropic.Tool[] = [{
    name: "search",
    description: "최신 게임 트렌드나 특정 게임 정보를 추가로 검색합니다",
    input_schema: {
      type: "object" as const,
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  }];

  let messages: Anthropic.MessageParam[] = [{
    role: "user",
    content: `다음 게임 기획 질문을 참고 게임들의 실제 사례와 비교 분석해줘.\n\n질문: ${userQuery}\n\n필요하다면 최신 트렌드나 추가 정보를 검색해줘.`
  }];

  let allSearchResults = "";

  // 검색 도구 호출 루프 (최대 2턴)
  for (let turn = 0; turn < 2; turn++) {
    const res = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 2000,
      system: `당신은 영웅수집형 게임 분석 전문 에이전트예요. AFK Arena, 세븐나이츠, 서머너즈워, 니케, 에픽세븐, 원신, 붕괴:스타레일, 아크나이츠, FGO, 블루아카이브 등 주요 게임들의 실제 시스템과 수익화 구조를 깊이 알고 있어요.

다음 참고 데이터베이스를 활용해서 질문을 분석해요:
${GAME_DATABASE}

분석 방향:
- 어떤 게임들이 유사한 시스템/문제를 갖고 있는지 찾아요
- 성공 사례와 실패 사례를 구분해요
- 수익화, 유저 리텐션, 메타 사이클 관점에서 분석해요
- 출력은 게임별 비교 분석 형태로, 2000토큰 이내로 작성해요`,
      tools,
      messages,
    });

    if (res.stop_reason === "end_turn") {
      // 텍스트 결과 수집
      const textContent = res.content.filter(b => b.type === "text").map(b => (b as Anthropic.TextBlock).text).join("");
      return allSearchResults ? `[추가 검색 정보]\n${allSearchResults}\n\n[분석 결과]\n${textContent}` : textContent;
    }

    if (res.stop_reason === "tool_use") {
      const toolBlocks = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      messages.push({ role: "assistant", content: res.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const tb of toolBlocks) {
        const query = (tb.input as { query: string }).query;
        const result = await runSearch(query);
        allSearchResults += `\n[검색: ${query}]\n${result}\n`;
        toolResults.push({ type: "tool_result", tool_use_id: tb.id, content: result });
      }
      messages.push({ role: "user", content: toolResults });
    } else {
      break;
    }
  }

  // 루프 종료 후 최종 텍스트 추출
  const lastMsg = messages[messages.length - 1];
  if (lastMsg.role === "assistant" && Array.isArray(lastMsg.content)) {
    const textContent = lastMsg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map(b => b.text).join("");
    return textContent || "분석 완료";
  }
  return "분석 완료";
}

// ════════════════════════════════════════
// 에이전트 2: 설계 에이전트
// 역할: 조던의 10가지 철학에 기반해 구체적 설계안 도출
// ════════════════════════════════════════
async function designAgent(
  userQuery: string,
  analysisResult: string
): Promise<string> {
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

참고 분석 데이터:
${analysisResult}

설계 원칙:
- 추상적 방향이 아닌 구체적 수치와 구조로 제안해요
- "이렇게 하면 좋겠다" 가 아니라 "이렇게 만들어라" 형식
- 구현 가능성과 개발 리소스 현실성 반영
- 출력은 구체적 설계안, 2000토큰 이내`,
    messages: [{
      role: "user",
      content: `원래 질문: ${userQuery}\n\n위 분석을 바탕으로 조던의 10가지 철학에 기반한 구체적인 설계안을 도출해줘.`
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
    max_tokens: 1024,
    system: `당신은 글로벌 영웅수집형 모바일 게임을 10년 이상 개발한 베테랑 디렉터예요.
AFK Arena, 세븐나이츠, 서머너즈워, 니케, 에픽세븐, 원신 등 성공한 게임들의 실제 설계 원리와 실패 패턴을 몸소 경험했어요.

[검토 기준 1] 실제 구현 가능성
- 제안된 시스템이 6개월 내 실제 개발 가능한 규모인가?
- 기술적 리스크나 숨겨진 복잡도가 있는가?

[검토 기준 2] 수익화 지속성
- 이 구조로 출시 후 12개월 이상 매출을 유지할 수 있는가?
- 유저가 지갑을 여는 명확한 동기가 설계에 내재되어 있는가?

[검토 기준 3] 유저 이탈 위험
- 초반 30일 이탈 위험 요소가 있는가?
- 하드코어 유저와 캐주얼 유저 모두를 묶어둘 수 있는가?

[검토 기준 4] 글로벌 확장성
- 한국/일본/동남아/북미 각 시장에서 통할 수 있는 설계인가?
- 문화적 진입 장벽이나 현지화 이슈가 있는가?

출력 형식 (반드시 이 형식 그대로):
첫 줄에 "APPROVED" 또는 "NEEDS_IMPROVEMENT" 한 단어만 쓰고 빈 줄 하나 후,
아래 4줄 형식으로만 답해요. 헤더(#), 추가 섹션, 긴 설명 금지.

**① 구현 가능성**: [✅통과 / ⚠️보완 / ❌미흡] — [한 문장]
**② 수익화 지속성**: [✅통과 / ⚠️보완 / ❌미흡] — [한 문장, 핵심 문제만]
**③ 유저 이탈 위험**: [✅통과 / ⚠️보완 / ❌미흡] — [한 문장, 핵심 문제만]
**④ 글로벌 확장성**: [✅통과 / ⚠️보완 / ❌미흡] — [한 문장]

빈 줄 후 딱 한 줄: 💡 **핵심 보완**: [가장 중요한 것 1가지만, 한 문장]`,
    messages: [{
      role: "user",
      content: `원래 질문: ${userQuery}\n\n설계안:\n${designResult}\n\n베테랑 디렉터 관점에서 이 설계안을 검토해줘.`
    }],
  });

  const feedback = res.content.filter(b => b.type === "text").map(b => (b as Anthropic.TextBlock).text).join("");
  const approved = feedback.trim().startsWith("APPROVED");
  return { approved, feedback };
}

// ════════════════════════════════════════
// 멀티 에이전트 파이프라인
// 분석 → 설계 → 검토 → 조던 최종 답변
// ════════════════════════════════════════
async function runMultiAgentPipeline(
  userQuery: string,
  onChunk: (text: string) => void,
  detailed = false
): Promise<string> {
  const criticHistory: { round: number; approved: boolean; feedback: string }[] = [];

  // ── 에이전트 1: 분석
  onChunk(`\n🔍 **분석 에이전트** 작동 중...\n`);
  const analysisResult = await analyzeAgent(userQuery);
  onChunk(`✅ 분석 완료\n\n`);

  // ── 에이전트 2: 설계
  onChunk(`📐 **설계 에이전트** 작동 중...\n`);
  const designResult = await designAgent(userQuery, analysisResult);
  onChunk(`✅ 설계 완료\n\n`);

  // ── 에이전트 3: 검토
  onChunk(`🔎 **검토 에이전트** 검토 중...\n`);
  const { approved, feedback } = await criticAgent(userQuery, designResult);
  criticHistory.push({ round: 1, approved, feedback });
  onChunk(approved ? `✅ 검토 통과!\n\n---\n\n` : `📋 검토 완료 (피드백은 아래 버튼에서 확인)\n\n---\n\n`);

  // ── 조던 말투로 최종 답변 생성
  onChunk(`💬 **조던의 최종 답변:**\n\n__JORDAN_ANSWER_START__`);

  const combinedContext = `[분석]\n${analysisResult}\n\n[설계안]\n${designResult}`;

  const finalRes = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: detailed ? 8192 : 500,
    system: detailed
      ? `당신의 이름은 조던(Jordan)이에요. 영웅수집형 모바일 게임 기획 전문가 AI예요.
10년 이상 현장에서 게임을 만들어온 베테랑 디렉터의 시선으로 답변해요.
직설적이고 실무 중심으로, "이 구조는 이래서 망합니다"처럼 솔직하게 말해줘요.

말투:
- "~이에요", "~거든요", "~죠" 같은 친근한 말투를 사용해요
- 핵심 단어는 **굵게** 강조해요
- 불확실한 내용은 "제 견해로는" 이라고 명시해요

[절대 규칙 — 자세한 답변]
- 반드시 3000자 이내의 완결된 답변을 작성해요. 3000자를 절대 초과하지 마세요.
- 답변은 반드시 완결된 문장으로 끝나야 해요. 절대로 단어나 문장 중간에서 잘리면 안 돼요.
- 헤더(#), 목록(-, •), 표 등 구조가 도움된다면 자유롭게 사용해요.
- 만약 3000자로는 전달해야 할 내용의 50% 미만밖에 커버하지 못한다고 판단되면:
  1) 3000자 이내의 핵심 요약을 먼저 완결성 있게 작성하고 (반드시 완결된 문장으로 끝낼 것)
  2) 바로 다음 줄에 __NEEDS_FULL__ 을 단독으로 작성하고
  3) 그 아래에 전체 답변을 이어서 작성해요 (10000자 이내, 반드시 완결된 문장으로 끝낼 것)
- 50% 이상 커버 가능하면 __NEEDS_FULL__ 없이 3000자 이내로만 작성해요.`
      : `당신의 이름은 조던(Jordan)이에요. 영웅수집형 모바일 게임 기획 전문가 AI예요.
10년 이상 현장에서 게임을 만들어온 베테랑 디렉터의 시선으로 답변해요.
직설적이고 실무 중심으로, "이 구조는 이래서 망합니다"처럼 솔직하게 말해줘요.

말투:
- "~이에요", "~거든요", "~죠" 같은 친근한 말투를 사용해요
- 핵심 단어는 **굵게** 강조해요
- 불확실한 내용은 "제 견해로는" 이라고 명시해요

[절대 규칙 — 일반 답변]
- 반드시 500자 이내로 작성해요. 500자를 절대 초과하지 마세요. 어떤 질문에도 예외 없어요.
- 답변은 반드시 완결된 문장으로 끝나야 해요.
- 헤더(#), 목록(-, •, 번호), 표 등 마크다운 구조를 절대 사용하지 마세요. 순수 대화체 문장으로만 작성해요.
- 항목별 세부 나열 금지. 질문 전체를 3~5문장으로 압축 요약해요.
- 자세한 답변의 전체 내용을 조감하는 한 문단이어야 해요.`,
    messages: [{
      role: "user",
      content: `다음 분석과 설계 내용을 조던의 말투로 자연스럽게 전달해줘:\n\n${combinedContext}`
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

  // 검토 에이전트 피드백 메타데이터를 스트림 끝에 첨부 (클라이언트에서 파싱 후 분리)
  onChunk(`\n__JORDAN_CRITIC_START__${JSON.stringify(criticHistory)}__JORDAN_CRITIC_END__`);

  return finalText;
}

// ── POST 핸들러 ──
type Message = { role: "user" | "assistant"; content: string };

export async function POST(request: Request) {
  try {
    const { messages, session_id, pair_id, detailed } = (await request.json()) as {
      messages: Message[];
      session_id?: string;
      pair_id?: string;
      detailed?: boolean;
    };

    const userMessage = messages[messages.length - 1];

    const readable = new ReadableStream({
      async start(controller) {
        const encode = (text: string) =>
          controller.enqueue(new TextEncoder().encode(text));
        try {
          const assistantText = await runMultiAgentPipeline(userMessage.content, encode, detailed);
          // Supabase에 대화 저장 (session_id, pair_id가 있을 때만)
          if (session_id && pair_id) {
            await supabase.from("messages").insert([
              { session_id, pair_id, role: "user", content: userMessage.content, universes: "게임기획", is_deleted: false },
              { session_id, pair_id, role: "assistant", content: assistantText, universes: "게임기획", is_deleted: false },
            ]);
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

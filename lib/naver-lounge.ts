// 네이버 라운지 크롤링 — Jina Reader 활용
// Naver 라운지는 SPA라 Claude 웹 검색이 인덱싱 못함 → Jina Reader가 JS 렌더링한 마크다운 제공
//
// 흐름:
//   1. r.jina.ai/{원본 URL} → JS 실행된 결과 마크다운으로 반환
//   2. 공지사항·홈·게시판 컨텐츠를 가져와 답변 컨텍스트에 추가
//
// 비용: Jina Reader 무료 (anonymous), 약간의 latency (~2-3초)

const JINA_READER = "https://r.jina.ai/";
const FETCH_TIMEOUT_MS = 8000;

// 네이버 라운지에서 가져올 페이지 경로 (라운지 ID당)
// 공지사항(board/11)이 가장 시의성 높은 정보
const LOUNGE_PATHS = [
  { name: "공지사항", path: "/board/11?order=new" },
  { name: "홈", path: "/home" },
];

// 안전한 fetch (타임아웃 적용)
async function safeFetch(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (Jordan Game Planning Agent)" },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    return await res.text();
  } catch (err) {
    console.warn(`[naver-lounge] fetch 실패: ${url}`, err);
    return null;
  }
}

// 마크다운 본문 정리 — Jina 헤더·네비·이미지 노이즈 제거
function cleanJinaMd(md: string): string {
  let cleaned = md;
  // 상단 Jina 메타 제거 ([\s\S] 트릭으로 dot-all 회피)
  cleaned = cleaned.replace(/^Title:[\s\S]*?Markdown Content:\s*\n/, "");
  // 이미지 마크다운 제거
  cleaned = cleaned.replace(/!\[[^\]]*\]\([^)]+\)/g, "");
  // 네비게이션 링크 제거 (NAVER, GAME, 치지직 등)
  cleaned = cleaned.replace(/^\*\s+\[(NAVER|GAME|치지직|e스포츠|PC게임|오리지널 시리즈|공식 인플루언서)\][^\n]*\n/gm, "");
  // 연속 빈줄 정리
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  return cleaned.trim();
}

export interface LoungeFetchResult {
  loungeId: string;
  url: string;
  pageName: string;
  content: string;
  fetchedAt: string;
}

// 단일 라운지 페이지 가져오기
export async function fetchLoungePage(
  loungeId: string,
  path: string,
  pageName: string
): Promise<LoungeFetchResult | null> {
  const originalUrl = `https://game.naver.com/lounge/${loungeId}${path}`;
  const jinaUrl = `${JINA_READER}${originalUrl}`;

  const raw = await safeFetch(jinaUrl);
  if (!raw) return null;

  const cleaned = cleanJinaMd(raw);
  if (cleaned.length < 100) return null;

  return {
    loungeId,
    url: originalUrl,
    pageName,
    content: cleaned.slice(0, 4000),  // 컨텍스트 비용 제한
    fetchedAt: new Date().toISOString(),
  };
}

// 목록 마크다운에서 게시글 detail URL 추출 (최신순 상위 N개)
function extractArticleUrls(listMd: string, loungeId: string, max: number = 4): string[] {
  // 패턴: [제목](https://game.naver.com/lounge/{loungeId}/board/detail/{articleId})
  const re = new RegExp(`\\(https://game\\.naver\\.com/lounge/${loungeId}/board/detail/(\\d+)\\)`, "g");
  const ids = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(listMd)) !== null && ids.size < max) {
    ids.add(m[1]);
  }
  return Array.from(ids).map(id => `/board/detail/${id}`);
}

// 게시글 본문에서 노이즈 제거 (댓글·관련글·푸터 등)
function trimArticleBody(md: string): string {
  // "댓글" 섹션 이하 잘라내기
  const commentIdx = md.search(/^\s*(댓글|❤|👍|관련 게시글|관련글|다음 게시글|이전 게시글)/m);
  if (commentIdx > 0) md = md.slice(0, commentIdx);
  return md.trim();
}

// 라운지의 핵심 페이지 + 최신 공지 본문 N개 가져오기 (병렬)
export async function fetchLoungeAll(loungeId: string): Promise<LoungeFetchResult[]> {
  // 1) 핵심 페이지 (공지 목록·홈) 먼저
  const baseResults = await Promise.all(
    LOUNGE_PATHS.map(({ name, path }) => fetchLoungePage(loungeId, path, name))
  );
  const filtered = baseResults.filter((r): r is LoungeFetchResult => r !== null);

  // 2) 공지 목록 페이지에서 게시글 URL 추출
  const noticeList = filtered.find(r => r.pageName === "공지사항");
  if (!noticeList) return filtered;

  const articlePaths = extractArticleUrls(noticeList.content, loungeId, 4);
  if (articlePaths.length === 0) return filtered;

  // 3) 게시글 본문 병렬 fetch
  const articleResults = await Promise.all(
    articlePaths.map((path, i) => fetchLoungePage(loungeId, path, `공지 본문 #${i + 1}`))
  );
  for (const r of articleResults) {
    if (r) {
      r.content = trimArticleBody(r.content).slice(0, 5000);  // 본문은 좀 더 길게 허용
      filtered.push(r);
    }
  }

  return filtered;
}

// 답변 컨텍스트에 주입할 형태로 빌드
export function buildLoungeContext(results: LoungeFetchResult[]): string {
  if (results.length === 0) return "";
  const lines: string[] = [
    `[★ 공식 네이버 라운지 데이터 — 최우선 신뢰 출처 ★]`,
    `※ 운영자 공지·패치노트가 가장 빨리 올라오는 1순위 공식 채널이에요. 시점·날짜는 이 데이터를 우선 신뢰하세요.`,
    ``,
  ];
  for (const r of results) {
    lines.push(`━━━ 라운지 [${r.loungeId}] / ${r.pageName} ━━━`);
    lines.push(`출처 URL: ${r.url}`);
    lines.push(r.content);
    lines.push("");
  }
  return lines.join("\n");
}

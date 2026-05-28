// 웹툰 IP 레지스트리 컨텍스트
// 사용자 질문에 등록된 웹툰명이 언급되면 자동으로 정보를 답변 컨텍스트에 주입
// 웹툰 IP 기반 영웅수집형 게임 기획에 활용

import { supabase } from "./supabase";

interface WebtoonRow {
  id: string;
  title: string;
  title_en: string | null;
  author: string | null;
  platform: string | null;
  genre: string[] | null;
  status: string | null;
  summary: string | null;
  world_setting: string | null;
  game_potential: string | null;
  reference_notes: string[] | null;
}

// 등록된 웹툰 전부 (in-memory 캐싱은 단순하게 매번 fetch — 양 적음)
async function fetchAllWebtoons(): Promise<WebtoonRow[]> {
  try {
    const { data } = await supabase
      .from("webtoon_registry")
      .select("id, title, title_en, author, platform, genre, status, summary, world_setting, game_potential, reference_notes")
      .eq("is_active", true)
      .order("display_order");
    return (data ?? []) as WebtoonRow[];
  } catch (err) {
    console.error("[webtoon-context] fetch 실패:", err);
    return [];
  }
}

// 사용자 질문에서 언급된 웹툰 식별 (제목 부분 일치)
function detectMentioned(query: string, webtoons: WebtoonRow[]): WebtoonRow[] {
  const q = query.toLowerCase();
  return webtoons.filter(w => {
    if (q.includes(w.title.toLowerCase())) return true;
    if (w.title_en && q.includes(w.title_en.toLowerCase())) return true;
    return false;
  });
}

// 답변 컨텍스트용 텍스트 빌드
export async function buildWebtoonContext(userQuery: string): Promise<string> {
  const all = await fetchAllWebtoons();
  if (all.length === 0) return "";

  const mentioned = detectMentioned(userQuery, all);
  // 언급된 게 없어도 "사용 가능한 웹툰 IP 목록"은 짧게 전달
  if (mentioned.length === 0) {
    const titles = all.map(w => w.title).join(", ");
    return `[등록된 웹툰 IP 라이브러리 — ${all.length}종]\n` +
           `※ 사용자가 다음 웹툰 중 하나를 언급하거나 게임화 자문 요청 시 활용 가능: ${titles}\n` +
           `상세 정보가 필요하면 사용자에게 어떤 웹툰을 기준으로 자문할지 물어볼 것.`;
  }

  const lines: string[] = [
    `[★ 사용자 질문에서 언급된 웹툰 IP — 게임화 자문 시 적극 활용 ★]`,
    ``,
  ];
  for (const w of mentioned) {
    lines.push(`━━━ ${w.title}${w.title_en ? ` (${w.title_en})` : ""} ━━━`);
    if (w.author) lines.push(`작가: ${w.author}`);
    if (w.platform) lines.push(`플랫폼: ${w.platform}`);
    if (w.status) lines.push(`상태: ${w.status}`);
    if (w.genre && w.genre.length > 0) lines.push(`장르: ${w.genre.join(", ")}`);
    if (w.summary) lines.push(`요약: ${w.summary}`);
    if (w.world_setting) lines.push(`세계관: ${w.world_setting}`);
    if (w.game_potential) lines.push(`게임화 적합성: ${w.game_potential}`);
    if (w.reference_notes && w.reference_notes.length > 0) {
      lines.push(`게임화 참고 포인트:`);
      for (const n of w.reference_notes) lines.push(`  • ${n}`);
    }
    lines.push("");
  }
  lines.push(`→ 이 IP를 기반으로 영웅수집형 게임 기획 자문 시 위 정보를 적극 활용. 단, 위에 명시되지 않은 캐릭터·설정은 추측하지 말 것.`);
  return lines.join("\n");
}

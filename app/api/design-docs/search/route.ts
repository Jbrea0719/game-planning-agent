// 기획서 검색 — 제목 + 본문(content_markdown)에서 키워드 검색
// GET /api/design-docs/search?q=...&project_id=...
// family별 최신 버전만, 매칭 위치 스니펫 포함.

import { supabase } from "@/lib/supabase";

const DEFAULT_PROJECT_ID = "00000000-0000-0000-0000-000000000001";

interface Row {
  id: string;
  title: string;
  content_markdown: string;
  doc_family_id: string | null;
  created_at: string;
}

// 본문에서 q 주변 스니펫 추출 (마크다운 기호 약식 제거)
function makeSnippet(content: string, q: string): string {
  const plain = content.replace(/[#*`>_~\-]+/g, " ").replace(/\n+/g, " ").replace(/\s+/g, " ");
  const idx = plain.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return plain.slice(0, 90).trim();
  const start = Math.max(0, idx - 35);
  const end = Math.min(plain.length, idx + q.length + 55);
  return (start > 0 ? "…" : "") + plain.slice(start, end).trim() + (end < plain.length ? "…" : "");
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const raw = (searchParams.get("q") ?? "").trim();
    const projectId = searchParams.get("project_id") ?? DEFAULT_PROJECT_ID;
    if (raw.length < 1) return Response.json({ results: [] });
    // ilike 와일드카드 문자 무력화
    const q = raw.replace(/[%_]/g, "");
    if (!q) return Response.json({ results: [] });

    const pattern = `%${q}%`;
    const { data, error } = await supabase
      .from("design_docs")
      .select("id, title, content_markdown, doc_family_id, created_at")
      .eq("project_id", projectId)
      .or(`title.ilike.${pattern},content_markdown.ilike.${pattern}`)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      console.error("[doc-search] 실패:", error.message);
      return Response.json({ results: [] });
    }

    // family별 최신 버전만 (created_at desc 정렬돼 있으니 먼저 만난 것 채택)
    const seen = new Set<string>();
    const results: { id: string; title: string; snippet: string; inTitle: boolean }[] = [];
    for (const r of (data ?? []) as Row[]) {
      const fam = r.doc_family_id ?? r.id;
      if (seen.has(fam)) continue;
      seen.add(fam);
      const inTitle = (r.title ?? "").toLowerCase().includes(q.toLowerCase());
      results.push({
        id: r.id,
        title: r.title,
        snippet: makeSnippet(r.content_markdown ?? "", q),
        inTitle,
      });
      if (results.length >= 30) break;
    }
    // 제목 매칭을 위로
    results.sort((a, b) => Number(b.inTitle) - Number(a.inTitle));
    return Response.json({ results });
  } catch (err) {
    return Response.json({ results: [], error: String(err) });
  }
}

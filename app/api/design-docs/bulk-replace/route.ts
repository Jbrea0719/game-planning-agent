// 여러 기획서 용어 일괄 변경 (찾아바꾸기) — 큰 방향 변경 시 재화명 등 일괄 교체.
//   POST {project_id, find}                       → 미리보기(영향 기획서·매칭 수·스니펫)
//   POST {project_id, find, replace, apply:true, family_ids[]} → 선택 기획서에 적용
// 각 family의 '최신 버전' 본문·제목에서 literal 치환(정규식 아님), in-place 업데이트(직접 편집과 동일).

import { supabase } from "@/lib/supabase";
import { logActivity } from "@/lib/activity-log";

interface DocRow { id: string; doc_family_id: string | null; title: string | null; content_markdown: string | null; created_at: string; }

// family별 최신 버전만 (created_at desc 정렬된 입력 기준 첫 항목)
function latestPerFamily(rows: DocRow[]): DocRow[] {
  const m = new Map<string, DocRow>();
  for (const r of rows) {
    const fam = r.doc_family_id ?? r.id;
    if (!m.has(fam)) m.set(fam, r);
  }
  return [...m.values()];
}

const countOcc = (text: string, find: string) => (find ? text.split(find).length - 1 : 0);

function snippets(text: string, find: string, max = 3): string[] {
  const out: string[] = [];
  let from = 0;
  while (out.length < max) {
    const idx = text.indexOf(find, from);
    if (idx < 0) break;
    const s = Math.max(0, idx - 22), e = Math.min(text.length, idx + find.length + 22);
    out.push((s > 0 ? "…" : "") + text.slice(s, e).replace(/\s+/g, " ").trim() + (e < text.length ? "…" : ""));
    from = idx + find.length;
  }
  return out;
}

export async function POST(request: Request) {
  try {
    const { project_id, find, replace, apply, family_ids, nickname } = (await request.json()) as {
      project_id?: string; find?: string; replace?: string; apply?: boolean; family_ids?: string[]; nickname?: string;
    };
    if (!project_id) return Response.json({ error: "project_id 필수" }, { status: 400 });
    if (!find || typeof find !== "string") return Response.json({ error: "찾을 단어를 입력하세요" }, { status: 400 });

    const { data, error } = await supabase
      .from("design_docs")
      .select("id, doc_family_id, title, content_markdown, created_at")
      .eq("project_id", project_id)
      .order("created_at", { ascending: false });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    const latest = latestPerFamily((data as DocRow[]) ?? []);

    // ── 미리보기 ──
    if (!apply) {
      const matches = latest.map(d => {
        const content = d.content_markdown ?? "";
        const cc = countOcc(content, find);
        const tc = countOcc(d.title ?? "", find);
        if (cc + tc === 0) return null;
        return {
          family_id: d.doc_family_id ?? d.id,
          doc_id: d.id,
          title: d.title ?? "(제목 없음)",
          content_count: cc,
          title_count: tc,
          snippets: snippets(content, find),
        };
      }).filter(Boolean);
      const total = matches.reduce((s, m) => s + (m!.content_count + m!.title_count), 0);
      return Response.json({ matches, doc_count: matches.length, total });
    }

    // ── 적용 ──
    if (typeof replace !== "string") return Response.json({ error: "바꿀 단어를 입력하세요" }, { status: 400 });
    const targets = new Set(Array.isArray(family_ids) ? family_ids : []);
    let updated = 0;
    for (const d of latest) {
      const fam = d.doc_family_id ?? d.id;
      if (targets.size > 0 && !targets.has(fam)) continue;
      const content = d.content_markdown ?? "";
      const title = d.title ?? "";
      const cc = countOcc(content, find), tc = countOcc(title, find);
      if (cc + tc === 0) continue;
      const newContent = cc ? content.split(find).join(replace) : content;
      const newTitle = tc ? title.split(find).join(replace) : title;
      const { error: uErr } = await supabase
        .from("design_docs")
        .update({ content_markdown: newContent, title: newTitle })
        .eq("id", d.id);
      if (!uErr) {
        updated++;
        await logActivity({
          scope: "doc", action: "update", entity: "doc",
          title: newTitle || "(제목 없음)",
          detail: `용어 일괄 변경: "${find}" → "${replace}"`,
          target_id: d.id, nickname,
        });
      }
    }
    return Response.json({ updated });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

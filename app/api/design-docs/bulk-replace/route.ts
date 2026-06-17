// 여러 기획서 용어 일괄 변경 (찾아바꾸기) — 큰 방향 변경 시 재화명 등 일괄 교체.
//   POST {project_id, find}                       → 미리보기(영향 기획서·매칭 수·스니펫)
//   POST {project_id, find, replace, apply:true, family_ids[]} → 선택 기획서에 적용
// ※ design_docs에 doc_family_id 컬럼이 없으므로 각 행(doc id)을 독립 기획서로 취급.
//   (프런트의 family_id = doc_id 와 동일하게 맞춤)

import { supabase } from "@/lib/supabase";
import { logActivity } from "@/lib/activity-log";

interface DocRow { id: string; title: string | null; content_markdown: string | null; }

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
      .select("id, title, content_markdown")
      .eq("project_id", project_id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    const docs = (data as DocRow[]) ?? [];

    // ── 미리보기 ──
    if (!apply) {
      const matches = docs.map(d => {
        const content = d.content_markdown ?? "";
        const cc = countOcc(content, find);
        const tc = countOcc(d.title ?? "", find);
        if (cc + tc === 0) return null;
        return {
          family_id: d.id,  // 컬럼 없으므로 doc id를 키로 사용
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
    for (const d of docs) {
      if (targets.size > 0 && !targets.has(d.id)) continue;
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

// 기획서에 이미지 첨부 — content_markdown에 ![alt](url) 자동 삽입
// POST /api/design-docs/attach-image
//   { doc_id, image_url, alt_text, position: "end" | "after_section" | "top", section_title? }

import { supabase } from "@/lib/supabase";
import { createBackup } from "@/lib/doc-backup";

export async function POST(request: Request) {
  try {
    const { doc_id, image_url, alt_text, position, section_title, nickname } = (await request.json()) as {
      doc_id: string;
      image_url: string;
      alt_text: string;
      position: "end" | "after_section" | "top";
      section_title?: string;
      nickname?: string;
    };

    if (!doc_id || !image_url) {
      return Response.json({ error: "doc_id, image_url 필수" }, { status: 400 });
    }

    // 원본 로드
    const { data: doc, error: loadErr } = await supabase
      .from("design_docs")
      .select("id, project_id, title, content_markdown")
      .eq("id", doc_id)
      .maybeSingle();
    if (loadErr || !doc) return Response.json({ error: "기획서 없음" }, { status: 404 });

    // 백업 (수정 전)
    await createBackup({
      doc_id: doc.id,
      project_id: doc.project_id,
      title: doc.title,
      content_markdown: doc.content_markdown,
      reason: "이미지 첨부 직전",
      nickname,
    });

    // 이미지 마크다운 한 줄
    const safeAlt = (alt_text || "와이어프레임").replace(/[\[\]]/g, "");
    const imageMarkdown = `\n\n![${safeAlt}](${image_url})\n*${safeAlt}*\n\n`;

    let newContent = doc.content_markdown;

    if (position === "top") {
      // H1 다음 줄에 삽입 (H1 없으면 맨 앞)
      const h1Match = newContent.match(/^(#\s+.+\n)/m);
      if (h1Match && h1Match.index !== undefined) {
        const insertAt = h1Match.index + h1Match[0].length;
        newContent = newContent.slice(0, insertAt) + imageMarkdown + newContent.slice(insertAt);
      } else {
        newContent = imageMarkdown + newContent;
      }
    } else if (position === "after_section" && section_title) {
      // ## section_title 헤더 바로 다음 줄
      const sectionRegex = new RegExp(
        `(^##\\s+.*${section_title.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}.*\\n)`,
        "m"
      );
      const m = newContent.match(sectionRegex);
      if (m && m.index !== undefined) {
        const insertAt = m.index + m[0].length;
        newContent = newContent.slice(0, insertAt) + imageMarkdown + newContent.slice(insertAt);
      } else {
        // 못 찾으면 맨 끝에 추가
        newContent = newContent.trimEnd() + imageMarkdown;
      }
    } else {
      // end: 맨 끝
      newContent = newContent.trimEnd() + imageMarkdown;
    }

    // UPDATE
    const { error: updErr } = await supabase
      .from("design_docs")
      .update({
        content_markdown: newContent,
        changes_summary: `이미지 첨부: ${safeAlt}`,
        created_by_nickname: nickname ?? null,
      })
      .eq("id", doc_id);

    if (updErr) return Response.json({ error: updErr.message }, { status: 500 });

    return Response.json({ success: true });
  } catch (err) {
    console.error("[attach-image] 오류:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

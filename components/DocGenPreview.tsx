"use client";

// 기획서 작성 — 저장 전 미리보기 모달
// 제목(수정 가능) + 카테고리 위치 + 전체 요약을 보여주고, [저장] 시 실제로 design_docs에 저장.
// 본문은 생성 단계에서 이미 만들어졌고, 저장은 재생성 없이 그대로 INSERT (apply 모드).

import { useEffect, useState } from "react";

const SILVER = "#c0c8d8";
const SILVER_DIM = "rgba(192,200,216,0.5)";
const SILVER_FAINT = "rgba(192,200,216,0.15)";

export type DocGenPreviewData = {
  content: string;
  title: string;
  summary: string;
  category: { main_id: string | null; area_code: string | null; sub_id: string | null; label: string | null };
  messages_count: number;
};

export default function DocGenPreview({
  open,
  preview,
  projectId,
  nickname,
  targetDocId,
  onClose,
  onSaved,
}: {
  open: boolean;
  preview: DocGenPreviewData | null;
  projectId: string;
  nickname?: string;
  targetDocId?: string | null;  // 작성하기로 시작한 방이면 이 planned 기획서를 채움(in-place)
  onClose: () => void;
  onSaved: (doc: { title?: string; version_no?: number } | null) => void;
}) {
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [showFull, setShowFull] = useState(false);

  useEffect(() => {
    if (preview) { setTitle(preview.title); setShowFull(false); }
  }, [preview]);

  if (!open || !preview) return null;

  async function save() {
    if (!preview || saving) return;
    const finalTitle = title.trim() || preview.title || "대화 기반 기획서";
    setSaving(true);
    try {
      const res = await fetch("/api/document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apply: true,
          project_id: projectId,
          nickname,
          content_markdown: preview.content,
          title: finalTitle,
          category_main_id: preview.category.main_id,
          category_area_code: preview.category.area_code,
          category_sub_id: preview.category.sub_id,
          messages_count: preview.messages_count,
          target_doc_id: targetDocId ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? "저장 실패");
      onSaved(data.doc ?? null);
      onClose();
    } catch (err) {
      alert(`저장 실패: ${String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  const charCount = preview.content.length;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.75)" }} onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[88vh] flex flex-col rounded-2xl"
        style={{ backgroundColor: "#0f1628", border: `1px solid ${SILVER_FAINT}` }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${SILVER_FAINT}` }}>
          <div>
            <p className="text-sm font-bold" style={{ color: "rgba(180,210,255,1)" }}>📄 기획서 미리보기</p>
            <p className="text-xs mt-0.5" style={{ color: SILVER_DIM }}>제목을 확인·수정하고 [저장]하면 기획서 리스트에 추가돼요.</p>
          </div>
          <button onClick={onClose} className="text-xs px-3 py-1.5 rounded-lg flex-shrink-0" style={{ backgroundColor: SILVER_FAINT, color: SILVER_DIM }}>닫기</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4" style={{ scrollbarWidth: "thin", scrollbarColor: `${SILVER_DIM} transparent` }}>
          {/* 제목 (수정 가능) */}
          <div>
            <p className="text-xs font-bold mb-1.5" style={{ color: SILVER }}>제목 <span style={{ color: SILVER_DIM, fontWeight: 400 }}>(수정 가능)</span></p>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={80}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ backgroundColor: "rgba(255,255,255,0.06)", border: "1px solid rgba(100,180,255,0.4)", color: "#e0e8f0" }}
              placeholder="기획서 제목"
              autoFocus
            />
          </div>

          {/* 카테고리 위치 */}
          <div>
            <p className="text-xs font-bold mb-1.5" style={{ color: SILVER }}>카테고리 위치 <span style={{ color: SILVER_DIM, fontWeight: 400 }}>(자동 분류 — 저장 후 변경 가능)</span></p>
            <div className="px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: `1px solid ${SILVER_FAINT}`, color: preview.category.label ? "rgba(150,255,200,1)" : "rgba(255,220,150,1)" }}>
              {preview.category.label ? `📂 ${preview.category.label}` : "📄 미분류 (저장 후 분류 변경 가능)"}
            </div>
          </div>

          {/* 요약 */}
          <div>
            <p className="text-xs font-bold mb-1.5" style={{ color: SILVER }}>요약</p>
            <div className="px-3 py-2.5 rounded-lg text-xs leading-relaxed" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: `1px solid ${SILVER_FAINT}`, color: "#c8d2e0", whiteSpace: "pre-wrap" }}>
              {preview.summary || "(요약을 생성하지 못했어요)"}
            </div>
          </div>

          {/* 전체 본문 미리보기 (접기/펼치기) */}
          <div>
            <button
              onClick={() => setShowFull(v => !v)}
              className="text-xs px-3 py-1.5 rounded-lg font-medium"
              style={{ backgroundColor: SILVER_FAINT, color: SILVER }}
            >
              {showFull ? "▲ 전체 본문 접기" : `▼ 전체 본문 미리보기 (${charCount.toLocaleString()}자)`}
            </button>
            {showFull && (
              <pre className="mt-2 px-3 py-2.5 rounded-lg text-[11px] leading-relaxed overflow-x-auto" style={{ backgroundColor: "rgba(0,0,0,0.3)", border: `1px solid ${SILVER_FAINT}`, color: "#b8c4d4", whiteSpace: "pre-wrap", maxHeight: "40vh", overflowY: "auto" }}>
                {preview.content}
              </pre>
            )}
          </div>
        </div>

        {/* 하단 버튼 */}
        <div className="px-5 py-3 flex items-center justify-end gap-2" style={{ borderTop: `1px solid ${SILVER_FAINT}` }}>
          <button onClick={onClose} disabled={saving} className="text-xs px-4 py-2 rounded-lg disabled:opacity-40" style={{ backgroundColor: SILVER_FAINT, color: SILVER }}>취소</button>
          <button
            onClick={save}
            disabled={saving}
            className="text-xs px-4 py-2 rounded-lg font-bold disabled:opacity-40"
            style={{ backgroundColor: "rgba(100,180,255,0.25)", border: "1px solid rgba(100,180,255,0.5)", color: "rgba(200,225,255,1)" }}
          >
            {saving ? "저장 중..." : "✓ 이 내용으로 저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

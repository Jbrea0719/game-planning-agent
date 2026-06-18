"use client";

// 기획서 선택 모달 — 참고 기획서(다중) 또는 수정 대상(단일) 선택용 공용 컴포넌트
// mode="multi": 체크박스 다중 선택 → [확인]으로 onConfirm(ids)
// mode="single": 한 개 클릭 즉시 onConfirm([id])

import { useState, useEffect, useMemo } from "react";

const SILVER = "#c0c8d8";
const SILVER_DIM = "rgba(192,200,216,0.5)";
const SILVER_FAINT = "rgba(192,200,216,0.15)";

type DocMeta = {
  id: string;
  title: string;
  category_main_id?: string | null;
  created_by_nickname?: string | null;
  created_at?: string;
};

export default function DocPickerModal({
  open,
  onClose,
  projectId,
  mode = "multi",
  title = "기획서 선택",
  selectedIds = [],
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  mode?: "multi" | "single";
  title?: string;
  selectedIds?: string[];
  onConfirm: (ids: string[]) => void;
}) {
  const [docs, setDocs] = useState<DocMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set(selectedIds));

  useEffect(() => {
    if (!open) return;
    setSel(new Set(selectedIds));
    setLoading(true);
    fetch(`/api/design-docs?project_id=${encodeURIComponent(projectId)}`)
      .then((r) => r.json())
      .then((d) => setDocs(d.docs ?? []))
      .catch((e) => console.error("[DocPicker] 목록 로드 실패:", e))
      .finally(() => setLoading(false));
    // selectedIds는 open될 때 한 번만 반영
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter((d) => (d.title ?? "").toLowerCase().includes(q));
  }, [docs, query]);

  if (!open) return null;

  function toggle(id: string) {
    if (mode === "single") {
      onConfirm([id]);
      onClose();
      return;
    }
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.7)" }} onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[80vh] flex flex-col rounded-2xl"
        style={{ backgroundColor: "#0f1628", border: `1px solid ${SILVER_FAINT}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${SILVER_FAINT}` }}>
          <div>
            <p className="text-sm font-bold" style={{ color: SILVER }}>{title}</p>
            <p className="text-xs mt-0.5" style={{ color: SILVER_DIM }}>
              {mode === "multi" ? "답변 시 함께 참고할 기획서를 체크하세요 (여러 개 가능)" : "수정할 기획서 1개를 선택하세요"}
            </p>
          </div>
          <button onClick={onClose} className="text-xs px-3 py-1.5 rounded-lg" style={{ backgroundColor: SILVER_FAINT, color: SILVER_DIM }}>닫기</button>
        </div>

        <div className="px-5 pt-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="기획서 제목 검색..."
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ backgroundColor: "rgba(255,255,255,0.07)", border: `1px solid ${SILVER_FAINT}`, color: "#e0e8f0" }}
          />
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1" style={{ scrollbarWidth: "thin", scrollbarColor: `${SILVER_DIM} transparent` }}>
          {loading && <p className="text-xs px-2 py-4 text-center" style={{ color: SILVER_DIM }}>불러오는 중...</p>}
          {!loading && filtered.length === 0 && <p className="text-xs px-2 py-4 text-center" style={{ color: SILVER_DIM }}>기획서가 없어요.</p>}
          {!loading && filtered.map((d) => {
            const checked = sel.has(d.id);
            return (
              <button
                key={d.id}
                onClick={() => toggle(d.id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors"
                style={{ backgroundColor: checked ? "rgba(100,180,255,0.15)" : "transparent", border: `1px solid ${checked ? "rgba(100,180,255,0.4)" : "transparent"}` }}
              >
                {mode === "multi" && (
                  <span className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 text-[10px]"
                    style={{ backgroundColor: checked ? "rgba(100,180,255,0.9)" : "transparent", border: `1px solid ${checked ? "rgba(100,180,255,0.9)" : SILVER_DIM}`, color: "#0a0e1a" }}>
                    {checked ? "✓" : ""}
                  </span>
                )}
                <span className="text-sm flex-1 truncate" style={{ color: checked ? "var(--accent-2)" : "#d0d8e4" }}>{d.title || "(제목 없음)"}</span>
              </button>
            );
          })}
        </div>

        {mode === "multi" && (
          <div className="px-5 py-3 flex items-center justify-between" style={{ borderTop: `1px solid ${SILVER_FAINT}` }}>
            <span className="text-xs" style={{ color: SILVER_DIM }}>{sel.size}개 선택됨</span>
            <div className="flex gap-2">
              <button onClick={() => setSel(new Set())} className="text-xs px-3 py-1.5 rounded-lg" style={{ backgroundColor: SILVER_FAINT, color: SILVER_DIM }}>전체 해제</button>
              <button
                onClick={() => { onConfirm(Array.from(sel)); onClose(); }}
                className="text-xs px-4 py-1.5 rounded-lg font-bold"
                style={{ backgroundColor: "rgba(100,180,255,0.25)", border: "1px solid rgba(100,180,255,0.5)", color: "rgba(200,225,255,1)" }}
              >
                확인
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

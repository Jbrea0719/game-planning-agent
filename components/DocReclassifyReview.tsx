"use client";

// 기획서 AI 재분류 검토 모달
//
// 소카테고리 삭제 등으로 미분류가 된 기획서를, AI가 "이 카테고리로 옮길게요" 제안하면
// 사용자가 항목별로 확인(체크)한 뒤 [적용]을 눌러야 실제 DB에 반영된다.
// (결정사항용 ReclassifyReview의 기획서 버전)
//
// 흐름: 마운트 → /api/design-docs/reclassify(preview) → 제안 목록 표시
//       → 체크된 항목만 (apply)로 일괄 반영 → onApplied()

import { useEffect, useState, useCallback } from "react";

const SILVER = "#c0c8d8";
const SILVER_DIM = "rgba(192,200,216,0.5)";
const SILVER_FAINT = "rgba(192,200,216,0.15)";

interface Proposal {
  id: string;
  title: string;
  proposed_main_id: string | null;
  proposed_area_code: string | null;
  proposed_sub_id: string | null;
  proposed_label: string | null;
  reasoning: string;
}

export default function DocReclassifyReview({
  open,
  docIds,
  onClose,
  onApplied,
}: {
  open: boolean;
  docIds: string[];           // 재분류 대상 (소카테고리 삭제로 미분류된 기획서들)
  onClose: () => void;
  onApplied: () => void;      // 적용 완료 시 (부모가 기획서 목록 새로고침)
}) {
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [accepted, setAccepted] = useState<Set<string>>(new Set());

  const loadPreview = useCallback(async () => {
    if (docIds.length === 0) { setProposals([]); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/design-docs/reclassify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview", doc_ids: docIds }),
      });
      const data = await res.json();
      const list = (data.proposals ?? []) as Proposal[];
      setProposals(list);
      // AI가 카테고리를 제안한 항목만 기본 체크
      setAccepted(new Set(list.filter(p => p.proposed_sub_id).map(p => p.id)));
    } catch (err) {
      console.error("[doc-reclassify] 제안 로드 실패:", err);
      setProposals([]);
    } finally {
      setLoading(false);
    }
  }, [docIds]);

  useEffect(() => {
    if (open) void loadPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const toggle = (id: string) => {
    setAccepted(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  async function apply() {
    const assignments = proposals
      .filter(p => accepted.has(p.id) && p.proposed_sub_id)
      .map(p => ({ id: p.id, main_id: p.proposed_main_id, area_code: p.proposed_area_code, sub_id: p.proposed_sub_id }));
    if (assignments.length === 0) { onClose(); return; }
    setApplying(true);
    try {
      await fetch("/api/design-docs/reclassify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "apply", assignments }),
      });
      onApplied();
      onClose();
    } catch (err) {
      console.error("[doc-reclassify] 적용 실패:", err);
      alert("재분류 적용 중 오류가 났어요. 다시 시도해 주세요.");
    } finally {
      setApplying(false);
    }
  }

  const acceptedCount = proposals.filter(p => accepted.has(p.id) && p.proposed_sub_id).length;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.8)" }}
      onClick={onClose}
    >
      <div
        className="rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl"
        style={{ backgroundColor: "#0f1628", border: `1px solid ${SILVER_FAINT}` }}
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 flex-shrink-0" style={{ borderBottom: `1px solid ${SILVER_FAINT}` }}>
          <p className="text-sm font-bold flex items-center gap-2" style={{ color: SILVER }}>
            <span>🤖</span> 기획서 재분류 검토
          </p>
          <p className="text-xs mt-1" style={{ color: SILVER_DIM }}>
            카테고리가 삭제돼 분류가 풀린 기획서예요. AI가 새 위치를 제안했어요.
            <br />체크된 항목만 옮겨지고, 체크 해제하면 <b>분류 안 됨</b>으로 남아요.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4" style={{ scrollbarWidth: "thin", scrollbarColor: `${SILVER_DIM} transparent` }}>
          {loading && (
            <p className="text-xs text-center py-8" style={{ color: SILVER_DIM }}>
              🤖 AI가 재배치 위치를 분석 중이에요...
            </p>
          )}
          {!loading && proposals.length === 0 && (
            <p className="text-xs text-center py-8" style={{ color: SILVER_DIM }}>재분류할 기획서가 없어요.</p>
          )}
          {!loading && proposals.map(p => {
            const isChecked = accepted.has(p.id);
            const hasProposal = !!p.proposed_sub_id;
            return (
              <div
                key={p.id}
                className="mb-2 rounded-lg px-3 py-2.5 flex gap-3 items-start"
                style={{ backgroundColor: "rgba(255,255,255,0.03)", border: `1px solid ${SILVER_FAINT}` }}
              >
                <input
                  type="checkbox"
                  checked={isChecked && hasProposal}
                  disabled={!hasProposal}
                  onChange={() => toggle(p.id)}
                  className="mt-0.5 flex-shrink-0"
                  style={{ accentColor: "rgba(100,220,160,1)", width: 15, height: 15 }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs leading-snug font-medium" style={{ color: "#d8e0ec" }}>📄 {p.title}</p>
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgba(255,180,180,0.12)", color: "rgba(255,180,180,0.8)" }}>
                      분류 안 됨
                    </span>
                    <span style={{ color: SILVER_DIM, fontSize: "11px" }}>→</span>
                    {hasProposal ? (
                      <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ backgroundColor: "rgba(100,220,160,0.15)", color: "rgba(150,255,200,1)" }}>
                        {p.proposed_label}
                      </span>
                    ) : (
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: SILVER_FAINT, color: SILVER_DIM }}>
                        AI가 적합한 위치를 못 찾음 (분류 안 됨 유지)
                      </span>
                    )}
                  </div>
                  {p.reasoning && (
                    <p className="text-xs mt-1" style={{ color: SILVER_DIM }}>💬 {p.reasoning}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-5 py-3 flex-shrink-0 flex items-center justify-between" style={{ borderTop: `1px solid ${SILVER_FAINT}` }}>
          <span className="text-xs" style={{ color: SILVER_DIM }}>{acceptedCount}개 이동 예정</span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="text-xs px-4 py-2 rounded-lg"
              style={{ backgroundColor: SILVER_FAINT, color: SILVER }}
            >
              나중에 (분류 안 됨으로 둠)
            </button>
            <button
              disabled={applying || loading || acceptedCount === 0}
              onClick={apply}
              className="text-xs px-4 py-2 rounded-lg font-bold disabled:opacity-40"
              style={{ backgroundColor: "rgba(100,220,160,0.25)", border: "1px solid rgba(100,220,160,0.6)", color: "rgba(150,255,200,1)" }}
            >
              {applying ? "적용 중..." : "이대로 적용"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

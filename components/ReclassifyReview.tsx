"use client";

// 결정사항 AI 재분류 검토 모달
//
// 카테고리 삭제 등으로 미분류가 된 결정사항을, AI가 "이 카테고리로 옮길게요" 제안하면
// 사용자가 항목별로 확인(체크)한 뒤 [적용]을 눌러야 실제 DB에 반영된다.
//
// 흐름: 마운트 → /api/decisions/reclassify(preview) 호출 → 제안 목록 표시
//       → 체크된 항목만 (apply)로 일괄 반영 → onApplied()

import { useEffect, useState, useCallback } from "react";

const SILVER = "#c0c8d8";
const SILVER_DIM = "rgba(192,200,216,0.5)";
const SILVER_FAINT = "rgba(192,200,216,0.15)";

interface Proposal {
  id: string;
  content: string;
  current_sub_category_id: string | null;
  current_label: string | null;
  proposed_sub_category_id: string | null;
  proposed_label: string | null;
  reasoning: string;
  changed: boolean;
}

export default function ReclassifyReview({
  open,
  projectId,
  decisionIds,
  nickname,
  onClose,
  onApplied,
}: {
  open: boolean;
  projectId: string;
  decisionIds: string[];           // 재분류 대상 (카테고리 삭제로 미분류된 결정들)
  nickname?: string;
  onClose: () => void;
  onApplied: () => void;           // 적용 완료 시 (부모가 바이블 결정사항 새로고침)
}) {
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  // 체크된 항목 id (적용 대상). 기본: AI가 카테고리를 제안한 항목만 체크
  const [accepted, setAccepted] = useState<Set<string>>(new Set());

  // ── 제안 받아오기 ────────────────────────────────────────────────
  const loadPreview = useCallback(async () => {
    if (decisionIds.length === 0) { setProposals([]); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/decisions/reclassify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview", project_id: projectId, decision_ids: decisionIds }),
      });
      const data = await res.json();
      const list = (data.proposals ?? []) as Proposal[];
      setProposals(list);
      // AI가 카테고리를 제안한(=미분류 아님) 항목만 기본 체크
      setAccepted(new Set(list.filter(p => p.proposed_sub_category_id).map(p => p.id)));
    } catch (err) {
      console.error("[reclassify-review] 제안 로드 실패:", err);
      setProposals([]);
    } finally {
      setLoading(false);
    }
  }, [projectId, decisionIds]);

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

  // ── 적용 ─────────────────────────────────────────────────────────
  async function apply() {
    // 체크된 항목만, AI 제안 카테고리로 이동. 체크 해제된 건 미분류로 둠.
    const assignments = proposals
      .filter(p => accepted.has(p.id) && p.proposed_sub_category_id)
      .map(p => ({ id: p.id, sub_category_id: p.proposed_sub_category_id }));
    if (assignments.length === 0) { onClose(); return; }
    setApplying(true);
    try {
      await fetch("/api/decisions/reclassify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "apply", assignments, nickname }),
      });
      onApplied();
      onClose();
    } catch (err) {
      console.error("[reclassify-review] 적용 실패:", err);
      alert("재분류 적용 중 오류가 났어요. 다시 시도해 주세요.");
    } finally {
      setApplying(false);
    }
  }

  const acceptedCount = proposals.filter(p => accepted.has(p.id) && p.proposed_sub_category_id).length;

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
        {/* 헤더 */}
        <div className="px-5 py-4 flex-shrink-0" style={{ borderBottom: `1px solid ${SILVER_FAINT}` }}>
          <p className="text-sm font-bold flex items-center gap-2" style={{ color: SILVER }}>
            <span>🤖</span> 결정사항 재분류 검토
          </p>
          <p className="text-xs mt-1" style={{ color: SILVER_DIM }}>
            카테고리가 삭제돼 분류가 풀린 결정사항이에요. AI가 새 위치를 제안했어요.
            <br />체크된 항목만 옮겨지고, 체크 해제하면 <b>미분류</b>로 남아요.
          </p>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto px-5 py-4" style={{ scrollbarWidth: "thin", scrollbarColor: `${SILVER_DIM} transparent` }}>
          {loading && (
            <p className="text-xs text-center py-8" style={{ color: SILVER_DIM }}>
              🤖 AI가 재배치 위치를 분석 중이에요...
            </p>
          )}
          {!loading && proposals.length === 0 && (
            <p className="text-xs text-center py-8" style={{ color: SILVER_DIM }}>
              재분류할 결정사항이 없어요.
            </p>
          )}
          {!loading && proposals.map(p => {
            const isChecked = accepted.has(p.id);
            const hasProposal = !!p.proposed_sub_category_id;
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
                  <p className="text-xs leading-snug" style={{ color: "#d8e0ec" }}>{p.content}</p>
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgba(255,180,180,0.12)", color: "rgba(255,180,180,0.8)" }}>
                      미분류
                    </span>
                    <span style={{ color: SILVER_DIM, fontSize: "11px" }}>→</span>
                    {hasProposal ? (
                      <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ backgroundColor: "rgba(100,220,160,0.15)", color: "rgba(150,255,200,1)" }}>
                        {p.proposed_label}
                      </span>
                    ) : (
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: SILVER_FAINT, color: SILVER_DIM }}>
                        AI가 적합한 위치를 못 찾음 (미분류 유지)
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

        {/* 푸터 */}
        <div className="px-5 py-3 flex-shrink-0 flex items-center justify-between" style={{ borderTop: `1px solid ${SILVER_FAINT}` }}>
          <span className="text-xs" style={{ color: SILVER_DIM }}>
            {acceptedCount}개 이동 예정
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="text-xs px-4 py-2 rounded-lg"
              style={{ backgroundColor: SILVER_FAINT, color: SILVER }}
            >
              나중에 (미분류로 둠)
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

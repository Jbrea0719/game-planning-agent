"use client";

// 자동 추출된 결정사항 즉시 검토 카드
// 답변 직후 우상단에 떠서, 각 항목별로 유지·수정·삭제 선택

import { useState } from "react";

const SILVER = "#c0c8d8";
const SILVER_DIM = "rgba(192,200,216,0.5)";
const SILVER_FAINT = "rgba(192,200,216,0.15)";

export interface ExtractedItem {
  id: string;
  content: string;
  confidence: string;
  sub_category_label: string | null;
}

export default function ExtractedReviewCard({
  items,
  onClose,
  onChanged,
}: {
  items: ExtractedItem[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [list, setList] = useState<ExtractedItem[]>(items);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [busy, setBusy] = useState(false);

  async function deleteItem(id: string) {
    setBusy(true);
    try {
      await fetch(`/api/decisions/${id}`, { method: "DELETE" });
      setList(prev => prev.filter(d => d.id !== id));
      onChanged();
    } catch (err) {
      console.error("[review] 삭제 실패:", err);
    } finally { setBusy(false); }
  }

  async function saveEdit(id: string) {
    if (!editText.trim()) return;
    setBusy(true);
    try {
      await fetch(`/api/decisions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editText.trim() }),
      });
      setList(prev => prev.map(d => d.id === id ? { ...d, content: editText.trim() } : d));
      setEditingId(null);
      onChanged();
    } catch (err) {
      console.error("[review] 수정 실패:", err);
    } finally { setBusy(false); }
  }

  // 모두 삭제했으면 자동 닫기
  if (list.length === 0) {
    setTimeout(onClose, 0);
    return null;
  }

  return (
    <div
      className="fixed top-20 right-4 z-50 rounded-2xl shadow-2xl flex flex-col"
      style={{
        backgroundColor: "rgba(15,25,40,0.97)",
        border: "1px solid rgba(100,220,160,0.5)",
        backdropFilter: "blur(10px)",
        width: "min(380px, calc(100vw - 32px))",
        maxHeight: "min(70vh, 600px)",
      }}
    >
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderBottom: `1px solid ${SILVER_FAINT}` }}>
        <div>
          <p className="text-xs font-bold flex items-center gap-1.5" style={{ color: "rgba(150,255,200,1)" }}>
            <span>🤖</span> 자동 추출 검토 ({list.length})
          </p>
          <p className="text-[10px] mt-0.5" style={{ color: SILVER_DIM }}>
            바이블에 추가됐어요. 잘못 추출된 건 삭제·수정해주세요.
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-xs px-2 py-1 rounded"
          style={{ backgroundColor: SILVER_FAINT, color: SILVER_DIM }}
        >✕</button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2" style={{ scrollbarWidth: "thin" }}>
        {list.map(item => {
          const isEditing = editingId === item.id;
          const confStyle =
            item.confidence === "decided" ? { bg: "rgba(100,220,160,0.15)", color: "rgba(150,255,200,1)", label: "✓ 결정" }
            : item.confidence === "review" ? { bg: "rgba(255,200,100,0.15)", color: "rgba(255,220,150,1)", label: "🔍 검토" }
            : { bg: "rgba(150,180,255,0.15)", color: "rgba(180,210,255,1)", label: "⚪ 미정" };
          return (
            <div
              key={item.id}
              className="px-3 py-2 rounded-lg flex flex-col gap-1.5"
              style={{ backgroundColor: "rgba(255,255,255,0.03)", border: `1px solid ${SILVER_FAINT}` }}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0" style={{ backgroundColor: confStyle.bg, color: confStyle.color }}>
                  {confStyle.label}
                </span>
                {item.sub_category_label && (
                  <span className="text-[10px] truncate" style={{ color: SILVER_DIM }}>📍 {item.sub_category_label}</span>
                )}
              </div>
              {isEditing ? (
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  rows={2}
                  className="text-xs px-2 py-1.5 rounded outline-none resize-none"
                  style={{ backgroundColor: "rgba(0,0,0,0.4)", border: "1px solid rgba(100,180,255,0.5)", color: "#e0e8f0" }}
                  autoFocus
                />
              ) : (
                <p className="text-xs" style={{ color: "#e0e8f0", lineHeight: 1.45 }}>{item.content}</p>
              )}
              <div className="flex items-center gap-1.5 justify-end">
                {isEditing ? (
                  <>
                    <button onClick={() => setEditingId(null)} className="text-[10px] px-2 py-1 rounded" style={{ backgroundColor: SILVER_FAINT, color: SILVER_DIM }}>취소</button>
                    <button onClick={() => saveEdit(item.id)} disabled={busy} className="text-[10px] px-2 py-1 rounded font-bold" style={{ backgroundColor: "rgba(100,180,255,0.25)", color: "rgba(180,210,255,1)" }}>저장</button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => { setEditingId(item.id); setEditText(item.content); }}
                      className="text-[10px] px-2 py-1 rounded hover:bg-white/5"
                      style={{ color: SILVER_DIM }}
                    >✏️ 수정</button>
                    <button
                      onClick={() => deleteItem(item.id)}
                      disabled={busy}
                      className="text-[10px] px-2 py-1 rounded hover:bg-white/5"
                      style={{ color: "rgba(255,180,180,0.8)" }}
                    >🗑️ 삭제</button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="px-4 py-2.5 flex-shrink-0 flex items-center justify-between" style={{ borderTop: `1px solid ${SILVER_FAINT}` }}>
        <p className="text-[10px]" style={{ color: SILVER_DIM }}>💡 ✕로 닫으면 모두 그대로 유지</p>
        <button
          onClick={onClose}
          className="text-xs px-3 py-1 rounded-lg font-medium"
          style={{ backgroundColor: "rgba(100,220,160,0.2)", border: "1px solid rgba(100,220,160,0.5)", color: "rgba(150,255,200,1)" }}
        >완료</button>
      </div>
    </div>
  );
}

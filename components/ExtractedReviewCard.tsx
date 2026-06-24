"use client";

// 결정 대기 카드 — 답변 직후 우상단에 떠서, 추출된 결정을 검토.
// 항목별 수정·카테고리 지정·신뢰도 조정 후 [등록]해야 바이블에 반영됨(쉽게 막 등록되지 않도록).
// 닫으면 '결정 대기함'(바이블 트래커)에 보관 → 나중에 다시 처리 가능.

import { useEffect, useState } from "react";
import PendingReviewList, { type PendingItem, type MainCat } from "@/components/PendingReviewList";

const SILVER_DIM = "rgba(192,200,216,0.5)";
const SILVER_FAINT = "rgba(192,200,216,0.15)";

// 호환: 기존 import 유지 (스트림에서 넘어오는 추출 항목 = 대기 항목)
export type ExtractedItem = PendingItem;

export default function ExtractedReviewCard({
  items,
  nickname,
  onClose,
  onChanged,
}: {
  items: ExtractedItem[];
  nickname?: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [categories, setCategories] = useState<MainCat[]>([]);

  useEffect(() => {
    fetch("/api/categories")
      .then(r => r.json())
      .then(d => setCategories(d.main_categories ?? []))
      .catch(() => {});
  }, []);

  return (
    <div
      className="fixed top-20 right-4 z-50 rounded-2xl shadow-2xl flex flex-col"
      style={{
        backgroundColor: "rgba(15,25,40,0.97)",
        border: "1px solid rgba(255,200,100,0.5)",
        backdropFilter: "blur(10px)",
        width: "min(400px, calc(100vw - 32px))",
        maxHeight: "min(74vh, 640px)",
      }}
    >
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderBottom: `1px solid ${SILVER_FAINT}` }}>
        <div>
          <p className="text-xs font-bold flex items-center gap-1.5" style={{ color: "rgba(255,220,150,1)" }}>
            <span>🕒</span> 결정 대기 ({items.length})
          </p>
          <p className="text-[10px] mt-0.5 leading-snug" style={{ color: SILVER_DIM }}>
            등록 전까진 바이블에 반영되지 않아요. 다듬은 뒤 <b style={{ color: "rgba(150,255,200,0.9)" }}>등록</b>하세요.
          </p>
        </div>
        <button onClick={onClose} className="text-xs px-2 py-1 rounded" style={{ backgroundColor: SILVER_FAINT, color: SILVER_DIM }}>✕</button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3" style={{ scrollbarWidth: "thin" }}>
        <PendingReviewList
          items={items}
          categories={categories}
          nickname={nickname}
          onChanged={onChanged}
          onEmpty={onClose}
        />
      </div>

      <div className="px-4 py-2.5 flex-shrink-0 flex items-center justify-between" style={{ borderTop: `1px solid ${SILVER_FAINT}` }}>
        <p className="text-[10px]" style={{ color: SILVER_DIM }}>💡 닫으면 ‘결정 대기함’에 보관</p>
        <button
          onClick={onClose}
          className="text-xs px-3 py-1 rounded-lg font-medium"
          style={{ backgroundColor: SILVER_FAINT, color: SILVER_DIM }}
        >닫기</button>
      </div>
    </div>
  );
}

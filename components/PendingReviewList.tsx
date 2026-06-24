"use client";

// 결정 대기 검토 리스트 (공용) — 답변 직후 카드 + 바이블 트래커 '결정 대기함' 양쪽에서 사용.
// 항목별: 내용 수정 · 카테고리 지정 · 신뢰도 · 조던 입장 배지 + [등록]/[삭제], 하단 [모두 등록].
// 등록 전까지는 바이블(decisions)에 반영되지 않음 — 등록 시 서버가 decisions로 옮긴다.

import { useEffect, useRef, useState } from "react";

const SILVER = "#c0c8d8";
const SILVER_DIM = "rgba(192,200,216,0.5)";
const SILVER_FAINT = "rgba(192,200,216,0.15)";

export interface PendingItem {
  id: string;
  content: string;
  confidence: string;
  jordan_agreement?: string;
  sub_category_id: string | null;
  sub_category_label: string | null;
}

interface SubCat { id: string; name_ko: string }
interface Area { code: string; name: string; sub_categories: SubCat[] }
export interface MainCat {
  id: string; name_ko: string; icon: string | null;
  sub_categories?: SubCat[]; areas?: Area[];
}

const CONFIDENCES: { key: string; label: string }[] = [
  { key: "decided", label: "✓ 결정" },
  { key: "review", label: "🔍 검토" },
  { key: "tentative", label: "⚪ 미정" },
];

export default function PendingReviewList({
  items,
  categories,
  nickname,
  onChanged,
  onEmpty,
}: {
  items: PendingItem[];
  categories: MainCat[];
  nickname?: string;
  onChanged?: () => void;       // 등록·삭제 후 (부모가 바이블 카운트 등 갱신)
  onEmpty?: () => void;         // 목록이 비면 (카드 자동 닫기용)
}) {
  // 내부 작업본 — 사용자가 내용/카테고리/신뢰도를 바로 편집
  const [list, setList] = useState<PendingItem[]>(items);
  const [busy, setBusy] = useState(false);
  const emptiedRef = useRef(false);

  useEffect(() => { setList(items); emptiedRef.current = false; }, [items]);

  useEffect(() => {
    if (list.length === 0 && !emptiedRef.current) {
      emptiedRef.current = true;
      onEmpty?.();
    }
  }, [list.length, onEmpty]);

  function patchLocal(id: string, fields: Partial<PendingItem>) {
    setList(prev => prev.map(d => (d.id === id ? { ...d, ...fields } : d)));
  }

  // 편집 영구화 (대기함에서 등록 안 하고 닫아도 유지) — 변경 즉시 서버 반영
  async function persist(id: string, fields: { content?: string; sub_category_id?: string | null; confidence?: string }) {
    try {
      await fetch(`/api/decisions/pending/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
    } catch (err) { console.error("[pending] 편집 저장 실패:", err); }
  }

  async function discard(id: string) {
    setBusy(true);
    try {
      await fetch(`/api/decisions/pending/${id}`, { method: "DELETE" });
      setList(prev => prev.filter(d => d.id !== id));
      onChanged?.();
    } catch (err) { console.error("[pending] 삭제 실패:", err); }
    finally { setBusy(false); }
  }

  async function register(targets: PendingItem[]) {
    if (targets.length === 0) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/decisions/pending`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nickname,
          items: targets.map(t => ({
            id: t.id, content: t.content, sub_category_id: t.sub_category_id, confidence: t.confidence,
          })),
        }),
      });
      if (res.ok) {
        const ids = new Set(targets.map(t => t.id));
        setList(prev => prev.filter(d => !ids.has(d.id)));
        onChanged?.();
      }
    } catch (err) { console.error("[pending] 등록 실패:", err); }
    finally { setBusy(false); }
  }

  if (list.length === 0) return null;

  return (
    <div className="space-y-2">
      {list.map(item => {
        const stance = item.jordan_agreement;
        const stanceBadge =
          stance === "opposed" ? { bg: "rgba(255,120,120,0.16)", color: "rgba(255,170,170,1)", label: "⚠️ 조던 반대" }
          : stance === "concerned" ? { bg: "rgba(255,200,100,0.16)", color: "rgba(255,220,150,1)", label: "△ 조던 우려" }
          : null;
        return (
          <div
            key={item.id}
            className="px-3 py-2.5 rounded-lg flex flex-col gap-2"
            style={{ backgroundColor: "rgba(255,255,255,0.03)", border: `1px solid ${SILVER_FAINT}` }}
          >
            {/* 상단: 신뢰도 + 조던 배지 */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {CONFIDENCES.map(c => (
                <button
                  key={c.key}
                  onClick={() => { patchLocal(item.id, { confidence: c.key }); persist(item.id, { confidence: c.key }); }}
                  className="text-[10px] px-1.5 py-0.5 rounded transition-colors"
                  style={
                    item.confidence === c.key
                      ? { backgroundColor: "rgba(100,180,255,0.25)", color: "var(--accent-2)", fontWeight: 700 }
                      : { backgroundColor: SILVER_FAINT, color: SILVER_DIM }
                  }
                >{c.label}</button>
              ))}
              {stanceBadge && (
                <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: stanceBadge.bg, color: stanceBadge.color }}>
                  {stanceBadge.label}
                </span>
              )}
            </div>

            {/* 내용 — 항상 편집 가능 */}
            <textarea
              value={item.content}
              onChange={(e) => patchLocal(item.id, { content: e.target.value })}
              onBlur={(e) => persist(item.id, { content: e.target.value.trim() })}
              rows={2}
              className="text-xs px-2 py-1.5 rounded outline-none resize-none w-full"
              style={{ backgroundColor: "rgba(0,0,0,0.35)", border: `1px solid ${SILVER_FAINT}`, color: "#e0e8f0", lineHeight: 1.45 }}
            />

            {/* 카테고리 지정 */}
            <select
              value={item.sub_category_id ?? ""}
              onChange={(e) => {
                const v = e.target.value || null;
                patchLocal(item.id, { sub_category_id: v });
                persist(item.id, { sub_category_id: v });
              }}
              className="text-[11px] px-2 py-1 rounded outline-none w-full"
              style={{ backgroundColor: "rgba(0,0,0,0.35)", border: `1px solid ${SILVER_FAINT}`, color: SILVER }}
            >
              <option value="">📂 카테고리 미지정</option>
              {categories.flatMap(m => {
                if (m.areas && m.areas.length > 0) {
                  return m.areas.map(a => (
                    <optgroup key={`${m.id}.${a.code}`} label={`${m.icon ?? ""} ${m.name_ko} › ${a.name}`}>
                      {a.sub_categories.map(s => <option key={s.id} value={s.id}>{s.name_ko}</option>)}
                    </optgroup>
                  ));
                }
                return (
                  <optgroup key={m.id} label={`${m.icon ?? ""} ${m.name_ko}`}>
                    {(m.sub_categories ?? []).map(s => <option key={s.id} value={s.id}>{s.name_ko}</option>)}
                  </optgroup>
                );
              })}
            </select>

            {/* 액션 */}
            <div className="flex items-center gap-1.5 justify-end">
              <button
                onClick={() => discard(item.id)}
                disabled={busy}
                className="text-[10px] px-2 py-1 rounded hover:bg-white/5"
                style={{ color: "rgba(255,180,180,0.85)" }}
              >🗑️ 삭제</button>
              <button
                onClick={() => register([item])}
                disabled={busy || !item.content.trim()}
                className="text-[11px] px-2.5 py-1 rounded font-bold"
                style={{ backgroundColor: "rgba(100,220,160,0.22)", border: "1px solid rgba(100,220,160,0.5)", color: "rgba(150,255,200,1)" }}
              >✅ 등록</button>
            </div>
          </div>
        );
      })}

      {/* 모두 등록 */}
      <button
        onClick={() => register(list.filter(d => d.content.trim()))}
        disabled={busy}
        className="w-full text-xs py-2 rounded-lg font-bold mt-1"
        style={{ backgroundColor: "rgba(100,220,160,0.18)", border: "1px solid rgba(100,220,160,0.45)", color: "rgba(150,255,200,1)" }}
      >✅ 모두 등록 ({list.length})</button>
    </div>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";
import AbsoluteRulesSection from "@/components/AbsoluteRulesSection";
import PendingReviewList, { type PendingItem } from "@/components/PendingReviewList";
import DecisionDetailPopup from "@/components/DecisionDetailPopup";

const SILVER = "#c0c8d8";
const SILVER_DIM = "rgba(192,200,216,0.5)";
const SILVER_FAINT = "rgba(192,200,216,0.15)";

// ── 타입 정의 ─────────────────────────────────────────────────────────
interface SubCategoryItem {
  id: string;
  name_ko: string;
}
interface AreaItem {
  code: string;
  name: string;
  sub_categories: SubCategoryItem[];
}
interface MainCategoryItem {
  id: string;
  name_ko: string;
  icon: string | null;
  description: string | null;
  sub_categories?: SubCategoryItem[]; // 평평한 경우 (아웃게임·그래픽 등)
  areas?: AreaItem[];                  // area로 그룹핑 (인게임)
}

interface Decision {
  id: string;
  project_id: string;
  sub_category_id: string | null;
  content: string;
  context: string | null;
  confidence: "decided" | "review" | "tentative" | string;
  source_session_id: string | null;
  is_auto_extracted: boolean;
  created_by_nickname: string | null;
  created_at: string;
}

// ── 컴포넌트 ────────────────────────────────────────────────────────────
export default function DecisionPanel({
  open,
  onClose,
  projectId,
  nickname,
  onCountChange,
  reloadKey,
  categoryReloadKey,
  onGenerateDoc,
  contextAnchorTimestamp,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  nickname: string;
  onCountChange?: (total: number) => void;
  reloadKey?: number;
  categoryReloadKey?: number;   // 외부에서 카테고리 변경 시 증가 → 카테고리 다시 fetch (기획서와 실시간 동기화)
  onGenerateDoc?: () => void;   // 기획서 제작 버튼 클릭 시 호출 (부모가 실제 생성 처리)
  contextAnchorTimestamp?: string | null;  // 맥락선 시점 — '현재 맥락' 탭에서 이 이후 결정만 표시
}) {
  // 1차 탭(상태): 전체 / 결정 대기 / 미정·검토 / 이번 대화(맥락선 이후)
  const [tab, setTab] = useState<"all" | "done" | "pending" | "tentative" | "context">("all");
  // 2차 탭(분류 필터): "all" 또는 대카테고리 id — 상태 탭을 바꿔도 유지(sticky)
  const [catFilter, setCatFilter] = useState<string>("all");
  const [categories, setCategories] = useState<MainCategoryItem[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // 폼 상태
  const [formContent, setFormContent] = useState("");
  const [formMainId, setFormMainId] = useState<string>("");
  const [formAreaCode, setFormAreaCode] = useState<string>("");
  const [formSubId, setFormSubId] = useState<string>("");

  // 접기/펼치기 상태 (대카테고리·영역별)
  const [collapsedMains, setCollapsedMains] = useState<Set<string>>(new Set());
  const [collapsedAreas, setCollapsedAreas] = useState<Set<string>>(new Set());

  // ── 카테고리 로드 ────────────────────────────────────────────────────
  const loadCategories = useCallback(() => {
    fetch("/api/categories")
      .then(r => r.json())
      .then(d => setCategories(d.main_categories ?? []))
      .catch(err => console.error("[panel] 카테고리 로드 실패:", err));
  }, []);

  // 마운트 시 1회
  useEffect(() => { loadCategories(); }, [loadCategories]);
  // 외부에서 카테고리 변경 → 다시 fetch (기획서 쪽 카테고리 관리와 실시간 동기화)
  useEffect(() => {
    if (categoryReloadKey !== undefined && categoryReloadKey > 0) loadCategories();
  }, [categoryReloadKey, loadCategories]);

  // ── 결정사항 로드 ──────────────────────────────────────────────────
  const loadDecisions = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/decisions?project_id=${projectId}`);
      const data = await res.json();
      const list = (data.decisions ?? []) as Decision[];
      setDecisions(list);
      onCountChange?.(list.length);
    } catch (err) {
      console.error("[panel] 결정사항 로드 실패:", err);
    } finally {
      setLoading(false);
    }
  }, [projectId, onCountChange]);

  // 패널 열릴 때마다 로드 + 마운트 시 1회 (배지 카운트용)
  useEffect(() => { void loadDecisions(); }, [loadDecisions]);
  useEffect(() => { if (open) void loadDecisions(); }, [open, loadDecisions]);
  // 외부에서 reloadKey 증가 → 결정사항 다시 fetch (자동 추출 후 갱신)
  useEffect(() => {
    if (reloadKey !== undefined && reloadKey > 0) void loadDecisions();
  }, [reloadKey, loadDecisions]);

  // ── 결정 대기 로드 ────────────────────────────────────────────────
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const loadPending = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await fetch(`/api/decisions/pending?project_id=${projectId}`);
      const data = await res.json();
      setPendingItems((data.pending ?? []) as PendingItem[]);
    } catch (err) {
      console.error("[panel] 결정 대기 로드 실패:", err);
    }
  }, [projectId]);
  useEffect(() => { void loadPending(); }, [loadPending]);
  useEffect(() => { if (open) void loadPending(); }, [open, loadPending]);
  useEffect(() => {
    if (reloadKey !== undefined && reloadKey > 0) void loadPending();
  }, [reloadKey, loadPending]);

  // ESC 키로 닫기
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      // 상세·이동 등 팝업이 열려 있으면 패널은 닫지 않음 (팝업만 먼저 닫히게)
      if (e.key === "Escape" && !document.querySelector("[data-modal]")) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // ── 결정사항 추가 ──────────────────────────────────────────────────
  async function submitNew() {
    if (!formContent.trim()) return;
    try {
      await fetch("/api/decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          sub_category_id: formSubId || null,
          content: formContent.trim(),
          nickname,
        }),
      });
      setFormContent("");
      setShowAddForm(false);
      await loadDecisions();
    } catch (err) {
      console.error("[panel] 추가 실패:", err);
    }
  }

  // ── 결정사항 편집 (인라인) ────────────────────────────────────────
  // 미정·보류 항목을 편집·저장하면 '결정(decided)'으로 확정되며 카테고리에 등록됨.
  // (카테고리를 안 골랐고 기존에도 없으면 AI가 자동 분류해 등록)
  async function saveEdit(id: string, newContent: string, newSubId: string | null) {
    try {
      const cur = decisions.find(x => x.id === id);
      const wasPending = !!cur && cur.confidence !== "decided";
      await fetch(`/api/decisions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: newContent,
          sub_category_id: newSubId,
          nickname,
          ...(wasPending ? { confidence: "decided" } : {}), // 미정 → 확정
        }),
      });
      if (wasPending && !newSubId) await autoCategorize(id); // 확정인데 카테고리 미선택 → 자동 등록
      setEditingId(null);
      await loadDecisions();
    } catch (err) {
      console.error("[panel] 편집 실패:", err);
    }
  }

  // ── 상태 전환: 결정 ↔ 미정 ────────────────────────────────────────
  async function setConfidence(id: string, confidence: "decided" | "tentative") {
    try {
      await fetch(`/api/decisions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confidence, nickname }),
      });
    } catch (err) {
      console.error("[panel] 상태 변경 실패:", err);
    }
  }
  // 미정으로 보류
  async function markPending(id: string) {
    await setConfidence(id, "tentative");
    await loadDecisions();
  }
  // 미정 → 결정으로 확정 (카테고리 없으면 AI 자동 등록)
  async function finalize(id: string) {
    const cur = decisions.find(x => x.id === id);
    await setConfidence(id, "decided");
    if (cur && !cur.sub_category_id) await autoCategorize(id);
    await loadDecisions();
  }
  // AI 자동 분류 — 해당 결정 1건을 현재 카테고리 트리에 맞춰 등록
  async function autoCategorize(id: string) {
    try {
      const prev = await fetch("/api/decisions/reclassify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview", project_id: projectId, decision_ids: [id] }),
      }).then(r => r.json());
      const sid = prev?.proposals?.[0]?.proposed_sub_category_id;
      if (sid) {
        await fetch("/api/decisions/reclassify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "apply", assignments: [{ id, sub_category_id: sid }], nickname }),
        });
      }
    } catch (err) {
      console.error("[panel] 자동 분류 실패:", err);
    }
  }

  // ── 결정사항 삭제 ──────────────────────────────────────────────────
  async function deleteDecision(id: string) {
    if (!confirm("이 결정사항을 삭제할까요?")) return;
    try {
      await fetch(`/api/decisions/${id}`, { method: "DELETE" });
      await loadDecisions();
    } catch (err) {
      console.error("[panel] 삭제 실패:", err);
    }
  }

  // ── 탭에 따른 트리 표시 대상 결정 ────────────────────────────────
  //  전체=결정·미정 모두 / 완료=확정(decided)만 / 이번 대화=맥락선 이후
  const treeDecisions =
    tab === "context"
      ? (contextAnchorTimestamp ? decisions.filter(d => d.created_at >= contextAnchorTimestamp) : [])
    : tab === "done"
      ? decisions.filter(d => d.confidence === "decided")
    : decisions;

  // 탭 배지 카운트 (현재 탭과 무관하게 항상 정확하게 산출)
  const doneCount = decisions.filter(d => d.confidence === "decided").length;
  const contextCount = contextAnchorTimestamp ? decisions.filter(d => d.created_at >= contextAnchorTimestamp).length : 0;

  // ── 카테고리별 결정사항 그룹핑 (전체/완료/이번 대화 탭의 트리) ──
  const subIdToDecisions = new Map<string, Decision[]>();
  for (const d of treeDecisions) {
    const key = d.sub_category_id ?? "_uncategorized";
    if (!subIdToDecisions.has(key)) subIdToDecisions.set(key, []);
    subIdToDecisions.get(key)!.push(d);
  }

  // 미정·검토(확정 안 된) 결정 — '미정·검토' 탭 (전체 기준, 탭 무관)
  const pendingDecisions = decisions.filter(d => d.confidence !== "decided");

  // sub_category_id → 대카테고리 id (2차 분류 칩 필터·카운트용)
  const subToMain = new Map<string, string>();
  for (const m of categories) {
    if (m.areas) for (const a of m.areas) for (const s of a.sub_categories) subToMain.set(s.id, m.id);
    if (m.sub_categories) for (const s of m.sub_categories) subToMain.set(s.id, m.id);
  }
  const catPass = (subId: string | null) => catFilter === "all" || (subId ? subToMain.get(subId) === catFilter : false);
  const visibleCategories = catFilter === "all" ? categories : categories.filter(m => m.id === catFilter);

  // 현재 1차 탭 데이터로 2차 칩 카운트 (분류 필터 적용 전 — 어디에 몇 개인지 보고 고르도록)
  const chipSubIds: (string | null)[] =
    tab === "pending" ? pendingItems.map(p => p.sub_category_id)
    : tab === "tentative" ? pendingDecisions.map(d => d.sub_category_id)
    : treeDecisions.map(d => d.sub_category_id);  // all / done / context
  const chipMainCount = new Map<string, number>();
  for (const sid of chipSubIds) { const mid = sid ? subToMain.get(sid) : null; if (mid) chipMainCount.set(mid, (chipMainCount.get(mid) ?? 0) + 1); }
  const chipTotal = chipSubIds.length;

  // 분류 필터 적용된 목록 (미정·검토 / 결정 대기 탭)
  const tentativeFiltered = pendingDecisions.filter(d => catPass(d.sub_category_id));
  const pendingFiltered = pendingItems.filter(p => catPass(p.sub_category_id));

  // sub_category_id → 사람이 읽는 이름 (미정 섹션의 카드에 소속 카테고리 표시용)
  function subLabelOf(subId: string | null): string {
    if (!subId) return "(카테고리 미지정)";
    for (const m of categories) {
      if (m.areas) for (const a of m.areas) for (const s of a.sub_categories) if (s.id === subId) return s.name_ko;
      if (m.sub_categories) for (const s of m.sub_categories) if (s.id === subId) return s.name_ko;
    }
    return "(카테고리 미지정)";
  }

  // 대카테고리 ID → 총 카운트
  const mainCounts = new Map<string, number>();
  for (const m of categories) {
    let c = 0;
    if (m.areas) {
      for (const a of m.areas) for (const s of a.sub_categories) c += subIdToDecisions.get(s.id)?.length ?? 0;
    } else if (m.sub_categories) {
      for (const s of m.sub_categories) c += subIdToDecisions.get(s.id)?.length ?? 0;
    }
    mainCounts.set(m.id, c);
  }

  // 영역(area_code) → 카운트
  const areaCounts = new Map<string, number>();
  for (const m of categories) {
    if (!m.areas) continue;
    for (const a of m.areas) {
      let c = 0;
      for (const s of a.sub_categories) c += subIdToDecisions.get(s.id)?.length ?? 0;
      areaCounts.set(`${m.id}.${a.code}`, c);
    }
  }

  // ── 폼 카테고리 선택 헬퍼 ───────────────────────────────────────────
  const currentMain = categories.find(m => m.id === formMainId) ?? null;
  const subOptions: SubCategoryItem[] = currentMain
    ? (currentMain.areas
        ? (currentMain.areas.find(a => a.code === formAreaCode)?.sub_categories ?? [])
        : (currentMain.sub_categories ?? []))
    : [];

  // ── 신뢰도 색상 ────────────────────────────────────────────────────
  function confidenceStyle(c: string) {
    if (c === "decided")  return { bg: "rgba(100,220,160,0.15)", color: "rgba(150,255,200,1)", label: "✓ 결정" };
    if (c === "review")   return { bg: "rgba(255,200,100,0.15)", color: "rgba(255,220,150,1)", label: "🔍 검토" };
    if (c === "tentative")return { bg: "rgba(150,180,255,0.15)", color: "var(--accent-2)", label: "⚪ 미정" };
    return { bg: "rgba(192,200,216,0.10)", color: SILVER_DIM, label: c };
  }

  if (!open) return null;

  return (
    <>
      {/* Backdrop — 패널 외부 클릭 시 닫힘 */}
      <div
        className="fixed inset-0 z-30"
        style={{ backgroundColor: "rgba(0,0,0,0.3)" }}
        onClick={onClose}
      />

      <div
        className="fixed top-0 right-0 h-full z-40 flex flex-col shadow-2xl"
        style={{
          width: "min(440px, 95vw)",
          backgroundColor: "#0a0f1c",
          borderLeft: `1px solid ${SILVER_FAINT}`,
        }}
      >
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderBottom: `1px solid ${SILVER_FAINT}` }}>
        <div>
          <p className="text-sm font-bold" style={{ color: SILVER }}>📚 기획 바이블</p>
          <p className="text-xs mt-0.5" style={{ color: SILVER_DIM }}>
            총 {decisions.length}개 누적{loading ? " (로딩 중...)" : ""} · 모든 기획에 참고되는 기준 자산
          </p>
        </div>
        <button onClick={onClose} className="text-xs px-3 py-1.5 rounded-lg" style={{ backgroundColor: SILVER_FAINT, color: SILVER_DIM }}>
          닫기
        </button>
      </div>

      {/* 1차 탭 — 상태 */}
      <div className="flex flex-wrap gap-1 px-4 pt-2 flex-shrink-0">
        {([
          { key: "all", label: "📚 전체", count: decisions.length, c: "120,200,200" },
          { key: "done", label: "✅ 완료", count: doneCount, c: "100,220,160" },
          { key: "pending", label: "🕒 대기", count: pendingItems.length, c: "255,200,100" },
          { key: "tentative", label: "🔍 미정·검토", count: pendingDecisions.length, c: "150,180,255" },
          { key: "context", label: "📌 이번 대화", count: contextCount, c: "192,200,216" },
        ] as const).map(t => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="text-[11px] px-2.5 py-1.5 rounded-t-lg font-medium"
              style={{
                backgroundColor: active ? `rgba(${t.c},0.18)` : "transparent",
                border: `1px solid ${active ? `rgba(${t.c},0.5)` : SILVER_FAINT}`,
                borderBottom: active ? "none" : `1px solid ${SILVER_FAINT}`,
                color: active ? `rgba(${t.c},1)` : SILVER_DIM,
              }}
            >
              {t.label}{t.count !== null ? ` (${t.count})` : ""}
            </button>
          );
        })}
      </div>

      {/* 2차 탭 — 분류 칩 (줄바꿈 · 모든 상태 탭에 적용 · sticky) */}
      <div className="flex flex-wrap gap-1.5 px-4 py-2 flex-shrink-0" style={{ borderBottom: `1px solid ${SILVER_FAINT}`, backgroundColor: "rgba(255,255,255,0.02)" }}>
        {[{ id: "all", icon: "", name_ko: "전체", n: chipTotal }, ...categories.map(m => ({ id: m.id, icon: m.icon ?? "", name_ko: m.name_ko, n: chipMainCount.get(m.id) ?? 0 }))].map(chip => {
          const active = catFilter === chip.id;
          return (
            <button
              key={chip.id}
              onClick={() => setCatFilter(active ? "all" : chip.id)}
              className="text-[11px] px-2.5 py-1 rounded-full font-medium"
              style={active
                ? { backgroundColor: "rgba(100,180,255,0.25)", color: "var(--accent-2)", border: "1px solid rgba(100,180,255,0.5)" }
                : { backgroundColor: "transparent", color: SILVER_DIM, border: `1px solid ${SILVER_FAINT}` }}
            >
              {chip.icon} {chip.name_ko} <span style={{ opacity: 0.7 }}>{chip.n}</span>
            </button>
          );
        })}
      </div>

      {/* 액션 바 */}
      <div className="flex gap-2 px-4 py-2 flex-shrink-0" style={{ borderBottom: `1px solid ${SILVER_FAINT}` }}>
        <button
          onClick={() => setShowAddForm(v => !v)}
          className="text-xs px-3 py-1.5 rounded-lg font-medium"
          style={{ backgroundColor: showAddForm ? SILVER_FAINT : "rgba(100,220,160,0.18)", border: `1px solid ${showAddForm ? SILVER_DIM : "rgba(100,220,160,0.5)"}`, color: showAddForm ? SILVER_DIM : "rgba(150,255,200,1)" }}
        >
          {showAddForm ? "취소" : "+ 새 항목 추가"}
        </button>
        {/* 기획서 제작 버튼은 헤더로 이동 — 트래커 안에서는 제거 (옵션 B) */}
      </div>

      {/* 추가 폼 */}
      {showAddForm && (
        <div className="px-4 py-3 flex flex-col gap-2 flex-shrink-0" style={{ borderBottom: `1px solid ${SILVER_FAINT}`, backgroundColor: "rgba(100,220,160,0.04)" }}>
          <textarea
            value={formContent}
            onChange={e => setFormContent(e.target.value)}
            placeholder="결정 내용 한 문장 (예: '영웅 등급은 5단계로 가자')"
            rows={2}
            className="w-full px-3 py-2 rounded text-xs outline-none resize-none"
            style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${SILVER_FAINT}`, color: "#e0e8f0" }}
            autoFocus
          />
          <div className="flex gap-2">
            <select value={formMainId} onChange={e => { setFormMainId(e.target.value); setFormAreaCode(""); setFormSubId(""); }} className="flex-1 px-2 py-1.5 rounded text-xs outline-none" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${SILVER_FAINT}`, color: "#e0e8f0" }}>
              <option value="">대카테고리...</option>
              {categories.map(m => <option key={m.id} value={m.id}>{m.icon} {m.name_ko}</option>)}
            </select>
            {currentMain?.areas && (
              <select value={formAreaCode} onChange={e => { setFormAreaCode(e.target.value); setFormSubId(""); }} className="flex-1 px-2 py-1.5 rounded text-xs outline-none" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${SILVER_FAINT}`, color: "#e0e8f0" }}>
                <option value="">영역...</option>
                {currentMain.areas.map(a => <option key={a.code} value={a.code}>{a.name}</option>)}
              </select>
            )}
          </div>
          {subOptions.length > 0 && (
            <select value={formSubId} onChange={e => setFormSubId(e.target.value)} className="px-2 py-1.5 rounded text-xs outline-none" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${SILVER_FAINT}`, color: "#e0e8f0" }}>
              <option value="">세부 항목 (선택)</option>
              {subOptions.map(s => <option key={s.id} value={s.id}>{s.name_ko}</option>)}
            </select>
          )}
          <button onClick={submitNew} disabled={!formContent.trim()} className="text-xs px-3 py-1.5 rounded-lg font-medium" style={{ backgroundColor: formContent.trim() ? "rgba(100,220,160,0.25)" : SILVER_FAINT, border: `1px solid rgba(100,220,160,0.6)`, color: formContent.trim() ? "rgba(150,255,200,1)" : SILVER_DIM, opacity: formContent.trim() ? 1 : 0.5 }}>
            결정 추가
          </button>
        </div>
      )}

      {/* 결정사항 트리 */}
      <div className="flex-1 overflow-y-auto px-3 py-3" style={{ scrollbarWidth: "thin", scrollbarColor: `${SILVER_DIM} transparent` }}>
        {/* ⚖️ 절대 규칙 — 바이블 상위. 전체·이번 대화 탭에서만 노출 */}
        {(tab === "all" || tab === "done" || tab === "context") && <AbsoluteRulesSection nickname={nickname} />}

        {/* 🕒 결정 대기 탭 — 등록해야 바이블 반영 */}
        {tab === "pending" && (
          pendingFiltered.length > 0 ? (
            <>
              <p className="text-[11px] mb-2" style={{ color: SILVER_DIM }}>다듬은 뒤 <b style={{ color: "rgba(150,255,200,0.9)" }}>등록</b>해야 바이블에 반영돼요.</p>
              <PendingReviewList
                items={pendingFiltered}
                categories={categories}
                nickname={nickname}
                onChanged={() => { void loadPending(); void loadDecisions(); }}
              />
            </>
          ) : (
            <p className="text-xs text-center mt-6" style={{ color: SILVER_DIM }}>
              {catFilter === "all" ? "검토할 결정 대기 항목이 없어요." : "이 분류에 결정 대기 항목이 없어요."}
            </p>
          )
        )}

        {tab === "context" && !contextAnchorTimestamp && (
          <p className="text-xs text-center mt-6 leading-relaxed" style={{ color: SILVER_DIM }}>
            📌 맥락선이 설정되어 있지 않아요.<br />
            대화에서 메시지 옆 압정(📌)으로 맥락선을 설정하면,<br />
            그 이후 추가된 결정사항만 여기에 모여요.
          </p>
        )}
        {tab === "context" && contextAnchorTimestamp && treeDecisions.length === 0 && (
          <p className="text-xs text-center mt-6 leading-relaxed" style={{ color: SILVER_DIM }}>
            맥락선 이후 추가된 결정사항이 아직 없어요.
          </p>
        )}
        {tab === "all" && decisions.length === 0 && (
          <p className="text-xs text-center mt-6" style={{ color: SILVER_DIM }}>
            아직 누적된 기획 바이블이 없어요.<br />
            상단의 [+ 새 항목 추가] 버튼으로 추가하세요.
          </p>
        )}

        {/* 🔍 미정·검토 탭 — 아직 확정 전이지만 결국 정해야 하는 항목 */}
        {tab === "tentative" && (
          tentativeFiltered.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              {tentativeFiltered.map(d => (
                <DecisionCard key={d.id} d={d} subName={subLabelOf(d.sub_category_id)}
                  editing={editingId === d.id}
                  onEditStart={() => setEditingId(d.id)}
                  onEditCancel={() => setEditingId(null)}
                  onEditSave={(c, sid) => saveEdit(d.id, c, sid)}
                  onDelete={() => deleteDecision(d.id)}
                  onMarkPending={() => markPending(d.id)}
                  onFinalize={() => finalize(d.id)}
                  categories={categories}
                  confStyle={confidenceStyle(d.confidence)}
                />
              ))}
            </div>
          ) : (
            <p className="text-xs text-center mt-6" style={{ color: SILVER_DIM }}>
              {catFilter === "all" ? "미정·검토 중인 항목이 없어요." : "이 분류에 미정·검토 항목이 없어요."}
            </p>
          )
        )}

        {(tab === "all" || tab === "done" || tab === "context") && visibleCategories.map(m => {
          const mainCount = mainCounts.get(m.id) ?? 0;
          if (mainCount === 0) return null; // 결정사항 있는 대카테고리만 표시

          const collapsed = collapsedMains.has(m.id);
          return (
            <div key={m.id} className="mb-3">
              <button
                onClick={() => setCollapsedMains(prev => { const n = new Set(prev); if (n.has(m.id)) n.delete(m.id); else n.add(m.id); return n; })}
                className="w-full text-left text-xs font-bold px-2 py-1.5 rounded flex items-center justify-between"
                style={{ backgroundColor: SILVER_FAINT, color: SILVER }}
              >
                <span>{collapsed ? "▶" : "▼"} {m.icon} {m.name_ko}</span>
                <span style={{ color: SILVER_DIM }}>{mainCount}개</span>
              </button>

              {!collapsed && (
                <div className="mt-2 ml-2 flex flex-col gap-2">
                  {/* area 그룹핑 */}
                  {m.areas?.map(a => {
                    const aKey = `${m.id}.${a.code}`;
                    const aCount = areaCounts.get(aKey) ?? 0;
                    if (aCount === 0) return null;
                    const aCollapsed = collapsedAreas.has(aKey);
                    return (
                      <div key={a.code}>
                        <button
                          onClick={() => setCollapsedAreas(prev => { const n = new Set(prev); if (n.has(aKey)) n.delete(aKey); else n.add(aKey); return n; })}
                          className="w-full text-left text-xs px-2 py-1 rounded flex items-center justify-between"
                          style={{ color: SILVER_DIM }}
                        >
                          <span>{aCollapsed ? "▶" : "▼"} {a.name}</span>
                          <span>{aCount}</span>
                        </button>
                        {!aCollapsed && (
                          <div className="ml-3 mt-1 flex flex-col gap-1.5">
                            {a.sub_categories.map(s => (subIdToDecisions.get(s.id) ?? []).map(d => (
                              <DecisionCard key={d.id} d={d} subName={s.name_ko}
                                editing={editingId === d.id}
                                onEditStart={() => setEditingId(d.id)}
                                onEditCancel={() => setEditingId(null)}
                                onEditSave={(c, sid) => saveEdit(d.id, c, sid)}
                                onDelete={() => deleteDecision(d.id)}
                                onMarkPending={() => markPending(d.id)}
                                onFinalize={() => finalize(d.id)}
                                categories={categories}
                                confStyle={confidenceStyle(d.confidence)}
                              />
                            )))}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* 평평한 경우 (아웃게임·그래픽·사운드·디자인 원칙) */}
                  {m.sub_categories?.map(s => (subIdToDecisions.get(s.id) ?? []).map(d => (
                    <DecisionCard key={d.id} d={d} subName={s.name_ko}
                      editing={editingId === d.id}
                      onEditStart={() => setEditingId(d.id)}
                      onEditCancel={() => setEditingId(null)}
                      onEditSave={(c, sid) => saveEdit(d.id, c, sid)}
                      onDelete={() => deleteDecision(d.id)}
                      onMarkPending={() => markPending(d.id)}
                      onFinalize={() => finalize(d.id)}
                      categories={categories}
                      confStyle={confidenceStyle(d.confidence)}
                    />
                  )))}
                </div>
              )}
            </div>
          );
        })}

        {/* 카테고리 없는 (sub_category_id null) 결정사항 — 전체·이번 대화 탭, 분류 미선택 시만 */}
        {(tab === "all" || tab === "done" || tab === "context") && catFilter === "all" && (subIdToDecisions.get("_uncategorized")?.length ?? 0) > 0 && (
          <div className="mb-3">
            <p className="text-xs px-2 py-1.5 rounded font-bold" style={{ backgroundColor: SILVER_FAINT, color: SILVER }}>
              📌 카테고리 미지정 ({subIdToDecisions.get("_uncategorized")!.length}개)
            </p>
            <div className="ml-2 mt-2 flex flex-col gap-1.5">
              {subIdToDecisions.get("_uncategorized")!.map(d => (
                <DecisionCard key={d.id} d={d} subName="(카테고리 미지정)"
                  editing={editingId === d.id}
                  onEditStart={() => setEditingId(d.id)}
                  onEditCancel={() => setEditingId(null)}
                  onEditSave={(c, sid) => saveEdit(d.id, c, sid)}
                  onDelete={() => deleteDecision(d.id)}
                  onMarkPending={() => markPending(d.id)}
                  onFinalize={() => finalize(d.id)}
                  categories={categories}
                  confStyle={confidenceStyle(d.confidence)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
      </div>
    </>
  );
}

// ── 결정사항 카드 (개별 항목) ─────────────────────────────────────────
function DecisionCard({
  d, subName, editing, onEditStart, onEditCancel, onEditSave, onDelete, onMarkPending, onFinalize, categories, confStyle,
}: {
  d: Decision;
  subName: string;
  editing: boolean;
  onEditStart: () => void;
  onEditCancel: () => void;
  onEditSave: (content: string, subId: string | null) => void;
  onDelete: () => void;
  onMarkPending: () => void;  // 결정 → 미정으로 보류
  onFinalize: () => void;     // 미정 → 결정으로 확정 (카테고리 자동 등록)
  categories: MainCategoryItem[];
  confStyle: { bg: string; color: string; label: string };
}) {
  const isPending = d.confidence !== "decided"; // 미정·보류 상태
  const [editContent, setEditContent] = useState(d.content);
  const [editSubId, setEditSubId] = useState(d.sub_category_id ?? "");
  const [showDetail, setShowDetail] = useState(false);       // [상세] 팝업
  const [moving, setMoving] = useState(false);               // 카테고리 이동 팝업
  const [moveSubId, setMoveSubId] = useState(d.sub_category_id ?? "");

  // 편집 모드 진입 시 초기화
  useEffect(() => {
    if (editing) {
      setEditContent(d.content);
      setEditSubId(d.sub_category_id ?? "");
    }
  }, [editing, d.content, d.sub_category_id]);

  // 모든 sub_categories 평면 리스트 (편집 시 카테고리 변경용)
  const allSubs: { id: string; label: string }[] = [];
  for (const m of categories) {
    if (m.areas) {
      for (const a of m.areas) for (const s of a.sub_categories) {
        allSubs.push({ id: s.id, label: `${m.name_ko} > ${a.name} > ${s.name_ko}` });
      }
    } else if (m.sub_categories) {
      for (const s of m.sub_categories) {
        allSubs.push({ id: s.id, label: `${m.name_ko} > ${s.name_ko}` });
      }
    }
  }

  if (editing) {
    return (
      <div className="px-2 py-2 rounded text-xs" style={{ backgroundColor: "rgba(255,255,255,0.06)", border: `1px solid ${SILVER_DIM}` }}>
        <textarea
          value={editContent}
          onChange={e => setEditContent(e.target.value)}
          rows={2}
          className="w-full px-2 py-1 rounded text-xs outline-none resize-none mb-1.5"
          style={{ backgroundColor: "rgba(0,0,0,0.3)", border: `1px solid ${SILVER_FAINT}`, color: "#e0e8f0" }}
          autoFocus
        />
        <select value={editSubId} onChange={e => setEditSubId(e.target.value)} className="w-full px-2 py-1 rounded text-xs outline-none mb-1.5" style={{ backgroundColor: "rgba(0,0,0,0.3)", border: `1px solid ${SILVER_FAINT}`, color: "#e0e8f0" }}>
          <option value="">(카테고리 미지정)</option>
          {allSubs.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <div className="flex gap-1.5 justify-end">
          <button onClick={onEditCancel} className="text-xs px-2 py-1 rounded" style={{ backgroundColor: SILVER_FAINT, color: SILVER_DIM }}>취소</button>
          <button onClick={() => onEditSave(editContent.trim(), editSubId || null)} className="text-xs px-2 py-1 rounded" style={{ backgroundColor: "rgba(100,220,160,0.2)", color: "rgba(150,255,200,1)" }}>저장</button>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="px-2 py-1.5 rounded text-xs flex items-start gap-2 group" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: `1px solid ${SILVER_FAINT}` }}>
      <span className="flex-shrink-0 mt-0.5 text-[10px] px-1 py-0.5 rounded" style={{ backgroundColor: confStyle.bg, color: confStyle.color }}>
        {confStyle.label}
      </span>
      <div className="flex-1 min-w-0">
        <p style={{ color: "#e0e8f0", lineHeight: 1.4 }}>{d.content}</p>
        <p className="mt-0.5 text-[10px]" style={{ color: SILVER_DIM }}>
          📍 {subName}
          {d.is_auto_extracted && <span className="ml-1.5">🤖 자동</span>}
          {d.created_by_nickname && <span className="ml-1.5">— {d.created_by_nickname}</span>}
        </p>
      </div>
      {/* 액션 — 상태 배지(위) + 아이콘 2×2 그리드 (상세·이동 / 삭제·수정) */}
      <div className="flex-shrink-0 flex flex-col gap-1 items-end">
        {isPending ? (
          <button onClick={onFinalize} title="결정으로 확정 (카테고리에 자동 등록)" className="text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap" style={{ backgroundColor: "rgba(100,220,160,0.18)", border: "1px solid rgba(100,220,160,0.5)", color: "rgba(150,255,200,1)" }}>✓ 결정</button>
        ) : (
          <button onClick={onMarkPending} title="미정으로 보류" className="text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap" style={{ backgroundColor: "rgba(150,180,255,0.15)", border: "1px solid rgba(150,180,255,0.45)", color: "var(--accent-2)" }}>미정</button>
        )}
        <div className="grid grid-cols-2 gap-1">
          <button onClick={() => setShowDetail(true)} title="상세 — 어떤 대화에서 결정됐는지 보기" className="text-sm w-6 h-6 flex items-center justify-center rounded hover:bg-white/5" style={{ color: SILVER_DIM }}>🔍</button>
          <button onClick={() => { setMoveSubId(d.sub_category_id ?? ""); setMoving(true); }} title="카테고리 이동" className="text-sm w-6 h-6 flex items-center justify-center rounded hover:bg-white/5" style={{ color: SILVER_DIM }}>📂</button>
          <button onClick={onDelete} title="삭제" className="text-sm w-6 h-6 flex items-center justify-center rounded hover:bg-white/5" style={{ color: "rgba(255,180,180,0.7)" }}>🗑️</button>
          <button onClick={onEditStart} title="편집" className="text-sm w-6 h-6 flex items-center justify-center rounded hover:bg-white/5" style={{ color: SILVER_DIM }}>✏️</button>
        </div>
      </div>
    </div>

    {showDetail && <DecisionDetailPopup decisionId={d.id} onClose={() => setShowDetail(false)} />}

    {moving && (
      <div data-modal="move" className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.55)" }} onClick={() => setMoving(false)}>
        <div className="rounded-2xl shadow-2xl p-4" style={{ width: "min(420px,94vw)", backgroundColor: "#0d1320", border: `1px solid ${SILVER_FAINT}` }} onClick={e => e.stopPropagation()}>
          <p className="text-sm font-bold mb-1" style={{ color: SILVER }}>📂 카테고리 이동</p>
          <p className="text-[11px] mb-3" style={{ color: SILVER_DIM, lineHeight: 1.4 }}>{d.content}</p>
          <select value={moveSubId} onChange={e => setMoveSubId(e.target.value)} className="w-full px-2 py-2 rounded text-xs outline-none mb-3" style={{ backgroundColor: "rgba(0,0,0,0.3)", border: `1px solid ${SILVER_FAINT}`, color: "#e0e8f0" }}>
            <option value="">(카테고리 미지정)</option>
            {allSubs.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <div className="flex justify-end gap-2">
            <button onClick={() => setMoving(false)} className="text-xs px-3 py-1.5 rounded" style={{ backgroundColor: SILVER_FAINT, color: SILVER_DIM }}>취소</button>
            <button onClick={() => { onEditSave(d.content, moveSubId || null); setMoving(false); }} className="text-xs px-3 py-1.5 rounded font-bold" style={{ backgroundColor: "rgba(100,220,160,0.2)", color: "rgba(150,255,200,1)" }}>이동</button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

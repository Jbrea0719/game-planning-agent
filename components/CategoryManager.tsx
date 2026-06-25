"use client";

// 카테고리 관리 모달 — 대/중/소 카테고리 전체 CRUD
// DocumentView의 톱니바퀴 버튼으로 열림

import { useEffect, useState, useCallback } from "react";

const SILVER = "#c0c8d8";
const SILVER_DIM = "rgba(192,200,216,0.5)";
const SILVER_FAINT = "rgba(192,200,216,0.15)";

// 카테고리 아이콘 선택 목록 (게임 기획 친화)
const ICON_CHOICES = [
  "📁","📂","📦","🎮","🕹️","⚔️","🛡️","🗡️","🏹","🎯",
  "⭐","🌟","💎","🔥","⚡","💰","🪙","🎁","🎰","🃏",
  "🏆","👑","🦸","🦹","🐉","🧙","🗺️","🏰","⛩️","🌍",
  "🌐","📊","📈","🧩","🔧","⚙️","🎨","🖼️","🎵","🔔",
  "💬","📜","📝","✨","❤️","🔮","🧪","🪄","🚀","🧭",
];

interface SubItem {
  id: string;
  name_ko: string;
  area_code: string | null;
  area_name: string | null;
  icon?: string | null;
  display_order?: number | null;
}
interface AreaGroup {
  code: string | null;     // null = 영역 없음
  name: string | null;
  subs: SubItem[];
}
interface MainItem {
  id: string;
  name_ko: string;
  icon: string | null;
  areas: AreaGroup[];   // null 영역 포함
}
interface DocMeta {
  id: string;
  title: string;
  category_main_id: string | null;
  category_area_code: string | null;
  category_sub_id: string | null;
  sort_order?: number | null;
}

export default function CategoryManager({
  open,
  onClose,
  onChanged,
  onOrphaned,
  onOrphanedDocs,
  projectId,
}: {
  open: boolean;
  onClose: () => void;
  onChanged: () => void;   // 변경 발생 시 호출 (외부에서 카테고리 다시 로드)
  onOrphaned?: (decisionIds: string[]) => void;  // 소카테고리 삭제로 미분류된 결정사항 id (AI 재분류 검토용)
  onOrphanedDocs?: (docIds: string[]) => void;   // 소카테고리 삭제로 미분류된 기획서 id (AI 재분류 검토용)
  projectId: string;       // 기획서(최하위) 목록 로드용
}) {
  const [mains, setMains] = useState<MainItem[]>([]);
  const [docs, setDocs] = useState<DocMeta[]>([]);  // 최하위 기획서 목록
  const [iconPicker, setIconPicker] = useState<{ kind: "main" | "sub"; id: string } | null>(null);  // 아이콘 변경 중인 대상
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  // 인라인 편집 상태 — 한 번에 하나만
  // type: "main" | "sub" | "area-rename" / id: 대상 id (area인 경우 `${mainId}::${areaCode}`)
  const [editing, setEditing] = useState<{ type: string; key: string } | null>(null);
  const [editText, setEditText] = useState("");

  // 신규 입력 모달 상태
  const [adding, setAdding] = useState<
    | { type: "main" }
    | { type: "sub"; mainId: string; areaCode: string | null; areaName: string | null }
    | { type: "area"; mainId: string }
    | { type: "doc"; mainId: string; areaCode: string | null; subId: string; subName: string }
    | null
  >(null);
  const [addText, setAddText] = useState("");
  const [addExtra, setAddExtra] = useState("");  // sub 추가 시 area 추가용
  // 소(폴더) 접기/펼치기 + 문서 묶기 대상 선택 모달
  const [collapsedSubs, setCollapsedSubs] = useState<Set<string>>(new Set());
  const [nesting, setNesting] = useState<{ docId: string; docTitle: string; subs: SubItem[] } | null>(null);

  // ── 데이터 로드 ────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      // 기획서(최하위) 목록도 병렬 로드 — 카테고리 트리 아래에 표시·삭제용
      fetch(`/api/design-docs?project_id=${encodeURIComponent(projectId)}`)
        .then(r => r.json())
        .then(d => setDocs(d.docs ?? []))
        .catch(err => console.error("[cat-mgr] 기획서 로드 실패:", err));
      const res = await fetch("/api/categories");
      const data = await res.json();
      const raw = (data.main_categories ?? []) as Array<{
        id: string; name_ko: string; icon: string | null;
        sub_categories?: SubItem[];
        areas?: Array<{ code: string; name: string; sub_categories: SubItem[] }>;
      }>;
      const built: MainItem[] = raw.map(m => {
        const areas: AreaGroup[] = [];
        // areas 그대로 + flat sub_categories는 area=null로
        if (m.areas) for (const a of m.areas) areas.push({ code: a.code, name: a.name, subs: a.sub_categories });
        if (m.sub_categories && m.sub_categories.length > 0) {
          areas.push({ code: null, name: null, subs: m.sub_categories });
        }
        return { id: m.id, name_ko: m.name_ko, icon: m.icon, areas };
      });
      setMains(built);
    } catch (err) {
      console.error("[cat-mgr] 로드 실패:", err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { if (open) void load(); }, [open, load]);
  // 모달이 닫히면 편집/추가 진행 상태를 모두 초기화 (다시 열 때 "이름 변경 중"이 남지 않도록)
  useEffect(() => {
    if (!open) {
      setEditing(null);
      setEditText("");
      setAdding(null);
      setAddText("");
      setAddExtra("");
      setIconPicker(null);
    }
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  if (!open) return null;

  // ── 액션 함수들 ────────────────────────────────────────────────
  async function api(url: string, opts?: RequestInit) {
    setBusy(true);
    try {
      const res = await fetch(url, opts);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error ?? `오류 (${res.status})`);
        return null;
      }
      return data;
    } finally { setBusy(false); }
  }

  async function createMain(name: string) {
    if (!name.trim()) return;
    const ok = await api("/api/categories/main", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name_ko: name, icon: "📁" }),
    });
    if (ok) { await load(); onChanged(); }
  }
  async function renameMain(id: string, name: string) {
    if (!name.trim()) return;
    const ok = await api(`/api/categories/main/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name_ko: name }),
    });
    if (ok) { await load(); onChanged(); }
  }
  async function setCatIcon(kind: "main" | "sub", id: string, icon: string) {
    const url = kind === "main" ? `/api/categories/main/${id}` : `/api/categories/sub/${id}`;
    const ok = await api(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ icon }),
    });
    setIconPicker(null);
    if (ok) { await load(); onChanged(); }
  }

  // ── 순서 변경 (display_order 일괄 저장) ───────────────────────
  async function reorder(type: "main" | "sub" | "area", orderedIds: string[]) {
    const ok = await api("/api/categories/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, ordered_ids: orderedIds }),
    });
    if (ok) { await load(); onChanged(); }
  }
  // 대카테고리 위(-1)/아래(+1)
  function moveMain(mainId: string, dir: -1 | 1) {
    const idx = mains.findIndex(m => m.id === mainId);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= mains.length) return;
    const ids = mains.map(m => m.id);
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    void reorder("main", ids);
  }
  // (소 단독 정렬은 areaChildren 통합 정렬로 대체됨)
  // 중카테고리(영역) 위/아래 — 영역 블록 통째로 이동 (areas 테이블 display_order)
  function moveArea(m: MainItem, areaIdx: number, dir: -1 | 1) {
    const j = areaIdx + dir;
    if (j < 0 || j >= m.areas.length) return;
    const areas = [...m.areas];
    [areas[areaIdx], areas[j]] = [areas[j], areas[areaIdx]];
    // 실제 중(area.code 있는 것)만 id로 — code null(대 직속 소 묶음)은 제외
    const ids = areas.filter(a => a.code).map(a => `${m.id}:${a.code}`);
    if (ids.length > 0) void reorder("area", ids);
  }

  async function deleteMain(id: string, name: string) {
    if (!confirm(`대카테고리 "${name}"을 삭제할까요? 하위 항목이 있으면 삭제할 수 없어요.`)) return;
    const ok = await api(`/api/categories/main/${id}`, { method: "DELETE" });
    if (ok) { await load(); onChanged(); }
  }

  async function createSub(mainId: string, areaCode: string | null, areaName: string | null, name: string) {
    if (!name.trim()) return;
    const ok = await api("/api/categories/sub", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        main_category_id: mainId,
        area_code: areaCode,
        area_name: areaName,
        name_ko: name,
      }),
    });
    if (ok) { await load(); onChanged(); }
  }
  async function createArea(mainId: string, areaName: string) {
    if (!areaName.trim()) return;
    // 중(area)은 1급 객체 — 소 없이 이름만으로 빈 중 생성
    const ok = await api("/api/categories/area", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ main_id: mainId, name: areaName.trim() }),
    });
    if (ok) { await load(); onChanged(); }
  }
  async function renameSub(id: string, name: string) {
    if (!name.trim()) return;
    const ok = await api(`/api/categories/sub/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name_ko: name }),
    });
    if (ok) { await load(); onChanged(); }
  }
  async function deleteSub(id: string, name: string) {
    if (!confirm(`소카테고리 "${name}"을 삭제할까요? 이 카테고리에 연결된 결정사항·기획서는 분류가 해제돼요.`)) return;
    const ok = await api(`/api/categories/sub/${id}`, { method: "DELETE" });
    if (ok) {
      await load();
      onChanged();
      // 미분류로 떨어진 결정사항·기획서가 있으면 각각 AI 재분류 검토 트리거
      const orphaned = (ok.orphaned_decision_ids ?? []) as string[];
      if (orphaned.length > 0) onOrphaned?.(orphaned);
      const orphanedDocs = (ok.orphaned_doc_ids ?? []) as string[];
      if (orphanedDocs.length > 0) onOrphanedDocs?.(orphanedDocs);
    }
  }
  async function renameArea(mainId: string, areaCode: string, newName: string) {
    if (!newName.trim()) return;
    const ok = await api("/api/categories/area", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ main_id: mainId, area_code: areaCode, new_name: newName }),
    });
    if (ok) { await load(); onChanged(); }
  }
  async function deleteArea(mainId: string, areaCode: string, areaName: string) {
    const choice = confirm(
      `중카테고리 "${areaName}"을 어떻게 처리할까요?\n\n` +
      `OK = 영역만 제거 (소카테고리는 보존되고 main 직속으로 이동)\n` +
      `취소 = 작업 안 함`
    );
    if (!choice) return;
    const ok = await api("/api/categories/area", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ main_id: mainId, area_code: areaCode, hard: false }),
    });
    if (ok) { await load(); onChanged(); }
  }

  // ── 기획서(최하위) 추가 — 소카테고리 아래에 빈 기획서 1개 ──────
  async function createDoc(mainId: string, areaCode: string | null, subId: string, title: string) {
    if (!title.trim()) return;
    const ok = await api("/api/design-docs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: projectId,
        title: title.trim(),
        category_main_id: mainId,
        category_area_code: areaCode,
        category_sub_id: subId,
      }),
    });
    if (ok) { await load(); onChanged(); }
  }

  // ── 기획서(최하위) 삭제 ───────────────────────────────────────
  async function deleteDoc(id: string, title: string) {
    if (!confirm(`기획서 "${title || "(제목 없음)"}"을(를) 삭제할까요? 되돌릴 수 없어요.`)) return;
    const ok = await api(`/api/design-docs/${id}`, { method: "DELETE" });
    if (ok) {
      setDocs(prev => prev.filter(d => d.id !== id));  // 즉시 화면 반영
      onChanged();  // DocumentView 기획서 트리도 새로고침
    }
  }

  // 카테고리별 기획서 묶기
  const docsForSub = (subId: string) => docs.filter(d => d.category_sub_id === subId);
  // 소 안의 기획서 — sort_order 순 (null은 뒤)
  const subDocsSorted = (subId: string) =>
    docsForSub(subId).slice().sort((a, b) => (a.sort_order ?? 1e9) - (b.sort_order ?? 1e9));

  // 중(area) 하위 자식 = 소(폴더) + 단일(중 직속) 기획서를 하나의 순서로 병합
  type AreaChild = { kind: "sub"; sub: SubItem } | { kind: "doc"; doc: DocMeta };
  function areaChildren(mainId: string, area: AreaGroup): AreaChild[] {
    const subs = area.subs.map((s, i) => ({ kind: "sub" as const, sub: s, ord: s.display_order ?? 1e9, seq: i }));
    const direct = (area.code ? areaDirectDocs(mainId, area.code) : [])
      .map((d, i) => ({ kind: "doc" as const, doc: d, ord: d.sort_order ?? 1e9, seq: i }));
    return [...subs, ...direct]
      .sort((a, b) => (a.ord - b.ord) || (a.kind === b.kind ? a.seq - b.seq : a.kind === "sub" ? -1 : 1))
      .map(c => (c.kind === "sub" ? { kind: "sub", sub: c.sub } : { kind: "doc", doc: c.doc }));
  }
  // 통합 정렬 — 소·직속 문서를 섞은 순서로 저장
  async function moveAreaChild(mainId: string, area: AreaGroup, idx: number, dir: -1 | 1) {
    const list = areaChildren(mainId, area);
    const j = idx + dir;
    if (j < 0 || j >= list.length) return;
    [list[idx], list[j]] = [list[j], list[idx]];
    const items = list.map(c => (c.kind === "sub" ? { type: "sub", id: c.sub.id } : { type: "doc", id: c.doc.id }));
    const ok = await api("/api/categories/area-children/reorder", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }),
    });
    if (ok) { await load(); onChanged(); }
  }
  // 소 안 문서끼리 순서 변경
  async function moveSubDoc(subId: string, idx: number, dir: -1 | 1) {
    const list = subDocsSorted(subId);
    const j = idx + dir;
    if (j < 0 || j >= list.length) return;
    [list[idx], list[j]] = [list[j], list[idx]];
    const items = list.map(d => ({ type: "doc", id: d.id }));
    const ok = await api("/api/categories/area-children/reorder", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }),
    });
    if (ok) { await load(); onChanged(); }
  }
  // 묶기(문서 → 소) / 풀기(문서 → 중 직속)
  async function nestDoc(docId: string, subId: string) {
    const ok = await api(`/api/design-docs/${docId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category_sub_id: subId }),
    });
    if (ok) { await load(); onChanged(); }
  }
  async function unnestDoc(docId: string) {
    const ok = await api(`/api/design-docs/${docId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category_sub_id: null }),
    });
    if (ok) { await load(); onChanged(); }
  }
  const toggleSub = (id: string) =>
    setCollapsedSubs(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  // 중(area) 직속 기획서 — 소는 없지만 중에는 속한 기획서
  const areaDirectDocs = (mainId: string, areaCode: string) =>
    docs.filter(d => d.category_main_id === mainId && d.category_area_code === areaCode && !d.category_sub_id);
  // 대 직속 기획서 — 중·소 모두 없는 기획서만 (중 직속은 위에서 따로 표시하므로 제외)
  const mainDirectDocs = (mainId: string) =>
    docs.filter(d => d.category_main_id === mainId && !d.category_sub_id && !d.category_area_code);
  const uncategorizedDocs = docs.filter(d => !d.category_main_id);

  // 기획서 한 줄 렌더
  function docRow(d: DocMeta) {
    return (
      <div key={d.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-white/5">
        <span style={{ fontSize: "10px" }}>📄</span>
        <span className="flex-1 text-xs truncate" style={{ color: "rgba(170,200,235,0.95)" }}>{d.title || "(제목 없음)"}</span>
        <button
          onClick={() => deleteDoc(d.id, d.title)}
          className="text-xs px-1 py-0.5 rounded hover:bg-white/10"
          style={{ color: "rgba(255,180,180,0.7)" }}
          title="기획서 삭제 (되돌릴 수 없음)"
        >🗑️</button>
      </div>
    );
  }

  // ── 인라인 편집 UI 헬퍼 ───────────────────────────────────────
  function startEdit(type: string, key: string, initial: string) {
    setEditing({ type, key });
    setEditText(initial);
  }
  function cancelEdit() { setEditing(null); setEditText(""); }

  // ── 렌더 ────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-[70] flex items-start sm:items-center justify-center p-4 overflow-y-auto"
      style={{ backgroundColor: "rgba(0,0,0,0.75)" }}
      onClick={onClose}
    >
      <div
        className="rounded-2xl w-full max-w-3xl max-h-[85dvh] flex flex-col shadow-2xl"
        style={{ backgroundColor: "#0f1628", border: `1px solid ${SILVER_FAINT}` }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ borderBottom: `1px solid ${SILVER_FAINT}` }}>
          <div>
            <p className="text-sm font-bold flex items-center gap-2" style={{ color: SILVER }}>
              <span>⚙️</span> 카테고리 관리
            </p>
            <p className="text-xs mt-0.5" style={{ color: SILVER_DIM }}>
              대(📁) → 중(📂) → 소 → 기획서(📄). <b>아이콘 클릭→변경</b>(대·소) · <b>▲▼ 순서 이동</b> · ✏️ 이름 · 🗑️ 삭제.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setAdding({ type: "main" }); setAddText(""); }}
              className="text-xs px-3 py-1.5 rounded-lg font-medium"
              style={{ backgroundColor: "rgba(100,220,160,0.18)", border: "1px solid rgba(100,220,160,0.5)", color: "rgba(150,255,200,1)" }}
            >
              + 대카테고리
            </button>
            <button
              onClick={onClose}
              className="text-xs px-3 py-1.5 rounded-lg"
              style={{ backgroundColor: SILVER_FAINT, color: SILVER_DIM }}
            >
              닫기
            </button>
          </div>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto px-5 py-4" style={{ scrollbarWidth: "thin", scrollbarColor: `${SILVER_DIM} transparent` }}>
          {loading && <p className="text-xs" style={{ color: SILVER_DIM }}>로딩 중...</p>}
          {!loading && mains.length === 0 && (
            <p className="text-xs text-center mt-6" style={{ color: SILVER_DIM }}>
              카테고리가 없어요. [+ 대카테고리]로 추가하세요.
            </p>
          )}

          {/* 미분류 기획서 (대분류 미지정) — 최상단 */}
          {uncategorizedDocs.length > 0 && (
            <div className="mb-4 rounded-lg px-3 py-2.5" style={{ border: "1px dashed rgba(255,200,100,0.4)", backgroundColor: "rgba(255,200,100,0.05)" }}>
              <p className="text-xs font-bold mb-1.5" style={{ color: "rgba(255,220,150,1)" }}>📄 미분류 기획서 ({uncategorizedDocs.length})</p>
              <div className="flex flex-col gap-0.5">
                {uncategorizedDocs.map(docRow)}
              </div>
            </div>
          )}

          {mains.map((m, mi) => (
            <div key={m.id} className="mb-4 rounded-lg" style={{ border: `1px solid ${SILVER_FAINT}` }}>
              {/* 대카테고리 헤더 */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-t-lg" style={{ backgroundColor: "rgba(192,200,216,0.08)" }}>
                <div className="flex flex-col leading-none">
                  <button onClick={() => moveMain(m.id, -1)} disabled={mi === 0 || busy} className="text-[9px] disabled:opacity-20 hover:text-white" style={{ color: SILVER_DIM }} title="위로">▲</button>
                  <button onClick={() => moveMain(m.id, 1)} disabled={mi === mains.length - 1 || busy} className="text-[9px] disabled:opacity-20 hover:text-white" style={{ color: SILVER_DIM }} title="아래로">▼</button>
                </div>
                <button
                  onClick={() => setIconPicker({ kind: "main", id: m.id })}
                  title="아이콘 변경 — 클릭하면 아이콘 목록"
                  className="rounded hover:bg-white/10 px-1 py-0.5 leading-none"
                  style={{ fontSize: "15px" }}
                >{m.icon ?? "📁"}</button>
                {editing?.type === "main" && editing.key === m.id ? (
                  <input
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onBlur={() => { void renameMain(m.id, editText); cancelEdit(); }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { void renameMain(m.id, editText); cancelEdit(); }
                      if (e.key === "Escape") cancelEdit();
                    }}
                    className="flex-1 text-sm font-bold px-2 py-0.5 rounded outline-none"
                    style={{ backgroundColor: "rgba(0,0,0,0.4)", border: "1px solid rgba(100,180,255,0.5)", color: "#e0e8f0" }}
                    autoFocus
                  />
                ) : (
                  <span className="flex-1 text-sm font-bold" style={{ color: SILVER }}>{m.name_ko}</span>
                )}
                <button
                  onClick={() => startEdit("main", m.id, m.name_ko)}
                  className="text-xs px-1.5 py-0.5 rounded hover:bg-white/10"
                  style={{ color: SILVER_DIM }}
                  title="이름 변경"
                >✏️</button>
                <button
                  onClick={() => deleteMain(m.id, m.name_ko)}
                  className="text-xs px-1.5 py-0.5 rounded hover:bg-white/10"
                  style={{ color: "rgba(255,180,180,0.7)" }}
                  title="삭제 (하위 없을 때만)"
                >🗑️</button>
                <button
                  onClick={() => { setAdding({ type: "area", mainId: m.id }); setAddText(""); setAddExtra(""); }}
                  className="text-xs px-2 py-0.5 rounded font-medium"
                  style={{ backgroundColor: "rgba(100,180,255,0.18)", border: "1px solid rgba(100,180,255,0.4)", color: "var(--accent-2)" }}
                  title="중카테고리(영역) 추가"
                >+ 중</button>
                <button
                  onClick={() => { setAdding({ type: "sub", mainId: m.id, areaCode: null, areaName: null }); setAddText(""); }}
                  className="text-xs px-2 py-0.5 rounded font-medium"
                  style={{ backgroundColor: "rgba(100,220,160,0.18)", border: "1px solid rgba(100,220,160,0.4)", color: "rgba(150,255,200,1)" }}
                  title="중카테고리 없이 직속 소카테고리 추가"
                >+ 소</button>
              </div>

              {/* 영역(중) 리스트 */}
              <div className="px-3 py-2 flex flex-col gap-2">
                {m.areas.length === 0 && (
                  <p className="text-xs text-center py-2" style={{ color: SILVER_DIM }}>
                    하위 카테고리가 없어요
                  </p>
                )}
                {m.areas.map((a, ai) => {
                  const areaKey = `${m.id}::${a.code ?? "_none"}`;
                  return (
                    <div key={ai} className="rounded" style={{ backgroundColor: "rgba(255,255,255,0.02)", border: `1px dashed ${SILVER_FAINT}` }}>
                      {/* 중카테고리 헤더 */}
                      {a.code && (
                        <div className="flex items-center gap-2 px-2 py-1.5">
                          <div className="flex flex-col leading-none">
                            <button onClick={() => moveArea(m, ai, -1)} disabled={ai === 0 || busy} className="text-[8px] disabled:opacity-20 hover:text-white" style={{ color: SILVER_DIM }} title="위로">▲</button>
                            <button onClick={() => moveArea(m, ai, 1)} disabled={ai === m.areas.length - 1 || busy} className="text-[8px] disabled:opacity-20 hover:text-white" style={{ color: SILVER_DIM }} title="아래로">▼</button>
                          </div>
                          <span style={{ fontSize: "12px" }}>📂</span>
                          {editing?.type === "area-rename" && editing.key === areaKey ? (
                            <input
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              onBlur={() => { void renameArea(m.id, a.code!, editText); cancelEdit(); }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") { void renameArea(m.id, a.code!, editText); cancelEdit(); }
                                if (e.key === "Escape") cancelEdit();
                              }}
                              className="flex-1 text-xs font-medium px-1.5 py-0.5 rounded outline-none"
                              style={{ backgroundColor: "rgba(0,0,0,0.4)", border: "1px solid rgba(100,180,255,0.5)", color: "#e0e8f0" }}
                              autoFocus
                            />
                          ) : (
                            <span className="flex-1 text-xs font-medium" style={{ color: SILVER }}>{a.name}</span>
                          )}
                          <button
                            onClick={() => startEdit("area-rename", areaKey, a.name ?? "")}
                            className="text-xs px-1 py-0.5 rounded hover:bg-white/10"
                            style={{ color: SILVER_DIM }}
                          >✏️</button>
                          <button
                            onClick={() => deleteArea(m.id, a.code!, a.name ?? "")}
                            className="text-xs px-1 py-0.5 rounded hover:bg-white/10"
                            style={{ color: "rgba(255,180,180,0.7)" }}
                          >🗑️</button>
                          <button
                            onClick={() => { setAdding({ type: "sub", mainId: m.id, areaCode: a.code, areaName: a.name }); setAddText(""); }}
                            className="text-xs px-1.5 py-0.5 rounded"
                            style={{ backgroundColor: "rgba(100,220,160,0.15)", border: "1px solid rgba(100,220,160,0.3)", color: "rgba(150,255,200,0.9)" }}
                          >+ 소</button>
                        </div>
                      )}

                      {/* 중 하위 = 소(폴더) + 단일 기획서 통합 리스트 (▲▼로 함께 정렬) */}
                      <div className={`${a.code ? "pl-6 pr-2 pb-2" : "px-2 py-1"} flex flex-col gap-0.5`}>
                        {areaChildren(m.id, a).map((c, ci, arr) => {
                          const moveCol = (
                            <div className="flex flex-col leading-none">
                              <button onClick={() => moveAreaChild(m.id, a, ci, -1)} disabled={ci === 0 || busy} className="text-[8px] disabled:opacity-20 hover:text-white" style={{ color: SILVER_DIM }} title="위로">▲</button>
                              <button onClick={() => moveAreaChild(m.id, a, ci, 1)} disabled={ci === arr.length - 1 || busy} className="text-[8px] disabled:opacity-20 hover:text-white" style={{ color: SILVER_DIM }} title="아래로">▼</button>
                            </div>
                          );
                          if (c.kind === "sub") {
                            const s = c.sub;
                            const collapsed = collapsedSubs.has(s.id);
                            const sdocs = subDocsSorted(s.id);
                            return (
                              <div key={s.id}>
                                <div className="flex items-center gap-2 px-2 py-1 rounded hover:bg-white/5">
                                  {moveCol}
                                  <button onClick={() => toggleSub(s.id)} className="text-[9px] hover:text-white" style={{ color: SILVER_DIM }} title={collapsed ? "펼치기" : "접기"}>{collapsed ? "▶" : "▼"}</button>
                                  <button onClick={() => setIconPicker({ kind: "sub", id: s.id })} title="아이콘 변경" className="rounded hover:bg-white/10 leading-none px-0.5" style={{ fontSize: "12px", color: s.icon ? undefined : SILVER_DIM }}>{s.icon ?? "📁"}</button>
                                  {editing?.type === "sub" && editing.key === s.id ? (
                                    <input value={editText} onChange={(e) => setEditText(e.target.value)} onBlur={() => { void renameSub(s.id, editText); cancelEdit(); }} onKeyDown={(e) => { if (e.key === "Enter") { void renameSub(s.id, editText); cancelEdit(); } if (e.key === "Escape") cancelEdit(); }} className="flex-1 text-xs px-1.5 py-0.5 rounded outline-none" style={{ backgroundColor: "rgba(0,0,0,0.4)", border: "1px solid rgba(100,180,255,0.5)", color: "#e0e8f0" }} autoFocus />
                                  ) : (
                                    <span className="flex-1 text-xs font-medium" style={{ color: "#b8c4d4" }}>{s.name_ko} <span style={{ color: SILVER_DIM }}>({sdocs.length})</span></span>
                                  )}
                                  <button onClick={() => startEdit("sub", s.id, s.name_ko)} className="text-xs px-1 py-0.5 rounded hover:bg-white/10" style={{ color: SILVER_DIM }}>✏️</button>
                                  <button onClick={() => deleteSub(s.id, s.name_ko)} className="text-xs px-1 py-0.5 rounded hover:bg-white/10" style={{ color: "rgba(255,180,180,0.7)" }}>🗑️</button>
                                  <button onClick={() => { setAdding({ type: "doc", mainId: m.id, areaCode: a.code, subId: s.id, subName: s.name_ko }); setAddText(""); }} className="text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap" style={{ backgroundColor: "rgba(100,180,255,0.15)", border: "1px solid rgba(100,180,255,0.35)", color: "var(--accent-2)" }} title="이 소에 기획서 추가">+ 기획서</button>
                                </div>
                                {!collapsed && sdocs.length > 0 && (
                                  <div className="ml-7 mt-0.5 flex flex-col gap-0.5">
                                    {sdocs.map((d, di) => (
                                      <div key={d.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-white/5">
                                        <div className="flex flex-col leading-none">
                                          <button onClick={() => moveSubDoc(s.id, di, -1)} disabled={di === 0 || busy} className="text-[8px] disabled:opacity-20 hover:text-white" style={{ color: SILVER_DIM }} title="위로">▲</button>
                                          <button onClick={() => moveSubDoc(s.id, di, 1)} disabled={di === sdocs.length - 1 || busy} className="text-[8px] disabled:opacity-20 hover:text-white" style={{ color: SILVER_DIM }} title="아래로">▼</button>
                                        </div>
                                        <span style={{ fontSize: "10px" }}>📄</span>
                                        <span className="flex-1 text-xs truncate" style={{ color: "rgba(170,200,235,0.95)" }}>{d.title || "(제목 없음)"}</span>
                                        <button onClick={() => unnestDoc(d.id)} className="text-[10px] px-1.5 py-0.5 rounded hover:bg-white/10" style={{ color: SILVER_DIM }} title="소에서 빼기 (중 직속으로)">↤ 풀기</button>
                                        <button onClick={() => deleteDoc(d.id, d.title)} className="text-xs px-1 py-0.5 rounded hover:bg-white/10" style={{ color: "rgba(255,180,180,0.7)" }} title="기획서 삭제">🗑️</button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          }
                          // 단일(중 직속) 기획서
                          const d = c.doc;
                          return (
                            <div key={d.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-white/5">
                              {moveCol}
                              <span style={{ fontSize: "10px" }}>📄</span>
                              <span className="flex-1 text-xs truncate" style={{ color: "rgba(170,200,235,0.95)" }}>{d.title || "(제목 없음)"}</span>
                              <button onClick={() => { if (a.subs.length === 0) { alert("이 중에 소카테고리가 없어요. 먼저 +소로 만들어 주세요."); return; } setNesting({ docId: d.id, docTitle: d.title, subs: a.subs }); }} className="text-[10px] px-1.5 py-0.5 rounded hover:bg-white/10" style={{ color: "var(--accent-2)" }} title="소로 묶기">📁 묶기</button>
                              <button onClick={() => deleteDoc(d.id, d.title)} className="text-xs px-1 py-0.5 rounded hover:bg-white/10" style={{ color: "rgba(255,180,180,0.7)" }} title="기획서 삭제">🗑️</button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {/* 이 대분류 직속 기획서 (소카테고리 없이 바로 붙은 기획서) */}
                {mainDirectDocs(m.id).length > 0 && (
                  <div className="rounded px-2 py-1.5" style={{ backgroundColor: "rgba(100,180,255,0.04)", border: `1px dashed ${SILVER_FAINT}` }}>
                    <p className="text-[10px] mb-1" style={{ color: SILVER_DIM }}>📄 직속 기획서 (소분류 미지정)</p>
                    <div className="flex flex-col gap-0.5">
                      {mainDirectDocs(m.id).map(docRow)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* 아이콘 선택 팝업 */}
        {iconPicker && (
          <div
            className="absolute inset-0 z-[80] flex items-center justify-center p-4"
            style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
            onClick={() => setIconPicker(null)}
          >
            <div
              className="rounded-xl p-4 w-full max-w-sm shadow-2xl"
              style={{ backgroundColor: "#0f1628", border: `1px solid ${SILVER_FAINT}` }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-bold" style={{ color: SILVER }}>아이콘 선택</p>
                <button onClick={() => setIconPicker(null)} className="text-xs px-2 py-1 rounded" style={{ backgroundColor: SILVER_FAINT, color: SILVER_DIM }}>닫기</button>
              </div>
              <div className="grid grid-cols-8 gap-1">
                {ICON_CHOICES.map((ic) => {
                  const cur = iconPicker.kind === "main"
                    ? (mains.find(m => m.id === iconPicker.id)?.icon ?? "📁")
                    : (mains.flatMap(m => m.areas).flatMap(a => a.subs).find(s => s.id === iconPicker.id)?.icon ?? "•");
                  const selected = cur === ic;
                  return (
                    <button
                      key={ic}
                      onClick={() => setCatIcon(iconPicker.kind, iconPicker.id, ic)}
                      disabled={busy}
                      className="aspect-square rounded-lg flex items-center justify-center hover:bg-white/10 disabled:opacity-40"
                      style={{ fontSize: "18px", backgroundColor: selected ? "rgba(100,180,255,0.25)" : "transparent", border: `1px solid ${selected ? "rgba(100,180,255,0.6)" : "transparent"}` }}
                    >{ic}</button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* 묶기 — 단일 기획서를 어느 소로 넣을지 선택 */}
        {nesting && (
          <div
            className="absolute inset-0 z-[80] flex items-center justify-center p-4"
            style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
            onClick={() => setNesting(null)}
          >
            <div
              className="rounded-xl p-5 w-full max-w-md shadow-2xl flex flex-col gap-2"
              style={{ backgroundColor: "#0f1628", border: `1px solid ${SILVER_FAINT}` }}
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-sm font-bold" style={{ color: SILVER }}>📁 소카테고리로 묶기</p>
              <p className="text-xs mb-1" style={{ color: SILVER_DIM }}>「{nesting.docTitle || "(제목 없음)"}」을(를) 넣을 소를 선택하세요.</p>
              <div className="flex flex-col gap-1 max-h-[40vh] overflow-y-auto">
                {nesting.subs.map(s => (
                  <button
                    key={s.id}
                    onClick={async () => { const id = nesting.docId; setNesting(null); await nestDoc(id, s.id); }}
                    className="text-left text-xs px-3 py-2 rounded-lg hover:bg-white/10"
                    style={{ backgroundColor: "rgba(255,255,255,0.04)", border: `1px solid ${SILVER_FAINT}`, color: "#e0e8f0" }}
                  >📁 {s.name_ko}</button>
                ))}
              </div>
              <div className="flex justify-end mt-1">
                <button onClick={() => setNesting(null)} className="text-xs px-4 py-2 rounded-lg" style={{ backgroundColor: SILVER_FAINT, color: SILVER }}>취소</button>
              </div>
            </div>
          </div>
        )}

        {/* 신규 추가 모달 */}
        {adding && (
          <div
            className="absolute inset-0 z-[80] flex items-center justify-center p-4"
            style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
            onClick={() => { setAdding(null); setAddText(""); setAddExtra(""); }}
          >
            <div
              className="rounded-xl p-5 w-full max-w-md shadow-2xl flex flex-col gap-3"
              style={{ backgroundColor: "#0f1628", border: `1px solid ${SILVER_FAINT}` }}
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-sm font-bold" style={{ color: SILVER }}>
                {adding.type === "main" && "새 대카테고리 추가"}
                {adding.type === "area" && "새 중카테고리(영역) 추가"}
                {adding.type === "sub" && `새 소카테고리 추가${adding.areaName ? ` — ${adding.areaName}` : ""}`}
                {adding.type === "doc" && `새 기획서 추가 — ${adding.subName}`}
              </p>
              {adding.type === "doc" && (
                <p className="text-xs" style={{ color: SILVER_DIM }}>
                  이 소카테고리 아래에 빈 기획서가 생겨요. 만든 뒤 열어서 내용을 작성하면 됩니다.
                </p>
              )}
              {adding.type === "area" && (
                <p className="text-xs" style={{ color: SILVER_DIM }}>
                  중카테고리는 소 없이도 생성돼요. 만든 뒤 기획서를 바로 넣거나 소를 추가할 수 있어요.
                </p>
              )}
              <input
                value={addText}
                onChange={(e) => setAddText(e.target.value)}
                placeholder={
                  adding.type === "main" ? "예: 라이브 운영"
                    : adding.type === "area" ? "중카테고리 이름 (예: 영웅, PVE)"
                    : adding.type === "doc" ? "기획서 제목 (예: 영웅 등급 기획서)"
                    : "소카테고리 이름 (예: 영웅 등급)"
                }
                className="px-3 py-2 rounded-lg text-sm outline-none"
                style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${SILVER_FAINT}`, color: "#e0e8f0" }}
                autoFocus
              />
              <div className="flex gap-2 justify-end mt-1">
                <button
                  onClick={() => { setAdding(null); setAddText(""); setAddExtra(""); }}
                  className="text-xs px-4 py-2 rounded-lg"
                  style={{ backgroundColor: SILVER_FAINT, color: SILVER }}
                >취소</button>
                <button
                  disabled={busy || !addText.trim()}
                  onClick={async () => {
                    if (adding.type === "main") await createMain(addText);
                    else if (adding.type === "sub") await createSub(adding.mainId, adding.areaCode, adding.areaName, addText);
                    else if (adding.type === "area") await createArea(adding.mainId, addText);
                    else if (adding.type === "doc") await createDoc(adding.mainId, adding.areaCode, adding.subId, addText);
                    setAdding(null); setAddText(""); setAddExtra("");
                  }}
                  className="text-xs px-4 py-2 rounded-lg font-bold disabled:opacity-40"
                  style={{ backgroundColor: "rgba(100,220,160,0.25)", border: "1px solid rgba(100,220,160,0.6)", color: "rgba(150,255,200,1)" }}
                >추가</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

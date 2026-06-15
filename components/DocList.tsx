"use client";

// 기획서 리스트 트리 — 좌측 사이드바 오버레이로 표시
// 대(Main) > 중(Area) > 소(Sub) > 기획서(leaf) 4단계 그룹핑
//
// 핵심: 트리를 "기획서가 있는 폴더"가 아니라 "카테고리 전체"로 만든다.
//   → 기획서가 없는 빈 소분류도 항상 보이고, 주황으로 강조해 채워야 할 곳을 표시.
//   → 폴더마다 채움/전체 카운트 + 상단 전체 진행률 + 필터(전체/완성/빈 항목).
// 위계 구분은 배경색이 아니라 글자 크기·굵기·밝기 + 들여쓰기로.

import { useState, useEffect, type ReactNode } from "react";
import {
  DndContext, pointerWithin, rectIntersection, PointerSensor, TouchSensor, useSensor, useSensors, useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { DocMeta, DocFull, CategoryMainItem } from "./DocumentView";

const COLLAPSED_LS_KEY = "jordan_doc_collapsed_filter"; // 완성/빈항목 필터의 접힘 상태 저장 키

type DragHandle = Pick<ReturnType<typeof useSortable>, "attributes" | "listeners">;

// 드래그 가능한 한 줄 — 그립(⠿)으로만 드래그, 제목 탭/토글은 그대로 동작
function SortableItem({ id, render }: { id: string; render: (handle: DragHandle) => ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1, zIndex: isDragging ? 20 : undefined, position: "relative" }}
    >
      {render({ attributes, listeners })}
    </div>
  );
}

// 정렬 영역 — 루트의 단일 DndContext 안에서 SortableContext만 제공 (DnD 처리는 루트 onDragEnd가 통합)
// enabled=false거나 항목 1개 이하면 그냥 평범하게 렌더(드래그 비활성)
function SortableZone<T>({ items, getId, renderItem, enabled }: {
  items: T[];
  getId: (t: T) => string;
  renderItem: (t: T, handle?: DragHandle) => ReactNode;
  onReorder?: (orderedIds: string[]) => void;  // (미사용 — 루트 핸들러가 처리, 호출부 호환용)
  enabled: boolean;
}) {
  const ids = items.map(getId);
  if (!enabled || items.length < 1) {
    return <>{items.map(t => renderItem(t))}</>;
  }
  return (
    <SortableContext items={ids} strategy={verticalListSortingStrategy}>
      {items.map(t => <SortableItem key={getId(t)} id={getId(t)} render={handle => renderItem(t, handle)} />)}
    </SortableContext>
  );
}

// 카테고리 드롭 영역 — 기획서를 여기에 떨구면 해당 카테고리 하위로 이동
function CatDroppable({ id, children }: { id: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{
        borderRadius: 8,
        padding: "3px 0",   // 위아래 여백으로 카테고리 드롭(겹침) 구간을 넓힘
        outline: isOver ? "2px dashed rgba(100,180,255,0.9)" : "2px solid transparent",
        outlineOffset: -1,
        backgroundColor: isOver ? "rgba(100,180,255,0.2)" : undefined,
        transition: "background-color 0.1s",
      }}
    >
      {children}
    </div>
  );
}

const SILVER = "#c0c8d8";
const SILVER_DIM = "rgba(192,200,216,0.5)";
const SILVER_FAINT = "rgba(192,200,216,0.15)";

// 단계별 텍스트 색 (대=가장 밝고 큼 → 소=어둡고 작음)
const MAIN_COLOR = SILVER;
const AREA_COLOR = "rgba(210,220,235,1)";
const SUB_COLOR = SILVER_DIM;

// 빈 소분류 강조 (주황) — 아직 기획서가 없어 채워야 할 곳
const EMPTY_BG = "rgba(255,150,60,0.15)";
const EMPTY_BORDER = "rgba(255,150,60,0.5)";
const EMPTY_TEXT = "rgba(255,200,140,1)";

type FilterMode = "all" | "filled" | "empty";

// ── 트리 노드 타입 ──────────────────────────────────────────────────
type Leaf = { id: string; label: string; docs: DocMeta[] };
type AreaNode = { code: string; label: string; subs: Leaf[]; directDocs: DocMeta[] };
type MainNode = { id: string | null; label: string; icon: string; areas: AreaNode[]; subs: Leaf[]; directDocs: DocMeta[] };

export default function DocList({
  versions,
  currentDoc,
  viewedDocIds,
  categories,
  expandedCats,
  toggleCat,
  renamingDocId,
  renameInput,
  setRenameInput,
  submitRename,
  cancelRename,
  startRename,
  startCategorize,
  onStartWriting,
  onStartWritingDoc,
  onLoadDoc,
  onOpenCategoryManager,
  onClose,
  onMoved,
}: {
  versions: DocMeta[];
  currentDoc: DocFull | null;
  viewedDocIds: Set<string>;
  categories: CategoryMainItem[];
  expandedCats: Set<string>;
  toggleCat: (key: string) => void;
  renamingDocId: string | null;
  renameInput: string;
  setRenameInput: (s: string) => void;
  submitRename: (docId: string) => void;
  cancelRename: () => void;
  startRename: (docId: string, title: string) => void;
  startCategorize: (doc: DocMeta) => void;
  onStartWriting?: (subCategoryId: string, label: string) => void;   // 빈 (진짜)소분류 '작성하기' → 그 소에 새 기획서 작성
  onStartWritingDoc?: (docId: string, title: string) => void;        // planned 기획서 '작성하기' → 조던 인터뷰가 이 기획서를 채움
  onLoadDoc: (id: string) => void;
  onOpenCategoryManager: () => void;
  onClose: () => void;
  onMoved?: () => void;   // 드래그로 기획서를 다른 카테고리로 옮긴 뒤 부모에 새로고침 요청
}) {
  const [filter, setFilter] = useState<FilterMode>("all");
  // 기획서 검색 (제목+본문) — 입력 시 디바운스로 서버 검색, 결과는 평면 리스트로
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<{ id: string; title: string; snippet: string; inTitle: boolean }[]>([]);
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    const q = searchQ.trim();
    if (!q) { setSearchResults([]); setSearching(false); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/design-docs/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setSearchResults(data.results ?? []);
      } catch { setSearchResults([]); } finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [searchQ]);
  // 완성/빈항목 필터에선 기본 펼침이라, 접기 상태를 별도 Set으로 관리(전체 탭은 부모 expandedCats 사용)
  // localStorage에서 복원 → 필터 전환·새로고침 후에도 마지막 +/- 상태 유지
  const [collapsedInFilter, setCollapsedInFilter] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = localStorage.getItem(COLLAPSED_LS_KEY);
      if (raw) return new Set(JSON.parse(raw) as string[]);
    } catch { /* 무시 */ }
    return new Set();
  });
  // 변경 시 저장
  useEffect(() => {
    if (typeof window === "undefined") return;
    try { localStorage.setItem(COLLAPSED_LS_KEY, JSON.stringify([...collapsedInFilter])); } catch { /* 무시 */ }
  }, [collapsedInFilter]);

  // 드래그 정렬 — 낙관적 반영용 순서 덮어쓰기(id→순번). DB 저장은 백그라운드.
  const [orderOverride, setOrderOverride] = useState<Record<string, number>>({});
  const docOrder = (d: DocMeta) => orderOverride[d.id] ?? (d.sort_order ?? Number.MAX_SAFE_INTEGER);
  // 그룹 내 정렬: 수동 순서 우선, 없으면 기존 순서(생성일 역순) 유지 (Array.sort는 안정 정렬)
  const groupSort = (docs: DocMeta[]) => [...docs].sort((a, b) => docOrder(a) - docOrder(b));
  const persistReorder = (orderedIds: string[]) => {
    setOrderOverride(prev => { const n = { ...prev }; orderedIds.forEach((id, i) => { n[id] = i; }); return n; });
    fetch("/api/design-docs/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ordered_ids: orderedIds }),
    })
      .then(async r => { if (!r.ok) { const d = await r.json().catch(() => ({})); console.warn("[reorder] 저장 실패:", d.error); } })
      .catch(err => console.warn("[reorder] 저장 실패:", err));
  };

  // 카테고리(대/소) 드래그 정렬 — 낙관적 반영 + display_order DB 저장
  const [mainOrderOverride, setMainOrderOverride] = useState<Record<string, number>>({});
  const [subOrderOverride, setSubOrderOverride] = useState<Record<string, number>>({});
  // 그룹 내 원래 순서(index) 기준 + 덮어쓰기 우선으로 정렬
  const sortByOverride = <T,>(arr: T[], getId: (t: T) => string, override: Record<string, number>): T[] =>
    arr.map((t, i) => ({ t, i })).sort((a, b) => (override[getId(a.t)] ?? a.i) - (override[getId(b.t)] ?? b.i)).map(x => x.t);
  const persistCategoryOrder = (type: "main" | "sub", orderedIds: string[]) => {
    const setter = type === "main" ? setMainOrderOverride : setSubOrderOverride;
    setter(prev => { const n = { ...prev }; orderedIds.forEach((id, i) => { n[id] = i; }); return n; });
    fetch("/api/categories/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, ordered_ids: orderedIds }),
    })
      .then(async r => { if (!r.ok) { const d = await r.json().catch(() => ({})); console.warn("[cat-reorder] 저장 실패:", d.error); } })
      .catch(err => console.warn("[cat-reorder] 저장 실패:", err));
  };
  // 카테고리 드래그는 '전체' 필터에서만 (필터 중엔 일부 숨겨져 순서가 모호)
  const catDnd = filter === "all";

  // ── 1. 카테고리 전체로 빈 트리 생성 ───────────────────────────────
  const mains: MainNode[] = [];
  const subLeafById = new Map<string, Leaf>();
  const areaByKey = new Map<string, AreaNode>();  // `${mainId}::${areaCode}` → 중(area) 노드

  for (const m of categories) {
    const main: MainNode = { id: m.id, label: m.name_ko, icon: m.icon ?? "📁", areas: [], subs: [], directDocs: [] };
    if (m.areas && m.areas.length > 0) {
      for (const a of m.areas) {
        const area: AreaNode = { code: a.code, label: a.name, subs: [], directDocs: [] };
        areaByKey.set(`${m.id}::${a.code}`, area);
        for (const s of a.sub_categories) {
          const leaf: Leaf = { id: s.id, label: s.name_ko, docs: [] };
          subLeafById.set(s.id, leaf);
          area.subs.push(leaf);
        }
        main.areas.push(area);
      }
    }
    if (m.sub_categories && m.sub_categories.length > 0) {
      for (const s of m.sub_categories) {
        const leaf: Leaf = { id: s.id, label: s.name_ko, docs: [] };
        subLeafById.set(s.id, leaf);
        main.subs.push(leaf);
      }
    }
    mains.push(main);
  }

  // ── 2. 기획서를 트리에 얹기 ─────────────────────────────────────────
  // 소분류(leaf)에 정확히 매칭되는 기획서만 카테고리 밑에 배치.
  // 소분류 미지정(대/중까지만) 또는 삭제된 소분류 참조 → '분류 안 됨'(소분류 지정 필요).
  // 이렇게 해야 카테고리 관리(소분류 구조)와 기획서 트리가 정확히 일치함.
  const uncategorized: DocMeta[] = [];
  const mainById = new Map(mains.map(m => [m.id, m]));
  for (const d of versions) {
    const areaKey = d.category_main_id && d.category_area_code ? `${d.category_main_id}::${d.category_area_code}` : null;
    if (d.category_sub_id && subLeafById.has(d.category_sub_id)) {
      subLeafById.get(d.category_sub_id)!.docs.push(d);
    } else if (areaKey && areaByKey.has(areaKey)) {
      // 소 없이 중(area)까지 지정된 기획서 → 중 직속으로
      areaByKey.get(areaKey)!.directDocs.push(d);
    } else if (d.category_main_id && mainById.has(d.category_main_id)) {
      // 소·중 없이 대분류만 지정된 기획서 → 대분류 직속으로
      mainById.get(d.category_main_id)!.directDocs.push(d);
    } else {
      uncategorized.push(d);
    }
  }

  // ── 3. 진척도 계산 (기획서 단위) ─────────────────────────────
  // planned(작성 예정, 빈 소에서 전환된 기획서)는 '미완성'으로 — 분모엔 포함, 분자(완성)엔 제외.
  const isWritten = (d: DocMeta) => d.status !== "planned";
  const writtenN = (docs: DocMeta[]) => docs.filter(isWritten).length;
  function mainLeaves(m: MainNode): Leaf[] {
    return [...m.subs, ...m.areas.flatMap(a => a.subs)];
  }
  // 전체 기획서 수 (작성됨 + 작성예정 모두)
  function mainDocCount(m: MainNode): number {
    return m.directDocs.length
      + m.subs.reduce((s, l) => s + l.docs.length, 0)
      + m.areas.reduce((s, a) => s + areaDocCount(a), 0);
  }
  function areaDocCount(a: AreaNode): number {
    return a.directDocs.length + a.subs.reduce((s, l) => s + l.docs.length, 0);
  }
  // 완성(작성된) 기획서 수만 — planned 제외
  function mainWrittenCount(m: MainNode): number {
    return writtenN(m.directDocs)
      + m.subs.reduce((s, l) => s + writtenN(l.docs), 0)
      + m.areas.reduce((s, a) => s + areaWrittenCount(a), 0);
  }
  function areaWrittenCount(a: AreaNode): number {
    return writtenN(a.directDocs) + a.subs.reduce((s, l) => s + writtenN(l.docs), 0);
  }
  function emptyLeafCount(leaves: Leaf[]): number {
    return leaves.filter(l => l.docs.length === 0).length;
  }
  const overallDone = mains.reduce((s, m) => s + mainWrittenCount(m), 0);
  const overallTotal = mains.reduce((s, m) => s + mainDocCount(m), 0) + emptyLeafCount(mains.flatMap(mainLeaves));
  const overallPct = overallTotal > 0 ? Math.round((overallDone / overallTotal) * 100) : 0;

  // ── 4. 필터 ────────────────────────────────────────────────────────
  const passes = (leaf: Leaf) =>
    filter === "all" ? true : filter === "filled" ? leaf.docs.length > 0 : leaf.docs.length === 0;
  // 필터별 표시할 기획서 — '완성'은 작성된 것만, '빈 항목'은 planned(작성예정)만
  const visibleDocs = (docs: DocMeta[]) =>
    filter === "all" ? docs : filter === "filled" ? docs.filter(isWritten) : docs.filter(d => !isWritten(d));
  // 전체 탭: 부모 expandedCats로 펼침 제어 / 필터 탭: 기본 펼침이되 collapsedInFilter로 개별 접기 허용
  const isOpen = (key: string) => filter === "all" ? expandedCats.has(key) : !collapsedInFilter.has(key);
  // +/- 토글 — 탭에 따라 알맞은 상태를 갱신 (필터 탭에서도 버튼이 동작하도록)
  const tog = (key: string) => {
    if (filter === "all") { toggleCat(key); return; }
    setCollapsedInFilter(prev => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key); else n.add(key);
      return n;
    });
  };
  const showUncategorized = filter !== "empty"; // '분류 안 됨'(소분류 지정 필요) 기획서는 '빈 항목' 필터에선 숨김

  // '전체' 필터에선 빈 중(소·기획서 없는 중)도 보이게 — 드롭 대상/구조 확인용
  const areaVisible = (a: AreaNode) => filter === "all" || a.subs.some(passes) || visibleDocs(a.directDocs).length > 0;
  const mainVisible = (m: MainNode) => filter === "all" || m.areas.some(areaVisible) || m.subs.some(passes) || visibleDocs(m.directDocs).length > 0;

  // ── 통합 DnD (순서변경 + 카테고리 이동) ───────────────────────────────
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );
  // 조회용 집합/맵 (현재 트리 기준)
  const docIdSet = new Set(versions.map(d => d.id));
  const subIdSet = new Set([...subLeafById.keys()]);
  const mainIdList = mains.map(m => m.id ?? "__none__");
  const mainIdSet = new Set(mainIdList);
  // 기획서 id → 같은 컨테이너의 정렬된 기획서 id 배열
  const docContainerByDoc = new Map<string, string[]>();
  const regDocs = (docs: DocMeta[]) => {
    const ids = groupSort(docs).map(d => d.id);
    for (const id of ids) docContainerByDoc.set(id, ids);
  };
  for (const m of mains) {
    regDocs(m.directDocs);
    for (const s of m.subs) regDocs(s.docs);
    for (const a of m.areas) { regDocs(a.directDocs); for (const s of a.subs) regDocs(s.docs); }
  }
  regDocs(uncategorized);
  // 기획서 id → 현재 소속 카테고리 (도착지가 다른 그룹이면 '이동'으로 판단)
  const docCategoryByDoc = new Map<string, { mainId: string | null; areaCode: string | null; subId: string | null }>();
  for (const m of mains) {
    for (const d of m.directDocs) docCategoryByDoc.set(d.id, { mainId: m.id, areaCode: null, subId: null });
    for (const s of m.subs) for (const d of s.docs) docCategoryByDoc.set(d.id, { mainId: m.id, areaCode: null, subId: s.id });
    for (const a of m.areas) {
      for (const d of a.directDocs) docCategoryByDoc.set(d.id, { mainId: m.id, areaCode: a.code, subId: null });
      for (const s of a.subs) for (const d of s.docs) docCategoryByDoc.set(d.id, { mainId: m.id, areaCode: a.code, subId: s.id });
    }
  }
  // 소 id → 같은 부모의 정렬된 소 id 배열
  const subGroupBySub = new Map<string, string[]>();
  const regSubs = (leaves: Leaf[]) => {
    const ids = sortByOverride(leaves, l => l.id, subOrderOverride).map(l => l.id);
    for (const id of ids) subGroupBySub.set(id, ids);
  };
  for (const m of mains) { regSubs(m.subs); for (const a of m.areas) regSubs(a.subs); }
  // 소 id → 소속(대/중)
  const subInfoById = new Map<string, { mainId: string | null; areaCode: string | null }>();
  for (const m of mains) {
    for (const s of m.subs) subInfoById.set(s.id, { mainId: m.id, areaCode: null });
    for (const a of m.areas) for (const s of a.subs) subInfoById.set(s.id, { mainId: m.id, areaCode: a.code });
  }

  // 기획서를 다른 카테고리로 이동 (드롭 시)
  async function moveDoc(docId: string, mainId: string | null, areaCode: string | null, subId: string | null) {
    try {
      await fetch("/api/design-docs/reclassify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "apply", assignments: [{ id: docId, main_id: mainId, area_code: areaCode, sub_id: subId }] }),
      });
      onMoved?.();
    } catch (err) {
      console.warn("[doc-move] 이동 저장 실패:", err);
    }
  }

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    // 1) 카테고리로 드롭 → 이동
    if (overId.startsWith("D:")) {
      if (!docIdSet.has(activeId)) return;
      const parts = overId.split(":"); // D:sub:<id> | D:main:<id> | D:area:<mainId>:<areaCode>
      if (parts[1] === "sub") {
        const info = subInfoById.get(parts[2]);
        if (info) void moveDoc(activeId, info.mainId, info.areaCode, parts[2]);
      } else if (parts[1] === "area") {
        // 중(area) 직속으로 이동 — 소는 null
        void moveDoc(activeId, parts[2] === "__none__" ? null : parts[2], parts[3] ?? null, null);
      } else if (parts[1] === "main") {
        void moveDoc(activeId, parts[2] === "__none__" ? null : parts[2], null, null);
      }
      return;
    }

    // 2) 기획서 위에 드롭
    if (docIdSet.has(activeId) && docIdSet.has(overId)) {
      const aCont = docContainerByDoc.get(activeId);
      const bCont = docContainerByDoc.get(overId);
      if (aCont && aCont === bCont) {
        // 같은 그룹 → 순서 변경
        persistReorder(arrayMove(aCont, aCont.indexOf(activeId), aCont.indexOf(overId)));
      } else {
        // 다른 그룹의 기획서 위 → 그 카테고리로 이동(포함)
        const cat = docCategoryByDoc.get(overId);
        if (cat) void moveDoc(activeId, cat.mainId, cat.areaCode, cat.subId);
      }
      return;
    }
    // 3) 소 순서 변경 (같은 부모 내)
    if (subIdSet.has(activeId) && subIdSet.has(overId)) {
      const grp = subGroupBySub.get(activeId);
      if (grp && grp.includes(overId)) {
        persistCategoryOrder("sub", arrayMove(grp, grp.indexOf(activeId), grp.indexOf(overId)));
      }
      return;
    }
    // 4) 대분류 순서 변경
    if (mainIdSet.has(activeId) && mainIdSet.has(overId)) {
      persistCategoryOrder("main", arrayMove(mainIdList, mainIdList.indexOf(activeId), mainIdList.indexOf(overId)));
    }
  };

  // ── 기획서 1개 렌더 (leaf 문서, rename 인라인 처리) ────────────────
  // handle 전달 시 왼쪽에 드래그 그립(⠿) 표시 (그룹 내 순서 변경용)
  // 드래그 그립(⠿) — handle 있을 때만. 클릭(탭)은 막아 토글/열기와 충돌 방지
  const grip = (handle?: DragHandle) => handle ? (
    <span
      {...handle.attributes}
      {...(handle.listeners ?? {})}
      title="드래그해서 순서 변경"
      className="cursor-grab active:cursor-grabbing flex-shrink-0 px-0.5 select-none"
      style={{ color: SILVER_DIM, touchAction: "none", fontSize: "12px", lineHeight: 1 }}
      onClick={(e) => e.stopPropagation()}
    >⠿</span>
  ) : null;

  const renderDocRow = (d: DocMeta, handle?: DragHandle) => {
    if (renamingDocId === d.id) {
      return (
        <div key={d.id} className="flex items-center gap-1">
          <input
            value={renameInput}
            onChange={(e) => setRenameInput(e.target.value)}
            onBlur={() => submitRename(d.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitRename(d.id);
              if (e.key === "Escape") cancelRename();
            }}
            className="flex-1 text-xs font-medium px-2 py-1.5 rounded outline-none"
            style={{ backgroundColor: "rgba(0,0,0,0.5)", border: "1px solid rgba(100,180,255,0.6)", color: "#e0e8f0" }}
            autoFocus
          />
        </div>
      );
    }
    // ── 작성 예정(planned) 기획서: 열기 대신 '✍️ 작성하기' 행 (빈 소에서 전환된 기획서) ──
    if (d.status === "planned") {
      return (
        <div key={d.id} className="flex items-center gap-1">
          {grip(handle)}
          <span
            className="flex-1 min-w-0 px-2 py-1.5 rounded flex items-center justify-between gap-1"
            style={{ backgroundColor: EMPTY_BG, border: `1px solid ${EMPTY_BORDER}`, color: EMPTY_TEXT, fontSize: "11.5px" }}
          >
            <span className="flex items-center gap-1 min-w-0">
              <span style={{ flexShrink: 0, fontSize: "8px" }}>▸</span>
              <span className="truncate font-medium" title={d.title}>{d.title}</span>
            </span>
            <button
              onClick={() => onStartWritingDoc?.(d.id, d.title)}
              title={`"${d.title}" 기획서 작성 — 조던이 질문을 시작해요`}
              className="text-[10px] px-2 py-0.5 rounded flex-shrink-0 font-bold whitespace-nowrap hover:brightness-110"
              style={{ backgroundColor: "rgba(255,170,80,0.9)", color: "#3a1d00" }}
            >✍️ 작성하기</button>
          </span>
          <button
            onClick={() => startRename(d.id, d.title)}
            title="이름 변경"
            className="text-xs px-1 py-1 rounded hover:bg-white/10 flex-shrink-0"
            style={{ color: SILVER_DIM }}
          >✏️</button>
          <button
            onClick={() => startCategorize(d)}
            title="카테고리 분류 — 다른 카테고리로 이동"
            className="text-xs px-1 py-1 rounded hover:bg-white/10 flex-shrink-0"
            style={{ color: SILVER_DIM }}
          >📂</button>
        </div>
      );
    }
    const active = d.id === currentDoc?.id;
    const isUnviewed = !viewedDocIds.has(d.id);
    return (
      <div key={d.id} className="flex items-center gap-1">
        {grip(handle)}
        <button
          onClick={() => onLoadDoc(d.id)}
          title={d.title}  // 이름이 길어 …으로 잘릴 때 마우스오버(PC)·롱프레스(모바일)로 풀네임 표시
          // min-w-0: 제목이 길어도 버튼을 밀어내지 않고 자기 영역 안에서 …으로 잘리도록
          className="flex-1 min-w-0 text-left text-xs px-2 py-1.5 rounded flex items-center gap-1.5 transition-colors"
          // 선택된 기획서: 파란 카테고리와 헷갈리지 않게 선명한 민트그린 + 왼쪽 강조바 + 글로우로 확실히 구분
          style={{
            backgroundColor: active ? "rgba(70,205,140,0.30)" : "transparent",
            border: active ? "1px solid rgba(110,235,175,0.95)" : "1px solid transparent",
            borderLeft: active ? "3px solid rgba(120,255,190,1)" : undefined,
            boxShadow: active ? "0 0 8px rgba(80,210,150,0.45)" : undefined,
            color: active ? "#c8ffe6" : "#d0d8e0",
            fontWeight: active ? 700 : undefined,
          }}
        >
          <span style={{ color: SILVER_DIM, fontSize: "9px", flexShrink: 0 }}>📄</span>
          <span className="truncate font-medium min-w-0">{d.title}</span>
          {isUnviewed && (
            <span
              className="w-2 h-2 rounded-full ml-auto flex-shrink-0 animate-pulse"
              title="아직 열어보지 않은 새 기획서"
              style={{ backgroundColor: "rgba(255,80,80,0.95)", boxShadow: "0 0 4px rgba(255,80,80,0.6)" }}
            />
          )}
        </button>
        <button
          onClick={() => startRename(d.id, d.title)}
          title="이름 변경"
          className="text-xs px-1 py-1 rounded hover:bg-white/10 flex-shrink-0"
          style={{ color: SILVER_DIM }}
        >✏️</button>
        {/* 분류 버튼 — 분류 여부와 무관하게 동일한 기본 📂 아이콘 */}
        <button
          onClick={() => startCategorize(d)}
          title="카테고리 분류 — 다른 카테고리로 이동"
          className="text-xs px-1 py-1 rounded hover:bg-white/10 flex-shrink-0"
          style={{ color: SILVER_DIM }}
        >📂</button>
      </div>
    );
  };

  // ── 소분류(leaf) 렌더 ─────────────────────────────────────────────
  const renderLeaf = (leaf: Leaf, parentKey: string, handle?: DragHandle) => {
    const key = `${parentKey}::${leaf.id}`;
    const empty = leaf.docs.length === 0;
    // ── 빈 소분류: 토글 대신 '작성하기' 버튼 행 (button 중첩 방지 위해 div로) ──
    if (empty) {
      return (
        <CatDroppable key={key} id={`D:sub:${leaf.id}`}>
        <div
          className="w-full px-2 py-1 rounded flex items-center justify-between gap-1"
          style={{ backgroundColor: EMPTY_BG, border: `1px solid ${EMPTY_BORDER}`, color: EMPTY_TEXT, fontSize: "11.5px" }}
        >
          <span className="flex items-center gap-1 min-w-0">
            {grip(handle)}
            <span style={{ flexShrink: 0, fontSize: "8px" }}>▸</span>
            <span className="truncate font-medium" title={leaf.label}>{leaf.label}</span>
          </span>
          <button
            onClick={() => onStartWriting?.(leaf.id, leaf.label)}
            title={`"${leaf.label}" 기획서 작성 — 조던이 질문을 시작해요`}
            className="text-[10px] px-2 py-0.5 rounded flex-shrink-0 font-bold whitespace-nowrap hover:brightness-110"
            style={{ backgroundColor: "rgba(255,170,80,0.9)", color: "#3a1d00" }}
          >✍️ 작성하기</button>
        </div>
        </CatDroppable>
      );
    }
    // ── 채워진 소분류: 펼치면 기획서 목록 ──
    const open = isOpen(key);
    return (
      <CatDroppable key={key} id={`D:sub:${leaf.id}`}>
      <div>
        <div className="flex items-center gap-1">
          {grip(handle)}
          <button
            onClick={() => tog(key)}
            className="flex-1 min-w-0 text-left px-2 py-1 rounded flex items-center justify-between font-medium transition-colors hover:bg-white/5"
            style={{ color: SUB_COLOR, fontSize: "11.5px" }}
          >
          <span className="flex items-center gap-1 min-w-0">
            <span style={{ flexShrink: 0, fontSize: "8px" }}>▸</span>
            <span className="truncate" title={leaf.label}>{leaf.label}</span>
          </span>
          <span className="flex items-center gap-1 flex-shrink-0">
            <span className="text-[9px]">{leaf.docs.length}</span>
            <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded text-xs leading-none">
              {open ? "−" : "+"}
            </span>
          </span>
          </button>
        </div>
        {open && (
          <div className="mt-0.5 flex flex-col gap-0.5 ml-2">
            <SortableZone items={groupSort(leaf.docs)} getId={(d) => d.id} renderItem={(d, h) => renderDocRow(d, h)} onReorder={persistReorder} enabled />
          </div>
        )}
      </div>
      </CatDroppable>
    );
  };

  // ── 카운트 배지 (채움/전체) ───────────────────────────────────────
  // 기획서 개수 기준 카운트 (대/중 옆 배지) — 소분류 폴더 수가 아니라 실제 최하위 기획서 개수
  // 완성된 기획서 / 총 기획서 (%) 배지 (기획서 단위)
  const progressBadge = (done: number, total: number) => {
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return (
      <span className="text-[10px] flex-shrink-0" style={{ color: done < total ? "rgba(255,180,120,0.9)" : "rgba(120,230,170,0.9)", fontWeight: 600 }}>
        {done}/{total} ({pct}%)
      </span>
    );
  };

  // 소분류 그룹 렌더 — 드래그 정렬(전체 필터에서만) 가능
  const renderSubGroup = (leaves: Leaf[], parentKey: string) => (
    <SortableZone
      items={sortByOverride(leaves.filter(passes), (l) => l.id, subOrderOverride)}
      getId={(l) => l.id}
      renderItem={(leaf, h) => renderLeaf(leaf, parentKey, h)}
      onReorder={(ids) => persistCategoryOrder("sub", ids)}
      enabled={catDnd}
    />
  );

  // ── 대카테고리(main) 블록 렌더 ────────────────────────────────────
  const renderMainBlock = (main: MainNode, handle?: DragHandle) => {
    const mainKey = main.id ?? "__none__";
    const mainOpen = isOpen(mainKey);
    return (
      <div key={mainKey} className="mb-2">
        <CatDroppable id={`D:main:${mainKey}`}>
        <div className="flex items-center gap-1">
          {grip(handle)}
          <button
            onClick={() => tog(mainKey)}
            className="flex-1 min-w-0 text-left px-2 py-2 rounded flex items-center justify-between font-bold transition-colors hover:bg-white/5"
            style={{ color: MAIN_COLOR, fontSize: "15px" }}
          >
            <span className="flex items-center gap-1.5 min-w-0">
              <span style={{ flexShrink: 0 }}>{main.icon}</span>
              <span className="truncate" title={main.label}>{main.label}</span>
            </span>
            <span className="flex items-center gap-1.5 flex-shrink-0">
              {progressBadge(mainWrittenCount(main), mainDocCount(main) + emptyLeafCount(mainLeaves(main)))}
              <span className="inline-flex items-center justify-center w-4 h-4 rounded text-sm leading-none" style={{ color: SILVER_DIM }}>
                {mainOpen ? "−" : "+"}
              </span>
            </span>
          </button>
        </div>
        </CatDroppable>

        {mainOpen && (
          <div className="mt-1 flex flex-col gap-1">
            {/* 대분류 직속 기획서 (소 없이 대분류에 바로 붙은 기획서) */}
            {visibleDocs(main.directDocs).length > 0 && (
              <div className="flex flex-col gap-0.5 pl-2">
                <SortableZone items={groupSort(visibleDocs(main.directDocs))} getId={(d) => d.id} renderItem={(d, h) => renderDocRow(d, h)} onReorder={persistReorder} enabled />
              </div>
            )}
            {/* 대 직속 소분류 (영역 없는 대카테고리) — 드래그 정렬 */}
            {main.subs.filter(passes).length > 0 && (
              <div className="flex flex-col gap-0.5 pl-2">
                {renderSubGroup(main.subs, mainKey)}
              </div>
            )}
            {/* 중카테고리(영역) — area는 코드순(A·B·C) 고정, 드래그 대상 아님 */}
            {main.areas.filter(areaVisible).map(area => {
              const areaKey = `${mainKey}::${area.code}`;
              const areaOpen = isOpen(areaKey);
              return (
                <div key={areaKey} className="ml-2">
                  <CatDroppable id={`D:area:${mainKey}:${area.code}`}>
                  <button
                    onClick={() => tog(areaKey)}
                    className="w-full text-left px-2 py-1.5 rounded flex items-center justify-between font-semibold transition-colors hover:bg-white/5"
                    style={{ color: AREA_COLOR, fontSize: "13px" }}
                  >
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span style={{ flexShrink: 0, fontSize: "10px" }}>📂</span>
                      <span className="truncate" title={area.label}>{area.label}</span>
                    </span>
                    <span className="flex items-center gap-1.5 flex-shrink-0">
                      {progressBadge(areaWrittenCount(area), areaDocCount(area) + emptyLeafCount(area.subs))}
                      <span className="inline-flex items-center justify-center w-4 h-4 rounded text-sm leading-none" style={{ color: SILVER_DIM }}>
                        {areaOpen ? "−" : "+"}
                      </span>
                    </span>
                  </button>
                  </CatDroppable>
                  {areaOpen && (
                    <div className="mt-1 ml-2 flex flex-col gap-1">
                      {/* 중(area) 직속 기획서 — 소 없이 중에 바로 붙은 기획서 */}
                      {visibleDocs(area.directDocs).length > 0 && (
                        <div className="flex flex-col gap-0.5 pl-2">
                          <SortableZone items={groupSort(visibleDocs(area.directDocs))} getId={(d) => d.id} renderItem={(d, h) => renderDocRow(d, h)} onReorder={persistReorder} enabled />
                        </div>
                      )}
                      {renderSubGroup(area.subs, areaKey)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className="absolute inset-0 flex flex-col z-10"
      style={{ backgroundColor: "#0a0e1a", borderRight: `1px solid ${SILVER_FAINT}` }}
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between px-3 py-2.5 flex-shrink-0 gap-2" style={{ borderBottom: `1px solid ${SILVER_FAINT}` }}>
        <p className="text-xs font-bold flex-1 min-w-0" style={{ color: "rgba(180,210,255,1)" }}>📚 기획서 리스트</p>
        <button
          onClick={onOpenCategoryManager}
          title="카테고리 관리 — 대/중/소 카테고리 추가·수정·삭제"
          className="flex items-center justify-center w-7 h-7 rounded flex-shrink-0"
          style={{ backgroundColor: "rgba(255,200,100,0.15)", border: "1px solid rgba(255,200,100,0.4)", color: "rgba(255,220,150,1)" }}
        >
          {/* 톱니바퀴 — 인라인 SVG(폰트 폴백 영향 없이 정중앙 정렬). 이모지 ⚙️는 Twemoji 서브셋 누락으로 어긋남 */}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
          </svg>
        </button>
      </div>

      {/* 🔍 기획서 검색 (제목+본문) */}
      <div className="px-3 py-2 flex-shrink-0" style={{ borderBottom: `1px solid ${SILVER_FAINT}` }}>
        <div className="relative">
          <input
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="🔍 기획서 검색 (제목·내용)"
            className="w-full text-[12px] pl-3 pr-7 py-1.5 rounded-lg outline-none"
            style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${SILVER_FAINT}`, color: "#e0e8f0" }}
          />
          {searchQ && (
            <button onClick={() => setSearchQ("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-xs px-1" style={{ color: SILVER_DIM }}>✕</button>
          )}
        </div>
      </div>

      {/* 검색 결과 (검색어 있을 때만 — 진행률/트리 대신 표시) */}
      {searchQ.trim() && (
        <div className="flex-1 overflow-y-auto px-2 py-2" style={{ scrollbarWidth: "thin" }}>
          {searching ? (
            <p className="text-xs text-center mt-6" style={{ color: SILVER_DIM }}>검색 중…</p>
          ) : searchResults.length === 0 ? (
            <p className="text-xs text-center mt-6" style={{ color: SILVER_DIM }}>“{searchQ.trim()}” 검색 결과가 없어요</p>
          ) : (
            <>
              <p className="text-[11px] px-1 mb-1.5" style={{ color: SILVER_DIM }}>결과 {searchResults.length}개</p>
              {searchResults.map(r => (
                <button key={r.id}
                  onClick={() => { onLoadDoc(r.id); setSearchQ(""); }}
                  className="block w-full text-left px-2.5 py-2 rounded-lg mb-1 hover:bg-white/5"
                  style={{ border: `1px solid ${SILVER_FAINT}` }}>
                  <span className="text-[12px] font-bold block truncate" style={{ color: r.id === currentDoc?.id ? "rgba(180,210,255,1)" : SILVER }}>
                    {r.inTitle ? "📄 " : "📝 "}{r.title}
                  </span>
                  {r.snippet && <span className="text-[10px] block mt-0.5 line-clamp-2" style={{ color: SILVER_DIM }}>{r.snippet}</span>}
                </button>
              ))}
            </>
          )}
        </div>
      )}

      {/* 전체 진행률 */}
      <div className="px-3 py-2 flex-shrink-0" style={{ borderBottom: `1px solid ${SILVER_FAINT}`, display: searchQ.trim() ? "none" : undefined }}>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px]" style={{ color: SILVER_DIM }}>전체 채움</span>
          <span className="text-[11px] font-bold" style={{ color: "rgba(180,210,255,1)" }}>
            {overallDone}/{overallTotal} ({overallPct}%)
          </span>
        </div>
        <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.08)" }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${overallPct}%`, backgroundColor: "rgba(100,220,160,0.9)" }} />
        </div>
        {/* 필터 — 전체 / 완성 / 빈 항목 */}
        <div className="flex gap-1 mt-2">
          {([["all", "전체"], ["filled", "완성"], ["empty", "빈 항목"]] as [FilterMode, string][]).map(([mode, label]) => {
            const on = filter === mode;
            return (
              <button
                key={mode}
                onClick={() => setFilter(mode)}
                className="flex-1 text-[11px] py-1 rounded transition-colors"
                style={{
                  backgroundColor: on ? "rgba(100,180,255,0.25)" : "rgba(255,255,255,0.04)",
                  border: on ? "1px solid rgba(100,180,255,0.6)" : `1px solid ${SILVER_FAINT}`,
                  color: on ? "rgba(180,210,255,1)" : SILVER_DIM,
                  fontWeight: on ? 700 : 400,
                }}
              >{label}</button>
            );
          })}
        </div>
      </div>

      {/* 트리 */}
      <div className="flex-1 overflow-y-auto px-2 py-2" style={{ scrollbarWidth: "thin", scrollbarColor: `${SILVER_DIM} transparent`, display: searchQ.trim() ? "none" : undefined }}>
        {mains.length === 0 && (
          <p className="text-xs text-center mt-6" style={{ color: SILVER_DIM }}>카테고리가 없어요</p>
        )}
        <DndContext
          sensors={dndSensors}
          collisionDetection={(args) => {
            const activeId = String(args.active.id);
            const hits = pointerWithin(args);
            const list = hits.length ? hits : rectIntersection(args);
            if (docIdSet.has(activeId)) {
              // 기획서를 끌 때: 기획서 위면 그걸(같은그룹=순서변경 / 다른그룹=이동), 없으면 카테고리(빈 칸)
              const docHit = list.find(h => docIdSet.has(String(h.id)) && String(h.id) !== activeId);
              if (docHit) return [docHit];
              const catHit = list.find(h => String(h.id).startsWith("D:"));
              return catHit ? [catHit] : [];
            }
            // 소·대분류를 끌 때: 같은 종류 항목만(순서변경), 카테고리 드롭영역은 무시
            const sortHit = list.find(h => !String(h.id).startsWith("D:") && String(h.id) !== activeId);
            return sortHit ? [sortHit] : [];
          }}
          onDragEnd={handleDragEnd}
        >
        <SortableZone
          items={sortByOverride(mains, (m) => m.id ?? "__none__", mainOrderOverride).filter(mainVisible)}
          getId={(m) => m.id ?? "__none__"}
          renderItem={(main, h) => renderMainBlock(main, h)}
          onReorder={(ids) => persistCategoryOrder("main", ids)}
          enabled={catDnd}
        />

        {/* 분류 안 됨 — 소분류가 지정 안 됐거나 삭제된 소분류를 참조하는 기획서 (빈 항목 필터에선 숨김) */}
        {showUncategorized && uncategorized.length > 0 && (
          <div className="mb-2">
            <button
              onClick={() => tog("__none__")}
              className="w-full text-left px-2 py-2 rounded flex items-center justify-between font-bold transition-colors hover:bg-white/5"
              style={{ color: "rgba(255,180,120,1)", fontSize: "15px" }}
            >
              <span className="flex items-center gap-1.5 min-w-0">
                <span style={{ flexShrink: 0 }}>📁</span>
                <span className="truncate">분류 안 됨</span>
              </span>
              <span className="flex items-center gap-1.5 flex-shrink-0">
                <span className="text-[10px]" style={{ color: SILVER_DIM, fontWeight: 600 }}>{uncategorized.length}</span>
                <span className="inline-flex items-center justify-center w-4 h-4 rounded text-sm leading-none" style={{ color: SILVER_DIM }}>
                  {isOpen("__none__") ? "−" : "+"}
                </span>
              </span>
            </button>
            {isOpen("__none__") && (
              <div className="mt-1 flex flex-col gap-0.5 pl-2">
                <SortableZone items={groupSort(uncategorized)} getId={(d) => d.id} renderItem={(d, h) => renderDocRow(d, h)} onReorder={persistReorder} enabled />
              </div>
            )}
          </div>
        )}
        </DndContext>
      </div>
    </div>
  );
}

"use client";

// 기획서 리스트 트리 — 좌측 사이드바 오버레이로 표시
// 대(Main) > 중(Area) > 소(Sub) > 기획서(leaf) 4단계 그룹핑
// DocumentView에서 추출 (1000+줄 파일 분리)

import type { DocMeta, DocFull, CategoryMainItem } from "./DocumentView";

const SILVER = "#c0c8d8";
const SILVER_DIM = "rgba(192,200,216,0.5)";
const SILVER_FAINT = "rgba(192,200,216,0.15)";

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
  onLoadDoc,
  onOpenCategoryManager,
  onClose,
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
  onLoadDoc: (id: string) => void;
  onOpenCategoryManager: () => void;
  onClose: () => void;
}) {
  // 트리 구조 빌드
  type MainNode = {
    key: string; mainId: string | null; label: string; icon: string;
    areas: Map<string, AreaNode>;
    directDocs: DocMeta[];
  };
  type AreaNode = {
    key: string; code: string; label: string;
    subs: Map<string, SubNode>;
    directDocs: DocMeta[];
  };
  type SubNode = {
    key: string; subId: string; label: string;
    docs: DocMeta[];
  };

  const tree = new Map<string, MainNode>();
  const NONE_KEY = "__none__";

  function ensureMain(mainId: string | null): MainNode {
    const key = mainId ?? NONE_KEY;
    if (!tree.has(key)) {
      const main = mainId ? categories.find(m => m.id === mainId) ?? null : null;
      tree.set(key, {
        key, mainId,
        label: main ? main.name_ko : "분류 안 됨",
        icon: main?.icon ?? "📂",
        areas: new Map(),
        directDocs: [],
      });
    }
    return tree.get(key)!;
  }
  function ensureArea(main: MainNode, areaCode: string): AreaNode {
    if (!main.areas.has(areaCode)) {
      const mainObj = categories.find(m => m.id === main.mainId);
      const areaName = mainObj?.areas?.find(a => a.code === areaCode)?.name ?? areaCode;
      main.areas.set(areaCode, { key: `${main.key}::${areaCode}`, code: areaCode, label: areaName, subs: new Map(), directDocs: [] });
    }
    return main.areas.get(areaCode)!;
  }
  function ensureSub(area: AreaNode, subId: string, mainId: string | null, areaCode: string): SubNode {
    if (!area.subs.has(subId)) {
      const mainObj = mainId ? categories.find(m => m.id === mainId) : null;
      let subName = subId;
      if (mainObj) {
        const subItem = mainObj.areas?.find(a => a.code === areaCode)?.sub_categories.find(s => s.id === subId)
          ?? mainObj.sub_categories?.find(s => s.id === subId);
        if (subItem) subName = subItem.name_ko;
      }
      area.subs.set(subId, { key: `${area.key}::${subId}`, subId, label: subName, docs: [] });
    }
    return area.subs.get(subId)!;
  }

  for (const d of versions) {
    const main = ensureMain(d.category_main_id);
    if (d.category_area_code) {
      const area = ensureArea(main, d.category_area_code);
      if (d.category_sub_id) {
        const sub = ensureSub(area, d.category_sub_id, d.category_main_id, d.category_area_code);
        sub.docs.push(d);
      } else {
        area.directDocs.push(d);
      }
    } else {
      main.directDocs.push(d);
    }
  }

  const mainArr = Array.from(tree.values()).sort((a, b) => {
    if (a.key === NONE_KEY) return 1;
    if (b.key === NONE_KEY) return -1;
    return a.label.localeCompare(b.label, "ko");
  });

  const STYLE = {
    MAIN_BG: "rgba(100,180,255,0.18)",
    MAIN_BORDER: "rgba(100,180,255,0.45)",
    AREA_BG: "rgba(100,180,255,0.08)",
    AREA_BORDER: "rgba(100,180,255,0.25)",
    SUB_BG: "rgba(255,255,255,0.03)",
    SUB_BORDER: "rgba(192,200,216,0.20)",
  };

  // 기획서 1개 렌더 (leaf, rename 인라인 처리)
  const renderDoc = (d: DocMeta, depth: number) => {
    if (renamingDocId === d.id) {
      return (
        <div key={d.id} className="flex items-center gap-1" style={{ paddingLeft: `${depth * 12}px` }}>
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
    const active = d.id === currentDoc?.id;
    const isUnviewed = !viewedDocIds.has(d.id);
    return (
      <div key={d.id} className="flex items-center gap-1" style={{ paddingLeft: `${depth * 12}px` }}>
        <button
          onClick={() => onLoadDoc(d.id)}
          // min-w-0: 제목이 길어도 버튼을 밀어내지 않고 자기 영역 안에서 …으로 잘리도록
          className="flex-1 min-w-0 text-left text-xs px-2 py-1.5 rounded flex items-center gap-1.5 transition-colors"
          style={{
            backgroundColor: active ? "rgba(100,180,255,0.25)" : "transparent",
            border: active ? "1px solid rgba(100,180,255,0.6)" : "1px solid transparent",
            color: active ? "rgba(180,210,255,1)" : "#d0d8e0",
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
        {/* 분류 안 된 기획서는 강조된 '📂 분류' 버튼으로 이동을 유도, 이미 분류된 건 아이콘만 */}
        {!d.category_main_id ? (
          <button
            onClick={() => startCategorize(d)}
            title="카테고리로 이동 — 이 기획서를 분류하기"
            className="text-[10px] px-1.5 py-1 rounded flex-shrink-0 font-bold hover:brightness-110 whitespace-nowrap"
            style={{ backgroundColor: "rgba(255,200,100,0.18)", border: "1px solid rgba(255,200,100,0.5)", color: "rgba(255,220,150,1)" }}
          >📂 분류</button>
        ) : (
          <button
            onClick={() => startCategorize(d)}
            title="카테고리 분류 변경 — 다른 카테고리로 이동"
            className="text-xs px-1 py-1 rounded hover:bg-white/10 flex-shrink-0"
            style={{ color: SILVER_DIM }}
          >📂</button>
        )}
      </div>
    );
  };

  return (
    <div
      className="absolute inset-0 flex flex-col z-10"
      style={{ backgroundColor: "#0a0e1a", borderRight: `1px solid ${SILVER_FAINT}` }}
    >
      {/* 오버레이 헤더 — ✕ 제거, 기획서 선택 시 자동으로 목차로 전환 */}
      <div className="flex items-center justify-between px-3 py-2.5 flex-shrink-0 gap-2" style={{ borderBottom: `1px solid ${SILVER_FAINT}` }}>
        <p className="text-xs font-bold flex-1 min-w-0" style={{ color: "rgba(180,210,255,1)" }}>📚 기획서 리스트</p>
        <button
          onClick={onOpenCategoryManager}
          title="카테고리 관리 — 대/중/소 카테고리 추가·수정·삭제"
          className="flex items-center justify-center w-7 h-7 rounded flex-shrink-0"
          style={{
            backgroundColor: "rgba(255,200,100,0.15)",
            border: "1px solid rgba(255,200,100,0.4)",
            color: "rgba(255,220,150,1)",
            fontSize: "13px",
          }}
        >⚙️</button>
      </div>

      {/* 트리 */}
      <div className="flex-1 overflow-y-auto px-2 py-2" style={{ scrollbarWidth: "thin", scrollbarColor: `${SILVER_DIM} transparent` }}>
        {versions.length === 0 && (
          <p className="text-xs text-center mt-6" style={{ color: SILVER_DIM }}>
            생성된 기획서가 없어요
          </p>
        )}
        {mainArr.map(main => {
          const mainOpen = expandedCats.has(main.key);
          const mainTotalDocs =
            main.directDocs.length +
            Array.from(main.areas.values()).reduce((s, a) =>
              s + a.directDocs.length + Array.from(a.subs.values()).reduce((ss, sub) => ss + sub.docs.length, 0),
            0);

          return (
            <div key={main.key} className="mb-2">
              <button
                onClick={() => toggleCat(main.key)}
                className="w-full text-left px-3 py-2 rounded-md flex items-center justify-between font-bold transition-colors"
                style={{
                  backgroundColor: STYLE.MAIN_BG,
                  border: `1px solid ${STYLE.MAIN_BORDER}`,
                  color: SILVER,
                  fontSize: "13px",
                }}
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  <span style={{ flexShrink: 0 }}>{main.icon}</span>
                  <span className="truncate">{main.label}</span>
                </span>
                <span className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="text-[10px]" style={{ color: SILVER_DIM, fontWeight: 500 }}>{mainTotalDocs}</span>
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded text-sm leading-none" style={{ color: SILVER_DIM }}>
                    {mainOpen ? "−" : "+"}
                  </span>
                </span>
              </button>

              {mainOpen && (
                <div className="mt-1 flex flex-col gap-1">
                  {main.directDocs.length > 0 && (
                    <div className="flex flex-col gap-0.5 pl-2">
                      {main.directDocs.map(d => renderDoc(d, 0))}
                    </div>
                  )}
                  {Array.from(main.areas.values())
                    .sort((a, b) => a.label.localeCompare(b.label, "ko"))
                    .map(area => {
                      const areaOpen = expandedCats.has(area.key);
                      const areaTotal = area.directDocs.length + Array.from(area.subs.values()).reduce((s, sub) => s + sub.docs.length, 0);
                      return (
                        <div key={area.key} className="ml-2">
                          <button
                            onClick={() => toggleCat(area.key)}
                            className="w-full text-left px-2.5 py-1.5 rounded flex items-center justify-between font-semibold transition-colors"
                            style={{
                              backgroundColor: STYLE.AREA_BG,
                              border: `1px solid ${STYLE.AREA_BORDER}`,
                              color: "rgba(220,228,240,1)",
                              fontSize: "12px",
                            }}
                          >
                            <span className="flex items-center gap-1.5 min-w-0">
                              <span style={{ flexShrink: 0, fontSize: "10px" }}>📂</span>
                              <span className="truncate">{area.label}</span>
                            </span>
                            <span className="flex items-center gap-1.5 flex-shrink-0">
                              <span className="text-[10px]" style={{ color: SILVER_DIM }}>{areaTotal}</span>
                              <span className="inline-flex items-center justify-center w-4 h-4 rounded text-sm leading-none" style={{ color: SILVER_DIM }}>
                                {areaOpen ? "−" : "+"}
                              </span>
                            </span>
                          </button>

                          {areaOpen && (
                            <div className="mt-1 ml-2 flex flex-col gap-1">
                              {area.directDocs.length > 0 && (
                                <div className="flex flex-col gap-0.5">
                                  {area.directDocs.map(d => renderDoc(d, 0))}
                                </div>
                              )}
                              {Array.from(area.subs.values())
                                .sort((a, b) => a.label.localeCompare(b.label, "ko"))
                                .map(sub => {
                                  const subOpen = expandedCats.has(sub.key);
                                  return (
                                    <div key={sub.key}>
                                      <button
                                        onClick={() => toggleCat(sub.key)}
                                        className="w-full text-left px-2 py-1 rounded flex items-center justify-between transition-colors"
                                        style={{
                                          backgroundColor: STYLE.SUB_BG,
                                          borderLeft: `2px solid ${STYLE.SUB_BORDER}`,
                                          color: SILVER_DIM,
                                          fontSize: "11px",
                                        }}
                                      >
                                        <span className="flex items-center gap-1 min-w-0">
                                          <span style={{ flexShrink: 0, fontSize: "8px" }}>▸</span>
                                          <span className="truncate">{sub.label}</span>
                                        </span>
                                        <span className="flex items-center gap-1 flex-shrink-0">
                                          <span className="text-[9px]">{sub.docs.length}</span>
                                          <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded text-xs leading-none">
                                            {subOpen ? "−" : "+"}
                                          </span>
                                        </span>
                                      </button>
                                      {subOpen && (
                                        <div className="mt-0.5 flex flex-col gap-0.5 ml-2">
                                          {sub.docs.map(d => renderDoc(d, 0))}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

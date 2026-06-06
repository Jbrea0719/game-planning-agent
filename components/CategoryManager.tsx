"use client";

// 카테고리 관리 모달 — 대/중/소 카테고리 전체 CRUD
// DocumentView의 톱니바퀴 버튼으로 열림

import { useEffect, useState, useCallback } from "react";

const SILVER = "#c0c8d8";
const SILVER_DIM = "rgba(192,200,216,0.5)";
const SILVER_FAINT = "rgba(192,200,216,0.15)";

interface SubItem {
  id: string;
  name_ko: string;
  area_code: string | null;
  area_name: string | null;
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

export default function CategoryManager({
  open,
  onClose,
  onChanged,
  onOrphaned,
  onOrphanedDocs,
}: {
  open: boolean;
  onClose: () => void;
  onChanged: () => void;   // 변경 발생 시 호출 (외부에서 카테고리 다시 로드)
  onOrphaned?: (decisionIds: string[]) => void;  // 소카테고리 삭제로 미분류된 결정사항 id (AI 재분류 검토용)
  onOrphanedDocs?: (docIds: string[]) => void;   // 소카테고리 삭제로 미분류된 기획서 id (AI 재분류 검토용)
}) {
  const [mains, setMains] = useState<MainItem[]>([]);
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
    | null
  >(null);
  const [addText, setAddText] = useState("");
  const [addExtra, setAddExtra] = useState("");  // sub 추가 시 area 추가용

  // ── 데이터 로드 ────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
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
  }, []);

  useEffect(() => { if (open) void load(); }, [open, load]);
  // 모달이 닫히면 편집/추가 진행 상태를 모두 초기화 (다시 열 때 "이름 변경 중"이 남지 않도록)
  useEffect(() => {
    if (!open) {
      setEditing(null);
      setEditText("");
      setAdding(null);
      setAddText("");
      setAddExtra("");
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
  async function createArea(mainId: string, areaName: string, firstSubName: string) {
    if (!areaName.trim() || !firstSubName.trim()) return;
    // 영역 자체는 가상이므로 첫 sub와 함께 생성. area_code는 슬러그
    const code = areaName.toLowerCase().replace(/[^a-z0-9가-힣]/g, "_").slice(0, 30) || `area_${Date.now()}`;
    await createSub(mainId, code, areaName.trim(), firstSubName);
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
              대(📁) → 중(📂) → 소(•) 3단계 분류. 기획 바이블과 공유돼요.
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

          {mains.map(m => (
            <div key={m.id} className="mb-4 rounded-lg" style={{ border: `1px solid ${SILVER_FAINT}` }}>
              {/* 대카테고리 헤더 */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-t-lg" style={{ backgroundColor: "rgba(192,200,216,0.08)" }}>
                <span style={{ fontSize: "14px" }}>{m.icon ?? "📁"}</span>
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
                  style={{ backgroundColor: "rgba(100,180,255,0.18)", border: "1px solid rgba(100,180,255,0.4)", color: "rgba(180,210,255,1)" }}
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

                      {/* 소카테고리 리스트 */}
                      <div className={`${a.code ? "pl-6 pr-2 pb-2" : "px-2 py-1"} flex flex-col gap-0.5`}>
                        {a.subs.map(s => (
                          <div key={s.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-white/5">
                            <span style={{ color: SILVER_DIM, fontSize: "10px" }}>•</span>
                            {editing?.type === "sub" && editing.key === s.id ? (
                              <input
                                value={editText}
                                onChange={(e) => setEditText(e.target.value)}
                                onBlur={() => { void renameSub(s.id, editText); cancelEdit(); }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") { void renameSub(s.id, editText); cancelEdit(); }
                                  if (e.key === "Escape") cancelEdit();
                                }}
                                className="flex-1 text-xs px-1.5 py-0.5 rounded outline-none"
                                style={{ backgroundColor: "rgba(0,0,0,0.4)", border: "1px solid rgba(100,180,255,0.5)", color: "#e0e8f0" }}
                                autoFocus
                              />
                            ) : (
                              <span className="flex-1 text-xs" style={{ color: "#b8c4d4" }}>{s.name_ko}</span>
                            )}
                            <button
                              onClick={() => startEdit("sub", s.id, s.name_ko)}
                              className="text-xs px-1 py-0.5 rounded hover:bg-white/10"
                              style={{ color: SILVER_DIM }}
                            >✏️</button>
                            <button
                              onClick={() => deleteSub(s.id, s.name_ko)}
                              className="text-xs px-1 py-0.5 rounded hover:bg-white/10"
                              style={{ color: "rgba(255,180,180,0.7)" }}
                            >🗑️</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

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
              </p>
              {adding.type === "area" && (
                <p className="text-xs" style={{ color: SILVER_DIM }}>
                  영역은 첫 소카테고리와 함께 생성돼요. 영역명 + 첫 소카테고리명 입력.
                </p>
              )}
              <input
                value={addText}
                onChange={(e) => setAddText(e.target.value)}
                placeholder={
                  adding.type === "main" ? "예: 라이브 운영"
                    : adding.type === "area" ? "영역 이름 (예: 영웅, PVE)"
                    : "소카테고리 이름 (예: 영웅 등급)"
                }
                className="px-3 py-2 rounded-lg text-sm outline-none"
                style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${SILVER_FAINT}`, color: "#e0e8f0" }}
                autoFocus
              />
              {adding.type === "area" && (
                <input
                  value={addExtra}
                  onChange={(e) => setAddExtra(e.target.value)}
                  placeholder="첫 소카테고리 이름 (필수)"
                  className="px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${SILVER_FAINT}`, color: "#e0e8f0" }}
                />
              )}
              <div className="flex gap-2 justify-end mt-1">
                <button
                  onClick={() => { setAdding(null); setAddText(""); setAddExtra(""); }}
                  className="text-xs px-4 py-2 rounded-lg"
                  style={{ backgroundColor: SILVER_FAINT, color: SILVER }}
                >취소</button>
                <button
                  disabled={busy || !addText.trim() || (adding.type === "area" && !addExtra.trim())}
                  onClick={async () => {
                    if (adding.type === "main") await createMain(addText);
                    else if (adding.type === "sub") await createSub(adding.mainId, adding.areaCode, adding.areaName, addText);
                    else if (adding.type === "area") await createArea(adding.mainId, addText, addExtra);
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

"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import ReactMarkdown from "react-markdown";

const SILVER = "#c0c8d8";
const SILVER_DIM = "rgba(192,200,216,0.5)";
const SILVER_FAINT = "rgba(192,200,216,0.15)";

interface DocMeta {
  id: string;
  version_no: number;
  title: string;
  status: string;
  changes_summary: string | null;
  created_at: string;
  created_by_nickname: string | null;
}

interface DocFull extends DocMeta {
  content_markdown: string;
  archived_at: string | null;
}

interface TocItem {
  level: number;     // 1, 2, 3
  text: string;
  id: string;        // anchor ID
}

export default function DocumentView({
  open,
  onClose,
  projectId,
  nickname,
  reloadKey,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  nickname: string;
  reloadKey?: number;  // 외부에서 새 기획서 생성 시 갱신용
}) {
  const [versions, setVersions] = useState<DocMeta[]>([]);
  const [currentDoc, setCurrentDoc] = useState<DocFull | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [showExportMenu, setShowExportMenu] = useState(false);
  // 수정 요청 모달 상태
  const [showReviseModal, setShowReviseModal] = useState(false);
  const [reviseInstruction, setReviseInstruction] = useState("");
  const [revising, setRevising] = useState(false);
  // 기획서 리스트 오버레이 패널 + 카테고리 펼침 상태
  const [showDocList, setShowDocList] = useState(false);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set(["chat", "revision", "decision", "other"]));
  const bodyRef = useRef<HTMLDivElement>(null);

  // ── 버전 목록 로드 ────────────────────────────────────────────────
  const loadVersions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/design-docs?project_id=${projectId}`);
      const data = await res.json();
      const list = (data.docs ?? []) as DocMeta[];
      setVersions(list);
      // 최신 버전 자동 선택
      if (list.length > 0 && !currentDoc) {
        await loadDoc(list[0].id);
      }
    } catch (err) {
      console.error("[doc-view] 버전 로드 실패:", err);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // ── 단건 본문 로드 ────────────────────────────────────────────────
  async function loadDoc(id: string) {
    try {
      const res = await fetch(`/api/design-docs/${id}`);
      const data = await res.json();
      if (data.doc) setCurrentDoc(data.doc as DocFull);
    } catch (err) {
      console.error("[doc-view] 단건 로드 실패:", err);
    }
  }

  // 마운트·열림·reloadKey 변경 시 갱신
  useEffect(() => { if (open) void loadVersions(); }, [open, loadVersions]);
  useEffect(() => {
    // reloadKey 변경 시: 버전 목록 새로 받고, 가장 최신을 선택
    if (reloadKey !== undefined && reloadKey > 0 && open) {
      (async () => {
        const res = await fetch(`/api/design-docs?project_id=${projectId}`);
        const data = await res.json();
        const list = (data.docs ?? []) as DocMeta[];
        setVersions(list);
        if (list.length > 0) await loadDoc(list[0].id);
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey, open, projectId]);

  // ── ESC로 닫기 ───────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") { if (editing) setEditing(false); else onClose(); } };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose, editing]);

  // ── 목차 자동 추출 (마크다운 헤더 ##, ### 파싱) ───────────────────
  const toc = useMemo<TocItem[]>(() => {
    if (!currentDoc?.content_markdown) return [];
    const lines = currentDoc.content_markdown.split("\n");
    const items: TocItem[] = [];
    let inCodeBlock = false;
    for (const line of lines) {
      if (line.trim().startsWith("```")) { inCodeBlock = !inCodeBlock; continue; }
      if (inCodeBlock) continue;
      const m = line.match(/^(#{1,4})\s+(.+)/);
      if (m) {
        const level = m[1].length;
        const text = m[2].replace(/[*_`]/g, "").trim();
        if (level >= 2 && level <= 4) {
          items.push({ level, text, id: `toc-${items.length}` });
        }
      }
    }
    return items;
  }, [currentDoc?.content_markdown]);

  // ── 편집 시작·저장·취소 ─────────────────────────────────────────
  function startEdit() {
    if (!currentDoc) return;
    setEditText(currentDoc.content_markdown);
    setEditing(true);
  }
  async function saveEdit() {
    if (!currentDoc) return;
    try {
      await fetch(`/api/design-docs/${currentDoc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content_markdown: editText, nickname }),
      });
      await loadDoc(currentDoc.id);
      setEditing(false);
    } catch (err) {
      console.error("[doc-view] 편집 저장 실패:", err);
    }
  }

  // ── 수정 요청 (사용자 지시 → 새 버전 생성) ─────────────────────
  async function submitRevise() {
    if (!currentDoc || !reviseInstruction.trim() || revising) return;
    setRevising(true);
    try {
      const res = await fetch("/api/design-docs/revise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          doc_id: currentDoc.id,
          instruction: reviseInstruction.trim(),
          nickname,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(`수정 실패: ${data.error ?? "알 수 없는 오류"}`);
        return;
      }
      // 새 버전이 생성됐으니 목록 갱신 + 새 버전 선택
      const newDocId = data.doc?.id;
      await loadVersions();
      if (newDocId) await loadDoc(newDocId);
      // 모달 정리
      setShowReviseModal(false);
      setReviseInstruction("");
    } catch (err) {
      console.error("[doc-view] 수정 요청 실패:", err);
      alert(`수정 실패: ${String(err)}`);
    } finally {
      setRevising(false);
    }
  }

  // ── 삭제 ───────────────────────────────────────────────────────
  async function deleteDoc() {
    if (!currentDoc) return;
    if (!confirm(`v${currentDoc.version_no} "${currentDoc.title}"을 삭제할까요?`)) return;
    try {
      await fetch(`/api/design-docs/${currentDoc.id}`, { method: "DELETE" });
      setCurrentDoc(null);
      await loadVersions();
    } catch (err) {
      console.error("[doc-view] 삭제 실패:", err);
    }
  }

  // ── 내보내기 ─────────────────────────────────────────────────────
  function downloadMD() {
    if (!currentDoc) return;
    const blob = new Blob([currentDoc.content_markdown], { type: "text/markdown;charset=utf-8" });
    triggerDownload(blob, `${safeName(currentDoc.title)}.md`);
    setShowExportMenu(false);
  }
  function downloadTXT() {
    if (!currentDoc) return;
    // 마크다운 기호 제거한 순수 텍스트
    const text = currentDoc.content_markdown
      .replace(/^#{1,6}\s+/gm, "")        // 헤더 기호
      .replace(/\*\*(.+?)\*\*/g, "$1")     // 굵게
      .replace(/\*(.+?)\*/g, "$1")         // 기울임
      .replace(/`(.+?)`/g, "$1")           // 코드
      .replace(/^\s*[-*+]\s+/gm, "• ")     // 불릿
      .replace(/^\s*\d+\.\s+/gm, "")       // 번호 리스트
      .replace(/!\[(.*?)\]\((.+?)\)/g, "[$1]")   // 이미지
      .replace(/\[(.+?)\]\((.+?)\)/g, "$1")      // 링크
      .replace(/^---+$/gm, "━━━━━━━━━━━━━━━━━━");

    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    triggerDownload(blob, `${safeName(currentDoc.title)}.txt`);
    setShowExportMenu(false);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: "#0a0e1a" }}>
      {/* 상단 액션 바 */}
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0 gap-3" style={{ borderBottom: `1px solid ${SILVER_FAINT}` }}>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <p className="text-sm font-bold flex-shrink-0" style={{ color: SILVER }}>📄 기획서</p>
          {currentDoc && (
            <>
              <span className="text-sm font-medium" style={{ color: "rgba(180,210,255,1)" }}>
                v{currentDoc.version_no}
              </span>
              <span className="text-sm truncate" style={{ color: SILVER }}>
                {currentDoc.title}
              </span>
              <span className="text-xs" style={{ color: SILVER_DIM }}>
                · {new Date(currentDoc.created_at).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" })}
                {currentDoc.created_by_nickname && ` · ${currentDoc.created_by_nickname}`}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {!editing ? (
            <>
              <button
                onClick={startEdit}
                disabled={!currentDoc}
                className="text-xs px-3 py-1.5 rounded-lg"
                style={{ backgroundColor: SILVER_FAINT, color: SILVER, opacity: currentDoc ? 1 : 0.5 }}
              >
                ✏️ 편집
              </button>
              <button
                onClick={() => { setReviseInstruction(""); setShowReviseModal(true); }}
                disabled={!currentDoc}
                title="조던에게 수정 요청 — 자연어로 지시하면 AI가 새 버전 생성"
                className="text-xs px-3 py-1.5 rounded-lg font-medium"
                style={{
                  backgroundColor: "rgba(100,180,255,0.18)",
                  border: "1px solid rgba(100,180,255,0.5)",
                  color: "rgba(180,210,255,1)",
                  opacity: currentDoc ? 1 : 0.5,
                }}
              >
                🪄 수정 요청
              </button>
              <div className="relative">
                <button
                  onClick={() => setShowExportMenu(v => !v)}
                  disabled={!currentDoc}
                  className="text-xs px-3 py-1.5 rounded-lg"
                  style={{ backgroundColor: SILVER_FAINT, color: SILVER, opacity: currentDoc ? 1 : 0.5 }}
                >
                  📥 내보내기 ▾
                </button>
                {showExportMenu && (
                  <div className="absolute right-0 top-full mt-1 rounded-lg shadow-2xl py-1 z-10" style={{ backgroundColor: "#0f1628", border: `1px solid ${SILVER_FAINT}`, minWidth: "160px" }}>
                    <button onClick={downloadMD} className="block w-full text-left text-xs px-3 py-2 hover:bg-white/5" style={{ color: SILVER }}>📝 MD (마크다운)</button>
                    <button onClick={downloadTXT} className="block w-full text-left text-xs px-3 py-2 hover:bg-white/5" style={{ color: SILVER }}>📄 TXT (순수 텍스트)</button>
                    <div className="px-3 py-1.5 text-[10px]" style={{ color: SILVER_DIM }}>PDF·HTML은 곧 추가 예정</div>
                  </div>
                )}
              </div>
              <button
                onClick={deleteDoc}
                disabled={!currentDoc}
                className="text-xs px-3 py-1.5 rounded-lg"
                style={{ backgroundColor: "rgba(255,180,180,0.1)", color: "rgba(255,180,180,0.8)", opacity: currentDoc ? 1 : 0.5 }}
              >
                🗑️ 삭제
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setEditing(false)}
                className="text-xs px-3 py-1.5 rounded-lg"
                style={{ backgroundColor: SILVER_FAINT, color: SILVER }}
              >
                취소
              </button>
              <button
                onClick={saveEdit}
                className="text-xs px-3 py-1.5 rounded-lg font-medium"
                style={{ backgroundColor: "rgba(100,220,160,0.25)", border: `1px solid rgba(100,220,160,0.6)`, color: "rgba(150,255,200,1)" }}
              >
                저장
              </button>
            </>
          )}
          <button
            onClick={onClose}
            title="조던 채팅 화면으로 돌아가기"
            className="text-xs px-4 py-2 rounded-lg font-bold flex items-center gap-1.5 transition-transform hover:scale-105"
            style={{
              backgroundColor: "rgba(100,220,160,0.22)",
              border: "1.5px solid rgba(100,220,160,0.7)",
              color: "rgba(150,255,200,1)",
              boxShadow: "0 2px 10px rgba(100,220,160,0.25)",
            }}
          >
            ← 조던으로 돌아가기
          </button>
        </div>
      </div>

      {/* 본문 영역 */}
      <div className="flex-1 flex min-h-0">
        {/* 좌측 사이드바 — 목차 + 기획서 리스트 오버레이 */}
        {!editing && (
          <aside className="relative flex-shrink-0 flex flex-col" style={{ width: "260px", borderRight: `1px solid ${SILVER_FAINT}` }}>
            {/* 상단 기획서 리스트 버튼 */}
            <div className="px-3 pt-3 pb-2 flex-shrink-0" style={{ borderBottom: `1px solid ${SILVER_FAINT}` }}>
              <button
                onClick={() => setShowDocList(v => !v)}
                className="w-full text-left text-xs px-3 py-2 rounded-lg font-bold flex items-center justify-between"
                style={{
                  backgroundColor: showDocList ? "rgba(100,180,255,0.18)" : SILVER_FAINT,
                  border: `1px solid ${showDocList ? "rgba(100,180,255,0.6)" : SILVER_DIM}`,
                  color: showDocList ? "rgba(180,210,255,1)" : SILVER,
                }}
              >
                <span>📚 기획서 리스트</span>
                <span style={{ color: SILVER_DIM, fontWeight: 400 }}>({versions.length})</span>
              </button>
            </div>

            {/* 목차 영역 */}
            {toc.length > 0 && (
              <div className="overflow-y-auto py-4 px-3 flex-1" style={{ scrollbarWidth: "thin" }}>
                <p className="text-xs font-bold mb-2" style={{ color: SILVER_DIM }}>📑 목차</p>
                {toc.map(item => (
                  <button
                    key={item.id}
                    onClick={() => {
                      const elements = bodyRef.current?.querySelectorAll("h1, h2, h3, h4");
                      if (!elements) return;
                      let idx = -1;
                      let count = 0;
                      for (let i = 0; i < elements.length; i++) {
                        const el = elements[i];
                        const lvl = parseInt(el.tagName.slice(1));
                        if (lvl >= 2 && lvl <= 4) {
                          if (count === toc.findIndex(t => t.id === item.id)) { idx = i; break; }
                          count++;
                        }
                      }
                      if (idx >= 0) elements[idx].scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                    className="block w-full text-left text-xs py-1 hover:underline"
                    style={{
                      paddingLeft: `${(item.level - 2) * 12}px`,
                      color: item.level === 2 ? SILVER : SILVER_DIM,
                      fontWeight: item.level === 2 ? 600 : 400,
                      lineHeight: 1.5,
                    }}
                  >
                    {item.text}
                  </button>
                ))}
              </div>
            )}

            {/* 기획서 리스트 오버레이 — 사이드바와 동일 크기로 덮음 */}
            {showDocList && (
              <div
                className="absolute inset-0 flex flex-col z-10"
                style={{ backgroundColor: "#0a0e1a", borderRight: `1px solid ${SILVER_FAINT}` }}
              >
                {/* 오버레이 헤더 */}
                <div className="flex items-center justify-between px-3 py-2.5 flex-shrink-0" style={{ borderBottom: `1px solid ${SILVER_FAINT}` }}>
                  <p className="text-xs font-bold" style={{ color: "rgba(180,210,255,1)" }}>📚 기획서 리스트</p>
                  <button
                    onClick={() => setShowDocList(false)}
                    className="text-xs px-2 py-0.5 rounded"
                    style={{ backgroundColor: SILVER_FAINT, color: SILVER_DIM }}
                  >
                    ✕
                  </button>
                </div>

                {/* 카테고리 트리 */}
                <div className="flex-1 overflow-y-auto px-2 py-2" style={{ scrollbarWidth: "thin" }}>
                  {versions.length === 0 && (
                    <p className="text-xs text-center mt-6" style={{ color: SILVER_DIM }}>
                      생성된 기획서가 없어요
                    </p>
                  )}
                  {(() => {
                    // 카테고리 분류 — changes_summary 패턴 기반
                    const cats: { id: string; label: string; icon: string; docs: DocMeta[] }[] = [
                      { id: "chat", label: "대화 기반", icon: "💬", docs: [] },
                      { id: "revision", label: "수정 버전", icon: "🪄", docs: [] },
                      { id: "decision", label: "기획 바이블 기반", icon: "📋", docs: [] },
                      { id: "other", label: "기타", icon: "📌", docs: [] },
                    ];
                    for (const v of versions) {
                      const s = v.changes_summary ?? "";
                      if (s.includes("수정 요청")) cats[1].docs.push(v);
                      else if (s.includes("대화") && s.includes("교차 검증")) cats[0].docs.push(v);
                      else if (s.includes("결정사항") || s.includes("자동 생성") || s.includes("반영")) cats[2].docs.push(v);
                      else cats[3].docs.push(v);
                    }

                    return cats.map(cat => {
                      if (cat.docs.length === 0) return null;
                      const isOpen = expandedCats.has(cat.id);
                      return (
                        <div key={cat.id} className="mb-2">
                          <button
                            onClick={() =>
                              setExpandedCats(prev => {
                                const n = new Set(prev);
                                if (n.has(cat.id)) n.delete(cat.id);
                                else n.add(cat.id);
                                return n;
                              })
                            }
                            className="w-full text-left text-xs px-2 py-1.5 rounded flex items-center justify-between font-bold"
                            style={{ backgroundColor: SILVER_FAINT, color: SILVER }}
                          >
                            <span>
                              {cat.icon} {cat.label}
                            </span>
                            <span
                              className="inline-flex items-center justify-center w-5 h-5 rounded text-base leading-none"
                              style={{ backgroundColor: "rgba(255,255,255,0.06)", color: SILVER_DIM }}
                            >
                              {isOpen ? "−" : "+"}
                            </span>
                          </button>

                          {isOpen && (
                            <div className="mt-1 ml-1 flex flex-col gap-0.5">
                              {cat.docs.map(d => {
                                const active = d.id === currentDoc?.id;
                                return (
                                  <button
                                    key={d.id}
                                    onClick={() => {
                                      void loadDoc(d.id);
                                      setShowDocList(false);
                                    }}
                                    className="text-left text-xs px-2 py-1.5 rounded"
                                    style={{
                                      backgroundColor: active ? "rgba(100,180,255,0.18)" : "transparent",
                                      border: active ? "1px solid rgba(100,180,255,0.5)" : "1px solid transparent",
                                      color: active ? "rgba(180,210,255,1)" : "#b8c4d4",
                                    }}
                                  >
                                    <div className="flex items-center gap-1.5">
                                      <span style={{ color: SILVER_DIM, flexShrink: 0 }}>v{d.version_no}</span>
                                      <span className="truncate">{d.title}</span>
                                    </div>
                                    <div className="text-[10px] mt-0.5" style={{ color: SILVER_DIM }}>
                                      {new Date(d.created_at).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })}
                                      {d.created_by_nickname && ` · ${d.created_by_nickname}`}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            )}
          </aside>
        )}

        {/* 중앙 본문 */}
        <div ref={bodyRef} className="flex-1 overflow-y-auto px-6 py-6" style={{ scrollbarWidth: "thin" }}>
          {loading && !currentDoc && (
            <p className="text-sm" style={{ color: SILVER_DIM }}>로딩 중...</p>
          )}
          {!loading && versions.length === 0 && (
            <div className="max-w-2xl mx-auto mt-12 text-center">
              <p className="text-base font-bold mb-3" style={{ color: SILVER }}>아직 생성된 기획서가 없어요</p>
              <p className="text-sm" style={{ color: SILVER_DIM }}>
                결정사항 트래커에서 [📋 결정사항] 을 열고<br />
                [📄 기획서 제작] 버튼을 누르면 자동으로 생성돼요.
              </p>
            </div>
          )}
          {currentDoc && !editing && (
            <article className="prose prose-sm max-w-3xl mx-auto" style={{ color: "#e0e8f0" }}>
              <ReactMarkdown>{currentDoc.content_markdown}</ReactMarkdown>
            </article>
          )}
          {currentDoc && editing && (
            <textarea
              value={editText}
              onChange={e => setEditText(e.target.value)}
              className="w-full h-full px-4 py-3 rounded text-sm outline-none resize-none font-mono"
              style={{ backgroundColor: "rgba(255,255,255,0.04)", border: `1px solid ${SILVER_FAINT}`, color: "#e0e8f0", minHeight: "60vh" }}
              autoFocus
            />
          )}
        </div>
      </div>

      {/* 수정 요청 모달 */}
      {showReviseModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
          onClick={() => { if (!revising) setShowReviseModal(false); }}
        >
          <div
            className="rounded-2xl w-full max-w-xl shadow-2xl"
            style={{ backgroundColor: "#0f1628", border: "1px solid rgba(100,180,255,0.4)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 flex items-center gap-2" style={{ borderBottom: `1px solid ${SILVER_FAINT}` }}>
              <span style={{ fontSize: "18px" }}>🪄</span>
              <div className="flex-1">
                <p className="text-sm font-bold" style={{ color: "rgba(180,210,255,1)" }}>기획서 수정 요청</p>
                <p className="text-xs mt-0.5" style={{ color: SILVER_DIM }}>
                  자연어로 어떻게 바꾸고 싶은지 알려주세요. 조던이 새 버전을 만들어요.
                </p>
              </div>
            </div>

            <div className="px-5 py-4 flex flex-col gap-3">
              <textarea
                value={reviseInstruction}
                onChange={(e) => setReviseInstruction(e.target.value)}
                disabled={revising}
                placeholder="예시:&#10;- 가챠 확률을 SSR 3%에서 1.5%로 낮추고 천장 조건도 100회로 조정&#10;- 영웅 등급 체계 섹션을 더 상세하게 보강&#10;- 수익화 섹션 제거하고 그 자리에 라이브 운영 일정 추가"
                rows={7}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                style={{
                  backgroundColor: "rgba(255,255,255,0.05)",
                  border: `1px solid ${SILVER_FAINT}`,
                  color: "#e0e8f0",
                  lineHeight: 1.55,
                }}
                autoFocus
              />
              <p className="text-xs" style={{ color: SILVER_DIM }}>
                💡 수정은 새 버전(v{(currentDoc?.version_no ?? 0) + 1}+)으로 저장돼요. 원본은 그대로 남아요.
              </p>
              <div className="flex gap-2 justify-end mt-1">
                <button
                  onClick={() => setShowReviseModal(false)}
                  disabled={revising}
                  className="text-xs px-4 py-2 rounded-lg"
                  style={{ backgroundColor: SILVER_FAINT, color: SILVER }}
                >
                  취소
                </button>
                <button
                  onClick={submitRevise}
                  disabled={!reviseInstruction.trim() || revising}
                  className="text-xs px-4 py-2 rounded-lg font-bold flex items-center gap-1.5 disabled:opacity-40"
                  style={{
                    backgroundColor: "rgba(100,180,255,0.25)",
                    border: "1px solid rgba(100,180,255,0.6)",
                    color: "rgba(180,210,255,1)",
                  }}
                >
                  {revising ? (
                    <>
                      <span className="inline-block w-3 h-3 rounded-full border-2 animate-spin" style={{ borderColor: "rgba(180,210,255,0.3)", borderTopColor: "rgba(180,210,255,1)" }} />
                      수정 중...
                    </>
                  ) : (
                    <>🪄 수정 시작</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 헬퍼: 파일명 안전 처리 ─────────────────────────────────────────
function safeName(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, "_").trim() || "design_doc";
}
function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

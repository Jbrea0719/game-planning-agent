"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import { marked } from "marked";
import CategoryManager from "./CategoryManager";

const SILVER = "#c0c8d8";
const SILVER_DIM = "rgba(192,200,216,0.5)";
const SILVER_FAINT = "rgba(192,200,216,0.15)";

interface DocMeta {
  id: string;
  doc_family_id: string | null;
  version_no: number;
  title: string;
  status: string;
  changes_summary: string | null;
  created_at: string;
  created_by_nickname: string | null;
  category_main_id: string | null;
  category_area_code: string | null;
  category_sub_id: string | null;
}

interface CategorySubItem {
  id: string;
  name_ko: string;
  area_code: string | null;
  area_name: string | null;
}
interface CategoryAreaItem {
  code: string;
  name: string;
  sub_categories: CategorySubItem[];
}
interface CategoryMainItem {
  id: string;
  name_ko: string;
  icon: string | null;
  sub_categories?: CategorySubItem[];
  areas?: CategoryAreaItem[];
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
  // 기획서 리스트 오버레이 패널 — 진입 시 기본 ON
  const [showDocList, setShowDocList] = useState(true);
  // 카테고리 그룹 + family 펼침 상태 (둘 다 +/- 토글)
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [expandedFamilies, setExpandedFamilies] = useState<Set<string>>(new Set());
  // family 이름 변경 인라인 편집
  const [renamingFamilyId, setRenamingFamilyId] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState("");
  // family 카테고리 변경 모달 (대 > 중 > 소)
  const [categorizingFamilyId, setCategorizingFamilyId] = useState<string | null>(null);
  const [catPickMainId, setCatPickMainId] = useState<string>("");
  const [catPickAreaCode, setCatPickAreaCode] = useState<string>("");
  const [catPickSubId, setCatPickSubId] = useState<string>("");
  // 카테고리 트리 (DecisionPanel과 동일 소스)
  const [categories, setCategories] = useState<CategoryMainItem[]>([]);
  // 본 적 있는 doc id 추적 (per-doc 레드닷)
  const [viewedDocIds, setViewedDocIds] = useState<Set<string>>(new Set());
  // 카테고리 관리 모달
  const [showCatManager, setShowCatManager] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  // 카테고리 재로드 (관리 모달에서 변경 시)
  const reloadCategories = useCallback(() => {
    fetch("/api/categories")
      .then(r => r.json())
      .then(d => setCategories(d.main_categories ?? []))
      .catch(err => console.error("[doc-view] 카테고리 재로드 실패:", err));
    // 기획서도 새로 fetch — 카테고리 삭제 시 category 필드가 null이 됐을 수 있어서
    void loadVersions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 카테고리 트리 로드 (한 번)
  useEffect(() => {
    fetch("/api/categories")
      .then(r => r.json())
      .then(d => setCategories(d.main_categories ?? []))
      .catch(err => console.error("[doc-view] 카테고리 로드 실패:", err));
  }, []);

  // viewedDocIds — localStorage 복원 (없으면 현재 전체 버전을 초기 viewed로)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem("jordan_doc_viewed_ids");
    if (saved) {
      try {
        const arr = JSON.parse(saved) as string[];
        setViewedDocIds(new Set(arr));
      } catch { /* 무시 */ }
    }
  }, []);
  // versions 로드된 직후, viewed가 비어있으면 (= 최초 사용자) 전부 viewed로 초기화
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (versions.length === 0) return;
    const saved = localStorage.getItem("jordan_doc_viewed_ids");
    if (!saved) {
      const ids = versions.map(v => v.id);
      const set = new Set(ids);
      setViewedDocIds(set);
      localStorage.setItem("jordan_doc_viewed_ids", JSON.stringify(ids));
    }
  }, [versions]);

  // doc를 본 것으로 마킹
  function markViewed(id: string) {
    setViewedDocIds(prev => {
      if (prev.has(id)) return prev;
      const n = new Set(prev);
      n.add(id);
      if (typeof window !== "undefined") {
        localStorage.setItem("jordan_doc_viewed_ids", JSON.stringify(Array.from(n)));
      }
      return n;
    });
  }

  // ── family 카테고리 변경 ─────────────────────────────────────────
  async function submitCategorize() {
    if (!categorizingFamilyId) return;
    try {
      await fetch("/api/design-docs/family/categorize", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          family_id: categorizingFamilyId,
          main_id: catPickMainId || null,
          area_code: catPickAreaCode || null,
          sub_id: catPickSubId || null,
        }),
      });
      setCategorizingFamilyId(null);
      setCatPickMainId(""); setCatPickAreaCode(""); setCatPickSubId("");
      await loadVersions();
    } catch (err) {
      console.error("[doc-view] 카테고리 변경 실패:", err);
    }
  }

  // ── family 이름 변경 ─────────────────────────────────────────────
  async function submitRename(familyId: string) {
    const newTitle = renameInput.trim();
    if (!newTitle) { setRenamingFamilyId(null); return; }
    try {
      await fetch("/api/design-docs/family/rename", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ family_id: familyId, title: newTitle }),
      });
      setRenamingFamilyId(null);
      setRenameInput("");
      await loadVersions();
      // 현재 doc도 다시 로드 (헤더 제목 갱신)
      if (currentDoc) await loadDoc(currentDoc.id);
    } catch (err) {
      console.error("[doc-view] 이름 변경 실패:", err);
    }
  }

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
      if (data.doc) {
        setCurrentDoc(data.doc as DocFull);
        markViewed(id);   // 본 것으로 기록 (레드닷 해제)
      }
    } catch (err) {
      console.error("[doc-view] 단건 로드 실패:", err);
    }
  }

  // 마운트·열림·reloadKey 변경 시 갱신
  useEffect(() => { if (open) void loadVersions(); }, [open, loadVersions]);

  // versions 로드되면 모든 family + 카테고리를 기본 펼침으로
  useEffect(() => {
    if (versions.length === 0) return;
    setExpandedFamilies(prev => {
      const n = new Set(prev);
      for (const v of versions) n.add(v.doc_family_id ?? v.id);
      return n;
    });
    setExpandedCats(prev => {
      const n = new Set(prev);
      for (const v of versions) {
        const key = v.category_main_id
          ? `${v.category_main_id}::${v.category_area_code ?? ""}::${v.category_sub_id ?? ""}`
          : "__none__";
        n.add(key);
      }
      return n;
    });
  }, [versions]);
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
  // HTML 내보내기 — 마크다운을 스타일링된 HTML 문서로 변환해 다운로드
  function downloadHTML() {
    if (!currentDoc) return;
    const bodyHtml = marked.parse(currentDoc.content_markdown, { async: false }) as string;
    const html = buildHtmlDoc(currentDoc.title, bodyHtml);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    triggerDownload(blob, `${safeName(currentDoc.title)}.html`);
    setShowExportMenu(false);
  }

  // PDF 내보내기 — HTML을 새 창에서 띄우고 브라우저 인쇄(저장 대화상자)로 PDF 저장
  // (서버리스 환경에서 별도 PDF 라이브러리 없이 가장 안정적인 방식)
  function downloadPDF() {
    if (!currentDoc) return;
    const bodyHtml = marked.parse(currentDoc.content_markdown, { async: false }) as string;
    const html = buildHtmlDoc(currentDoc.title, bodyHtml, true);
    // 새 창 열기 → onload 시 자동 print() → 사용자가 "PDF로 저장" 선택
    const win = window.open("", "_blank", "width=900,height=1200");
    if (!win) {
      alert("팝업이 차단됐어요. 브라우저 팝업 허용 후 다시 시도해주세요.");
      return;
    }
    win.document.write(html);
    win.document.close();
    // 약간의 딜레이 후 print (렌더 완료 보장)
    setTimeout(() => {
      try { win.focus(); win.print(); } catch (err) { console.error("PDF 인쇄 실패:", err); }
    }, 400);
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
            <span className="text-xs" style={{ color: SILVER_DIM }}>
              {new Date(currentDoc.created_at).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" })}
              {currentDoc.created_by_nickname && ` · ${currentDoc.created_by_nickname}`}
            </span>
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
                  <div className="absolute right-0 top-full mt-1 rounded-lg shadow-2xl py-1 z-10" style={{ backgroundColor: "#0f1628", border: `1px solid ${SILVER_FAINT}`, minWidth: "180px" }}>
                    <button onClick={downloadMD} className="block w-full text-left text-xs px-3 py-2 hover:bg-white/5" style={{ color: SILVER }}>📝 MD (마크다운)</button>
                    <button onClick={downloadTXT} className="block w-full text-left text-xs px-3 py-2 hover:bg-white/5" style={{ color: SILVER }}>📄 TXT (순수 텍스트)</button>
                    <button onClick={downloadHTML} className="block w-full text-left text-xs px-3 py-2 hover:bg-white/5" style={{ color: SILVER }}>🌐 HTML (웹 페이지)</button>
                    <button onClick={downloadPDF} className="block w-full text-left text-xs px-3 py-2 hover:bg-white/5" style={{ color: SILVER }}>🖨️ PDF (인쇄 → 저장)</button>
                    <div className="px-3 py-1.5 text-[10px]" style={{ color: SILVER_DIM }}>PDF는 인쇄 대화상자에서 "PDF로 저장" 선택</div>
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
            {/* 상단 기획서 리스트 버튼 + 카테고리 관리 톱니바퀴 */}
            <div className="px-3 pt-3 pb-2 flex-shrink-0 flex items-center gap-1.5" style={{ borderBottom: `1px solid ${SILVER_FAINT}` }}>
              <button
                onClick={() => setShowDocList(v => !v)}
                className="flex-1 text-left text-xs px-3 py-2 rounded-lg font-bold flex items-center justify-between"
                style={{
                  backgroundColor: showDocList ? "rgba(100,180,255,0.18)" : SILVER_FAINT,
                  border: `1px solid ${showDocList ? "rgba(100,180,255,0.6)" : SILVER_DIM}`,
                  color: showDocList ? "rgba(180,210,255,1)" : SILVER,
                }}
              >
                <span>📚 기획서 리스트</span>
                <span style={{ color: SILVER_DIM, fontWeight: 400 }}>({versions.length})</span>
              </button>
              <button
                onClick={() => setShowCatManager(true)}
                title="카테고리 관리 — 대/중/소 카테고리 추가·수정·삭제"
                className="flex items-center justify-center w-9 h-9 rounded-lg flex-shrink-0"
                style={{
                  backgroundColor: "rgba(255,200,100,0.15)",
                  border: "1px solid rgba(255,200,100,0.4)",
                  color: "rgba(255,220,150,1)",
                  fontSize: "14px",
                }}
              >
                ⚙️
              </button>
            </div>

            {/* 현재 보고 있는 기획서 제목 — 리스트 버튼과 목차 사이 */}
            {currentDoc && (
              <div className="px-3 py-2.5 flex-shrink-0" style={{ borderBottom: `1px solid ${SILVER_FAINT}` }}>
                <div className="flex items-baseline gap-2 min-w-0">
                  <span className="text-xs font-bold flex-shrink-0" style={{ color: "rgba(180,210,255,1)" }}>
                    v{currentDoc.version_no}
                  </span>
                  <span className="text-sm font-bold truncate" style={{ color: SILVER }} title={currentDoc.title}>
                    {currentDoc.title}
                  </span>
                </div>
              </div>
            )}

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

                {/* family 트리 — 같은 기획서의 버전끼리 묶음 */}
                <div className="flex-1 overflow-y-auto px-2 py-2" style={{ scrollbarWidth: "thin" }}>
                  {versions.length === 0 && (
                    <p className="text-xs text-center mt-6" style={{ color: SILVER_DIM }}>
                      생성된 기획서가 없어요
                    </p>
                  )}
                  {(() => {
                    // 1. family 단위 그룹핑
                    const familyMap = new Map<string, DocMeta[]>();
                    for (const v of versions) {
                      const fid = v.doc_family_id ?? v.id;
                      if (!familyMap.has(fid)) familyMap.set(fid, []);
                      familyMap.get(fid)!.push(v);
                    }
                    for (const arr of familyMap.values()) {
                      arr.sort((a, b) => b.version_no - a.version_no);
                    }
                    const families = Array.from(familyMap.entries()).map(([fid, docs]) => ({
                      familyId: fid,
                      docs,
                      latestAt: docs.reduce((m, d) => (d.created_at > m ? d.created_at : m), docs[0].created_at),
                      name: docs[0].title,
                      mainId: docs[0].category_main_id,
                      areaCode: docs[0].category_area_code,
                      subId: docs[0].category_sub_id,
                    }));

                    // 2. 카테고리(대 > 중 > 소) 단위로 그룹핑
                    // 키: `${mainId}::${areaCode ?? ""}::${subId ?? ""}` / 미분류는 "__none__"
                    type Family = typeof families[number];
                    const catMap = new Map<string, { mainId: string | null; areaCode: string | null; subId: string | null; families: Family[] }>();
                    for (const f of families) {
                      const key = f.mainId
                        ? `${f.mainId}::${f.areaCode ?? ""}::${f.subId ?? ""}`
                        : "__none__";
                      if (!catMap.has(key)) {
                        catMap.set(key, { mainId: f.mainId, areaCode: f.areaCode, subId: f.subId, families: [] });
                      }
                      catMap.get(key)!.families.push(f);
                    }
                    // 카테고리 라벨: 대 > 중 > 소 형태로 표시
                    const catEntries = Array.from(catMap.entries()).map(([key, val]) => {
                      const main = categories.find(m => m.id === val.mainId) ?? null;
                      const areaName = main?.areas?.find(a => a.code === val.areaCode)?.name ?? null;
                      // 소카테고리 이름 찾기 — area가 있으면 area 안에서, 없으면 main 직속에서
                      let subName: string | null = null;
                      if (val.subId && main) {
                        if (main.areas && main.areas.length > 0) {
                          for (const a of main.areas) {
                            const found = a.sub_categories.find(s => s.id === val.subId);
                            if (found) { subName = found.name_ko; break; }
                          }
                        } else if (main.sub_categories) {
                          subName = main.sub_categories.find(s => s.id === val.subId)?.name_ko ?? null;
                        }
                      }
                      let label: string;
                      if (!main) label = "📂 분류 안 됨";
                      else {
                        const parts: string[] = [];
                        parts.push(`${main.icon ?? ""} ${main.name_ko}`.trim());
                        if (areaName) parts.push(areaName);
                        if (subName) parts.push(subName);
                        label = parts.join(" > ");
                      }
                      val.families.sort((a, b) => (a.latestAt < b.latestAt ? 1 : -1));
                      return { key, label, val };
                    });
                    catEntries.sort((a, b) => {
                      if (a.key === "__none__") return 1;
                      if (b.key === "__none__") return -1;
                      return a.label.localeCompare(b.label, "ko");
                    });

                    return catEntries.map(({ key: catKey, label: catLabel, val: catVal }) => {
                      const catOpen = expandedCats.has(catKey);
                      const totalDocs = catVal.families.reduce((s, f) => s + f.docs.length, 0);
                      return (
                        <div key={catKey} className="mb-2">
                          {/* 카테고리 헤더 (Main > Area) */}
                          <button
                            onClick={() =>
                              setExpandedCats(prev => {
                                const n = new Set(prev);
                                if (n.has(catKey)) n.delete(catKey); else n.add(catKey);
                                return n;
                              })
                            }
                            className="w-full text-left text-xs px-2 py-1.5 rounded flex items-center justify-between font-bold"
                            style={{ backgroundColor: "rgba(192,200,216,0.18)", color: SILVER }}
                          >
                            <span className="truncate">{catLabel}</span>
                            <span className="flex items-center gap-1.5 flex-shrink-0">
                              <span style={{ color: SILVER_DIM, fontWeight: 400 }}>{totalDocs}개</span>
                              <span className="inline-flex items-center justify-center w-5 h-5 rounded text-base leading-none" style={{ backgroundColor: "rgba(255,255,255,0.06)", color: SILVER_DIM }}>
                                {catOpen ? "−" : "+"}
                              </span>
                            </span>
                          </button>

                          {/* 카테고리 안의 family들 */}
                          {catOpen && catVal.families.map(fam => {
                      const isOpen = expandedFamilies.has(fam.familyId);
                      const isRenaming = renamingFamilyId === fam.familyId;
                      return (
                        <div key={fam.familyId} className="mb-2">
                          {/* family 헤더 */}
                          <div
                            className="flex items-center gap-1 px-2 py-1.5 rounded font-bold"
                            style={{ backgroundColor: SILVER_FAINT, color: SILVER }}
                          >
                            {isRenaming ? (
                              <input
                                value={renameInput}
                                onChange={(e) => setRenameInput(e.target.value)}
                                onBlur={() => submitRename(fam.familyId)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") submitRename(fam.familyId);
                                  if (e.key === "Escape") { setRenamingFamilyId(null); setRenameInput(""); }
                                }}
                                className="flex-1 text-xs px-1.5 py-0.5 rounded outline-none"
                                style={{ backgroundColor: "rgba(0,0,0,0.4)", border: "1px solid rgba(100,180,255,0.5)", color: "#e0e8f0" }}
                                autoFocus
                              />
                            ) : (
                              <>
                                <button
                                  onClick={() =>
                                    setExpandedFamilies(prev => {
                                      const n = new Set(prev);
                                      if (n.has(fam.familyId)) n.delete(fam.familyId);
                                      else n.add(fam.familyId);
                                      return n;
                                    })
                                  }
                                  className="flex-1 text-left text-xs flex items-center gap-1.5 min-w-0"
                                >
                                  <span className="truncate">{fam.name}</span>
                                  <span style={{ color: SILVER_DIM, fontWeight: 400, flexShrink: 0 }}>
                                    ({fam.docs.length})
                                  </span>
                                </button>
                                {/* 이름 수정 아이콘 */}
                                <button
                                  onClick={() => { setRenamingFamilyId(fam.familyId); setRenameInput(fam.name); }}
                                  title="기획서 이름 변경 (같은 family의 모든 버전에 적용)"
                                  className="text-xs px-1 py-0.5 rounded hover:bg-white/10"
                                  style={{ color: SILVER_DIM }}
                                >
                                  ✏️
                                </button>
                                {/* 카테고리 변경 아이콘 */}
                                <button
                                  onClick={() => {
                                    setCategorizingFamilyId(fam.familyId);
                                    setCatPickMainId(fam.mainId ?? "");
                                    setCatPickAreaCode(fam.areaCode ?? "");
                                    setCatPickSubId(fam.subId ?? "");
                                  }}
                                  title="카테고리 분류 변경"
                                  className="text-xs px-1 py-0.5 rounded hover:bg-white/10"
                                  style={{ color: SILVER_DIM }}
                                >
                                  📂
                                </button>
                                {/* +/− 토글 */}
                                <button
                                  onClick={() =>
                                    setExpandedFamilies(prev => {
                                      const n = new Set(prev);
                                      if (n.has(fam.familyId)) n.delete(fam.familyId);
                                      else n.add(fam.familyId);
                                      return n;
                                    })
                                  }
                                  className="inline-flex items-center justify-center w-5 h-5 rounded text-base leading-none flex-shrink-0"
                                  style={{ backgroundColor: "rgba(255,255,255,0.06)", color: SILVER_DIM }}
                                >
                                  {isOpen ? "−" : "+"}
                                </button>
                              </>
                            )}
                          </div>

                          {/* 버전 리스트 */}
                          {isOpen && (
                            <div className="mt-1 ml-2 flex flex-col gap-0.5">
                              {fam.docs.map(d => {
                                const active = d.id === currentDoc?.id;
                                const isUnviewed = !viewedDocIds.has(d.id);
                                return (
                                  <button
                                    key={d.id}
                                    onClick={() => {
                                      void loadDoc(d.id);
                                      setShowDocList(false);
                                    }}
                                    className="text-left text-xs px-2 py-1.5 rounded relative"
                                    style={{
                                      backgroundColor: active ? "rgba(100,180,255,0.18)" : "transparent",
                                      border: active ? "1px solid rgba(100,180,255,0.5)" : "1px solid transparent",
                                      color: active ? "rgba(180,210,255,1)" : "#b8c4d4",
                                    }}
                                  >
                                    <div className="flex items-center gap-1.5">
                                      <span style={{ color: active ? "rgba(180,210,255,1)" : SILVER_DIM, flexShrink: 0, fontWeight: 600 }}>
                                        v{d.version_no}
                                      </span>
                                      <span className="text-[10px]" style={{ color: SILVER_DIM }}>
                                        {new Date(d.created_at).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })}
                                        {d.created_by_nickname && ` · ${d.created_by_nickname}`}
                                      </span>
                                      {isUnviewed && (
                                        <span
                                          className="w-2 h-2 rounded-full ml-auto flex-shrink-0 animate-pulse"
                                          title="아직 열어보지 않은 새 기획서"
                                          style={{ backgroundColor: "rgba(255,80,80,0.95)", boxShadow: "0 0 4px rgba(255,80,80,0.6)" }}
                                        />
                                      )}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
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

      {/* 카테고리 관리 모달 — 톱니바퀴로 열림 */}
      <CategoryManager
        open={showCatManager}
        onClose={() => setShowCatManager(false)}
        onChanged={reloadCategories}
      />

      {/* 카테고리 변경 모달 */}
      {categorizingFamilyId && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
          onClick={() => setCategorizingFamilyId(null)}
        >
          <div
            className="rounded-2xl w-full max-w-sm shadow-2xl"
            style={{ backgroundColor: "#0f1628", border: `1px solid ${SILVER_FAINT}` }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 flex items-center gap-2" style={{ borderBottom: `1px solid ${SILVER_FAINT}` }}>
              <span style={{ fontSize: "16px" }}>📂</span>
              <p className="text-sm font-bold" style={{ color: SILVER }}>카테고리 분류</p>
            </div>
            <div className="px-5 py-4 flex flex-col gap-3">
              {/* 대카테고리 (Main) */}
              <div className="flex flex-col gap-1">
                <label className="text-xs" style={{ color: SILVER_DIM }}>대카테고리</label>
                <select
                  value={catPickMainId}
                  onChange={(e) => { setCatPickMainId(e.target.value); setCatPickAreaCode(""); setCatPickSubId(""); }}
                  className="px-3 py-2 rounded-lg text-xs outline-none"
                  style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${SILVER_FAINT}`, color: "#e0e8f0" }}
                >
                  <option value="">(분류 안 됨)</option>
                  {categories.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.icon} {m.name_ko}
                    </option>
                  ))}
                </select>
              </div>
              {/* 중카테고리 (Area) — areas가 있는 main만 표시 */}
              {(() => {
                const currentMain = categories.find(m => m.id === catPickMainId);
                if (!currentMain?.areas || currentMain.areas.length === 0) return null;
                return (
                  <div className="flex flex-col gap-1">
                    <label className="text-xs" style={{ color: SILVER_DIM }}>중카테고리</label>
                    <select
                      value={catPickAreaCode}
                      onChange={(e) => { setCatPickAreaCode(e.target.value); setCatPickSubId(""); }}
                      className="px-3 py-2 rounded-lg text-xs outline-none"
                      style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${SILVER_FAINT}`, color: "#e0e8f0" }}
                    >
                      <option value="">(중카테고리 선택 안 함)</option>
                      {currentMain.areas.map(a => (
                        <option key={a.code} value={a.code}>{a.name}</option>
                      ))}
                    </select>
                  </div>
                );
              })()}
              {/* 소카테고리 (Sub) */}
              {(() => {
                const currentMain = categories.find(m => m.id === catPickMainId);
                if (!currentMain) return null;
                // areas가 있으면 선택된 area의 sub, 없으면 main 직속 sub
                let subOptions: CategorySubItem[] = [];
                if (currentMain.areas && currentMain.areas.length > 0) {
                  if (!catPickAreaCode) return null;
                  subOptions = currentMain.areas.find(a => a.code === catPickAreaCode)?.sub_categories ?? [];
                } else {
                  subOptions = currentMain.sub_categories ?? [];
                }
                if (subOptions.length === 0) return null;
                return (
                  <div className="flex flex-col gap-1">
                    <label className="text-xs" style={{ color: SILVER_DIM }}>소카테고리</label>
                    <select
                      value={catPickSubId}
                      onChange={(e) => setCatPickSubId(e.target.value)}
                      className="px-3 py-2 rounded-lg text-xs outline-none"
                      style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${SILVER_FAINT}`, color: "#e0e8f0" }}
                    >
                      <option value="">(소카테고리 선택 안 함)</option>
                      {subOptions.map(s => (
                        <option key={s.id} value={s.id}>{s.name_ko}</option>
                      ))}
                    </select>
                  </div>
                );
              })()}
              <div className="flex gap-2 justify-end mt-1">
                <button
                  onClick={() => setCategorizingFamilyId(null)}
                  className="text-xs px-4 py-2 rounded-lg"
                  style={{ backgroundColor: SILVER_FAINT, color: SILVER }}
                >
                  취소
                </button>
                <button
                  onClick={submitCategorize}
                  className="text-xs px-4 py-2 rounded-lg font-bold"
                  style={{ backgroundColor: "rgba(100,220,160,0.25)", border: "1px solid rgba(100,220,160,0.6)", color: "rgba(150,255,200,1)" }}
                >
                  적용
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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

// ── 헬퍼: 스타일링된 HTML 문서 빌드 ────────────────────────────────
// printMode=true면 인쇄 친화 스타일(여백·페이지 브레이크) 추가
function buildHtmlDoc(title: string, bodyHtml: string, printMode = false): string {
  const escTitle = title.replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] ?? c));
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escTitle}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  body {
    font-family: -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", "맑은 고딕", sans-serif;
    line-height: 1.7;
    color: #1a1a1a;
    max-width: 820px;
    margin: 0 auto;
    padding: 48px 32px;
    background: #fff;
  }
  h1 { font-size: 28px; margin: 0 0 24px; padding-bottom: 12px; border-bottom: 2px solid #333; }
  h2 { font-size: 22px; margin: 36px 0 14px; padding-bottom: 8px; border-bottom: 1px solid #ccc; }
  h3 { font-size: 18px; margin: 28px 0 10px; color: #333; }
  h4 { font-size: 15px; margin: 22px 0 8px; color: #555; }
  p { margin: 10px 0; }
  ul, ol { margin: 10px 0; padding-left: 28px; }
  li { margin: 4px 0; }
  strong { color: #000; }
  em { color: #444; }
  code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; font-size: 0.92em; font-family: "SF Mono", Consolas, monospace; }
  pre { background: #f5f5f5; padding: 14px; border-radius: 6px; overflow-x: auto; }
  pre code { background: transparent; padding: 0; }
  blockquote { border-left: 4px solid #999; padding: 4px 16px; margin: 14px 0; color: #555; background: #fafafa; }
  table { border-collapse: collapse; width: 100%; margin: 14px 0; }
  th, td { border: 1px solid #ccc; padding: 8px 12px; text-align: left; }
  th { background: #f0f0f0; font-weight: 600; }
  a { color: #0066cc; }
  hr { border: none; border-top: 1px solid #ccc; margin: 28px 0; }
  .footer { margin-top: 48px; padding-top: 14px; border-top: 1px solid #ccc; color: #888; font-size: 11px; text-align: center; }
  ${printMode ? `
    @page { size: A4; margin: 18mm 16mm; }
    @media print {
      body { padding: 0; max-width: none; }
      h1, h2, h3 { page-break-after: avoid; }
      pre, blockquote, table { page-break-inside: avoid; }
    }
  ` : ""}
</style>
</head>
<body>
${bodyHtml}
<div class="footer">조던 — 게임 기획 전문가 · ${new Date().toLocaleString("ko-KR")}</div>
</body>
</html>`;
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

"use client";

// 대본 보관·편집 페이지 (/scripts)
// - 좌: 대본 목록  /  우: 편집기 (제목 + 본문 + 자동저장 + 미리보기)
// - 반응형: PC는 2단, 모바일은 단일 화면(목록 ↔ 편집 전환)
// - 기획서와 분리된 독립 공간. Supabase scripts 테이블 사용.

import { useState, useEffect, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const BG = "#0a0e1a";
const SILVER = "#c0c8d8";
const SILVER_DIM = "rgba(192,200,216,0.5)";
const SILVER_FAINT = "rgba(192,200,216,0.15)";
const PANEL = "rgba(255,255,255,0.03)";

type ScriptMeta = {
  id: string;
  title: string;
  status: string;
  created_at: string;
  updated_at: string;
};

type SaveState = "idle" | "saving" | "saved" | "dirty";

function fmtTime(iso: string) {
  try {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch {
    return "";
  }
}

export default function ScriptsPage() {
  const [list, setList] = useState<ScriptMeta[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [showPreview, setShowPreview] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "editor">("list");
  const [loading, setLoading] = useState(true);

  const skipSave = useRef(false);     // 대본 로드 직후 자동저장 1회 방지
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── 목록 로드 ──────────────────────────────────────────────
  const loadList = useCallback(async () => {
    try {
      const res = await fetch("/api/scripts");
      const data = await res.json();
      setList(data.scripts ?? []);
    } catch {
      /* noop */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  // ── 대본 열기 ──────────────────────────────────────────────
  async function openScript(id: string) {
    try {
      const res = await fetch(`/api/scripts/${id}`);
      const data = await res.json();
      if (data.script) {
        skipSave.current = true; // 로드로 인한 state 변경은 저장하지 않음
        setSelectedId(id);
        setTitle(data.script.title ?? "");
        setContent(data.script.content ?? "");
        setSaveState("idle");
        setShowPreview(false);
        setMobileView("editor");
      }
    } catch {
      /* noop */
    }
  }

  // ── 새 대본 ────────────────────────────────────────────────
  async function newScript() {
    try {
      const res = await fetch("/api/scripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "제목 없는 대본", content: "" }),
      });
      const data = await res.json();
      if (data.script) {
        setList((prev) => [data.script, ...prev]);
        skipSave.current = true;
        setSelectedId(data.script.id);
        setTitle(data.script.title);
        setContent("");
        setSaveState("idle");
        setShowPreview(false);
        setMobileView("editor");
      }
    } catch {
      /* noop */
    }
  }

  // ── 저장 (PATCH) ───────────────────────────────────────────
  const save = useCallback(async () => {
    if (!selectedId) return;
    setSaveState("saving");
    try {
      const res = await fetch(`/api/scripts/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content }),
      });
      const data = await res.json();
      if (data.script) {
        setSaveState("saved");
        // 목록의 제목·수정시각 갱신 + 최신순 재정렬
        setList((prev) =>
          [data.script, ...prev.filter((s) => s.id !== data.script.id)].map((s) =>
            s.id === data.script.id
              ? { ...s, title: data.script.title, updated_at: data.script.updated_at, status: data.script.status }
              : s
          )
        );
      } else {
        setSaveState("dirty");
      }
    } catch {
      setSaveState("dirty");
    }
  }, [selectedId, title, content]);

  // ── 자동저장: 편집 1.5초 후 ────────────────────────────────
  useEffect(() => {
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    if (!selectedId) return;
    setSaveState("dirty");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save(), 1500);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [title, content, selectedId, save]);

  // Ctrl/Cmd+S 즉시 저장
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (saveTimer.current) clearTimeout(saveTimer.current);
        save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  // ── 삭제 ───────────────────────────────────────────────────
  async function deleteScript() {
    if (!selectedId) return;
    if (!window.confirm("이 대본을 삭제할까요? 되돌릴 수 없어요.")) return;
    try {
      await fetch(`/api/scripts/${selectedId}`, { method: "DELETE" });
      setList((prev) => prev.filter((s) => s.id !== selectedId));
      setSelectedId(null);
      setTitle("");
      setContent("");
      setMobileView("list");
    } catch {
      /* noop */
    }
  }

  const saveLabel =
    saveState === "saving" ? "저장 중…" :
    saveState === "saved" ? "저장됨" :
    saveState === "dirty" ? "수정됨 (곧 저장)" : "";

  return (
    <div className="flex flex-col h-screen" style={{ backgroundColor: BG, color: SILVER }}>
      {/* 헤더 */}
      <header className="px-4 py-3 flex items-center gap-3 flex-shrink-0" style={{ borderBottom: `1px solid ${SILVER_FAINT}`, backgroundColor: "rgba(0,0,0,0.4)" }}>
        <a href="/chat" className="text-sm px-2.5 py-1.5 rounded-lg" style={{ backgroundColor: SILVER_FAINT, border: `1px solid ${SILVER_FAINT}`, color: SILVER }}>← 채팅</a>
        <span className="font-bold text-sm">📜 대본</span>
        <button onClick={newScript} className="ml-auto text-sm px-3 py-1.5 rounded-lg font-bold" style={{ backgroundColor: SILVER, color: BG }}>+ 새 대본</button>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* ── 목록 (모바일: editor 보기일 땐 숨김 / PC: 항상) ── */}
        <aside
          className={`${mobileView === "editor" ? "hidden md:flex" : "flex"} flex-col w-full md:w-72 md:flex-shrink-0 overflow-y-auto`}
          style={{ borderRight: `1px solid ${SILVER_FAINT}` }}
        >
          {loading ? (
            <p className="p-4 text-sm" style={{ color: SILVER_DIM }}>불러오는 중…</p>
          ) : list.length === 0 ? (
            <p className="p-4 text-sm leading-relaxed" style={{ color: SILVER_DIM }}>아직 대본이 없어요.<br />[+ 새 대본]으로 시작하세요.</p>
          ) : (
            list.map((s) => (
              <button
                key={s.id}
                onClick={() => openScript(s.id)}
                className="text-left px-4 py-3 w-full"
                style={{
                  borderBottom: `1px solid ${SILVER_FAINT}`,
                  backgroundColor: s.id === selectedId ? "rgba(192,200,216,0.08)" : "transparent",
                }}
              >
                <div className="text-sm font-medium truncate" style={{ color: SILVER }}>{s.title || "제목 없음"}</div>
                <div className="text-xs mt-0.5" style={{ color: SILVER_DIM }}>{fmtTime(s.updated_at)}{s.status === "final" ? " · 완성" : ""}</div>
              </button>
            ))
          )}
        </aside>

        {/* ── 편집기 (모바일: list 보기일 땐 숨김 / PC: 항상) ── */}
        <main className={`${mobileView === "list" ? "hidden md:flex" : "flex"} flex-col flex-1 min-w-0`}>
          {!selectedId ? (
            <div className="flex-1 flex items-center justify-center p-6 text-center text-sm" style={{ color: SILVER_DIM }}>
              왼쪽에서 대본을 선택하거나<br />새 대본을 만들어 주세요.
            </div>
          ) : (
            <>
              {/* 편집기 툴바 */}
              <div className="px-4 py-2 flex items-center gap-2 flex-shrink-0" style={{ borderBottom: `1px solid ${SILVER_FAINT}` }}>
                <button onClick={() => setMobileView("list")} className="md:hidden text-sm px-2 py-1 rounded" style={{ backgroundColor: SILVER_FAINT, color: SILVER }}>← 목록</button>
                <button onClick={() => setShowPreview((v) => !v)} className="text-sm px-2.5 py-1 rounded" style={{ backgroundColor: showPreview ? "rgba(100,180,255,0.22)" : SILVER_FAINT, border: `1px solid ${SILVER_FAINT}`, color: SILVER }}>
                  {showPreview ? "✏️ 편집" : "👁 미리보기"}
                </button>
                <span className="text-xs" style={{ color: SILVER_DIM }}>{saveLabel}</span>
                <button onClick={deleteScript} className="ml-auto text-sm px-2.5 py-1 rounded" style={{ backgroundColor: "rgba(255,90,90,0.12)", border: "1px solid rgba(255,90,90,0.35)", color: "#ff8a8a" }}>삭제</button>
              </div>

              {/* 제목 */}
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="대본 제목"
                className="px-4 py-3 text-lg font-bold bg-transparent outline-none flex-shrink-0"
                style={{ color: SILVER, borderBottom: `1px solid ${SILVER_FAINT}` }}
              />

              {/* 본문: 편집 or 미리보기 */}
              {showPreview ? (
                <div className="flex-1 overflow-y-auto px-4 py-4 prose prose-invert max-w-none" style={{ color: SILVER }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{content || "_(내용 없음)_"}</ReactMarkdown>
                </div>
              ) : (
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="여기에 대본을 작성하세요. 마크다운 표·제목 등 사용 가능. (Ctrl/⌘+S 즉시 저장)"
                  className="flex-1 w-full px-4 py-4 bg-transparent outline-none resize-none text-sm leading-relaxed"
                  style={{ color: SILVER, fontFamily: "inherit" }}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

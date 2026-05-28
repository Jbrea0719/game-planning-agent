"use client";

// 모바일 전용 챗 페이지
// 데스크톱과 동일한 백엔드(/api/agent, Supabase)를 호출 — 데이터 자동 공유
// 기존 모달 컴포넌트(DecisionPanel·DocumentView)는 재사용

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import ReactMarkdown from "react-markdown";
import DecisionPanel from "@/components/DecisionPanel";
import DocumentView from "@/components/DocumentView";

const SILVER = "#c0c8d8";
const SILVER_DIM = "rgba(192,200,216,0.5)";
const SILVER_FAINT = "rgba(192,200,216,0.15)";
const DEFAULT_PROJECT_ID = "00000000-0000-0000-0000-000000000001";

type Message = { role: "user" | "assistant"; content: string };
type Pair = { pair_id: string; user: Message; assistant: Message; timestamp?: string };

export default function MobileChatPage() {
  const [nickname, setNickname] = useState("");
  const [nicknameInput, setNicknameInput] = useState("");
  const [showNicknameModal, setShowNicknameModal] = useState(false);
  const sessionId = nickname ? `agent:${nickname}` : null;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem("jordan_agent_nickname");
    if (saved) setNickname(saved);
    else setShowNicknameModal(true);
  }, []);

  function confirmNickname() {
    const v = nicknameInput.trim();
    if (!v) return;
    localStorage.setItem("jordan_agent_nickname", v);
    setNickname(v);
    setShowNicknameModal(false);
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: "linear-gradient(160deg, #0a0e1a 0%, #0d1525 50%, #0a1020 100%)" }}>
      {showNicknameModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="rounded-2xl p-6 w-full max-w-xs shadow-2xl" style={{ backgroundColor: "#0f1628", border: `1px solid ${SILVER_FAINT}` }}>
            <p className="text-sm font-bold mb-1" style={{ color: SILVER }}>입장하기</p>
            <p className="text-xs mb-4" style={{ color: SILVER_DIM }}>닉네임을 입력하면 대화 기록이 저장돼요</p>
            <input
              value={nicknameInput}
              onChange={(e) => setNicknameInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirmNickname()}
              placeholder="닉네임"
              autoFocus
              className="w-full px-3 py-2.5 rounded-lg text-sm outline-none mb-3"
              style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${SILVER_FAINT}`, color: "#e0e8f0" }}
            />
            <button
              onClick={confirmNickname}
              disabled={!nicknameInput.trim()}
              className="w-full py-2.5 rounded-lg text-sm font-bold disabled:opacity-40"
              style={{ backgroundColor: SILVER, color: "#0a0e1a" }}
            >
              입장
            </button>
          </div>
        </div>
      )}

      {sessionId && <MobileChat sessionId={sessionId} nickname={nickname} />}
    </div>
  );
}

// ── 본 챗 영역 ────────────────────────────────────────────────────
function MobileChat({ sessionId, nickname }: { sessionId: string; nickname: string }) {
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [streaming, setStreaming] = useState<{ user: string; assistant: string } | null>(null);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // UI 상태
  const [showMenu, setShowMenu] = useState(false);
  const [showBible, setShowBible] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  // 설정 상태
  const [showCitations, setShowCitations] = useState(false);
  const [contextAnchorPairId, setContextAnchorPairId] = useState<string | null>(null);
  const [contextAnchorTimestamp, setContextAnchorTimestamp] = useState<string | null>(null);

  // 바이블 카운트 + 리로드
  const [decisionCount, setDecisionCount] = useState(0);
  const [decisionReloadKey, setDecisionReloadKey] = useState(0);
  const [docReloadKey, setDocReloadKey] = useState(0);

  // 기획서 신규 알림
  const [docNewDot, setDocNewDot] = useState(false);
  // 바이블 신규 알림
  const [bibleNewDot, setBibleNewDot] = useState(false);
  const prevCountRef = useRef(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // 토글·맥락선 localStorage 복원
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem("jordan_show_citations") === "true") setShowCitations(true);
    if (localStorage.getItem("jordan_doc_new_dot") === "true") setDocNewDot(true);
    const savedAnchorPair = localStorage.getItem(`jordan_context_anchor_pair:${sessionId}`);
    const savedAnchorTime = localStorage.getItem(`jordan_context_anchor_time:${sessionId}`);
    if (savedAnchorPair) setContextAnchorPairId(savedAnchorPair);
    if (savedAnchorTime) setContextAnchorTimestamp(savedAnchorTime);
  }, [sessionId]);

  // 출처 표시 저장
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("jordan_show_citations", String(showCitations));
  }, [showCitations]);

  // 바이블 카운트 증가 → 빨간 점
  useEffect(() => {
    const prev = prevCountRef.current;
    if (decisionCount > prev && prev !== 0) {
      setBibleNewDot(true);
      const t = setTimeout(() => setBibleNewDot(false), 2 * 60 * 1000);
      return () => clearTimeout(t);
    }
    prevCountRef.current = decisionCount;
  }, [decisionCount]);

  // 메시지 로드
  useEffect(() => {
    fetch(`/api/messages?session_id=${encodeURIComponent(sessionId)}`)
      .then(r => r.json())
      .then(data => {
        if (data.messages?.length > 0) {
          const pairMap = new Map<string, { user?: Message; assistant?: Message }>();
          const order: string[] = [];
          for (const m of data.messages) {
            if (m.is_deleted) continue;
            const pid = m.pair_id ?? "unknown";
            if (!pairMap.has(pid)) { pairMap.set(pid, {}); order.push(pid); }
            if (m.role === "user") pairMap.get(pid)!.user = m;
            else pairMap.get(pid)!.assistant = m;
          }
          setPairs(order.map(pid => {
            const e = pairMap.get(pid)!;
            if (!e.user || !e.assistant) return null;
            return { pair_id: pid, user: e.user, assistant: e.assistant };
          }).filter(Boolean) as Pair[]);
        }
      })
      .catch(() => {});
  }, [sessionId]);

  // 자동 스크롤
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [pairs, streaming]);

  // 맥락선 설정/해제
  function setContextAnchor(pairId: string, timestamp: string) {
    setContextAnchorPairId(pairId);
    setContextAnchorTimestamp(timestamp);
    localStorage.setItem(`jordan_context_anchor_pair:${sessionId}`, pairId);
    localStorage.setItem(`jordan_context_anchor_time:${sessionId}`, timestamp);
  }
  function clearContextAnchor() {
    setContextAnchorPairId(null);
    setContextAnchorTimestamp(null);
    localStorage.removeItem(`jordan_context_anchor_pair:${sessionId}`);
    localStorage.removeItem(`jordan_context_anchor_time:${sessionId}`);
  }

  async function sendMessage() {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    const pairId = crypto.randomUUID();

    const visiblePairs = pairs;
    let relevantPairs = visiblePairs;
    if (contextAnchorPairId) {
      const idx = visiblePairs.findIndex(p => p.pair_id === contextAnchorPairId);
      if (idx >= 0) relevantPairs = visiblePairs.slice(idx);
    }
    const allMessages = [
      ...relevantPairs.flatMap(p => [
        { role: p.user.role, content: p.user.content },
        { role: p.assistant.role, content: p.assistant.content },
      ]),
      { role: "user" as const, content: trimmed },
    ];
    setStreaming({ user: trimmed, assistant: "" });
    setInput("");
    setIsLoading(true);
    if (inputRef.current) { inputRef.current.style.height = "auto"; }

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: allMessages,
          session_id: sessionId,
          pair_id: pairId,
          agentContext: "",
          show_citations: showCitations,
          context_anchor_time: contextAnchorTimestamp,
        }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error("err");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let text = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value);
        let display = text;
        const idx = display.indexOf("__JORDAN_ANSWER_START__");
        if (idx !== -1) display = display.slice(idx + "__JORDAN_ANSWER_START__".length).trimStart();
        display = display.replace(/\n__JORDAN_CRITIC_START__[\s\S]*?__JORDAN_CRITIC_END__$/, "");
        display = display.replace(/__DECISIONS_(EXTRACTED|HELD)__\d+/g, "");
        display = display.replace("__TRUNCATED__", "");
        setStreaming({ user: trimmed, assistant: display });
      }
      let clean = text;
      const extractedMatch = text.match(/__DECISIONS_EXTRACTED__(\d+)/);
      if (extractedMatch && parseInt(extractedMatch[1], 10) > 0) {
        setDecisionReloadKey(k => k + 1);
      }
      const startIdx = clean.indexOf("__JORDAN_ANSWER_START__");
      if (startIdx !== -1) clean = clean.slice(startIdx + "__JORDAN_ANSWER_START__".length).trimStart();
      clean = clean.replace(/\n__JORDAN_CRITIC_START__[\s\S]*?__JORDAN_CRITIC_END__/, "");
      clean = clean.replace(/__DECISIONS_(EXTRACTED|HELD)__\d+/g, "");
      clean = clean.replace("__TRUNCATED__", "").trimEnd();

      setPairs(prev => [...prev, {
        pair_id: pairId,
        user: { role: "user", content: trimmed },
        assistant: { role: "assistant", content: clean },
      }]);
      setStreaming(null);
    } catch {
      // 무시
    } finally {
      abortRef.current = null;
      setIsLoading(false);
    }
  }

  function cancelStream() {
    abortRef.current?.abort();
    setStreaming(null);
    setIsLoading(false);
  }

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && e.altKey) { e.preventDefault(); setInput(p => p + "\n"); }
    else if (e.key === "Enter" && !e.shiftKey && !e.altKey) { e.preventDefault(); sendMessage(); }
  }

  function openMenu(key: "bible" | "docs" | "settings" | "guide") {
    setShowMenu(false);
    if (key === "bible") { setShowBible(true); setBibleNewDot(false); }
    if (key === "docs") {
      setShowDocs(true);
      setDocNewDot(false);
      if (typeof window !== "undefined") localStorage.removeItem("jordan_doc_new_dot");
    }
    if (key === "settings") setShowSettings(true);
    if (key === "guide") setShowGuide(true);
  }

  const isAdmin = nickname === "정민";

  return (
    <>
      {/* 헤더 */}
      <header className="px-3 py-2.5 flex items-center gap-2 flex-shrink-0" style={{ backgroundColor: "rgba(0,0,0,0.4)", borderBottom: `1px solid ${SILVER_FAINT}` }}>
        <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0" style={{ border: `1px solid ${SILVER_DIM}` }}>
          <img src="/avatar.jpg" alt="조던" className="w-full h-full object-cover" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm truncate" style={{ color: SILVER }}>조던</p>
          <p className="text-[10px] truncate" style={{ color: SILVER_DIM }}>난 게임기획자이자 게임마스터 조던!</p>
        </div>

        {/* 핵심 버튼 — 책(바이블) + 기획서 */}
        <button
          onClick={() => openMenu("bible")}
          className="flex items-center justify-center w-9 h-9 rounded-lg flex-shrink-0 relative"
          style={{ backgroundColor: SILVER_FAINT, border: `1px solid ${SILVER_DIM}`, color: SILVER, fontSize: "14px" }}
          aria-label="기획 바이블"
        >
          📚
          {bibleNewDot && (
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full animate-pulse"
              style={{ backgroundColor: "rgba(255,80,80,0.95)" }} />
          )}
        </button>
        <button
          onClick={() => openMenu("docs")}
          className="flex items-center justify-center w-9 h-9 rounded-lg flex-shrink-0 relative"
          style={{ backgroundColor: SILVER_FAINT, border: `1px solid ${SILVER_DIM}`, color: SILVER, fontSize: "14px" }}
          aria-label="기획서"
        >
          📄
          {docNewDot && (
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full animate-pulse"
              style={{ backgroundColor: "rgba(255,80,80,0.95)" }} />
          )}
        </button>
        <button
          onClick={() => setShowMenu(v => !v)}
          className="flex items-center justify-center w-9 h-9 rounded-lg flex-shrink-0"
          style={{ backgroundColor: SILVER_FAINT, border: `1px solid ${SILVER_DIM}`, color: SILVER }}
          aria-label="메뉴"
        >
          <span style={{ fontSize: "16px" }}>☰</span>
        </button>
      </header>

      {/* 햄버거 드로어 */}
      {showMenu && (
        <div className="fixed inset-0 z-40 flex justify-end" onClick={() => setShowMenu(false)}>
          <div
            className="w-3/4 max-w-xs h-full flex flex-col"
            style={{ backgroundColor: "#0a0e1a", borderLeft: `1px solid ${SILVER_FAINT}` }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: `1px solid ${SILVER_FAINT}` }}>
              <p className="text-sm font-bold" style={{ color: SILVER }}>메뉴</p>
              <button onClick={() => setShowMenu(false)} className="text-xs px-2 py-1 rounded" style={{ backgroundColor: SILVER_FAINT, color: SILVER_DIM }}>✕</button>
            </div>
            <div className="flex-1 overflow-y-auto py-2">
              <MenuBtn icon="📌" label={contextAnchorPairId ? "맥락선 해제" : "맥락선"} subtitle={contextAnchorPairId ? "이 시점부터 조던에게 전달 중" : "설정 안 됨"}
                onClick={() => { setShowMenu(false); if (contextAnchorPairId) clearContextAnchor(); }} />
              <MenuBtn icon="📚" label="기획 바이블" subtitle={`현재 ${decisionCount}개 누적`} onClick={() => openMenu("bible")} />
              <MenuBtn icon="📄" label="기획서" subtitle="작성·열람·수정" onClick={() => openMenu("docs")} />
              <MenuBtn icon="⚙️" label="설정" subtitle="출처표시·참고게임·관리도구" onClick={() => openMenu("settings")} />
              <MenuBtn icon="📖" label="가이드" subtitle="조던 사용법" onClick={() => openMenu("guide")} />
              <div className="px-4 py-3 mt-2" style={{ borderTop: `1px solid ${SILVER_FAINT}` }}>
                <p className="text-[10px]" style={{ color: SILVER_DIM }}>
                  닉네임: <b style={{ color: SILVER }}>{nickname}</b>{isAdmin && " (관리자)"}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 메시지 영역 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4" style={{ scrollbarWidth: "thin" }}>
        <div className="space-y-4 max-w-xl mx-auto">
          {pairs.length === 0 && !streaming && (
            <div className="text-center mt-12 px-4">
              <div className="w-14 h-14 rounded-full mx-auto overflow-hidden mb-3" style={{ border: `1px solid ${SILVER_DIM}` }}>
                <img src="/avatar.jpg" alt="조던" className="w-full h-full object-cover" />
              </div>
              <p className="text-sm font-medium mb-1" style={{ color: SILVER }}>조던</p>
              <p className="text-xs px-3 py-1.5 rounded-full inline-block" style={{ backgroundColor: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.2)", color: "#34d399" }}>
                ✨ 다양한 수집형 게임 경험
              </p>
              <p className="text-xs mt-3" style={{ color: SILVER_DIM }}>
                AFK Arena · 세븐나이츠 · 니케 · 원신<br />무엇이든 물어봐
              </p>
            </div>
          )}
          {pairs.map(pair => {
            const isAnchor = pair.pair_id === contextAnchorPairId;
            const anchorIdx = contextAnchorPairId ? pairs.findIndex(p => p.pair_id === contextAnchorPairId) : -1;
            const myIdx = pairs.findIndex(p => p.pair_id === pair.pair_id);
            const isBeforeAnchor = anchorIdx >= 0 && myIdx < anchorIdx;
            return (
              <div key={pair.pair_id} className="space-y-2" style={{ opacity: isBeforeAnchor ? 0.4 : 1 }}>
                {isAnchor && (
                  <div className="flex items-center gap-2 py-1" style={{ color: "rgba(255,200,100,0.9)" }}>
                    <div className="flex-1" style={{ borderTop: "1px dashed rgba(255,200,100,0.6)" }} />
                    <span className="text-[10px] font-medium flex items-center gap-1">
                      📌 맥락선
                      <button onClick={clearContextAnchor} className="px-1 rounded hover:bg-white/10" style={{ color: "rgba(255,200,100,0.8)" }}>✕</button>
                    </span>
                    <div className="flex-1" style={{ borderTop: "1px dashed rgba(255,200,100,0.6)" }} />
                  </div>
                )}
                {/* 내 질문 */}
                <div className="flex justify-end items-end gap-1">
                  <button
                    onClick={() => setContextAnchor(pair.pair_id, pair.timestamp ?? new Date().toISOString())}
                    className="text-[10px] px-1.5 py-0.5 rounded"
                    style={{
                      backgroundColor: isAnchor ? "rgba(255,200,100,0.3)" : "rgba(255,200,100,0.1)",
                      color: "rgba(255,220,150,0.9)",
                    }}
                    title="이 시점에 맥락선 설정"
                  >📌</button>
                  <div className="max-w-[80%] px-3 py-2 rounded-2xl rounded-tr-sm text-sm whitespace-pre-wrap" style={{ backgroundColor: SILVER, color: "#0a0e1a" }}>
                    {pair.user.content}
                  </div>
                </div>
                {/* 조던 답변 */}
                <div className="flex items-start gap-2">
                  <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0" style={{ border: `1px solid ${SILVER_DIM}` }}>
                    <img src="/avatar.jpg" alt="조던" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="px-3 py-2 rounded-2xl rounded-tl-sm text-sm prose prose-sm max-w-none"
                      style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${SILVER_FAINT}`, color: "#e0e8f0" }}>
                      <ReactMarkdown>{pair.assistant.content}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {streaming && (
            <div className="space-y-2">
              <div className="flex justify-end items-end gap-2">
                <button
                  onClick={cancelStream}
                  className="text-[10px] px-2 py-1 rounded"
                  style={{ backgroundColor: "rgba(255,80,80,0.12)", color: "#f87171", border: "1px solid rgba(255,80,80,0.35)" }}
                >취소</button>
                <div className="max-w-[80%] px-3 py-2 rounded-2xl rounded-tr-sm text-sm" style={{ backgroundColor: SILVER, color: "#0a0e1a" }}>
                  {streaming.user}
                </div>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0" style={{ border: `1px solid ${SILVER_DIM}` }}>
                  <img src="/avatar.jpg" alt="조던" className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="px-3 py-2 rounded-2xl rounded-tl-sm text-sm prose prose-sm max-w-none"
                    style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${SILVER_FAINT}`, color: "#e0e8f0" }}>
                    {streaming.assistant ? <ReactMarkdown>{streaming.assistant}</ReactMarkdown> : <span style={{ color: SILVER_DIM }} className="animate-pulse">···</span>}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 입력창 */}
      <div className="px-3 py-2.5 flex gap-2 items-end flex-shrink-0" style={{ backgroundColor: "rgba(0,0,0,0.5)", borderTop: `1px solid ${SILVER_FAINT}` }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="질문해줘..."
          disabled={isLoading}
          rows={1}
          className="flex-1 px-3 py-2.5 rounded-xl text-sm outline-none resize-none"
          style={{ backgroundColor: "rgba(255,255,255,0.07)", border: `1px solid ${SILVER_FAINT}`, color: "#e0e8f0", maxHeight: "120px", lineHeight: "1.45" }}
          onInput={(e) => {
            const el = e.currentTarget;
            el.style.height = "auto";
            el.style.height = Math.min(el.scrollHeight, 120) + "px";
          }}
        />
        <button
          onClick={sendMessage}
          disabled={isLoading || !input.trim()}
          className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 font-bold disabled:opacity-40"
          style={{ backgroundColor: SILVER, color: "#0a0e1a" }}
        >
          ➤
        </button>
      </div>

      {/* 모달들 — 기존 컴포넌트 재사용 */}
      <DecisionPanel
        open={showBible}
        onClose={() => setShowBible(false)}
        projectId={DEFAULT_PROJECT_ID}
        nickname={nickname}
        onCountChange={setDecisionCount}
        reloadKey={decisionReloadKey}
      />
      <DocumentView
        open={showDocs}
        onClose={() => setShowDocs(false)}
        projectId={DEFAULT_PROJECT_ID}
        nickname={nickname}
        reloadKey={docReloadKey}
      />

      {/* 설정 모달 */}
      {showSettings && (
        <MobileSettings
          isAdmin={isAdmin}
          showCitations={showCitations}
          setShowCitations={setShowCitations}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* 가이드 모달 */}
      {showGuide && <MobileGuide onClose={() => setShowGuide(false)} />}
    </>
  );
}

// ── 메뉴 버튼 ──────────────────────────────────────────────────────
function MenuBtn({ icon, label, subtitle, onClick }: {
  icon: string; label: string; subtitle?: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full px-4 py-2.5 text-left flex items-center gap-3 hover:bg-white/5"
      style={{ color: SILVER }}
    >
      <span style={{ fontSize: "16px" }}>{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{label}</p>
        {subtitle && <p className="text-[10px] truncate" style={{ color: SILVER_DIM }}>{subtitle}</p>}
      </div>
    </button>
  );
}

// ── 모바일 설정 모달 ──────────────────────────────────────────────
function MobileSettings({
  isAdmin, showCitations, setShowCitations, onClose,
}: {
  isAdmin: boolean;
  showCitations: boolean;
  setShowCitations: (v: boolean) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div
        className="w-full max-h-[90vh] flex flex-col rounded-t-2xl"
        style={{ backgroundColor: "#0f1628", border: `1px solid ${SILVER_FAINT}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderBottom: `1px solid ${SILVER_FAINT}` }}>
          <div>
            <p className="text-sm font-bold flex items-center gap-2" style={{ color: SILVER }}>⚙️ 설정</p>
            <p className="text-[10px] mt-0.5" style={{ color: SILVER_DIM }}>{isAdmin ? "관리자 모드" : "뷰어 모드"}</p>
          </div>
          <button onClick={onClose} className="text-xs px-3 py-1.5 rounded-lg" style={{ backgroundColor: SILVER_FAINT, color: SILVER_DIM }}>닫기</button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* 출처 표시 */}
          <section>
            <p className="text-xs font-bold mb-2" style={{ color: "rgba(150,255,200,1)" }}>🏷️ 답변 표시</p>
            <div className="px-3 py-2.5 rounded-lg flex items-center justify-between" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: `1px solid ${SILVER_FAINT}` }}>
              <div className="flex-1">
                <p className="text-xs font-medium" style={{ color: SILVER }}>출처 표시</p>
                <p className="text-[10px] mt-0.5" style={{ color: SILVER_DIM }}>답변에 [공식 인용] 같은 라벨</p>
              </div>
              <button
                onClick={() => setShowCitations(!showCitations)}
                className="text-xs px-3 py-1.5 rounded-lg font-medium ml-2 flex-shrink-0"
                style={{
                  backgroundColor: showCitations ? "rgba(100,220,160,0.25)" : SILVER_FAINT,
                  border: `1px solid ${showCitations ? "rgba(100,220,160,0.7)" : SILVER_DIM}`,
                  color: showCitations ? "rgba(150,255,200,1)" : SILVER,
                }}
              >
                {showCitations ? "ON" : "OFF"}
              </button>
            </div>
          </section>

          {/* 관리 도구 */}
          <section>
            <div className="flex items-center gap-2 mb-2">
              <p className="text-xs font-bold" style={{ color: "rgba(255,220,150,1)" }}>🛠️ 관리 도구</p>
              {!isAdmin && (
                <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgba(255,200,100,0.1)", color: "rgba(255,220,150,0.7)" }}>
                  🔒 관리자 전용
                </span>
              )}
            </div>
            <div className="px-3 py-2.5 rounded-lg flex items-center justify-between" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: `1px solid ${SILVER_FAINT}`, opacity: isAdmin ? 1 : 0.5 }}>
              <div className="flex-1">
                <p className="text-xs font-medium" style={{ color: SILVER }}>게임 도메인 큐레이션</p>
                <p className="text-[10px] mt-0.5" style={{ color: SILVER_DIM }}>{isAdmin ? "신뢰 사이트 등록" : "정민만 접근 가능"}</p>
              </div>
              <button
                onClick={() => isAdmin && window.open("/admin/curation", "_blank")}
                disabled={!isAdmin}
                className="text-xs px-3 py-1.5 rounded-lg font-medium ml-2 flex-shrink-0 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: isAdmin ? "rgba(255,200,100,0.2)" : SILVER_FAINT,
                  border: `1px solid ${isAdmin ? "rgba(255,200,100,0.5)" : SILVER_DIM}`,
                  color: isAdmin ? "rgba(255,220,150,1)" : SILVER_DIM,
                }}
              >
                열기 →
              </button>
            </div>
          </section>

          {/* 답변 모델 */}
          <section>
            <p className="text-xs font-bold mb-2" style={{ color: "rgba(200,180,255,1)" }}>🤖 답변 모델</p>
            <div className="px-3 py-2.5 rounded-lg flex flex-col gap-1.5" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: `1px solid ${SILVER_FAINT}` }}>
              <div className="flex items-center justify-between">
                <p className="text-xs" style={{ color: SILVER }}>최종 답변</p>
                <span className="text-[10px] px-2 py-0.5 rounded font-bold" style={{ backgroundColor: "rgba(200,180,255,0.18)", color: "rgba(220,200,255,1)" }}>Opus 4.7</span>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs" style={{ color: SILVER }}>기획서 작성</p>
                <span className="text-[10px] px-2 py-0.5 rounded font-bold" style={{ backgroundColor: "rgba(200,180,255,0.18)", color: "rgba(220,200,255,1)" }}>Opus 4.7</span>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs" style={{ color: SILVER }}>내부 분석</p>
                <span className="text-[10px] px-2 py-0.5 rounded font-bold" style={{ backgroundColor: "rgba(100,180,255,0.15)", color: "rgba(180,210,255,1)" }}>Sonnet 4.5</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

// ── 모바일 가이드 모달 ────────────────────────────────────────────
function MobileGuide({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div
        className="w-full max-h-[90vh] flex flex-col rounded-t-2xl"
        style={{ backgroundColor: "#0f1628", border: `1px solid ${SILVER_FAINT}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderBottom: `1px solid ${SILVER_FAINT}` }}>
          <p className="text-sm font-bold flex items-center gap-2" style={{ color: SILVER }}>📖 사용 가이드</p>
          <button onClick={onClose} className="text-xs px-3 py-1.5 rounded-lg" style={{ backgroundColor: SILVER_FAINT, color: SILVER_DIM }}>닫기</button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 text-xs" style={{ color: "#b8c4d4", lineHeight: 1.55 }}>
          <section>
            <p className="font-bold mb-1.5" style={{ color: "rgba(150,255,200,1)" }}>🤖 조던이란?</p>
            <p>영웅수집형 게임 디렉터 AI. 분석부터 기획까지 같이 풀어가자.</p>
          </section>
          <section>
            <p className="font-bold mb-1.5" style={{ color: "rgba(180,210,255,1)" }}>📚 기획 바이블</p>
            <p>대화하면서 결정한 내용을 자동으로 누적·저장. 모든 기획서 작성 시 참조됨.</p>
          </section>
          <section>
            <p className="font-bold mb-1.5" style={{ color: "rgba(180,210,255,1)" }}>📄 기획서</p>
            <p>대화 기반·바이블 기반 기획서 생성. 자연어로 수정 요청 가능. MD/HTML/PDF 내보내기.</p>
          </section>
          <section>
            <p className="font-bold mb-1.5" style={{ color: "rgba(255,220,150,1)" }}>📌 맥락선</p>
            <p>메시지 옆 압정(📌) 탭 → 이 시점 이후만 조던에게 전달. 토큰 절약 + 새 주제 집중.</p>
          </section>
          <section>
            <p className="font-bold mb-1.5" style={{ color: "rgba(200,180,255,1)" }}>⚙️ 설정</p>
            <p>출처 표시 토글, 게임 도메인 큐레이션(관리자), 답변 모델 정보 확인.</p>
          </section>
          <section>
            <p className="font-bold mb-1.5" style={{ color: "rgba(150,255,200,1)" }}>💡 팁</p>
            <p>모바일과 PC는 같은 데이터를 공유해요. 둘 다 같은 닉네임으로 입장하면 대화·바이블·기획서가 자동 동기화됩니다.</p>
          </section>
        </div>
      </div>
    </div>
  );
}

"use client";

// 모바일 전용 챗 페이지
// 데스크톱과 동일한 백엔드(/api/agent, Supabase)를 호출 — 데이터 자동 공유
// 기존 모달 컴포넌트(DecisionPanel·DocumentView)는 재사용

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import ReactMarkdown from "react-markdown";
import dynamic from "next/dynamic";
import DecisionPanel from "@/components/DecisionPanel";
import DocumentView from "@/components/DocumentView";
import ExtractedReviewCard, { type ExtractedItem } from "@/components/ExtractedReviewCard";

// WireframeEditor·MockupGenerator는 DocumentView 안에서 호출 (📄 기획서 → 🎨 화면 설계)

const SILVER = "#c0c8d8";
const SILVER_DIM = "rgba(192,200,216,0.5)";
const SILVER_FAINT = "rgba(192,200,216,0.15)";
const DEFAULT_PROJECT_ID = "00000000-0000-0000-0000-000000000001";

type Message = { role: "user" | "assistant"; content: string };
type Pair = {
  pair_id: string;
  user: Message;
  assistant: Message;
  timestamp?: string;
  detail_content?: string;
  detail_loading?: boolean;
  detail_shown?: boolean;
};

export default function MobileChatPage({ simulateKeyboard = false }: { simulateKeyboard?: boolean }) {
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
    <div className="flex flex-col h-full overflow-hidden" style={{ background: "linear-gradient(160deg, #0a0e1a 0%, #0d1525 50%, #0a1020 100%)" }}>
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

      {sessionId && <MobileChat sessionId={sessionId} nickname={nickname} simulateKeyboard={simulateKeyboard} />}
    </div>
  );
}

// ── 본 챗 영역 ────────────────────────────────────────────────────
function MobileChat({ sessionId, nickname, simulateKeyboard }: { sessionId: string; nickname: string; simulateKeyboard?: boolean }) {
  const [keyboardOpen, setKeyboardOpen] = useState(false);
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
  // 화면 설계는 기획서 뷰에서 진입 (📄 → 🎨 화면 설계)

  // 설정 상태
  const [showCitations, setShowCitations] = useState(false);
  const [contextAnchorPairId, setContextAnchorPairId] = useState<string | null>(null);
  const [contextAnchorTimestamp, setContextAnchorTimestamp] = useState<string | null>(null);

  // 바이블 카운트 + 리로드
  const [decisionCount, setDecisionCount] = useState(0);
  const [decisionReloadKey, setDecisionReloadKey] = useState(0);
  const [docReloadKey, setDocReloadKey] = useState(0);
  // 카테고리 변경 시 증가 → 바이블 패널 카테고리 실시간 동기화
  const [categoryReloadKey, setCategoryReloadKey] = useState(0);

  // 기획서 신규 알림
  const [docNewDot, setDocNewDot] = useState(false);
  // 바이블 신규 알림
  const [bibleNewDot, setBibleNewDot] = useState(false);
  const prevCountRef = useRef(0);

  // 답변 피드백
  const [feedbacks, setFeedbacks] = useState<Record<string, "accurate" | "inaccurate">>({});
  const [reasonInputPairId, setReasonInputPairId] = useState<string | null>(null);
  const [reasonInputText, setReasonInputText] = useState("");

  // 기획서 작성 — 대화 선택 모드
  const [selectMode, setSelectMode] = useState(false);
  const [selectedPairIds, setSelectedPairIds] = useState<Set<string>>(new Set());
  const [docBackgroundGenerating, setDocBackgroundGenerating] = useState(false);
  const [docCompletedNotice, setDocCompletedNotice] = useState<{ title: string } | null>(null);
  const docGenAbortRef = useRef<AbortController | null>(null);

  // 메시지 액션 시트 (모바일에서는 메시지 탭 시 액션 메뉴)
  const [actionForPair, setActionForPair] = useState<string | null>(null);

  // 자동 추출 검토 카드
  const [extractedItems, setExtractedItems] = useState<ExtractedItem[]>([]);
  const [showExtractedReview, setShowExtractedReview] = useState(false);

  // 조던 인터뷰
  const [interviewLoading, setInterviewLoading] = useState(false);

  async function startInterview() {
    if (interviewLoading) return;
    setInterviewLoading(true);
    try {
      const recentTopics = pairs.slice(-10).map(p => p.user.content.slice(0, 40)).filter(c => c.length < 50);
      const res = await fetch("/api/jordan-interview/next-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: DEFAULT_PROJECT_ID, recent_topics: recentTopics }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) { alert(`질문 생성 실패: ${data.error ?? "오류"}`); return; }

      const pairId = crypto.randomUUID();
      const userMsg = "🎤 결정 안 된 영역 점검해줘";
      const question = `**🎤 조던 인터뷰** — ${data.category_hint ? `\`${data.category_hint}\` 영역.` : ""}\n\n${data.question}\n\n_답변해주시면 자동으로 바이블에 추가돼요._`;

      await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            { session_id: sessionId, pair_id: pairId, role: "user", content: userMsg },
            { session_id: sessionId, pair_id: pairId, role: "assistant", content: question },
          ],
        }),
      }).catch(() => {});

      setPairs(prev => [...prev, {
        pair_id: pairId,
        user: { role: "user", content: userMsg },
        assistant: { role: "assistant", content: question },
      }]);
      setShowMenu(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    } catch (err) {
      alert(`인터뷰 실패: ${String(err)}`);
    } finally {
      setInterviewLoading(false);
    }
  }

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // 자세한 답변 로드
  async function loadDetail(pairId: string) {
    const pair = pairs.find(p => p.pair_id === pairId);
    if (!pair) return;
    if (pair.detail_content) {
      setPairs(prev => prev.map(p => p.pair_id === pairId ? { ...p, detail_shown: !p.detail_shown } : p));
      return;
    }
    setPairs(prev => prev.map(p => p.pair_id === pairId ? { ...p, detail_loading: true, detail_shown: true } : p));
    try {
      const ctx = [
        { role: "user" as const, content: pair.user.content },
        { role: "assistant" as const, content: pair.assistant.content },
        { role: "user" as const, content: "위 답변을 더 자세하고 풍부하게 설명해줘." },
      ];
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: ctx, detailed: true }),
      });
      if (!res.ok || !res.body) throw new Error("err");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let text = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value);
        setPairs(prev => prev.map(p => p.pair_id === pairId ? { ...p, detail_content: text.replace("__TRUNCATED__", "") } : p));
      }
    } catch {
      setPairs(prev => prev.map(p => p.pair_id === pairId ? { ...p, detail_content: "오류가 발생했어요." } : p));
    } finally {
      setPairs(prev => prev.map(p => p.pair_id === pairId ? { ...p, detail_loading: false } : p));
    }
  }

  // 피드백 저장
  async function submitFeedback(pairId: string, type: "accurate" | "inaccurate", reason?: string) {
    const pair = pairs.find(p => p.pair_id === pairId);
    if (!pair) return;
    setFeedbacks(prev => ({ ...prev, [pairId]: type }));
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          pair_id: pairId,
          feedback_type: type,
          reason: reason ?? null,
          question: pair.user.content,
          answer: pair.assistant.content?.slice(0, 1000),
        }),
      });
    } catch (err) {
      console.error("[feedback] 저장 실패:", err);
    }
  }
  async function submitReason() {
    if (!reasonInputPairId) return;
    await submitFeedback(reasonInputPairId, "inaccurate", reasonInputText.trim() || undefined);
    setReasonInputPairId(null);
    setReasonInputText("");
  }

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

  // 기존 피드백 복원
  useEffect(() => {
    if (pairs.length === 0) return;
    const targets = pairs.filter(p => feedbacks[p.pair_id] === undefined);
    if (targets.length === 0) return;
    Promise.all(targets.map(async p => {
      try {
        const res = await fetch(`/api/feedback?pair_id=${encodeURIComponent(p.pair_id)}`);
        const data = await res.json();
        return data.feedback ? { pid: p.pair_id, type: data.feedback.feedback_type } : null;
      } catch { return null; }
    })).then(results => {
      const updates: Record<string, "accurate" | "inaccurate"> = {};
      for (const r of results) { if (r) updates[r.pid] = r.type; }
      if (Object.keys(updates).length > 0) setFeedbacks(prev => ({ ...prev, ...updates }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairs]);

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
      // 추출 데이터 파싱 → 검토 카드
      const dataMatch = text.match(/__DECISIONS_DATA__([\s\S]+?)__END__/);
      if (dataMatch) {
        try {
          const items = JSON.parse(dataMatch[1]) as ExtractedItem[];
          if (items.length > 0) { setExtractedItems(items); setShowExtractedReview(true); }
        } catch { /* 무시 */ }
      }
      const startIdx = clean.indexOf("__JORDAN_ANSWER_START__");
      if (startIdx !== -1) clean = clean.slice(startIdx + "__JORDAN_ANSWER_START__".length).trimStart();
      clean = clean.replace(/\n__JORDAN_CRITIC_START__[\s\S]*?__JORDAN_CRITIC_END__/, "");
      clean = clean.replace(/__DECISIONS_DATA__[\s\S]+?__END__/, "");
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

  // 기획서 작성 모드 진입 — 기본 선택값: 맥락선 이하 또는 전체
  function enterSelectMode() {
    let defaultIds: string[];
    if (contextAnchorPairId) {
      const idx = pairs.findIndex(p => p.pair_id === contextAnchorPairId);
      defaultIds = idx >= 0 ? pairs.slice(idx).map(p => p.pair_id) : pairs.map(p => p.pair_id);
    } else {
      defaultIds = pairs.map(p => p.pair_id);
    }
    setSelectedPairIds(new Set(defaultIds));
    setSelectMode(true);
    setShowMenu(false);
  }
  function togglePairSelect(pid: string) {
    setSelectedPairIds(prev => {
      const n = new Set(prev);
      if (n.has(pid)) n.delete(pid); else n.add(pid);
      return n;
    });
  }
  function cancelSelectMode() {
    setSelectMode(false);
    setSelectedPairIds(new Set());
  }

  async function generateDocument() {
    const selectedMsgs = pairs
      .filter(p => selectedPairIds.has(p.pair_id))
      .flatMap(p => [
        { role: p.user.role, content: p.user.content },
        { role: p.assistant.role, content: p.assistant.content },
      ]);
    if (selectedMsgs.length === 0) return;

    setSelectMode(false);
    setSelectedPairIds(new Set());
    setDocBackgroundGenerating(true);
    const controller = new AbortController();
    docGenAbortRef.current = controller;

    try {
      const res = await fetch("/api/document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: selectedMsgs,
          project_id: DEFAULT_PROJECT_ID,
          nickname,
        }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? "fail");
      const title = data.doc?.title ?? "새 기획서";
      setDocCompletedNotice({ title });
      setDocNewDot(true);
      localStorage.setItem("jordan_doc_new_dot", "true");
      setDocReloadKey(k => k + 1);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") { /* 취소 */ }
      else alert(`기획서 작성 실패: ${String(err)}`);
    } finally {
      docGenAbortRef.current = null;
      setDocBackgroundGenerating(false);
    }
  }
  function cancelDocGen() {
    docGenAbortRef.current?.abort();
    docGenAbortRef.current = null;
    setDocBackgroundGenerating(false);
  }

  // 메시지 삭제·복사
  async function deletePair(pid: string) {
    if (!confirm("이 대화를 삭제할까요?")) return;
    setPairs(prev => prev.filter(p => p.pair_id !== pid));
    setActionForPair(null);
    try {
      await fetch("/api/messages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pair_id: pid, is_deleted: true }),
      });
    } catch { /* 무시 */ }
  }
  async function copyMessage(text: string) {
    try { await navigator.clipboard.writeText(text); } catch { /* 무시 */ }
    setActionForPair(null);
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
      {/* 선택 모드 헤더 (기획서 작성용) */}
      {selectMode && (
        <header className="px-3 py-2.5 flex items-center gap-2 flex-shrink-0" style={{ backgroundColor: "rgba(0,0,0,0.5)", borderBottom: `1px solid rgba(100,180,255,0.4)` }}>
          <span className="text-xs font-medium flex-1" style={{ color: SILVER }}>
            <b style={{ color: "rgba(180,210,255,1)" }}>{selectedPairIds.size}개</b> 선택됨
          </span>
          <button
            onClick={generateDocument}
            disabled={selectedPairIds.size === 0}
            className="text-xs px-3 py-1.5 rounded-lg font-bold disabled:opacity-40"
            style={{ backgroundColor: SILVER, color: "#0a0e1a" }}
          >✓ 작성</button>
          <button
            onClick={cancelSelectMode}
            className="text-xs px-3 py-1.5 rounded-lg"
            style={{ backgroundColor: SILVER_FAINT, color: SILVER }}
          >취소</button>
        </header>
      )}

      {/* 일반 헤더 */}
      {!selectMode && (
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
        {docBackgroundGenerating && (
          <button
            onClick={cancelDocGen}
            className="flex items-center justify-center px-2 h-9 rounded-lg flex-shrink-0 gap-1"
            title="기획서 작성 중 — 누르면 취소"
            style={{ backgroundColor: "rgba(100,180,255,0.18)", border: "1px solid rgba(100,180,255,0.5)", color: "rgba(180,210,255,1)", fontSize: "10px" }}
          >
            <span className="inline-block w-2.5 h-2.5 rounded-full border-2 animate-spin" style={{ borderColor: "rgba(180,210,255,0.3)", borderTopColor: "rgba(180,210,255,1)" }} />
            작성중
          </button>
        )}
        <button
          onClick={() => setShowMenu(v => !v)}
          className="flex items-center justify-center w-9 h-9 rounded-lg flex-shrink-0"
          style={{ backgroundColor: SILVER_FAINT, border: `1px solid ${SILVER_DIM}`, color: SILVER }}
          aria-label="메뉴"
        >
          <span style={{ fontSize: "16px" }}>☰</span>
        </button>
      </header>
      )}

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
              <MenuBtn icon="🎤" label={interviewLoading ? "분석 중..." : "조던에게 질문 받기"} subtitle="빈 영역 자동 분석 → 다음 결정 질문" onClick={startInterview} />
              <MenuBtn icon="📌" label={contextAnchorPairId ? "맥락선 해제" : "맥락선"} subtitle={contextAnchorPairId ? "이 시점부터 조던에게 전달 중" : "설정 안 됨"}
                onClick={() => { setShowMenu(false); if (contextAnchorPairId) clearContextAnchor(); }} />
              <MenuBtn icon="📚" label="기획 바이블" subtitle={`현재 ${decisionCount}개 누적`} onClick={() => openMenu("bible")} />
              {pairs.length > 0 && !docBackgroundGenerating && (
                <MenuBtn icon="📝" label="기획서 작성" subtitle="대화 선택해서 기획서 생성" onClick={enterSelectMode} />
              )}
              <MenuBtn icon="📄" label="기획서" subtitle="작성·열람·수정" onClick={() => openMenu("docs")} />
              {/* 화면 설계는 📄 기획서 뷰의 [🎨 화면 설계] 버튼으로 통합됨 */}
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
            const isSelected = selectedPairIds.has(pair.pair_id);
            return (
              <div
                key={pair.pair_id}
                onClick={selectMode ? () => togglePairSelect(pair.pair_id) : undefined}
                className={`space-y-2 ${selectMode ? "cursor-pointer rounded-lg p-1" : ""}`}
                style={{
                  opacity: isBeforeAnchor ? 0.4 : 1,
                  backgroundColor: selectMode && isSelected ? "rgba(100,180,255,0.08)" : undefined,
                  border: selectMode ? `1px solid ${isSelected ? "rgba(100,180,255,0.4)" : "transparent"}` : undefined,
                }}>
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
                    onClick={(e) => { e.stopPropagation(); setContextAnchor(pair.pair_id, pair.timestamp ?? new Date().toISOString()); }}
                    className="text-[10px] px-1.5 py-0.5 rounded"
                    style={{
                      backgroundColor: isAnchor ? "rgba(255,200,100,0.3)" : "rgba(255,200,100,0.1)",
                      color: "rgba(255,220,150,0.9)",
                    }}
                    title="이 시점에 맥락선 설정"
                  >📌</button>
                  {!selectMode && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setActionForPair(pair.pair_id); }}
                      className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0"
                      style={{
                        backgroundColor: "rgba(192,200,216,0.12)",
                        border: "1px solid rgba(192,200,216,0.3)",
                        color: SILVER_DIM,
                      }}
                      title="이 대화 복사·삭제 도구"
                      aria-label="메시지 도구"
                    >🛠️</button>
                  )}
                  <div
                    onClick={(e) => { if (!selectMode) { e.stopPropagation(); setActionForPair(pair.pair_id); } }}
                    className="max-w-[78%] px-3 py-2 rounded-2xl rounded-tr-sm text-sm whitespace-pre-wrap"
                    style={{ backgroundColor: SILVER, color: "#0a0e1a" }}
                  >
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
                    {/* 답변 도구 — 자세한 답변 + 피드백 */}
                    <div className="flex items-center gap-3 mt-1.5 ml-1">
                      <button
                        onClick={() => loadDetail(pair.pair_id)}
                        className="text-[10px]"
                        style={{ color: SILVER_DIM }}
                      >
                        {pair.detail_loading ? "⏳" : pair.detail_shown ? "▲ 접기" : "▼ 자세히"}
                      </button>
                      <div className="ml-auto flex items-center gap-1.5">
                        <button
                          onClick={() => submitFeedback(pair.pair_id, "accurate")}
                          className="text-xs px-1.5 py-0.5 rounded"
                          style={{
                            backgroundColor: feedbacks[pair.pair_id] === "accurate" ? "rgba(100,220,160,0.2)" : "transparent",
                            color: feedbacks[pair.pair_id] === "accurate" ? "rgba(150,255,200,1)" : SILVER_DIM,
                            opacity: feedbacks[pair.pair_id] === "inaccurate" ? 0.3 : 1,
                          }}
                        >👍</button>
                        <button
                          onClick={() => { setReasonInputPairId(pair.pair_id); setReasonInputText(""); }}
                          className="text-xs px-1.5 py-0.5 rounded"
                          style={{
                            backgroundColor: feedbacks[pair.pair_id] === "inaccurate" ? "rgba(255,140,140,0.2)" : "transparent",
                            color: feedbacks[pair.pair_id] === "inaccurate" ? "rgba(255,180,180,1)" : SILVER_DIM,
                            opacity: feedbacks[pair.pair_id] === "accurate" ? 0.3 : 1,
                          }}
                        >👎</button>
                      </div>
                    </div>
                    {/* 자세한 답변 본문 */}
                    {pair.detail_shown && pair.detail_content && (
                      <div className="px-3 py-2 rounded-2xl text-sm prose prose-sm max-w-none mt-1.5"
                        style={{ backgroundColor: "rgba(192,200,216,0.07)", border: `1px solid rgba(192,200,216,0.25)`, color: "#e0e8f0" }}>
                        <ReactMarkdown>{pair.detail_content}</ReactMarkdown>
                      </div>
                    )}
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
          onFocus={() => simulateKeyboard && setKeyboardOpen(true)}
          onBlur={() => simulateKeyboard && setKeyboardOpen(false)}
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

      {/* PC 프레임 모드 — 가짜 키보드 시뮬레이션 (실제 모바일에선 진짜 키보드가 뜸) */}
      {simulateKeyboard && keyboardOpen && (
        <div
          className="flex-shrink-0 flex flex-col"
          style={{
            height: "280px",
            backgroundColor: "#1c1c1e",
            borderTop: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          {/* 키보드 상단 toolbar */}
          <div className="flex items-center justify-between px-3 py-1.5" style={{ backgroundColor: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
            <button
              onMouseDown={(e) => { e.preventDefault(); inputRef.current?.blur(); }}
              className="text-xs"
              style={{ color: "#8e8e93" }}
            >완료</button>
            <p className="text-[10px]" style={{ color: "#6e6e73" }}>🎹 가짜 키보드 (시뮬레이션)</p>
          </div>
          {/* 자판 (단순 시각화) */}
          <div className="flex-1 p-2 grid grid-cols-10 gap-1">
            {["ㅂ","ㅈ","ㄷ","ㄱ","ㅅ","ㅛ","ㅕ","ㅑ","ㅐ","ㅔ",
              "ㅁ","ㄴ","ㅇ","ㄹ","ㅎ","ㅗ","ㅓ","ㅏ","ㅣ",".",
              "ㅋ","ㅌ","ㅊ","ㅍ","ㅠ","ㅜ","ㅡ","","",""].map((k, i) => (
              <div
                key={i}
                className="flex items-center justify-center rounded-md text-xs"
                style={{
                  backgroundColor: k ? "rgba(255,255,255,0.12)" : "transparent",
                  color: "#fff",
                  minHeight: "32px",
                }}
              >{k}</div>
            ))}
          </div>
          {/* 키보드 하단 */}
          <div className="flex items-center justify-around px-3 py-2" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
            <span className="text-[10px]" style={{ color: "#8e8e93" }}>한/영</span>
            <span className="text-[10px]" style={{ color: "#8e8e93" }}>스페이스</span>
            <span className="text-[10px]" style={{ color: "#8e8e93" }}>↵</span>
          </div>
        </div>
      )}

      {/* 모달들 — 기존 컴포넌트 재사용 */}
      <DecisionPanel
        open={showBible}
        onClose={() => setShowBible(false)}
        projectId={DEFAULT_PROJECT_ID}
        nickname={nickname}
        onCountChange={setDecisionCount}
        reloadKey={decisionReloadKey}
        categoryReloadKey={categoryReloadKey}
      />
      <DocumentView
        open={showDocs}
        onClose={() => setShowDocs(false)}
        projectId={DEFAULT_PROJECT_ID}
        nickname={nickname}
        reloadKey={docReloadKey}
        onCategoriesChanged={() => setCategoryReloadKey(k => k + 1)}
        onDecisionsChanged={() => setDecisionReloadKey(k => k + 1)}
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

      {/* 화면 설계는 DocumentView 안으로 통합됨 */}

      {/* 자동 추출 검토 카드 */}
      {showExtractedReview && extractedItems.length > 0 && (
        <ExtractedReviewCard
          items={extractedItems}
          onClose={() => { setShowExtractedReview(false); setExtractedItems([]); }}
          onChanged={() => setDecisionReloadKey(k => k + 1)}
        />
      )}

      {/* 메시지 액션 시트 (bottom sheet) */}
      {actionForPair && (() => {
        const p = pairs.find(p => p.pair_id === actionForPair);
        if (!p) return null;
        return (
          <div className="fixed inset-0 z-50 flex items-end bg-black/60" onClick={() => setActionForPair(null)}>
            <div
              className="w-full rounded-t-2xl flex flex-col"
              style={{ backgroundColor: "#0f1628", border: `1px solid ${SILVER_FAINT}` }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 py-3" style={{ borderBottom: `1px solid ${SILVER_FAINT}` }}>
                <p className="text-xs" style={{ color: SILVER_DIM }}>메시지 동작</p>
              </div>
              <button
                onClick={() => copyMessage(p.user.content)}
                className="px-4 py-3 text-left text-sm hover:bg-white/5 flex items-center gap-2"
                style={{ color: SILVER }}
              >
                <span>⎘</span> 내 질문 복사
              </button>
              <button
                onClick={() => copyMessage(p.assistant.content)}
                className="px-4 py-3 text-left text-sm hover:bg-white/5 flex items-center gap-2"
                style={{ color: SILVER }}
              >
                <span>⎘</span> 조던 답변 복사
              </button>
              <button
                onClick={() => deletePair(p.pair_id)}
                className="px-4 py-3 text-left text-sm hover:bg-white/5 flex items-center gap-2"
                style={{ color: "rgba(255,180,180,0.9)" }}
              >
                <span>🗑️</span> 이 대화 삭제
              </button>
              <button
                onClick={() => setActionForPair(null)}
                className="px-4 py-3 text-center text-sm font-medium"
                style={{ backgroundColor: SILVER_FAINT, color: SILVER, borderTop: `1px solid ${SILVER_FAINT}` }}
              >취소</button>
            </div>
          </div>
        );
      })()}

      {/* 기획서 작성 완료 알림 */}
      {docCompletedNotice && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 text-sm max-w-[90vw]"
          style={{ backgroundColor: "rgba(15,25,40,0.97)", border: "1px solid rgba(100,180,255,0.6)", color: "rgba(180,210,255,1)" }}>
          <span style={{ fontSize: "16px" }}>📄</span>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-xs">기획서 완료</p>
            <p className="text-[10px] truncate" style={{ color: "rgba(180,210,255,0.7)" }}>{docCompletedNotice.title}</p>
          </div>
          <button
            onClick={() => { setDocCompletedNotice(null); setShowDocs(true); setDocNewDot(false); localStorage.removeItem("jordan_doc_new_dot"); }}
            className="text-[10px] px-2 py-1 rounded-lg font-medium"
            style={{ backgroundColor: "rgba(100,180,255,0.25)", border: "1px solid rgba(100,180,255,0.5)", color: "rgba(180,210,255,1)" }}
          >바로 보기</button>
          <button onClick={() => setDocCompletedNotice(null)} className="text-[10px] px-1.5" style={{ color: "rgba(180,210,255,0.6)" }}>✕</button>
        </div>
      )}

      {/* 부정확 사유 입력 */}
      {reasonInputPairId && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/60 p-4" onClick={() => setReasonInputPairId(null)}>
          <div
            className="w-full rounded-2xl shadow-2xl flex flex-col"
            style={{ backgroundColor: "#0f1628", border: `1px solid ${SILVER_FAINT}` }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3" style={{ borderBottom: `1px solid ${SILVER_FAINT}` }}>
              <p className="text-sm font-bold" style={{ color: "rgba(255,180,180,1)" }}>👎 부정확한 부분</p>
              <p className="text-[10px] mt-0.5" style={{ color: SILVER_DIM }}>구체적으로 알려주면 다음 답변에 반영돼요</p>
            </div>
            <div className="px-4 py-3 flex flex-col gap-3">
              <textarea
                value={reasonInputText}
                onChange={(e) => setReasonInputText(e.target.value)}
                placeholder="예: 5월 14일 업데이트 정보가 틀림"
                rows={3}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${SILVER_FAINT}`, color: "#e0e8f0" }}
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <button onClick={() => setReasonInputPairId(null)} className="text-xs px-3 py-1.5 rounded-lg" style={{ backgroundColor: SILVER_FAINT, color: SILVER }}>취소</button>
                <button onClick={submitReason} className="text-xs px-3 py-1.5 rounded-lg" style={{ backgroundColor: "rgba(255,180,180,0.2)", border: "1px solid rgba(255,180,180,0.5)", color: "rgba(255,200,200,1)" }}>전송</button>
              </div>
            </div>
          </div>
        </div>
      )}
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

          {/* 화면 모드 */}
          <section>
            <p className="text-xs font-bold mb-2" style={{ color: "rgba(180,210,255,1)" }}>📱 화면 모드</p>
            <div className="px-3 py-2.5 rounded-lg flex items-center justify-between" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: `1px solid ${SILVER_FAINT}` }}>
              <div className="flex-1">
                <p className="text-xs font-medium" style={{ color: SILVER }}>PC 뷰로 강제 전환</p>
                <p className="text-[10px] mt-0.5" style={{ color: SILVER_DIM }}>현재 모바일 자동 감지</p>
              </div>
              <button
                onClick={() => { window.location.href = "/chat?view=desktop"; }}
                className="text-xs px-3 py-1.5 rounded-lg font-medium ml-2 flex-shrink-0"
                style={{ backgroundColor: SILVER_FAINT, border: `1px solid ${SILVER_DIM}`, color: SILVER }}
              >🖥️ 전환</button>
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

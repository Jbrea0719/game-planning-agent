"use client";

// 모바일 전용 챗 페이지 — Phase별로 점진적 구축
// Phase 1: 핵심 챗 기능 (메시지 송수신·히스토리·바이블/기획서 진입)
// Phase 2: 모달·설정·맥락선 등 부가 기능
// Phase 3: 하단 탭바·애니메이션 폴리시

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import ReactMarkdown from "react-markdown";

const SILVER = "#c0c8d8";
const SILVER_DIM = "rgba(192,200,216,0.5)";
const SILVER_FAINT = "rgba(192,200,216,0.15)";

type Message = { role: "user" | "assistant"; content: string };

export default function MobileChatPage() {
  const [nickname, setNickname] = useState("");
  const [nicknameInput, setNicknameInput] = useState("");
  const [showNicknameModal, setShowNicknameModal] = useState(false);
  const sessionId = nickname ? `agent:${nickname}` : null;

  // 최초 진입 시 닉네임 복원·요청
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
      {/* 닉네임 모달 */}
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

      <MobileChatContent sessionId={sessionId} nickname={nickname} />
    </div>
  );
}

// ── 본 챗 영역 ────────────────────────────────────────────────────
function MobileChatContent({ sessionId, nickname }: { sessionId: string | null; nickname: string }) {
  const [pairs, setPairs] = useState<{ pair_id: string; user: Message; assistant: Message; timestamp?: string }[]>([]);
  const [streaming, setStreaming] = useState<{ user: string; assistant: string } | null>(null);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // 메시지 로드
  useEffect(() => {
    if (!sessionId) return;
    fetch(`/api/messages?session_id=${encodeURIComponent(sessionId)}`)
      .then(r => r.json())
      .then(data => {
        if (data.messages?.length > 0) {
          // pair 그룹핑
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
          }).filter(Boolean) as { pair_id: string; user: Message; assistant: Message }[]);
        }
      })
      .catch(() => {});
  }, [sessionId]);

  // 스크롤 하단 유지
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [pairs, streaming]);

  async function sendMessage() {
    const trimmed = input.trim();
    if (!trimmed || isLoading || !sessionId) return;
    const pairId = crypto.randomUUID();
    const allMessages = [
      ...pairs.flatMap(p => [{ role: p.user.role, content: p.user.content }, { role: p.assistant.role, content: p.assistant.content }]),
      { role: "user" as const, content: trimmed },
    ];
    setStreaming({ user: trimmed, assistant: "" });
    setInput("");
    setIsLoading(true);

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
          show_citations: false,
          context_anchor_time: null,
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
        // __JORDAN_ANSWER_START__ 이후만 표시
        let display = text;
        const idx = display.indexOf("__JORDAN_ANSWER_START__");
        if (idx !== -1) display = display.slice(idx + "__JORDAN_ANSWER_START__".length).trimStart();
        display = display.replace(/\n__JORDAN_CRITIC_START__[\s\S]*?__JORDAN_CRITIC_END__$/, "");
        display = display.replace(/__DECISIONS_(EXTRACTED|HELD)__\d+/g, "");
        display = display.replace("__TRUNCATED__", "");
        setStreaming({ user: trimmed, assistant: display });
      }
      // 최종 정리
      let clean = text;
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
      // 취소·에러
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

  return (
    <>
      {/* 모바일 헤더 — 콤팩트 */}
      <header className="px-3 py-2.5 flex items-center gap-2 flex-shrink-0" style={{ backgroundColor: "rgba(0,0,0,0.4)", borderBottom: `1px solid ${SILVER_FAINT}` }}>
        <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0" style={{ border: `1px solid ${SILVER_DIM}` }}>
          <img src="/avatar.jpg" alt="조던" className="w-full h-full object-cover" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm truncate" style={{ color: SILVER }}>조던</p>
          <p className="text-[10px] truncate" style={{ color: SILVER_DIM }}>난 게임기획자이자 게임마스터 조던!</p>
        </div>
        {/* 햄버거 메뉴 */}
        <button
          onClick={() => setShowMenu(v => !v)}
          className="flex items-center justify-center w-9 h-9 rounded-lg flex-shrink-0"
          style={{ backgroundColor: SILVER_FAINT, border: `1px solid ${SILVER_DIM}`, color: SILVER }}
          aria-label="메뉴"
        >
          <span style={{ fontSize: "16px" }}>☰</span>
        </button>
      </header>

      {/* 메뉴 드로어 (햄버거 → 펼침) */}
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
              <MobileMenuButton icon="📌" label="맥락" subtitle="맥락 시작점 (PC 버전에서)" disabled />
              <MobileMenuButton icon="📋" label="맥락 결정사항" subtitle="기획 바이블 결정 보기" disabled />
              <MobileMenuButton icon="📄" label="기획서 작성" subtitle="대화 기반 기획서 생성" disabled />
              <MobileMenuButton icon="📚" label="기획 바이블" subtitle="누적된 기획 결정 자산" disabled />
              <MobileMenuButton icon="📄" label="기획서" subtitle="생성된 기획서 열람" disabled />
              <MobileMenuButton icon="📖" label="가이드" subtitle="조던 사용법" disabled />
              <MobileMenuButton icon="⚙️" label="설정" subtitle="출처표시·참고게임·관리도구" disabled />
              <div className="px-4 py-3 mt-2" style={{ borderTop: `1px solid ${SILVER_FAINT}` }}>
                <p className="text-[10px]" style={{ color: SILVER_DIM }}>
                  💡 모바일 뷰는 단계적으로 완성 중. 비활성 메뉴는 곧 추가돼요.
                </p>
                <p className="text-[10px] mt-1" style={{ color: SILVER_DIM }}>
                  현재 닉네임: <b style={{ color: SILVER }}>{nickname}</b>
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
          {pairs.map(pair => (
            <div key={pair.pair_id} className="space-y-2">
              {/* 내 질문 */}
              <div className="flex justify-end">
                <div className="max-w-[85%] px-3 py-2 rounded-2xl rounded-tr-sm text-sm whitespace-pre-wrap" style={{ backgroundColor: SILVER, color: "#0a0e1a" }}>
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
          ))}
          {/* 스트리밍 중 */}
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

      {/* 입력창 — 하단 고정 */}
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
    </>
  );
}

function MobileMenuButton({ icon, label, subtitle, disabled, onClick }: {
  icon: string; label: string; subtitle?: string; disabled?: boolean; onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full px-4 py-2.5 text-left flex items-center gap-3 disabled:opacity-40"
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

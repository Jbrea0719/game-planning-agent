"use client";

// 기획서 댓글 (유튜브식: 의견 + 답글)
// doc_family_id 기준으로 의견을 달고, 각 의견에 1단계 답글을 단다.

import { useCallback, useEffect, useState } from "react";

const SILVER = "#c0c8d8";
const SILVER_DIM = "rgba(192,200,216,0.5)";
const SILVER_FAINT = "rgba(192,200,216,0.15)";
const BLUE = "rgba(180,210,255,1)";
const ADMIN = "정민";

interface Comment {
  id: string;
  doc_family_id: string;
  parent_id: string | null;
  content: string;
  nickname: string | null;
  created_at: string;
}

function timeAgo(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "방금";
    if (m < 60) return `${m}분 전`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}시간 전`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d}일 전`;
    return new Date(iso).toLocaleDateString("ko-KR");
  } catch { return ""; }
}

export default function DocComments({ docFamilyId, nickname }: { docFamilyId: string; nickname?: string }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [newText, setNewText] = useState("");
  const [posting, setPosting] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  const load = useCallback(async () => {
    if (!docFamilyId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/design-docs/comments?doc_family_id=${encodeURIComponent(docFamilyId)}`);
      const data = await res.json();
      setComments(data.comments ?? []);
    } catch { setComments([]); } finally { setLoading(false); }
  }, [docFamilyId]);

  useEffect(() => { void load(); }, [load]);

  async function post(parentId: string | null, text: string) {
    const c = text.trim();
    if (!c || posting) return;
    setPosting(true);
    try {
      const res = await fetch("/api/design-docs/comments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc_family_id: docFamilyId, parent_id: parentId, content: c, nickname }),
      });
      const data = await res.json();
      if (data.error) { alert(`등록 실패: ${data.error}\n(테이블이 없으면 마이그레이션 021을 적용하세요)`); return; }
      if (parentId) { setReplyText(""); setReplyingTo(null); } else { setNewText(""); }
      await load();
    } catch (e) { alert(`등록 실패: ${String(e)}`); } finally { setPosting(false); }
  }

  async function remove(id: string) {
    if (!confirm("이 댓글을 삭제할까요? (답글도 함께 삭제됩니다)")) return;
    try {
      const res = await fetch("/api/design-docs/comments", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, nickname }),
      });
      const data = await res.json();
      if (data.error) { alert(data.error); return; }
      await load();
    } catch { /* 무시 */ }
  }

  const canDelete = (c: Comment) => nickname === ADMIN || (c.nickname && c.nickname === nickname);

  const tops = comments.filter(c => !c.parent_id);
  const repliesOf = (id: string) => comments.filter(c => c.parent_id === id);

  function Avatar({ name }: { name: string | null }) {
    const ch = (name ?? "?").trim().charAt(0).toUpperCase() || "?";
    return (
      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold"
        style={{ backgroundColor: "rgba(100,180,255,0.18)", border: "1px solid rgba(100,180,255,0.4)", color: BLUE }}>
        {ch}
      </div>
    );
  }

  return (
    <div className="mt-8 pt-6" style={{ borderTop: `1px solid ${SILVER_FAINT}` }}>
      <p className="text-sm font-bold mb-3" style={{ color: SILVER }}>💬 의견 {tops.length > 0 ? `(${tops.length})` : ""}</p>

      {/* 새 의견 입력 */}
      <div className="flex gap-2 mb-5">
        <Avatar name={nickname ?? null} />
        <div className="flex-1">
          <textarea
            value={newText}
            onChange={e => setNewText(e.target.value)}
            placeholder="이 기획서에 대한 의견을 남겨주세요…"
            rows={2}
            className="w-full text-[13px] px-3 py-2 rounded-lg outline-none resize-none"
            style={{ backgroundColor: "rgba(255,255,255,0.04)", border: `1px solid ${SILVER_FAINT}`, color: "#e0e8f0" }}
          />
          <div className="flex justify-end mt-1.5">
            <button onClick={() => post(null, newText)} disabled={posting || !newText.trim()}
              className="text-xs px-4 py-1.5 rounded-lg font-bold disabled:opacity-40"
              style={{ backgroundColor: "rgba(100,180,255,0.2)", border: "1px solid rgba(100,180,255,0.5)", color: BLUE }}>
              {posting ? "등록 중…" : "의견 등록"}
            </button>
          </div>
        </div>
      </div>

      {/* 목록 */}
      {loading ? (
        <p className="text-xs" style={{ color: SILVER_DIM }}>불러오는 중…</p>
      ) : tops.length === 0 ? (
        <p className="text-xs" style={{ color: SILVER_DIM }}>아직 의견이 없어요. 첫 의견을 남겨보세요.</p>
      ) : (
        <div className="space-y-4">
          {tops.map(c => (
            <div key={c.id} className="flex gap-2">
              <Avatar name={c.nickname} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-bold" style={{ color: SILVER }}>{c.nickname ?? "익명"}</span>
                  <span className="text-[10px]" style={{ color: SILVER_DIM }}>{timeAgo(c.created_at)}</span>
                </div>
                <p className="text-[13px] mt-0.5 whitespace-pre-wrap break-words" style={{ color: "#dbe2ec" }}>{c.content}</p>
                <div className="flex items-center gap-3 mt-1">
                  <button onClick={() => { setReplyingTo(replyingTo === c.id ? null : c.id); setReplyText(""); }}
                    className="text-[11px]" style={{ color: SILVER_DIM }}>답글</button>
                  {canDelete(c) && (
                    <button onClick={() => remove(c.id)} className="text-[11px]" style={{ color: "rgba(255,150,150,0.7)" }}>삭제</button>
                  )}
                </div>

                {/* 답글 입력 */}
                {replyingTo === c.id && (
                  <div className="flex gap-2 mt-2">
                    <textarea
                      value={replyText}
                      onChange={e => setReplyText(e.target.value)}
                      placeholder={`${c.nickname ?? "익명"}님에게 답글…`}
                      rows={2}
                      autoFocus
                      className="flex-1 text-[12px] px-2.5 py-1.5 rounded-lg outline-none resize-none"
                      style={{ backgroundColor: "rgba(255,255,255,0.04)", border: `1px solid ${SILVER_FAINT}`, color: "#e0e8f0" }}
                    />
                    <div className="flex flex-col gap-1">
                      <button onClick={() => post(c.id, replyText)} disabled={posting || !replyText.trim()}
                        className="text-[11px] px-3 py-1.5 rounded-lg font-bold disabled:opacity-40"
                        style={{ backgroundColor: "rgba(100,180,255,0.2)", border: "1px solid rgba(100,180,255,0.5)", color: BLUE }}>등록</button>
                      <button onClick={() => { setReplyingTo(null); setReplyText(""); }}
                        className="text-[11px] px-3 py-1.5 rounded-lg" style={{ backgroundColor: SILVER_FAINT, color: SILVER_DIM }}>취소</button>
                    </div>
                  </div>
                )}

                {/* 답글 목록 */}
                {repliesOf(c.id).length > 0 && (
                  <div className="mt-3 space-y-3 pl-3" style={{ borderLeft: `2px solid ${SILVER_FAINT}` }}>
                    {repliesOf(c.id).map(r => (
                      <div key={r.id} className="flex gap-2">
                        <Avatar name={r.nickname} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[12px] font-bold" style={{ color: SILVER }}>{r.nickname ?? "익명"}</span>
                            <span className="text-[10px]" style={{ color: SILVER_DIM }}>{timeAgo(r.created_at)}</span>
                          </div>
                          <p className="text-[13px] mt-0.5 whitespace-pre-wrap break-words" style={{ color: "#dbe2ec" }}>{r.content}</p>
                          {canDelete(r) && (
                            <button onClick={() => remove(r.id)} className="text-[11px] mt-1" style={{ color: "rgba(255,150,150,0.7)" }}>삭제</button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

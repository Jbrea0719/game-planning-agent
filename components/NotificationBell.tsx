"use client";

// 알림 종 — 기획서 댓글/답글 알림. 안 읽은 수 배지 + 드롭다운 목록 + 댓글 바로가기.

import { useCallback, useEffect, useState } from "react";

const SILVER = "#c0c8d8";
const SILVER_DIM = "rgba(192,200,216,0.5)";
const SILVER_FAINT = "rgba(192,200,216,0.15)";
const BLUE = "var(--accent-2)";

interface Notif {
  id: string;
  actor_nickname: string | null;
  type: "comment" | "reply" | string;
  doc_family_id: string | null;
  doc_id: string | null;
  doc_title: string | null;
  comment_id: string | null;
  preview: string | null;
  is_read: boolean;
  created_at: string;
}

function timeAgo(iso: string): string {
  try {
    const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 1) return "방금";
    if (m < 60) return `${m}분 전`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}시간 전`;
    return `${Math.floor(h / 24)}일 전`;
  } catch { return ""; }
}

export default function NotificationBell({
  nickname,
  onOpen,
}: {
  nickname?: string;
  onOpen: (docId: string | null, familyId: string | null, commentId: string | null) => void;
}) {
  const [items, setItems] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    if (!nickname) return;
    try {
      const res = await fetch(`/api/notifications?nickname=${encodeURIComponent(nickname)}`);
      const data = await res.json();
      setItems(data.notifications ?? []);
      setUnread(data.unread ?? 0);
    } catch { /* 무시 */ }
  }, [nickname]);

  // 마운트 + 60초마다 폴링 + 창 포커스 시 갱신
  useEffect(() => {
    void load();
    const t = setInterval(load, 60000);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(t); window.removeEventListener("focus", onFocus); };
  }, [load]);

  async function openItem(n: Notif) {
    setOpen(false);
    if (!n.is_read) {
      try { await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: n.id }) }); } catch { /* 무시 */ }
    }
    onOpen(n.doc_id, n.doc_family_id, n.comment_id);
    void load();
  }

  async function markAll() {
    try { await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nickname }) }); } catch { /* 무시 */ }
    void load();
  }

  const label = (n: Notif) =>
    n.type === "reply"
      ? `${n.actor_nickname ?? "누군가"}님이 내 댓글에 답글`
      : `${n.actor_nickname ?? "누군가"}님이 내 기획서에 의견`;

  return (
    <div className="relative">
      <button
        onClick={() => { setOpen(v => !v); if (!open) void load(); }}
        title="알림"
        className="relative w-9 h-9 rounded-lg flex items-center justify-center"
        style={{ backgroundColor: "rgba(255,255,255,0.06)", border: `1px solid ${SILVER_FAINT}`, color: SILVER }}
      >
        🔔
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center text-[9px] font-bold"
            style={{ backgroundColor: "#e5484d", color: "white" }}>
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[75]" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1.5 rounded-xl shadow-2xl z-[76] flex flex-col"
            style={{ backgroundColor: "#0f1628", border: `1px solid ${SILVER_FAINT}`, width: "min(360px, 90vw)", maxHeight: "70vh" }}>
            <div className="flex items-center justify-between px-4 py-2.5 flex-shrink-0" style={{ borderBottom: `1px solid ${SILVER_FAINT}` }}>
              <p className="text-sm font-bold" style={{ color: SILVER }}>🔔 알림 {unread > 0 ? `(${unread})` : ""}</p>
              {items.length > 0 && <button onClick={markAll} className="text-[11px]" style={{ color: BLUE }}>모두 읽음</button>}
            </div>
            <div className="flex-1 overflow-y-auto">
              {items.length === 0 ? (
                <p className="text-xs text-center py-8" style={{ color: SILVER_DIM }}>알림이 없어요</p>
              ) : (
                items.map(n => (
                  <button key={n.id} onClick={() => openItem(n)}
                    className="block w-full text-left px-4 py-2.5 hover:bg-white/5"
                    style={{ borderBottom: `1px solid ${SILVER_FAINT}`, backgroundColor: n.is_read ? "transparent" : "rgba(100,180,255,0.06)" }}>
                    <div className="flex items-center gap-1.5">
                      {!n.is_read && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: "#5b9bd5" }} />}
                      <span className="text-[12px] font-medium truncate" style={{ color: SILVER }}>{label(n)}</span>
                    </div>
                    <p className="text-[11px] mt-0.5 truncate" style={{ color: BLUE }}>📄 {n.doc_title ?? "기획서"}</p>
                    {n.preview && <p className="text-[11px] mt-0.5 line-clamp-1" style={{ color: SILVER_DIM }}>“{n.preview}”</p>}
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[10px]" style={{ color: SILVER_DIM }}>{timeAgo(n.created_at)}</span>
                      <span className="text-[10px]" style={{ color: BLUE }}>바로가기 →</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

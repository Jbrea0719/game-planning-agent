"use client";

// 변경 히스토리 패널 (PC·모바일 설정에서 공용으로 사용)
// 2개 탭: "조던 기능"(scope=jordan) / "기획서"(scope=doc)
// - 항목별 삭제, 제목·부가설명 인라인 수정 지원
// - 조던 다크 테마 토큰에 맞춘 컴팩트 스타일

import { useState, useEffect, useCallback } from "react";

// 테마 컬러 (chat/page.tsx·MobileChatPage.tsx와 동일 토큰)
const SILVER = "#c0c8d8";
const SILVER_DIM = "rgba(192,200,216,0.5)";
const SILVER_FAINT = "rgba(192,200,216,0.15)";

type Scope = "jordan" | "doc";

interface Entry {
  id: string;
  scope: string;
  action: string;     // create | update | delete
  entity?: string | null;
  title?: string | null;
  detail?: string | null;
  target_id?: string | null;
  nickname?: string | null;
  created_at: string;
}

// 동작별 배지 색상·라벨
function actionBadge(action: string): { label: string; bg: string; border: string; color: string } {
  switch (action) {
    case "create":
      return { label: "추가", bg: "rgba(100,220,160,0.18)", border: "rgba(100,220,160,0.55)", color: "rgba(150,255,200,1)" };
    case "update":
      return { label: "수정", bg: "rgba(255,200,100,0.18)", border: "rgba(255,200,100,0.55)", color: "rgba(255,220,150,1)" };
    case "delete":
      return { label: "삭제", bg: "rgba(255,120,120,0.18)", border: "rgba(255,120,120,0.55)", color: "rgba(255,180,180,1)" };
    default:
      return { label: action, bg: SILVER_FAINT, border: SILVER_DIM, color: SILVER };
  }
}

// 세부 종류(entity) → 한글 라벨
function entityLabel(entity?: string | null): string {
  switch (entity) {
    case "decision": return "결정사항";
    case "category": return "카테고리";
    case "doc": return "기획서";
    case "comment": return "의견";
    case "feature": return "기능";
    default: return entity ?? "";
  }
}

// 상대 시간(간단) — 1분 전·2시간 전·3일 전, 그 이상은 날짜
function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "";
  const diff = Date.now() - t;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "방금";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}일 전`;
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function HistoryPanel() {
  const [tab, setTab] = useState<Scope>("jordan");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);

  // 인라인 편집 상태
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDetail, setEditDetail] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  // 탭 데이터 로드
  const load = useCallback(async (scope: Scope) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/history?scope=${scope}`);
      const json = await res.json();
      setEntries((json.entries ?? []) as Entry[]);
    } catch (err) {
      console.error("[HistoryPanel] 로드 실패:", err);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // 마운트·탭 변경 시 로드
  useEffect(() => {
    load(tab);
  }, [tab, load]);

  // 항목 삭제
  const handleDelete = async (id: string) => {
    // 낙관적 제거
    const prev = entries;
    setEntries((e) => e.filter((x) => x.id !== id));
    try {
      const res = await fetch("/api/history", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error("삭제 실패");
    } catch (err) {
      console.error("[HistoryPanel] 삭제 실패:", err);
      setEntries(prev); // 롤백
    }
  };

  // 편집 시작
  const startEdit = (entry: Entry) => {
    setEditingId(entry.id);
    setEditTitle(entry.title ?? "");
    setEditDetail(entry.detail ?? "");
  };

  // 편집 저장
  const saveEdit = async (id: string) => {
    setSavingId(id);
    try {
      const res = await fetch("/api/history", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, title: editTitle, detail: editDetail }),
      });
      if (!res.ok) throw new Error("수정 실패");
      setEntries((e) => e.map((x) => (x.id === id ? { ...x, title: editTitle, detail: editDetail } : x)));
      setEditingId(null);
    } catch (err) {
      console.error("[HistoryPanel] 수정 실패:", err);
    } finally {
      setSavingId(null);
    }
  };

  const tabBtnStyle = (active: boolean) => ({
    backgroundColor: active ? "rgba(100,220,160,0.18)" : SILVER_FAINT,
    border: `1px solid ${active ? "rgba(100,220,160,0.55)" : SILVER_DIM}`,
    color: active ? "rgba(150,255,200,1)" : SILVER,
  });

  return (
    <div>
      {/* 탭 */}
      <div className="flex gap-2 mb-2">
        <button
          onClick={() => setTab("jordan")}
          className="text-xs px-3 py-1.5 rounded-lg font-medium flex-1"
          style={tabBtnStyle(tab === "jordan")}
        >
          조던 기능
        </button>
        <button
          onClick={() => setTab("doc")}
          className="text-xs px-3 py-1.5 rounded-lg font-medium flex-1"
          style={tabBtnStyle(tab === "doc")}
        >
          기획서
        </button>
      </div>

      {/* 목록 */}
      <div className="space-y-1.5 max-h-[40vh] overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: `${SILVER_DIM} transparent` }}>
        {loading ? (
          <p className="text-[10px] text-center py-4 animate-pulse" style={{ color: SILVER_DIM }}>불러오는 중...</p>
        ) : entries.length === 0 ? (
          <p className="text-[10px] text-center py-6" style={{ color: SILVER_DIM }}>아직 기록된 변경 내역이 없어요</p>
        ) : (
          entries.map((entry) => {
            const badge = actionBadge(entry.action);
            const isEditing = editingId === entry.id;
            return (
              <div
                key={entry.id}
                className="px-2.5 py-2 rounded-lg"
                style={{ backgroundColor: "rgba(255,255,255,0.03)", border: `1px solid ${SILVER_FAINT}` }}
              >
                {/* 상단: 배지 + 메타 + 액션 버튼 */}
                <div className="flex items-center gap-1.5">
                  <span
                    className="text-[9px] px-1.5 py-0.5 rounded font-bold flex-shrink-0"
                    style={{ backgroundColor: badge.bg, border: `1px solid ${badge.border}`, color: badge.color }}
                  >
                    {badge.label}
                  </span>
                  {entry.entity && (
                    <span className="text-[9px] flex-shrink-0" style={{ color: SILVER_DIM }}>{entityLabel(entry.entity)}</span>
                  )}
                  <span className="text-[9px] ml-auto flex-shrink-0" style={{ color: SILVER_DIM }}>{relativeTime(entry.created_at)}</span>
                  {!isEditing && (
                    <>
                      <button
                        onClick={() => startEdit(entry)}
                        className="text-[10px] px-1 py-0.5 rounded flex-shrink-0"
                        style={{ color: SILVER_DIM }}
                        title="수정"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleDelete(entry.id)}
                        className="text-[10px] px-1 py-0.5 rounded flex-shrink-0"
                        style={{ color: "rgba(255,150,150,0.8)" }}
                        title="삭제"
                      >
                        🗑️
                      </button>
                    </>
                  )}
                </div>

                {/* 본문: 제목·부가설명 (보기 / 편집) */}
                {isEditing ? (
                  <div className="mt-1.5 space-y-1.5">
                    <input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      placeholder="제목"
                      className="w-full text-xs px-2 py-1 rounded-lg outline-none"
                      style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${SILVER_FAINT}`, color: "#e0e8f0" }}
                    />
                    <input
                      value={editDetail}
                      onChange={(e) => setEditDetail(e.target.value)}
                      placeholder="부가 설명 (선택)"
                      className="w-full text-[11px] px-2 py-1 rounded-lg outline-none"
                      style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${SILVER_FAINT}`, color: SILVER }}
                    />
                    <div className="flex gap-1.5 justify-end">
                      <button
                        onClick={() => setEditingId(null)}
                        className="text-[10px] px-2 py-1 rounded-lg"
                        style={{ backgroundColor: SILVER_FAINT, color: SILVER_DIM }}
                      >
                        취소
                      </button>
                      <button
                        onClick={() => saveEdit(entry.id)}
                        disabled={savingId === entry.id}
                        className="text-[10px] px-2 py-1 rounded-lg font-medium disabled:opacity-50"
                        style={{ backgroundColor: "rgba(100,220,160,0.25)", border: "1px solid rgba(100,220,160,0.55)", color: "rgba(150,255,200,1)" }}
                      >
                        {savingId === entry.id ? "저장 중..." : "저장"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-xs mt-1 break-words" style={{ color: SILVER }}>
                      {entry.title || <span style={{ color: SILVER_DIM }}>(제목 없음)</span>}
                    </p>
                    {entry.detail && (
                      <p className="text-[10px] mt-0.5 break-words" style={{ color: SILVER_DIM }}>{entry.detail}</p>
                    )}
                    {entry.nickname && (
                      <p className="text-[9px] mt-0.5" style={{ color: SILVER_DIM }}>by {entry.nickname}</p>
                    )}
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

"use client";

import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm"; // GFM 지원 — 표(table)·취소선 등 마크다운 확장 렌더링
import dynamic from "next/dynamic";
import CategoryManager from "./CategoryManager";
import ReclassifyReview from "./ReclassifyReview";
import DocReclassifyReview from "./DocReclassifyReview";
import DocList from "./DocList";

const WireframeEditor = dynamic(() => import("./WireframeEditor"), { ssr: false });
const MockupGenerator = dynamic(() => import("./MockupGenerator"), { ssr: false });
const ScreenshotFrameModal = dynamic(() => import("./ScreenshotFrameModal"), { ssr: false });
import {
  downloadMD as exportMD,
  downloadTXT as exportTXT,
  downloadHTML as exportHTML,
  downloadPDF as exportPDF,
} from "@/lib/doc-export";
import { MermaidDiagram, DocImage } from "./DocImages";
import { stripJordanImages, type DocImageItem } from "@/lib/doc-images";
import DocReferencePanel from "./DocReferencePanel";
import BulkReplaceModal from "./BulkReplaceModal";
import BulkReviseModal from "./BulkReviseModal";
import DocComments from "./DocComments";

// 조던 테마 컬러 — globals.css 의 CSS 변수(토큰)에 연결 → 스킨(테마) 전환 시 자동 반영
const SILVER = "var(--accent)";
const SILVER_DIM = "var(--accent-dim)";
const SILVER_FAINT = "var(--accent-faint)";

export interface DocMeta {
  id: string;
  title: string;
  status: string;
  changes_summary: string | null;
  created_at: string;
  created_by_nickname: string | null;
  category_main_id: string | null;
  category_area_code: string | null;
  category_sub_id: string | null;
  sort_order?: number | null;   // 같은 카테고리 그룹 내 수동 정렬 순서(드래그앤드롭)
  doc_family_id?: string | null;  // 버전 묶음 안정 키 (댓글 등 버전 무관 데이터의 기준)
}

export interface CategorySubItem {
  id: string;
  name_ko: string;
  area_code: string | null;
  area_name: string | null;
}
export interface CategoryAreaItem {
  code: string;
  name: string;
  sub_categories: CategorySubItem[];
}
export interface CategoryMainItem {
  id: string;
  name_ko: string;
  icon: string | null;
  sub_categories?: CategorySubItem[];
  areas?: CategoryAreaItem[];
}

export interface DocFull extends DocMeta {
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
  onCategoriesChanged,
  onDecisionsChanged,
  onStartWriting,
  onStartWritingDoc,
  onReviseViaChat,
  openTarget,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  nickname: string;
  reloadKey?: number;  // 외부에서 새 기획서 생성 시 갱신용
  onCategoriesChanged?: () => void;  // 카테고리 변경 시 부모에 알림 (바이블 패널 실시간 동기화용)
  onDecisionsChanged?: () => void;   // 결정사항 변경 시 부모에 알림 (AI 재분류 적용 후 바이블 새로고침용)
  onStartWriting?: (subCategoryId: string, label: string) => void;  // 빈 (진짜)소분류 '작성하기' → 그 소에 새 기획서 작성
  onStartWritingDoc?: (docId: string, title: string) => void;  // planned 기획서 '작성하기' → 인터뷰 결과가 이 기획서를 채움
  onReviseViaChat?: (docId: string, docTitle: string) => void;  // '대화를 통한 수정' → 채팅으로 이동해 이 기획서를 수정 대상으로 지정
  openTarget?: { docId: string | null; commentId: string | null } | null;  // 알림 바로가기 — 이 기획서를 열고 댓글로 스크롤
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
  // localStorage에서 마지막 +/- 상태를 복원 (없으면 빈 Set → 최초 1회 자동 펼침)
  const EXPAND_LS_KEY = "jordan_doc_expanded_cats";
  const [expandedCats, setExpandedCats] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = localStorage.getItem(EXPAND_LS_KEY);
      if (raw) return new Set(JSON.parse(raw) as string[]);
    } catch { /* 무시 */ }
    return new Set();
  });
  // 저장된 펼침 상태가 있었는지 (있으면 자동 펼침으로 덮어쓰지 않음)
  const hadSavedExpandRef = useRef<boolean>(typeof window !== "undefined" && !!localStorage.getItem("jordan_doc_expanded_cats"));
  const autoExpandSeededRef = useRef(false);
  const [expandedFamilies, setExpandedFamilies] = useState<Set<string>>(new Set());
  // family 이름 변경 인라인 편집
  const [renamingFamilyId, setRenamingFamilyId] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState("");
  // family 카테고리 변경 모달 (대 > 중 > 소)
  const [categorizingFamilyId, setCategorizingFamilyId] = useState<string | null>(null);
  const [catPickMainId, setCatPickMainId] = useState<string>("");
  const [catPickAreaCode, setCatPickAreaCode] = useState<string>("");
  const [catPickSubId, setCatPickSubId] = useState<string>("");
  // AI 카테고리 추천 (제안만 — 사용자가 검토 후 적용)
  const [catSuggesting, setCatSuggesting] = useState(false);
  const [catSuggestMsg, setCatSuggestMsg] = useState<string>("");
  // 카테고리 트리 (DecisionPanel과 동일 소스)
  const [categories, setCategories] = useState<CategoryMainItem[]>([]);
  // 본 적 있는 doc id 추적 (per-doc 레드닷)
  const [viewedDocIds, setViewedDocIds] = useState<Set<string>>(new Set());
  // 사이드바 접기/펴기 (localStorage 영속)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [refCollapsed, setRefCollapsed] = useState(false);  // 우측 레퍼런스 패널 접기/펴기
  const [showBulkReplace, setShowBulkReplace] = useState(false);  // 용어 일괄 변경 모달
  const [showBulkRevise, setShowBulkRevise] = useState(false);  // AI 일괄 수정 모달
  // 화면 설계 메뉴 (와이어프레임 / AI 시안)
  const [showScreenDesignMenu, setShowScreenDesignMenu] = useState(false);
  const [showReviseMenu, setShowReviseMenu] = useState(false);  // 수정 요청 → [직접수정 / 대화를 통한 수정]
  const [screenDesignOpen, setScreenDesignOpen] = useState<"wireframe" | "mockup" | "frame" | null>(null);
  // 카테고리 관리 모달
  const [showCatManager, setShowCatManager] = useState(false);
  // AI 재분류 검토 모달 — 카테고리 삭제로 미분류된 결정사항 id 목록 (null이면 닫힘)
  const [reclassifyIds, setReclassifyIds] = useState<string[] | null>(null);
  // 기획서 AI 재분류 검토 모달 — 카테고리 삭제로 미분류된 기획서 id 목록 (null이면 닫힘)
  const [reclassifyDocIds, setReclassifyDocIds] = useState<string[] | null>(null);
  // 자동 이미지 — 미리보기 단계
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [previewItems, setPreviewItems] = useState<DocImageItem[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [imageApplying, setImageApplying] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  // 카테고리 재로드 (관리 모달에서 변경 시)
  const reloadCategories = useCallback(() => {
    fetch("/api/categories")
      .then(r => r.json())
      .then(d => setCategories(d.main_categories ?? []))
      .catch(err => console.error("[doc-view] 카테고리 재로드 실패:", err));
    // 기획서도 새로 fetch — 카테고리 삭제 시 category 필드가 null이 됐을 수 있어서
    void loadVersions();
    // 부모에 알림 → 바이블 패널도 같은 카테고리로 즉시 동기화
    onCategoriesChanged?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onCategoriesChanged]);

  // 카테고리 트리 로드 (한 번)
  useEffect(() => {
    fetch("/api/categories")
      .then(r => r.json())
      .then(d => setCategories(d.main_categories ?? []))
      .catch(err => console.error("[doc-view] 카테고리 로드 실패:", err));
  }, []);

  // 사이드바 접힘 상태 복원 — 저장된 선호 우선, 없으면 좁은 화면(모바일)에선 기본 접힘
  // (리스트가 본문과 나란히 떠서 댓글·본문이 눌리는 문제 방지)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem("jordan_doc_sidebar_collapsed");
    if (saved === "true") setSidebarCollapsed(true);
    else if (saved === "false") setSidebarCollapsed(false);
    else if (window.innerWidth < 768) setSidebarCollapsed(true);  // 좁은 화면 기본 접힘
  }, []);
  function setSidebar(next: boolean) {
    setSidebarCollapsed(next);
    if (typeof window !== "undefined") {
      localStorage.setItem("jordan_doc_sidebar_collapsed", String(next));
    }
  }
  function toggleSidebar() { setSidebar(!sidebarCollapsed); }

  // ── 모바일 터치 스와이프 — 사이드바 열기/닫기 ────────────────────
  // 좌→우 스와이프 (60px+, 세로 30px 이하) → 사이드바 열기
  // 우→좌 스와이프 → 사이드바 닫기
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  function handleTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY };
  }
  function handleTouchEnd(e: React.TouchEvent) {
    if (!touchStartRef.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartRef.current.x;
    const dy = t.clientY - touchStartRef.current.y;
    touchStartRef.current = null;
    // 수평 60px 이상, 수직 30px 이내일 때만 스와이프로 판정 (스크롤·텍스트 선택 방해 X)
    if (Math.abs(dx) < 60 || Math.abs(dy) > 30) return;
    if (dx > 0 && sidebarCollapsed) setSidebar(false);     // → 펴기
    else if (dx < 0 && !sidebarCollapsed) setSidebar(true); // ← 접기
  }

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

  // ── AI 카테고리 추천 — 제안만 받아 드롭다운에 채움 (적용은 사용자가 '적용' 눌러야) ──
  async function suggestCategory() {
    if (!categorizingFamilyId) return;
    setCatSuggesting(true);
    setCatSuggestMsg("");
    try {
      const res = await fetch("/api/design-docs/categorize-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc_id: categorizingFamilyId }),
      });
      const data = await res.json();
      const s = data.suggestion as { main_id: string | null; area_code: string | null; sub_id: string | null; label: string | null; reasoning: string } | undefined;
      if (s?.sub_id) {
        // 드롭다운에 미리 채워두고, 사용자가 확인 후 '적용'
        setCatPickMainId(s.main_id ?? "");
        setCatPickAreaCode(s.area_code ?? "");
        setCatPickSubId(s.sub_id ?? "");
        setCatSuggestMsg(`💡 추천: ${s.label ?? ""}${s.reasoning ? ` — ${s.reasoning}` : ""}`);
      } else {
        setCatSuggestMsg("적합한 카테고리를 찾지 못했어요. 직접 골라주세요.");
      }
    } catch (err) {
      console.error("[doc-view] AI 카테고리 추천 실패:", err);
      setCatSuggestMsg("추천을 가져오지 못했어요. 직접 골라주세요.");
    } finally {
      setCatSuggesting(false);
    }
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
      setCatSuggestMsg("");
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
      // 자동 선택 — 마지막으로 보던 기획서가 있으면 그걸, 없으면 최신 1번.
      // 단, 작성예정(planned, 내용 없음) 기획서는 자동 선택 대상에서 제외(빈 화면 방지).
      if (list.length > 0 && !currentDoc) {
        const written = list.filter(d => d.status !== "planned");
        const saved = typeof window !== "undefined" ? sessionStorage.getItem("jordan_last_doc") : null;
        const target = saved && written.find(d => d.id === saved) ? saved : written[0]?.id;
        if (target) await loadDoc(target);
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
        if (typeof window !== "undefined") sessionStorage.setItem("jordan_last_doc", id);  // 새로고침 시 이 문서로 복원
      }
    } catch (err) {
      console.error("[doc-view] 단건 로드 실패:", err);
    }
  }

  // 마운트·열림·reloadKey 변경 시 갱신
  useEffect(() => { if (open) void loadVersions(); }, [open, loadVersions]);

  // 알림 '바로가기' — 지정된 기획서를 열고 댓글로 스크롤할 id를 DocComments에 전달
  const [scrollCommentId, setScrollCommentId] = useState<string | null>(null);
  useEffect(() => {
    if (!openTarget) return;
    if (openTarget.docId) void loadDoc(openTarget.docId);
    setScrollCommentId(openTarget.commentId ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openTarget]);

  // 기획서 스크롤 위치 복원 — 새로고침/문서 전환 시 마지막 위치로 (댓글 확인 등)
  // 본문·이미지 로드로 높이가 바뀌므로 몇 차례 시도. 사용자가 직접 스크롤하면 멈춤.
  useEffect(() => {
    if (!currentDoc || typeof window === "undefined") return;
    const saved = sessionStorage.getItem(`jordan_doc_scroll:${currentDoc.id}`);
    const y = saved ? parseInt(saved, 10) : 0;
    if (!y) return;
    let cancelled = false;
    const onUser = () => { cancelled = true; };
    bodyRef.current?.addEventListener("wheel", onUser, { passive: true, once: true });
    bodyRef.current?.addEventListener("touchstart", onUser, { passive: true, once: true });
    const timers = [60, 250, 600].map(d => setTimeout(() => { if (!cancelled && bodyRef.current) bodyRef.current.scrollTop = y; }, d));
    return () => { timers.forEach(clearTimeout); };
  }, [currentDoc?.id]);

  // 최초 1회만: 저장된 펼침 상태가 없을 때, 문서 있는 카테고리(대/중/소)를 기본 펼침
  // (저장된 상태가 있으면 사용자가 마지막에 둔 +/- 그대로 유지)
  useEffect(() => {
    if (versions.length === 0) return;
    if (hadSavedExpandRef.current || autoExpandSeededRef.current) return;
    autoExpandSeededRef.current = true;
    setExpandedCats(prev => {
      const n = new Set(prev);
      const NONE = "__none__";
      for (const v of versions) {
        const mainKey = v.category_main_id ?? NONE;
        n.add(mainKey);
        if (v.category_area_code) {
          const areaKey = `${mainKey}::${v.category_area_code}`;
          n.add(areaKey);
          if (v.category_sub_id) {
            n.add(`${areaKey}::${v.category_sub_id}`);
          }
        }
      }
      return n;
    });
  }, [versions]);

  // 펼침 상태 변경 시 localStorage에 저장 → 다음 진입·새로고침 때 복원
  useEffect(() => {
    if (typeof window === "undefined") return;
    try { localStorage.setItem(EXPAND_LS_KEY, JSON.stringify([...expandedCats])); } catch { /* 무시 */ }
  }, [expandedCats]);
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

  // ── 자동 이미지: 미리보기 → 조정 → 적용 ──────────────────────────
  // 1단계: 이미지 후보를 받아 미리보기 팝업 열기 (즉시 적용 X)
  async function startImagePreview() {
    if (!currentDoc || previewLoading) return;
    setShowImagePreview(true);
    setPreviewItems([]);
    setPreviewLoading(true);
    try {
      const res = await fetch("/api/design-docs/image-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: currentDoc.content_markdown }),
      });
      const data = await res.json();
      const base = stripJordanImages(currentDoc.content_markdown);
      const items: DocImageItem[] = (data.suggestions ?? [])
        .filter((s: { heading?: string }) => s.heading && base.includes(s.heading))
        .map((s: { heading: string; type: string; alt?: string; mermaid?: string; prompt?: string }, i: number) => {
          const type = s.type === "diagram" ? "diagram" : "mockup";
          return {
            key: `${Date.now()}-${i}`,
            heading: s.heading,
            type,
            alt: s.alt ?? "이미지",
            mermaid: s.mermaid,
            prompt: s.prompt,
            generating: type === "mockup",   // 목업은 Gemini 생성 대기 상태로 시작
          } as DocImageItem;
        });
      setPreviewItems(items);
      setPreviewLoading(false);
      // 목업 이미지는 Gemini로 병렬 생성 (각자 완료되는 대로 채워짐)
      items.filter(it => it.type === "mockup" && it.prompt).forEach(it => { void genMockup(it.key, it.prompt!); });
    } catch {
      setPreviewItems([]);
      setPreviewLoading(false);
    }
  }

  // 단일 목업 이미지 Gemini 생성 → 저장 URL을 항목에 채움
  async function genMockup(key: string, prompt: string) {
    setPreviewItems(prev => prev.map(it => it.key === key ? { ...it, generating: true, genFailed: false } : it));
    try {
      const res = await fetch("/api/design-docs/mockup-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, doc_id: currentDoc?.id }),
      });
      const data = await res.json();
      if (data.url) {
        setPreviewItems(prev => prev.map(it => it.key === key ? { ...it, imageUrl: data.url, generating: false } : it));
        return;
      }
    } catch { /* 아래에서 실패 처리 */ }
    setPreviewItems(prev => prev.map(it => it.key === key ? { ...it, generating: false, genFailed: true } : it));
  }

  function removePreviewItem(key: string) {
    setPreviewItems(prev => prev.filter(it => it.key !== key));
  }

  // 항목별 재생성: mockup은 Gemini 재생성, diagram은 API 재호출
  async function regeneratePreviewItem(key: string) {
    const item = previewItems.find(it => it.key === key);
    if (!item || !currentDoc) return;

    if (item.type === "mockup" && item.prompt) {
      // 약간의 변형 힌트를 더해 다른 화면이 나오게
      const varied = `${item.prompt} (alternative composition, variation ${Math.floor(Math.random() * 1000)})`;
      await genMockup(item.key, varied);
      return;
    }

    setPreviewItems(prev => prev.map(it => it.key === key ? { ...it, regenerating: true } : it));
    try {
      const res = await fetch("/api/design-docs/image-regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "diagram", heading: item.heading, content: currentDoc.content_markdown }),
      });
      const data = await res.json();
      if (data.mermaid) {
        setPreviewItems(prev => prev.map(it =>
          it.key === key ? { ...it, mermaid: data.mermaid, alt: data.alt ?? it.alt, regenerating: false } : it));
        return;
      }
    } catch { /* 아래에서 로딩만 해제 */ }
    setPreviewItems(prev => prev.map(it => it.key === key ? { ...it, regenerating: false } : it));
  }

  // 2단계: 승인된 항목을 본문에 반영하고 저장 (서버에서 백업 후 삽입)
  async function applyImagePreview() {
    if (!currentDoc || imageApplying) return;
    setImageApplying(true);
    try {
      const res = await fetch("/api/design-docs/enrich-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc_id: currentDoc.id, items: previewItems, nickname }),
      });
      const data = await res.json();
      if (data.success) {
        await loadDoc(currentDoc.id);
        setShowImagePreview(false);
      } else {
        alert(`이미지 적용 실패: ${data.error ?? "알 수 없는 오류"}`);
      }
    } catch (err) {
      alert(`이미지 적용 실패: ${String(err)}`);
    } finally {
      setImageApplying(false);
    }
  }

  // ── 내보내기 (lib/doc-export.ts 호출) ────────────────────────────
  function downloadMD() { if (currentDoc) { exportMD(currentDoc); setShowExportMenu(false); } }
  function downloadTXT() { if (currentDoc) { exportTXT(currentDoc); setShowExportMenu(false); } }
  function downloadHTML() { if (currentDoc) { exportHTML(currentDoc); setShowExportMenu(false); } }
  function downloadPDF() {
    if (!currentDoc) return;
    const ok = exportPDF(currentDoc);
    if (!ok) alert("팝업이 차단됐어요. 브라우저 팝업 허용 후 다시 시도해주세요.");
    setShowExportMenu(false);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: "var(--background)" }}>
      {/* 상단 액션 바 — 모바일에서는 줄바꿈 허용 */}
      <div className="flex flex-wrap items-center justify-between px-3 py-2 md:px-4 md:py-3 flex-shrink-0 gap-2 md:gap-3" style={{ borderBottom: `1px solid ${SILVER_FAINT}` }}>
        <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
          <p className="text-sm font-bold flex-shrink-0" style={{ color: SILVER }}>📄 기획서</p>
          {currentDoc && (
            <span className="text-xs" style={{ color: SILVER_DIM }}>
              {new Date(currentDoc.created_at).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" })}
              {currentDoc.created_by_nickname && ` · ${currentDoc.created_by_nickname}`}
            </span>
          )}
        </div>

        {/* 버튼 그룹 — 모바일에선 화면 폭 넘으면 줄바꿈·우측정렬(짤림 방지), PC(md↑)는 한 줄 유지 */}
        <div className="flex flex-wrap items-center justify-end gap-1.5 md:gap-2 md:flex-nowrap">
          {!editing ? (
            <>
              <button
                onClick={startEdit}
                disabled={!currentDoc}
                className="text-xs px-3 py-1.5 rounded-lg font-medium"
                style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--card-border)", color: "var(--text)", opacity: currentDoc ? 1 : 0.5 }}
              >
                ✏️ 편집
              </button>
              {/* 수정 요청 → [직접수정 / 대화를 통한 수정] 메뉴 */}
              <div className="relative">
                <button
                  onClick={() => setShowReviseMenu(v => !v)}
                  disabled={!currentDoc}
                  title="수정 요청 — 직접수정(지시문) 또는 대화를 통한 수정"
                  className="text-xs px-3 py-1.5 rounded-lg font-medium"
                  style={{
                    backgroundColor: "rgba(80,150,240,0.16)",
                    border: "1px solid rgba(80,150,240,0.45)",
                    color: "var(--text)",
                    opacity: currentDoc ? 1 : 0.5,
                  }}
                >
                  🪄 수정 요청 ▾
                </button>
                {showReviseMenu && currentDoc && (
                  <div className="absolute left-0 mt-1 rounded-lg overflow-hidden z-30 min-w-[200px]"
                    style={{ backgroundColor: "var(--surface-2)", border: `1px solid ${SILVER_FAINT}`, boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }}>
                    <button
                      onClick={() => { setShowReviseMenu(false); setReviseInstruction(""); setShowReviseModal(true); }}
                      className="block w-full text-left text-xs px-3 py-2.5 hover:bg-white/5"
                      style={{ color: SILVER }}
                    >
                      ✍️ <b>직접수정</b> — 지시문으로 수정
                    </button>
                    <button
                      onClick={() => { setShowReviseMenu(false); onReviseViaChat?.(currentDoc.id, currentDoc.title); }}
                      className="block w-full text-left text-xs px-3 py-2.5 hover:bg-white/5"
                      style={{ color: SILVER, borderTop: `1px solid ${SILVER_FAINT}` }}
                    >
                      💬 <b>대화를 통한 수정</b> — 채팅에서 논의 후 반영
                    </button>
                    <button
                      onClick={() => { setShowReviseMenu(false); setShowBulkReplace(true); }}
                      className="block w-full text-left text-xs px-3 py-2.5 hover:bg-white/5"
                      style={{ color: SILVER, borderTop: `1px solid ${SILVER_FAINT}` }}
                    >
                      🔧 <b>용어 일괄 변경</b> — 여러 기획서 단어 교체
                    </button>
                    <button
                      onClick={() => { setShowReviseMenu(false); setShowBulkRevise(true); }}
                      className="block w-full text-left text-xs px-3 py-2.5 hover:bg-white/5"
                      style={{ color: SILVER, borderTop: `1px solid ${SILVER_FAINT}` }}
                    >
                      🤖 <b>문맥 일괄 변경</b> — 여러 기획서 AI 문맥 수정
                    </button>
                  </div>
                )}
              </div>
              {/* 화면 설계 — 와이어프레임 또는 AI 시안 */}
              <div className="relative">
                <button
                  onClick={() => setShowScreenDesignMenu(v => !v)}
                  disabled={!currentDoc}
                  title="화면 설계 — 와이어프레임 직접 그리기 또는 AI로 시안 자동 생성"
                  className="text-xs px-3 py-1.5 rounded-lg font-medium"
                  style={{
                    backgroundColor: "rgba(150,110,235,0.16)",
                    border: "1px solid rgba(150,110,235,0.45)",
                    color: "var(--text)",
                    opacity: currentDoc ? 1 : 0.5,
                  }}
                >
                  🎨 화면 설계 ▾
                </button>
                {showScreenDesignMenu && (
                  <div className="absolute right-0 top-full mt-1 rounded-lg shadow-2xl py-1 z-10" style={{ backgroundColor: "var(--surface)", border: `1px solid ${SILVER_FAINT}`, minWidth: "220px" }}>
                    <button
                      onClick={() => { setShowScreenDesignMenu(false); setScreenDesignOpen("wireframe"); }}
                      className="block w-full text-left text-xs px-3 py-2 hover:bg-white/5"
                      style={{ color: SILVER }}
                    >
                      🎨 와이어프레임 (직접 그리기)
                    </button>
                    <button
                      onClick={() => { setShowScreenDesignMenu(false); setScreenDesignOpen("mockup"); }}
                      className="block w-full text-left text-xs px-3 py-2 hover:bg-white/5"
                      style={{ color: SILVER }}
                    >
                      🪄 AI 시안 생성 (자연어 → HTML)
                    </button>
                    <button
                      onClick={() => { setShowScreenDesignMenu(false); setScreenDesignOpen("frame"); }}
                      className="block w-full text-left text-xs px-3 py-2 hover:bg-white/5"
                      style={{ color: SILVER, borderTop: `1px solid ${SILVER_FAINT}` }}
                    >
                      📐 스크린샷 → 텍스트 UI 프레임
                    </button>
                    <div className="px-3 py-1.5 text-[10px]" style={{ color: SILVER_DIM, borderTop: `1px solid ${SILVER_FAINT}` }}>
                      💡 와이어/시안은 📎로 첨부 · 텍스트 프레임은 본문에 추가
                    </div>
                  </div>
                )}
              </div>
              {/* 자동 이미지 — 본문 분석 후 다이어그램/UI목업 미리보기 → 적용 */}
              <button
                onClick={startImagePreview}
                disabled={!currentDoc}
                title="기획서를 분석해 필요한 다이어그램·UI 이미지를 미리보기로 제안 — 확인 후 적용"
                className="text-xs px-3 py-1.5 rounded-lg font-medium"
                style={{
                  backgroundColor: "rgba(20,170,210,0.16)",
                  border: "1px solid rgba(20,170,210,0.5)",
                  color: "var(--text)",
                  opacity: currentDoc ? 1 : 0.5,
                }}
              >
                🖼️ 이미지 추가
              </button>
              <div className="relative">
                <button
                  onClick={() => setShowExportMenu(v => !v)}
                  disabled={!currentDoc}
                  className="text-xs px-3 py-1.5 rounded-lg font-medium"
                  style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--card-border)", color: "var(--text)", opacity: currentDoc ? 1 : 0.5 }}
                >
                  📥 내보내기 ▾
                </button>
                {showExportMenu && (
                  <div className="absolute right-0 top-full mt-1 rounded-lg shadow-2xl py-1 z-10" style={{ backgroundColor: "var(--surface)", border: `1px solid ${SILVER_FAINT}`, minWidth: "180px" }}>
                    <button onClick={downloadMD} className="block w-full text-left text-xs px-3 py-2 hover:bg-white/5" style={{ color: SILVER }}>📝 MD (마크다운)</button>
                    <button onClick={downloadTXT} className="block w-full text-left text-xs px-3 py-2 hover:bg-white/5" style={{ color: SILVER }}>📄 TXT (순수 텍스트)</button>
                    <button onClick={downloadHTML} className="block w-full text-left text-xs px-3 py-2 hover:bg-white/5" style={{ color: SILVER }}>🌐 HTML (웹 페이지)</button>
                    <button onClick={downloadPDF} className="block w-full text-left text-xs px-3 py-2 hover:bg-white/5" style={{ color: SILVER }}>🖨️ PDF (인쇄 → 저장)</button>
                    <div className="px-3 py-1.5 text-[10px]" style={{ color: SILVER_DIM }}>PDF는 인쇄 대화상자에서 "PDF로 저장" 선택</div>
                  </div>
                )}
              </div>
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
              backgroundColor: "rgba(40,185,120,0.18)",
              border: "1.5px solid rgba(40,185,120,0.6)",
              color: "var(--text)",
              boxShadow: "0 2px 10px rgba(40,185,120,0.2)",
            }}
          >
            ← 조던으로 돌아가기
          </button>
        </div>
      </div>

      {/* 본문 영역 — 모바일 터치 스와이프로 사이드바 토글 */}
      <div
        className="flex-1 flex min-h-0 relative"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* 사이드바 토글 탭 — 크고 반투명, 사이드바 끝을 따라 슬라이드 */}
        {!editing && (
          <button
            onClick={toggleSidebar}
            title={sidebarCollapsed ? "리스트·목차 펼치기 (또는 좌→우 스와이프)" : "리스트·목차 접기 (또는 우→좌 스와이프)"}
            className={`absolute z-20 flex items-center justify-center transition-all duration-300 ease-in-out hover:!opacity-100 group ${
              sidebarCollapsed
                ? "left-0"
                : "left-[260px] max-md:left-[220px]"
            }`}
            style={{
              top: "50%",
              // 접힘: 전체가 화면 안에 (translateX 없음) + 모바일 터치 영역 ↑
              // 펴짐: 사이드바 경계에 절반씩 걸침
              transform: sidebarCollapsed
                ? "translateY(-50%)"
                : "translateY(-50%) translateX(-50%)",
              width: sidebarCollapsed ? "32px" : "26px",
              height: sidebarCollapsed ? "96px" : "80px",
              backgroundColor: sidebarCollapsed ? "rgba(100,180,255,0.4)" : "rgba(192,200,216,0.22)",
              border: `1px solid ${sidebarCollapsed ? "rgba(100,180,255,0.55)" : "rgba(192,200,216,0.35)"}`,
              borderRadius: sidebarCollapsed ? "0 12px 12px 0" : "10px",
              borderLeft: sidebarCollapsed ? "none" : `1px solid rgba(192,200,216,0.35)`,
              color: sidebarCollapsed ? "var(--accent-2)" : SILVER,
              fontSize: sidebarCollapsed ? "22px" : "18px",
              fontWeight: 700,
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              boxShadow: sidebarCollapsed ? "2px 2px 10px rgba(0,0,0,0.4)" : "0 2px 8px rgba(0,0,0,0.35)",
              opacity: sidebarCollapsed ? 0.75 : 0.55,
              cursor: "pointer",
            }}
          >
            {sidebarCollapsed ? "›" : "‹"}
          </button>
        )}
        {/* 좌측 사이드바 — width 슬라이드 애니메이션 (항상 DOM에 마운트) */}
        {!editing && (
          <aside
            className={`relative flex-shrink-0 flex flex-col overflow-hidden transition-all duration-300 ease-in-out ${
              sidebarCollapsed
                ? "w-0 opacity-0 pointer-events-none"
                : "w-[260px] max-md:w-[220px] opacity-100"
            }`}
            style={{ borderRight: sidebarCollapsed ? "none" : `1px solid ${SILVER_FAINT}` }}
          >
            {/* 상단 기획서 리스트 버튼 (카테고리 관리는 리스트 오버레이 안으로 이동됨) */}
            <div className="px-3 pt-3 pb-2 flex-shrink-0" style={{ borderBottom: `1px solid ${SILVER_FAINT}` }}>
              <button
                onClick={() => setShowDocList(v => !v)}
                className="w-full text-left text-xs px-3 py-2 rounded-lg font-bold flex items-center justify-between"
                style={{
                  backgroundColor: showDocList ? "rgba(100,180,255,0.18)" : SILVER_FAINT,
                  border: `1px solid ${showDocList ? "rgba(100,180,255,0.6)" : SILVER_DIM}`,
                  color: showDocList ? "var(--accent-2)" : SILVER,
                }}
              >
                <span>📚 기획서 리스트</span>
                <span style={{ color: SILVER_DIM, fontWeight: 400 }}>({versions.length})</span>
              </button>
            </div>

            {/* 현재 보고 있는 기획서 제목 — ✕ 클릭 시 리스트로 돌아감 */}
            {currentDoc && (
              <div className="px-3 py-2.5 flex-shrink-0 flex items-center gap-2" style={{ borderBottom: `1px solid ${SILVER_FAINT}` }}>
                <p className="text-sm font-bold truncate flex-1 min-w-0" style={{ color: SILVER }} title={currentDoc.title}>
                  📄 {currentDoc.title}
                </p>
                <button
                  onClick={() => setShowDocList(true)}
                  title="기획서 리스트로 돌아가기"
                  className="text-xs flex items-center justify-center w-6 h-6 rounded flex-shrink-0 hover:bg-white/10"
                  style={{ color: SILVER_DIM }}
                >
                  ✕
                </button>
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

            {/* 기획서 리스트 오버레이 — DocList 컴포넌트로 분리됨 */}
            {showDocList && (
              <DocList
                versions={versions}
                currentDoc={currentDoc}
                viewedDocIds={viewedDocIds}
                categories={categories}
                expandedCats={expandedCats}
                toggleCat={(key) => setExpandedCats(prev => {
                  const n = new Set(prev);
                  if (n.has(key)) n.delete(key); else n.add(key);
                  return n;
                })}
                renamingDocId={renamingFamilyId}
                renameInput={renameInput}
                setRenameInput={setRenameInput}
                submitRename={(docId) => submitRename(docId)}
                cancelRename={() => { setRenamingFamilyId(null); setRenameInput(""); }}
                startRename={(docId, title) => { setRenamingFamilyId(docId); setRenameInput(title); }}
                startCategorize={(d) => {
                  setCategorizingFamilyId(d.id);
                  setCatPickMainId(d.category_main_id ?? "");
                  setCatPickAreaCode(d.category_area_code ?? "");
                  setCatPickSubId(d.category_sub_id ?? "");
                  setCatSuggestMsg("");
                }}
                onStartWriting={(subId, label) => {
                  // 빈 (진짜)소분류 → 그 소에 새 기획서 작성. 뷰 닫고 부모에 위임
                  setShowDocList(false);
                  onClose();
                  onStartWriting?.(subId, label);
                }}
                onStartWritingDoc={(docId, title) => {
                  // planned 기획서 → 인터뷰가 이 기획서를 채움. 뷰 닫고 부모에 위임
                  setShowDocList(false);
                  onClose();
                  onStartWritingDoc?.(docId, title);
                }}
                onLoadDoc={(id) => { void loadDoc(id); setShowDocList(false); }}
                onOpenCategoryManager={() => setShowCatManager(true)}
                onClose={() => setShowDocList(false)}
                onMoved={() => { void loadVersions(); }}
              />
            )}
          </aside>
        )}

        {/* 중앙 본문 */}
        <div
          ref={bodyRef}
          onScroll={() => { if (currentDoc && bodyRef.current && typeof window !== "undefined") sessionStorage.setItem(`jordan_doc_scroll:${currentDoc.id}`, String(bodyRef.current.scrollTop)); }}
          className="flex-1 overflow-y-auto px-6 py-6"
          style={{ scrollbarWidth: "thin" }}
        >
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
          {/* 기획서 미선택(또는 작성예정 빈 기획서) — 왼쪽 목록에서 골라달라는 안내 */}
          {!loading && versions.length > 0 && (!currentDoc || currentDoc.status === "planned") && (
            <div className="max-w-2xl mx-auto mt-12 text-center">
              <p className="text-base font-bold mb-2" style={{ color: SILVER }}>📄 기획서를 선택해주세요</p>
              <p className="text-sm" style={{ color: SILVER_DIM }}>왼쪽 목록에서 볼 기획서를 선택하면 여기에 내용이 표시돼요.</p>
            </div>
          )}
          {currentDoc && currentDoc.status !== "planned" && !editing && (
            <article
              className="prose prose-sm max-w-3xl mx-auto p-5 md:p-7"
              style={{
                color: "var(--text)",
                // 배경과 또렷이 분리되는 콘텐츠 카드 (테두리 + 은은한 그림자)
                backgroundColor: "var(--surface)",
                border: "1px solid var(--card-border)",
                borderRadius: 14,
                boxShadow: "var(--card-shadow)",
              }}
            >
              <ReactMarkdown
                remarkPlugins={[[remarkGfm, { singleTilde: false }]]}
                components={{
                  img: (props) => <DocImage src={typeof props.src === "string" ? props.src : undefined} alt={props.alt} />,
                  code: ({ className, children }) => {
                    if (/language-mermaid/.test(className ?? "")) {
                      return <MermaidDiagram code={String(children).trim()} />;
                    }
                    return <code className={className}>{children}</code>;
                  },
                  // 표 — 좁은 화면에서 칸 뭉개짐 방지(가로 스크롤 + 내용 폭)
                  table: ({ children, ...props }) => (
                    <div style={{ overflowX: "auto", margin: "0.6rem 0", border: "1px solid var(--prose-table-border)", borderRadius: 8 }}>
                      <table {...props} style={{ borderCollapse: "collapse", width: "auto", fontSize: "13px", lineHeight: 1.5 }}>{children}</table>
                    </div>
                  ),
                  th: ({ children, ...props }) => <th {...props} style={{ border: "1px solid var(--prose-table-border)", padding: "6px 10px", textAlign: "left", whiteSpace: "nowrap", backgroundColor: "var(--surface-2)", fontWeight: 700 }}>{children}</th>,
                  td: ({ children, ...props }) => <td {...props} style={{ border: "1px solid var(--prose-table-border)", padding: "6px 10px", verticalAlign: "top", minWidth: 56 }}>{children}</td>,
                }}
              >{currentDoc.content_markdown}</ReactMarkdown>
            </article>
          )}
          {/* 💬 기획서 댓글 (유튜브식: 의견 + 답글) — 보기 모드에서만, 작성된 기획서에만 */}
          {currentDoc && currentDoc.status !== "planned" && !editing && (
            <div className="max-w-3xl mx-auto">
              <DocComments docFamilyId={currentDoc.doc_family_id ?? currentDoc.id} nickname={nickname} scrollToCommentId={scrollCommentId} />
            </div>
          )}
          {currentDoc && editing && (
            <textarea
              value={editText}
              onChange={e => setEditText(e.target.value)}
              className="w-full h-full px-4 py-3 rounded text-sm outline-none resize-none font-mono"
              style={{ backgroundColor: "var(--surface-input)", border: `1px solid ${SILVER_FAINT}`, color: "var(--text)", minHeight: "60vh" }}
              autoFocus
            />
          )}
          {/* 모바일: 레퍼런스 이미지 — 본문 아래 (md 미만에서만) */}
          {currentDoc && !editing && (
            <div className="md:hidden max-w-3xl mx-auto mt-8 pt-6" style={{ borderTop: `1px solid ${SILVER_FAINT}` }}>
              <DocReferencePanel familyId={currentDoc.doc_family_id ?? currentDoc.id} />
            </div>
          )}
        </div>

        {/* 데스크톱: 우측 레퍼런스 이미지 패널 (기획서 리스트처럼 접기/펴기) */}
        {currentDoc && !editing && (
          <>
            {/* 우측 패널 토글 탭 — 패널 좌측 경계를 따라 슬라이드 */}
            <button
              onClick={() => setRefCollapsed(v => !v)}
              title={refCollapsed ? "레퍼런스 이미지 펼치기" : "레퍼런스 이미지 접기"}
              className={`hidden md:flex absolute z-20 items-center justify-center transition-all duration-300 ease-in-out hover:!opacity-100 ${refCollapsed ? "right-0" : "right-[300px]"}`}
              style={{
                top: "50%",
                transform: refCollapsed ? "translateY(-50%)" : "translateY(-50%) translateX(50%)",
                width: refCollapsed ? "32px" : "26px",
                height: refCollapsed ? "96px" : "80px",
                backgroundColor: refCollapsed ? "rgba(180,210,255,0.4)" : "rgba(192,200,216,0.22)",
                border: `1px solid ${refCollapsed ? "rgba(180,210,255,0.55)" : "rgba(192,200,216,0.35)"}`,
                borderRadius: refCollapsed ? "12px 0 0 12px" : "10px",
                color: refCollapsed ? "var(--accent-2)" : SILVER,
                fontSize: refCollapsed ? "22px" : "18px",
                fontWeight: 700,
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                boxShadow: refCollapsed ? "-2px 2px 10px rgba(0,0,0,0.4)" : "0 2px 8px rgba(0,0,0,0.35)",
                opacity: refCollapsed ? 0.8 : 0.55,
                cursor: "pointer",
              }}
            >
              {refCollapsed ? "‹" : "›"}
            </button>
            {/* 우측 패널 본체 — width 슬라이드 애니메이션 */}
            <aside
              className={`hidden md:block flex-shrink-0 overflow-y-auto transition-all duration-300 ease-in-out py-5 ${
                refCollapsed ? "w-0 opacity-0 pointer-events-none px-0" : "w-[300px] opacity-100 px-4"
              }`}
              style={{ borderLeft: refCollapsed ? "none" : `1px solid ${SILVER_FAINT}`, scrollbarWidth: "thin" }}
            >
              <DocReferencePanel familyId={currentDoc.doc_family_id ?? currentDoc.id} />
            </aside>
          </>
        )}
      </div>

      {/* 카테고리 관리 모달 — 톱니바퀴로 열림 */}
      <CategoryManager
        open={showCatManager}
        onClose={() => setShowCatManager(false)}
        onChanged={reloadCategories}
        onOrphaned={(ids) => setReclassifyIds(ids)}
        onOrphanedDocs={(ids) => setReclassifyDocIds(ids)}
        projectId={projectId}
      />

      {/* 용어 일괄 변경 모달 */}
      <BulkReplaceModal
        open={showBulkReplace}
        projectId={projectId}
        nickname={nickname}
        onClose={() => setShowBulkReplace(false)}
        onApplied={(updated) => {
          setShowBulkReplace(false);
          void loadVersions();
          if (currentDoc) void loadDoc(currentDoc.id);
          alert(`${updated}개 기획서에 일괄 적용했어요.`);
        }}
      />

      {/* AI 일괄 수정 모달 */}
      <BulkReviseModal
        open={showBulkRevise}
        projectId={projectId}
        nickname={nickname}
        onClose={() => setShowBulkRevise(false)}
        onApplied={(n) => {
          void loadVersions();
          if (currentDoc) void loadDoc(currentDoc.id);
          if (n > 0) alert(`${n}개 기획서에 AI 수정을 적용했어요.`);
        }}
      />

      {/* AI 재분류 검토 모달 — 카테고리 삭제로 미분류된 결정사항을 새 위치로 제안 */}
      <ReclassifyReview
        open={reclassifyIds !== null}
        projectId={projectId}
        decisionIds={reclassifyIds ?? []}
        nickname={nickname}
        onClose={() => setReclassifyIds(null)}
        onApplied={() => { onDecisionsChanged?.(); }}
      />

      {/* 기획서 AI 재분류 검토 모달 — 카테고리 삭제로 미분류된 기획서를 새 위치로 제안 */}
      <DocReclassifyReview
        open={reclassifyDocIds !== null}
        docIds={reclassifyDocIds ?? []}
        onClose={() => setReclassifyDocIds(null)}
        onApplied={() => { void loadVersions(); }}
      />

      {/* 화면 설계 도구 — 와이어프레임 / AI 시안 */}
      <WireframeEditor
        open={screenDesignOpen === "wireframe"}
        onClose={() => { setScreenDesignOpen(null); void loadVersions(); }}
        nickname={nickname}
      />
      <MockupGenerator
        open={screenDesignOpen === "mockup"}
        onClose={() => { setScreenDesignOpen(null); void loadVersions(); }}
        nickname={nickname}
      />
      <ScreenshotFrameModal
        open={screenDesignOpen === "frame"}
        onClose={() => setScreenDesignOpen(null)}
        docId={currentDoc?.id}
        currentMarkdown={currentDoc?.content_markdown}
        nickname={nickname}
        onInserted={() => { if (currentDoc) void loadDoc(currentDoc.id); }}
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
            style={{ backgroundColor: "var(--surface)", border: `1px solid ${SILVER_FAINT}` }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 flex items-center gap-2" style={{ borderBottom: `1px solid ${SILVER_FAINT}` }}>
              <span style={{ fontSize: "16px" }}>📂</span>
              <p className="text-sm font-bold" style={{ color: SILVER }}>카테고리 분류</p>
            </div>
            <div className="px-5 py-4 flex flex-col gap-3">
              {/* AI 추천 — 제안만 채우고 적용은 사용자가 '적용' 버튼으로 */}
              <button
                onClick={suggestCategory}
                disabled={catSuggesting}
                title="AI가 기획서 내용을 보고 적합한 카테고리를 제안해요 (적용은 직접 확인 후)"
                className="text-xs px-3 py-2 rounded-lg font-medium disabled:opacity-50"
                style={{ backgroundColor: "rgba(100,180,255,0.15)", border: "1px solid rgba(100,180,255,0.45)", color: "var(--accent-2)" }}
              >
                {catSuggesting ? "⏳ AI가 분류 중..." : "🤖 AI 추천 받기"}
              </button>
              {catSuggestMsg && (
                <p className="text-[11px] leading-snug px-1" style={{ color: "rgba(150,255,200,0.9)" }}>{catSuggestMsg}</p>
              )}
              {/* 대카테고리 (Main) */}
              <div className="flex flex-col gap-1">
                <label className="text-xs" style={{ color: SILVER_DIM }}>대카테고리</label>
                <select
                  value={catPickMainId}
                  onChange={(e) => { setCatPickMainId(e.target.value); setCatPickAreaCode(""); setCatPickSubId(""); }}
                  className="px-3 py-2 rounded-lg text-xs outline-none"
                  style={{ backgroundColor: "var(--surface-input)", border: `1px solid ${SILVER_FAINT}`, color: "var(--text)" }}
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
                      style={{ backgroundColor: "var(--surface-input)", border: `1px solid ${SILVER_FAINT}`, color: "var(--text)" }}
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
                      style={{ backgroundColor: "var(--surface-input)", border: `1px solid ${SILVER_FAINT}`, color: "var(--text)" }}
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
            style={{ backgroundColor: "var(--surface)", border: "1px solid rgba(100,180,255,0.4)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 flex items-center gap-2" style={{ borderBottom: `1px solid ${SILVER_FAINT}` }}>
              <span style={{ fontSize: "18px" }}>🪄</span>
              <div className="flex-1">
                <p className="text-sm font-bold" style={{ color: "var(--accent-2)" }}>기획서 수정 요청</p>
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
                  backgroundColor: "var(--surface-input)",
                  border: `1px solid ${SILVER_FAINT}`,
                  color: "var(--text)",
                  lineHeight: 1.55,
                }}
                autoFocus
              />
              <p className="text-xs" style={{ color: SILVER_DIM }}>
                💡 수정 전 원본은 7일간 백업 폴더에 보관돼요. 잘못된 수정 시 복구 가능.
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
                    color: "var(--accent-2)",
                  }}
                >
                  {revising ? (
                    <>
                      <span className="inline-block w-3 h-3 rounded-full border-2 animate-spin" style={{ borderColor: "rgba(180,210,255,0.3)", borderTopColor: "var(--accent-2)" }} />
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

      {/* 자동 이미지 미리보기 모달 — 적용 전 위치 확인·삭제·재생성 */}
      {showImagePreview && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.85)" }}>
          <div className="rounded-2xl w-full max-w-2xl max-h-[88vh] flex flex-col shadow-2xl" style={{ backgroundColor: "var(--surface)", border: `1px solid ${SILVER_FAINT}` }}>
            {/* 헤더 */}
            <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ borderBottom: `1px solid ${SILVER_FAINT}` }}>
              <div className="flex items-center gap-2">
                <span style={{ color: "rgba(180,225,255,1)" }}>🖼️</span>
                <p className="text-sm font-bold" style={{ color: SILVER }}>이미지 미리보기</p>
                {!previewLoading && <span className="text-xs" style={{ color: SILVER_DIM }}>{previewItems.length}개</span>}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={applyImagePreview}
                  disabled={previewLoading || imageApplying}
                  className="text-xs px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 disabled:opacity-40"
                  style={{ backgroundColor: "rgba(100,220,160,0.25)", border: "1px solid rgba(100,220,160,0.6)", color: "rgba(150,255,200,1)" }}
                >
                  {imageApplying ? (
                    <><span className="inline-block w-3 h-3 rounded-full border-2 animate-spin" style={{ borderColor: "rgba(150,255,200,0.3)", borderTopColor: "rgba(150,255,200,1)" }} />적용 중...</>
                  ) : "✓ 적용"}
                </button>
                <button
                  onClick={() => { if (!imageApplying) setShowImagePreview(false); }}
                  className="text-xs px-3 py-1.5 rounded-lg"
                  style={{ backgroundColor: SILVER_FAINT, color: SILVER_DIM }}
                >
                  취소
                </button>
              </div>
            </div>
            {/* 본문 */}
            <div className="flex-1 overflow-y-auto px-5 py-4" style={{ scrollbarWidth: "thin" }}>
              {previewLoading && (
                <div className="py-12 text-center">
                  <span className="animate-pulse text-sm" style={{ color: SILVER_DIM }}>📊 이미지가 필요한 위치를 분석하고 있어요...</span>
                </div>
              )}
              {!previewLoading && previewItems.length === 0 && (
                <div className="py-12 text-center">
                  <p className="text-sm" style={{ color: SILVER_DIM }}>추가할 이미지가 없습니다</p>
                  <p className="text-xs mt-1" style={{ color: SILVER_DIM }}>적용을 누르면 기존 자동 이미지가 정리되고 이미지 없이 유지됩니다</p>
                </div>
              )}
              {!previewLoading && previewItems.length > 0 && (
                <div className="space-y-4">
                  <p className="text-xs" style={{ color: SILVER_DIM }}>각 이미지가 들어갈 위치를 확인하고, 마음에 들지 않으면 삭제하거나 다시 만들 수 있어요. <span style={{ color: "rgba(180,225,255,0.8)" }}>적용</span>을 눌러야 기획서에 반영됩니다.</p>
                  {previewItems.map((item) => (
                    <div key={item.key} className="rounded-xl p-4" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: `1px solid ${SILVER_FAINT}` }}>
                      <div className="flex items-center justify-between mb-2 gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs px-2 py-0.5 rounded flex-shrink-0" style={{ backgroundColor: item.type === "diagram" ? "rgba(125,211,252,0.15)" : "rgba(192,200,216,0.15)", color: item.type === "diagram" ? "rgba(180,225,255,1)" : SILVER }}>
                            {item.type === "diagram" ? "📊 다이어그램" : "🖼️ UI 목업"}
                          </span>
                          <span className="text-xs truncate" style={{ color: SILVER_DIM }}>📍 {item.heading.replace(/^#+\s*/, "")}</span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button
                            onClick={() => regeneratePreviewItem(item.key)}
                            disabled={item.regenerating}
                            className="text-xs px-2 py-1 rounded-lg disabled:opacity-50"
                            style={{ backgroundColor: SILVER_FAINT, border: `1px solid ${SILVER_DIM}`, color: SILVER }}
                          >
                            {item.regenerating ? "⏳" : "🔄 재생성"}
                          </button>
                          <button
                            onClick={() => removePreviewItem(item.key)}
                            className="text-xs px-2 py-1 rounded-lg"
                            style={{ backgroundColor: "rgba(255,80,80,0.12)", border: "1px solid rgba(255,80,80,0.3)", color: "#f87171" }}
                          >
                            🗑️ 삭제
                          </button>
                        </div>
                      </div>
                      <div style={{ opacity: item.regenerating ? 0.4 : 1 }}>
                        {item.type === "diagram" && item.mermaid && (
                          <MermaidDiagram key={item.mermaid} code={item.mermaid} />
                        )}
                        {item.type === "mockup" && item.generating && (
                          <div className="animate-pulse" style={{ height: "180px", borderRadius: "8px", background: "rgba(192,200,216,0.08)", border: "1px solid rgba(192,200,216,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <span style={{ color: "rgba(192,200,216,0.5)", fontSize: "12px" }}>🎨 Gemini가 화면 시안을 그리는 중...</span>
                          </div>
                        )}
                        {item.type === "mockup" && !item.generating && item.genFailed && (
                          <div style={{ borderRadius: "8px", background: "rgba(255,80,80,0.08)", border: "1px solid rgba(255,80,80,0.25)", padding: "16px", textAlign: "center" }}>
                            <p style={{ color: "#f87171", fontSize: "12px" }}>⚠️ 이미지 생성 실패</p>
                            <p style={{ color: SILVER_DIM, fontSize: "11px", marginTop: "4px" }}>GEMINI_API_KEY 설정과 doc_images 테이블을 확인해주세요. (🔄 재생성으로 재시도)</p>
                          </div>
                        )}
                        {item.type === "mockup" && !item.generating && !item.genFailed && item.imageUrl && (
                          <DocImage key={item.imageUrl} src={item.imageUrl} alt={item.alt} />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


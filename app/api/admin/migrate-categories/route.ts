// 일회성 카테고리 전면 교체 마이그레이션 (사용 후 제거 예정)
// POST { step: "backup" | "build" | "reassign" | "delete-old" }
//  backup     : 현재 카테고리/기획서/결정사항 분류 상태 전체 반환 (롤백용)
//  build      : 새 트리 생성 + 기존 카테고리 비활성화(is_active=false)
//  reassign   : 기획서·결정사항을 새 카테고리로 AI 자동 재배치 (비활성 옛 카테고리는 분류기에서 제외됨)
//  delete-old : 비활성(옛) 카테고리 영구 삭제 (참조는 먼저 detach)

import { supabase } from "@/lib/supabase";
import { suggestDocumentCategory } from "@/lib/document-categorizer";
import { reclassifyDecisions, type ReclassifyInput } from "@/lib/decision-reclassifier";

// ── 새 카테고리 트리 정의 ───────────────────────────────────────────────
type SubDef = { name: string; area_code: string | null; area_name: string | null };
type MainDef = { id: string; name: string; icon: string; subs: SubDef[] };

function flat(main: string): (names: string[]) => SubDef[] {
  return (names) => names.map(n => ({ name: n, area_code: null, area_name: null }));
}
function area(code: string, name: string, names: string[]): SubDef[] {
  return names.map(n => ({ name: n, area_code: code, area_name: name }));
}

const TREE: MainDef[] = [
  {
    id: "g_outgame", name: "게임 외부 설계", icon: "🛠️",
    subs: flat("g_outgame")(["서버 구조", "빌드 정책", "CDN 정책", "가로세로 UI", "3D 캐릭터 모듈화"]),
  },
  {
    id: "g_base", name: "베이스", icon: "🧱",
    subs: [
      ...area("a_combat", "전투", ["전투 규칙", "전투 UI", "자동전투"]),
      ...area("b_lobby", "로비", ["로비", "메뉴버튼 (햄버거 & 즐겨찾기)"]),
      ...area("c_hero", "영웅", ["스탯", "스킬", "영웅 등급", "속성", "타입", "영웅 객체화", "정보", "영웅 커스텀"]),
      ...area("d_basic", "기본", ["재화", "팀편성", "백그라운드 & 병렬 플레이", "박스 & 선택 구조"]),
    ],
  },
  {
    id: "g_growth", name: "성장", icon: "📈",
    subs: [
      ...area("a_basic", "기본 성장", ["레벨업", "진화", "돌파", "스킬강화", "조각 합성"]),
      ...area("b_equip", "장비", ["장비 성장", "장비 제련"]),
    ],
  },
  {
    id: "g_system", name: "게임 시스템", icon: "⚙️",
    subs: [
      ...area("a_profile", "프로필", ["계정 마스터리"]),
      ...area("b_mission", "미션", ["가이드 미션", "일간/주간 미션", "반복 미션", "길드 미션"]),
      ...area("c_product", "상품", ["시즌 패스", "코스튬", "한정 수량 코스튬"]),
      ...area("d_etc", "기타", [
        "길드", "소환", "우편", "채팅", "랭킹", "도감 & 컬렉션", "친구", "제작", "상점 (+교환소)",
        "이벤트 (시즌 & 콜라보)", "출석부", "설정", "컨텐츠 이용 현황판", "개발자 Q&A 게시판",
        "영웅 빌려쓰기", "공략 빌려쓰기 및 포인트 랭킹", "덱편성 요청하기",
      ]),
    ],
  },
  {
    id: "g_content", name: "콘텐츠", icon: "📦",
    subs: flat("g_content")([
      "모험", "성장던전", "파밍 던전 (방치)", "무한의 탑 (비시즌형)", "무한의 탑 (시즌형)",
      "레이드 (개인)", "결투장", "상급 결투장", "월드 대전", "길드 원정대 (협동 PVE)", "길드전 (PVP)", "미니게임",
    ]),
  },
  {
    id: "g_art", name: "아트", icon: "🎨",
    subs: flat("g_art")(["2D 일러스트", "3D 캐릭터 모델링", "전투 및 영웅 연출", "스토리 표현 연출 (2D·3D·컷씬)", "UI 방향성"]),
  },
];

export async function POST(request: Request) {
  try {
    const { step } = (await request.json()) as { step: string };

    // ── 백업 ──────────────────────────────────────────────────────────
    if (step === "backup") {
      const [mains, subs, docs, decisions] = await Promise.all([
        supabase.from("main_categories").select("*"),
        supabase.from("sub_categories").select("*"),
        supabase.from("design_docs").select("id, title, category_main_id, category_area_code, category_sub_id"),
        supabase.from("decisions").select("id, content, sub_category_id"),
      ]);
      return Response.json({
        mains: mains.data, subs: subs.data, docs: docs.data, decisions: decisions.data,
        counts: { mains: mains.data?.length, subs: subs.data?.length, docs: docs.data?.length, decisions: decisions.data?.length },
      });
    }

    // ── 새 트리 생성 + 옛 카테고리 비활성화 ──────────────────────────────
    if (step === "build") {
      // 1) 옛 카테고리 id 수집 (g_ 로 시작하지 않는 것)
      const { data: oldMains } = await supabase.from("main_categories").select("id");
      const { data: oldSubs } = await supabase.from("sub_categories").select("id");
      const oldMainIds = (oldMains ?? []).map(m => m.id).filter((id: string) => !id.startsWith("g_"));
      const oldSubIds = (oldSubs ?? []).map(s => s.id).filter((id: string) => !id.startsWith("g_"));

      // 2) 새 mains insert
      const mainRows = TREE.map((m, i) => ({
        id: m.id, name_ko: m.name, icon: m.icon, description: null, display_order: i + 1, is_active: true,
      }));
      const { error: mErr } = await supabase.from("main_categories").upsert(mainRows);
      if (mErr) return Response.json({ error: `main insert: ${mErr.message}` }, { status: 500 });

      // 3) 새 subs insert
      const subRows: Array<Record<string, unknown>> = [];
      let order = 0;
      for (const m of TREE) {
        m.subs.forEach((s, i) => {
          order += 1;
          const subId = `${m.id}.${s.area_code ?? "flat"}.${i + 1}`;
          subRows.push({
            id: subId, main_category_id: m.id,
            area_code: s.area_code, area_name: s.area_name,
            name_ko: s.name, display_order: order, is_active: true,
          });
        });
      }
      const { error: sErr } = await supabase.from("sub_categories").upsert(subRows);
      if (sErr) return Response.json({ error: `sub insert: ${sErr.message}` }, { status: 500 });

      // 4) 옛 카테고리 비활성화
      if (oldMainIds.length > 0) await supabase.from("main_categories").update({ is_active: false }).in("id", oldMainIds);
      if (oldSubIds.length > 0) await supabase.from("sub_categories").update({ is_active: false }).in("id", oldSubIds);

      return Response.json({ ok: true, new_mains: mainRows.length, new_subs: subRows.length, deactivated_mains: oldMainIds.length, deactivated_subs: oldSubIds.length });
    }

    // ── 기획서·결정사항 새 카테고리로 자동 재배치 ────────────────────────
    if (step === "reassign") {
      // 기획서 (보통 소수)
      const { data: docs } = await supabase.from("design_docs").select("id, title, content_markdown");
      let docCount = 0;
      const docResults: Array<{ id: string; label: string | null }> = [];
      for (const d of docs ?? []) {
        const s = await suggestDocumentCategory(d.title ?? "", d.content_markdown ?? "");
        await supabase.from("design_docs").update({
          category_main_id: s.main_id, category_area_code: s.area_code, category_sub_id: s.sub_id,
        }).eq("id", d.id);
        docResults.push({ id: d.id, label: s.label });
        docCount += 1;
      }

      // 결정사항 (바이블) — 전체 재분류
      const { data: decs } = await supabase.from("decisions").select("id, content, context, sub_category_id");
      const inputs: ReclassifyInput[] = (decs ?? []).map(r => ({
        id: r.id, content: r.content, context: r.context, current_sub_category_id: r.sub_category_id,
      }));
      const proposals = await reclassifyDecisions(inputs);
      // 결정사항은 sub_category_id만 저장 (main/area는 sub에서 파생) — 기존 reclassify apply와 동일
      let decCount = 0;
      for (const p of proposals) {
        await supabase.from("decisions").update({
          sub_category_id: p.proposed_sub_category_id ?? null,
        }).eq("id", p.id);
        decCount += 1;
      }

      return Response.json({ ok: true, docs_reassigned: docCount, decisions_reassigned: decCount, doc_labels: docResults });
    }

    // ── 옛(비활성) 카테고리 영구 삭제 ───────────────────────────────────
    if (step === "delete-old") {
      const { data: oldSubs } = await supabase.from("sub_categories").select("id").eq("is_active", false);
      const oldSubIds = (oldSubs ?? []).map(s => s.id);
      // 아직 옛 sub를 참조하는 기획서·결정사항 detach
      if (oldSubIds.length > 0) {
        await supabase.from("design_docs").update({ category_sub_id: null, category_main_id: null, category_area_code: null }).in("category_sub_id", oldSubIds);
        await supabase.from("decisions").update({ sub_category_id: null }).in("sub_category_id", oldSubIds);
      }
      const delSubs = await supabase.from("sub_categories").delete().eq("is_active", false);
      const delMains = await supabase.from("main_categories").delete().eq("is_active", false);
      return Response.json({ ok: true, deleted_subs_err: delSubs.error?.message ?? null, deleted_mains_err: delMains.error?.message ?? null });
    }

    return Response.json({ error: "알 수 없는 step" }, { status: 400 });
  } catch (err) {
    console.error("[migrate-categories] 오류:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

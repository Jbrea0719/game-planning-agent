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
// 표기: 대(main) > 중(area) > 소(sub). subs 생략 시 = 중과 같은 이름의 소 1개 자동 생성.
type AreaDef = { name: string; subs?: string[] };
type MainDef = { id: string; name: string; icon: string; areas: AreaDef[] };

const TREE: MainDef[] = [
  {
    id: "g_outgame", name: "게임 외부 설계", icon: "🛠️",
    areas: [
      { name: "서버 구조" }, { name: "빌드 정책" }, { name: "CDN 정책" }, { name: "가로세로 UI" }, { name: "3D 캐릭터 모듈화" },
    ],
  },
  {
    id: "g_base", name: "베이스", icon: "🧱",
    areas: [
      { name: "전투", subs: ["전투 규칙", "전투 UI", "자동전투"] },
      { name: "재화" },
      { name: "로비", subs: ["로비", "메뉴버튼 (햄버거 & 즐겨찾기)"] },
      { name: "팀편성" },
      { name: "백그라운드 & 병렬 플레이" },
      { name: "박스 & 선택 구조" },
      { name: "영웅", subs: ["스탯", "스킬", "영웅 등급", "속성", "타입", "영웅 객체화", "정보", "영웅 커스텀"] },
    ],
  },
  {
    id: "g_growth", name: "성장", icon: "📈",
    areas: [
      { name: "레벨업" }, { name: "진화" }, { name: "돌파" }, { name: "스킬강화" }, { name: "조각 합성" },
      { name: "장비", subs: ["장비 성장", "장비 제련"] },
    ],
  },
  {
    id: "g_system", name: "게임 시스템", icon: "⚙️",
    areas: [
      { name: "프로필", subs: ["계정 마스터리"] },
      { name: "길드" }, { name: "소환" }, { name: "우편" },
      { name: "미션", subs: ["가이드 미션", "일간/주간 미션", "반복 미션", "길드 미션"] },
      { name: "채팅" }, { name: "랭킹" }, { name: "도감 & 컬렉션" }, { name: "친구" }, { name: "제작" }, { name: "상점 (+교환소)" },
      { name: "상품", subs: ["시즌 패스", "코스튬", "한정 수량 코스튬"] },
      { name: "이벤트 (시즌 & 콜라보)" }, { name: "출석부" }, { name: "설정" }, { name: "컨텐츠 이용 현황판" }, { name: "개발자 Q&A 게시판" },
      { name: "영웅 빌려쓰기" }, { name: "공략 빌려쓰기 및 포인트 랭킹" }, { name: "덱편성 요청하기" },
    ],
  },
  {
    id: "g_content", name: "콘텐츠", icon: "📦",
    areas: [
      { name: "모험" }, { name: "성장던전" }, { name: "파밍 던전 (방치)" }, { name: "무한의 탑 (비시즌형)" }, { name: "무한의 탑 (시즌형)" },
      { name: "레이드 (개인)" }, { name: "결투장" }, { name: "상급 결투장" }, { name: "월드 대전" }, { name: "길드 원정대 (협동 PVE)" }, { name: "길드전 (PVP)" }, { name: "미니게임" },
    ],
  },
  {
    id: "g_art", name: "아트", icon: "🎨",
    areas: [
      { name: "2D 일러스트" }, { name: "3D 캐릭터 모델링" }, { name: "전투 및 영웅 연출" }, { name: "스토리 표현 연출 (2D·3D·컷씬)" }, { name: "UI 방향성" },
    ],
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

      // 3) 새 subs insert — 중(area)별로 묶고, 자식 소가 없으면 같은 이름 소 1개 생성
      const subRows: Array<Record<string, unknown>> = [];
      let order = 0;
      for (const m of TREE) {
        m.areas.forEach((a, ai) => {
          const code = `a${String(ai + 1).padStart(2, "0")}`;  // a01, a02 ... 순서 보존
          const leafSubs = (a.subs && a.subs.length > 0) ? a.subs : [a.name];  // 자식 없으면 중과 동명 소
          leafSubs.forEach((subName, si) => {
            order += 1;
            subRows.push({
              id: `${m.id}.${code}.${si + 1}`,
              main_category_id: m.id,
              area_code: code,
              area_name: a.name,
              name_ko: subName,
              display_order: order,
              is_active: true,
            });
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

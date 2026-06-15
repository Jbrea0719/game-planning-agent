// 카테고리 트리 조회 API
// GET /api/categories → 5개 대카테고리 + 모든 하위 항목을 트리 구조로 반환
//
// 응답 형식:
// {
//   main_categories: [
//     {
//       id, name_ko, icon, description, display_order,
//       sub_categories: [...] (대분류가 평평한 경우),
//       areas: [{ code, name, sub_categories: [...] }] (인게임만, area로 그룹핑)
//     }
//   ]
// }

import { supabase } from "@/lib/supabase";

interface MainCategory {
  id: string;
  name_ko: string;
  description: string | null;
  icon: string | null;
  display_order: number | null;
}

interface SubCategory {
  id: string;
  main_category_id: string;
  area_code: string | null;
  area_name: string | null;
  name_ko: string;
  description: string | null;
  display_order: number | null;
  icon?: string | null;
}

export async function GET() {
  try {
    // 1. 대카테고리 조회
    const { data: mains, error: mainErr } = await supabase
      .from("main_categories")
      .select("id, name_ko, description, icon, display_order")
      .eq("is_active", true)
      .order("display_order", { ascending: true });

    if (mainErr) {
      console.error("[categories] main 조회 실패:", mainErr.message);
      return Response.json({ error: mainErr.message }, { status: 500 });
    }

    // 2. 소카테고리 조회 (icon 컬럼 포함 — 마이그레이션 017 전이면 컬럼 없어 폴백)
    const SUB_COLS = "id, main_category_id, area_code, area_name, name_ko, description, display_order";
    let subs: SubCategory[] | null = null;
    let subErr: { message: string } | null = null;
    const primary = await supabase
      .from("sub_categories")
      .select(`${SUB_COLS}, icon`)
      .eq("is_active", true)
      .order("display_order", { ascending: true });
    subs = primary.data as SubCategory[] | null;
    subErr = primary.error;
    if (subErr && /icon/i.test(subErr.message)) {
      const fb = await supabase
        .from("sub_categories")
        .select(SUB_COLS)
        .eq("is_active", true)
        .order("display_order", { ascending: true });
      subs = fb.data as SubCategory[] | null;
      subErr = fb.error;
    }

    if (subErr) {
      console.error("[categories] sub 조회 실패:", subErr.message);
      return Response.json({ error: subErr.message }, { status: 500 });
    }

    // 2.5 중(area) 조회 — 1급 객체(전용 테이블). 소가 없어도 중이 존재할 수 있음.
    //     마이그레이션 023 전이면 테이블이 없어 폴백(소의 area_code 로 파생).
    interface AreaRow { id: string; main_category_id: string; code: string; name: string; display_order: number | null }
    let areaRows: AreaRow[] = [];
    const areaRes = await supabase
      .from("areas")
      .select("id, main_category_id, code, name, display_order")
      .eq("is_active", true)
      .order("display_order", { ascending: true });
    if (areaRes.error) {
      if (!/relation .*areas.* does not exist|does not exist/i.test(areaRes.error.message)) {
        console.error("[categories] area 조회 실패:", areaRes.error.message);
      }
      areaRows = [];  // 테이블 없으면 빈 목록 — 아래에서 소의 area_code 로 파생
    } else {
      areaRows = (areaRes.data ?? []) as AreaRow[];
    }

    // 3. 트리 구조 빌드
    type SubOut = Pick<SubCategory, "id" | "name_ko" | "description" | "display_order" | "icon">;
    interface AreaOut { code: string; name: string; sub_categories: SubOut[] }
    interface MainOut extends MainCategory {
      sub_categories?: SubOut[];   // area 없이 대 직속인 소
      areas?: AreaOut[];           // 중(area)으로 묶인 소 (빈 중 포함)
    }

    const subList = (subs ?? []) as SubCategory[];
    const tree: MainOut[] = (mains as MainCategory[]).map(m => {
      const mySubs = subList.filter(s => s.main_category_id === m.id);
      const flatSubs = mySubs.filter(s => !s.area_code);          // 대 직속 소
      const areaSubs = mySubs.filter(s => s.area_code);           // 중에 속한 소
      const toOut = (s: SubCategory): SubOut => ({
        id: s.id, name_ko: s.name_ko, description: s.description, display_order: s.display_order, icon: s.icon ?? null,
      });

      // 중 목록 = areas 테이블의 이 대 소속 행 + (테이블에 없지만 소가 참조하는 area_code 보강)
      const myAreaRows = areaRows.filter(a => a.main_category_id === m.id);
      const areaByCode = new Map<string, AreaOut>();
      const order = new Map<string, number>();
      for (const a of myAreaRows) {
        areaByCode.set(a.code, { code: a.code, name: a.name, sub_categories: [] });
        order.set(a.code, a.display_order ?? 0);
      }
      for (const s of areaSubs) {
        const code = s.area_code as string;
        if (!areaByCode.has(code)) {
          // 테이블에 없는 중(마이그레이션 전/누락) → 소의 area_name 으로 파생
          areaByCode.set(code, { code, name: s.area_name ?? code, sub_categories: [] });
          order.set(code, s.display_order ?? 0);
        }
        areaByCode.get(code)!.sub_categories.push(toOut(s));
      }
      const areas = Array.from(areaByCode.values())
        .sort((a, b) => (order.get(a.code) ?? 0) - (order.get(b.code) ?? 0) || a.code.localeCompare(b.code));

      if (areas.length > 0) {
        // 중이 하나라도 있으면 areas 로 (대 직속 소가 함께 있으면 sub_categories 로도 포함)
        return flatSubs.length > 0
          ? { ...m, areas, sub_categories: flatSubs.map(toOut) }
          : { ...m, areas };
      }
      return { ...m, sub_categories: mySubs.map(toOut) };
    });

    return Response.json({ main_categories: tree });
  } catch (err) {
    console.error("[categories] 오류:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

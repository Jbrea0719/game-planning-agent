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

    // 3. 트리 구조 빌드
    type SubOut = Pick<SubCategory, "id" | "name_ko" | "description" | "display_order" | "icon">;
    interface AreaOut { code: string; name: string; sub_categories: SubOut[]; _minOrder: number }
    interface MainOut extends MainCategory {
      sub_categories?: SubOut[];   // 평평한 경우
      areas?: Omit<AreaOut, "_minOrder">[];  // 인게임처럼 area로 그룹핑된 경우
    }

    const subList = (subs ?? []) as SubCategory[];
    const tree: MainOut[] = (mains as MainCategory[]).map(m => {
      const mySubs = subList.filter(s => s.main_category_id === m.id);
      const hasAreas = mySubs.some(s => s.area_code);
      const toOut = (s: SubCategory): SubOut => ({
        id: s.id, name_ko: s.name_ko, description: s.description, display_order: s.display_order, icon: s.icon ?? null,
      });

      if (hasAreas) {
        // area_code로 그룹핑 (소는 이미 display_order 순)
        const areaMap = new Map<string, AreaOut>();
        for (const s of mySubs) {
          const code = s.area_code ?? "_default";
          const name = s.area_name ?? "기타";
          if (!areaMap.has(code)) {
            areaMap.set(code, { code, name, sub_categories: [], _minOrder: s.display_order ?? 0 });
          }
          areaMap.get(code)!.sub_categories.push(toOut(s));
        }
        // area 순서: 그 영역에 속한 소의 최소 display_order 기준 (순서 이동 반영)
        const areas = Array.from(areaMap.values())
          .sort((a, b) => a._minOrder - b._minOrder || a.code.localeCompare(b.code))
          .map(({ _minOrder: _omit, ...rest }) => rest);
        return { ...m, areas };
      } else {
        return { ...m, sub_categories: mySubs.map(toOut) };
      }
    });

    return Response.json({ main_categories: tree });
  } catch (err) {
    console.error("[categories] 오류:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

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

    // 2. 소카테고리 조회
    const { data: subs, error: subErr } = await supabase
      .from("sub_categories")
      .select("id, main_category_id, area_code, area_name, name_ko, description, display_order")
      .eq("is_active", true)
      .order("display_order", { ascending: true });

    if (subErr) {
      console.error("[categories] sub 조회 실패:", subErr.message);
      return Response.json({ error: subErr.message }, { status: 500 });
    }

    // 3. 트리 구조 빌드
    type SubOut = Pick<SubCategory, "id" | "name_ko" | "description" | "display_order">;
    interface AreaOut { code: string; name: string; sub_categories: SubOut[] }
    interface MainOut extends MainCategory {
      sub_categories?: SubOut[];   // 평평한 경우
      areas?: AreaOut[];           // 인게임처럼 area로 그룹핑된 경우
    }

    const tree: MainOut[] = (mains as MainCategory[]).map(m => {
      const mySubs = (subs as SubCategory[]).filter(s => s.main_category_id === m.id);
      const hasAreas = mySubs.some(s => s.area_code);

      if (hasAreas) {
        // area_code로 그룹핑
        const areaMap = new Map<string, AreaOut>();
        for (const s of mySubs) {
          const code = s.area_code ?? "_default";
          const name = s.area_name ?? "기타";
          if (!areaMap.has(code)) {
            areaMap.set(code, { code, name, sub_categories: [] });
          }
          areaMap.get(code)!.sub_categories.push({
            id: s.id,
            name_ko: s.name_ko,
            description: s.description,
            display_order: s.display_order,
          });
        }
        // area 순서: area_code 알파벳 순 (A_hero, B_combat, ...)
        const areas = Array.from(areaMap.values()).sort((a, b) => a.code.localeCompare(b.code));
        return { ...m, areas };
      } else {
        return {
          ...m,
          sub_categories: mySubs.map(s => ({
            id: s.id,
            name_ko: s.name_ko,
            description: s.description,
            display_order: s.display_order,
          })),
        };
      }
    });

    return Response.json({ main_categories: tree });
  } catch (err) {
    console.error("[categories] 오류:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

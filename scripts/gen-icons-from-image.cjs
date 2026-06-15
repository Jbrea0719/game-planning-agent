// PWA·iOS 아이콘을 '완성된 아이콘 이미지' 한 장에서 생성
// (기존 gen-icons.cjs는 avatar.jpg를 어두운 배경에 얹는 방식 — 이건 이미 완성된 아이콘을 그대로 사용)
//
// 사용: node scripts/gen-icons-from-image.cjs [소스경로]
//   소스경로 생략 시 public/icon-source.png 사용
//
// 처리: ① 소스 가장자리 여백(밝은 테두리·투명) 트림 → ② 약간 확대해 정사각 꽉 채움(라운드 코너 제거)
//      → ③ 혹시 남는 투명 코너는 그라데이션 중간색으로 메움 → 풀블리드 앱 아이콘.
//
// 출력: public/icon-192.png, public/icon-512.png, public/icon-maskable-512.png, app/apple-icon.png

const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

const ROOT = path.join(__dirname, "..");
const SRC = process.argv[2] || path.join(ROOT, "public", "icon-source.png");
// 투명/밝은 코너를 메울 배경색 (아이콘 그라데이션 중간톤 블루-퍼플)
const FILL = { r: 92, g: 104, b: 226 };

if (!fs.existsSync(SRC)) {
  console.error(`❌ 소스 이미지를 찾을 수 없어요: ${SRC}`);
  process.exit(1);
}

async function srcTrimmed() {
  try {
    return await sharp(SRC).trim({ threshold: 30 }).toBuffer();
  } catch {
    return await sharp(SRC).toBuffer();
  }
}

// 정사각 풀블리드: 트림 → zoom배 확대 cover → 투명부 FILL로 평탄화 → 중앙 size 추출
async function fillSquare(size, zoom) {
  const buf = await srcTrimmed();
  const big = Math.round(size * zoom);
  const resized = await sharp(buf)
    .resize(big, big, { fit: "cover", position: "centre" })
    .flatten({ background: FILL })
    .toBuffer();
  const off = Math.round((big - size) / 2);
  return sharp(resized).extract({ left: off, top: off, width: size, height: size }).png();
}

(async () => {
  await (await fillSquare(192, 1.1)).toFile(path.join(ROOT, "public", "icon-192.png"));
  await (await fillSquare(512, 1.1)).toFile(path.join(ROOT, "public", "icon-512.png"));
  // 마스킹 아이콘: OS가 원형/스퀘어클로 자름 → 풀블리드 동일 사용
  await (await fillSquare(512, 1.1)).toFile(path.join(ROOT, "public", "icon-maskable-512.png"));
  await (await fillSquare(180, 1.1)).toFile(path.join(ROOT, "app", "apple-icon.png"));
  console.log("✅ 아이콘 생성 완료(풀블리드) — icon-192/512, icon-maskable-512, apple-icon");
})();

// PWA·iOS 홈 화면 아이콘 생성 스크립트
// 기존 아바타(public/avatar.jpg)를 어두운 배경 위에 얹어 앱 아이콘으로 만듦
// 실행: node scripts/gen-icons.cjs  (아이콘을 다시 만들고 싶을 때만 실행)
const sharp = require("sharp");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const BG = { r: 10, g: 14, b: 26, alpha: 1 }; // 앱 테마 배경색 #0a0e1a
const AVATAR = path.join(ROOT, "public", "avatar.jpg");

// 정사각 아이콘 한 장 생성 — 어두운 배경 가운데에 아바타를 얹음
// avatarRatio: 아바타가 차지하는 비율 (작을수록 여백↑ = 마스킹 안전영역 확보)
async function makeIcon(size, avatarRatio) {
  const inner = Math.round(size * avatarRatio);
  const avatar = await sharp(AVATAR).resize(inner, inner, { fit: "cover" }).toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: avatar, gravity: "center" }])
    .png();
}

(async () => {
  // 일반 아이콘 (꽉 차게 — 비율 0.84)
  await (await makeIcon(512, 0.84)).toFile(path.join(ROOT, "public", "icon-512.png"));
  await (await makeIcon(192, 0.84)).toFile(path.join(ROOT, "public", "icon-192.png"));
  // 마스킹 아이콘 (원형 크롭 대비 여백 더 — 비율 0.72)
  await (await makeIcon(512, 0.72)).toFile(path.join(ROOT, "public", "icon-maskable-512.png"));
  // iOS 홈 화면 아이콘 (Next가 app/apple-icon.png 를 자동 인식해 apple-touch-icon으로 연결)
  await (await makeIcon(180, 0.84)).toFile(path.join(ROOT, "app", "apple-icon.png"));
  console.log("✅ 아이콘 생성 완료 — icon-192/512, icon-maskable-512, apple-icon");
})();

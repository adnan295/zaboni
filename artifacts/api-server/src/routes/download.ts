import { Router, type IRouter } from "express";
import { requireAdmin } from "../middleware/adminAuth";
import { apkFilePath, getApkInfo, syncApk, type ApkInfo } from "../lib/apkMirror";
import { logger } from "../lib/logger";
import { clientIp } from "../lib/clientIp";
import { db, systemSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

const IOS_URL = "https://apps.apple.com/app/zaboni/id6763415681";
const PLAY_URL = "https://play.google.com/store/apps/details?id=com.zaboni.delivery";
const APK_PATH = "/download/zaboni.apk";

const ARABIC_DIGITS = (n: string) => n.replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]!);

/**
 * Matches the zaboni.site landing page. Fonts and images come from /site on
 * the same domain (served by the landing container), never from Google/CDNs,
 * so it loads where those are blocked.
 */
export function downloadPage(info: ApkInfo | null, paused = false): string {
  const size = info ? `${Math.round(info.size / 1_048_576)} ميغا` : "";
  const androidCta = paused
    ? `<div class="btn btn-off big"><span class="t"><b>التحميل المباشر متوقف مؤقتاً</b><small>نزّل التطبيق من Google Play أو App Store</small></span></div>`
    : info
    ? `<a class="btn btn-red big" href="${APK_PATH}" id="apk">
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0-5-5m5 5 5-5M4 20h16"/></svg>
         <span class="t"><b>حمّل التطبيق لأندرويد</b><small>النسخة ${info.version} · ${size}</small></span>
       </a>`
    : `<div class="btn btn-off big"><span class="t"><b>التحميل المباشر عم يتجهّز</b><small>جرّب بعد شوي</small></span></div>`;
  const step = (n: number, icon: string, title: string, body: string) =>
    `<div class="step"><div class="num">${ARABIC_DIGITS(String(n))}</div><div class="ic">${icon}</div><h3>${title}</h3><p>${body}</p></div>`;
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>حمّل زبوني لأندرويد — تحميل مباشر بدون VPN</title>
<meta name="description" content="نزّل تطبيق زبوني على أندرويد مباشرة من موقعنا بدون غوغل بلاي وبدون VPN. نفس النسخة الرسمية الموقّعة من غوغل.">
<meta name="theme-color" content="#DC2626">
<meta property="og:title" content="حمّل زبوني لأندرويد — بدون VPN">
<meta property="og:description" content="تحميل مباشر من zaboni.site، نفس النسخة الرسمية يلي على غوغل بلاي.">
<meta property="og:image" content="/site/img/og-base.png">
<link rel="icon" type="image/png" href="/site/img/icon-64.png">
<link rel="preload" href="/site/fonts/tajawal-extrabold.woff2" as="font" type="font/woff2" crossorigin>
<style>
@font-face { font-family: Tajawal; font-weight: 400; font-display: swap; src: url(/site/fonts/tajawal-regular.woff2) format("woff2"); }
@font-face { font-family: Tajawal; font-weight: 700; font-display: swap; src: url(/site/fonts/tajawal-bold.woff2) format("woff2"); }
@font-face { font-family: Tajawal; font-weight: 800; font-display: swap; src: url(/site/fonts/tajawal-extrabold.woff2) format("woff2"); }
:root { --red:#DC2626; --red-dark:#991B1B; --red-light:#EF4444; --rose:#FEF2F2; --rose-2:#FEE2E2; --ink:#1A1A1A; --muted:#5F6368; --line:#EBEBEB; --soft:#F8F8F8; --green:#15803D; }
* { box-sizing:border-box; margin:0; padding:0; }
body { font-family: Tajawal, "Segoe UI", Tahoma, system-ui, sans-serif; color:var(--ink); background:#fff; line-height:1.7; -webkit-font-smoothing:antialiased; overflow-x:hidden; }
img { max-width:100%; height:auto; display:block; }
a { color:inherit; text-decoration:none; }
.wrap { width:min(1120px, 100% - 32px); margin-inline:auto; }
header { position:sticky; top:0; z-index:20; background:rgba(255,255,255,.88); backdrop-filter:blur(14px); -webkit-backdrop-filter:blur(14px); border-bottom:1px solid var(--line); }
.nav { height:64px; display:flex; align-items:center; justify-content:space-between; }
.brand { display:flex; align-items:center; gap:10px; font-weight:800; font-size:22px; }
.brand img { width:36px; height:36px; }
.home { font-weight:700; color:var(--muted); font-size:15px; }
.home:hover { color:var(--red); }

.hero { padding:clamp(32px,6vw,72px) 0 clamp(48px,7vw,90px); background:
  radial-gradient(900px 500px at 90% -10%, var(--rose-2), transparent 60%),
  radial-gradient(700px 500px at -10% 110%, var(--rose), transparent 60%); }
.grid { display:grid; grid-template-columns:1.15fr .85fr; gap:48px; align-items:center; }
.eyebrow { display:inline-flex; align-items:center; gap:6px; font-weight:700; font-size:14px; color:var(--red); background:var(--rose); border:1px solid var(--rose-2); border-radius:999px; padding:4px 14px; margin-bottom:16px; }
h1 { font-size:clamp(34px,5.4vw,58px); font-weight:800; line-height:1.15; letter-spacing:-.4px; }
h1 em { font-style:normal; color:var(--red); }
.lead { color:var(--muted); font-size:clamp(16px,1.6vw,19px); margin:16px 0 28px; max-width:520px; }
.btn { display:inline-flex; align-items:center; gap:14px; border-radius:18px; padding:14px 22px; font-weight:800; transition:transform .15s, background .15s, box-shadow .15s; }
.btn:hover { transform:translateY(-2px); }
.btn svg { width:28px; height:28px; flex:none; }
.btn .t { display:flex; flex-direction:column; line-height:1.2; text-align:start; }
.btn .t b { font-size:18px; }
.btn .t small { font-weight:400; font-size:13px; opacity:.88; }
.btn.big { padding:18px 28px; min-width:min(360px,100%); }
.btn.big .t b { font-size:21px; }
.btn-red { background:var(--red); color:#fff; box-shadow:0 14px 30px rgba(220,38,38,.35); }
.btn-red:hover { background:var(--red-dark); }
.btn-dark { background:var(--ink); color:#fff; }
.btn-off { background:#EFEFEF; color:var(--muted); }
.pills { display:flex; flex-wrap:wrap; gap:10px; margin-top:20px; }
.pill { display:inline-flex; align-items:center; gap:6px; background:#fff; border:1px solid var(--line); border-radius:999px; padding:6px 14px; font-weight:700; font-size:14px; }
.pill i { font-style:normal; color:var(--green); }
.alt { margin-top:26px; display:flex; flex-wrap:wrap; gap:10px 18px; color:var(--muted); font-size:15px; align-items:center; }
.alt a { font-weight:700; color:var(--ink); border-bottom:1.5px solid var(--line); }
.alt a:hover { color:var(--red); border-color:var(--red); }
.alt span.tag { font-size:12px; font-weight:700; color:#B45309; background:#FEF3C7; border-radius:999px; padding:1px 8px; margin-inline-start:4px; }
.art { position:relative; display:flex; justify-content:center; }
.art::before { content:""; position:absolute; width:86%; aspect-ratio:1; border-radius:50%; background:radial-gradient(circle at 40% 35%, var(--red-light), var(--red) 55%, var(--red-dark)); top:8%; }
.phone { position:relative; width:min(290px,70vw); aspect-ratio:9/19.5; border-radius:44px; background:#111; padding:11px; box-shadow:0 40px 80px rgba(80,0,0,.35), inset 0 0 0 2px #2a2a2a; }
.phone::before { content:""; position:absolute; top:20px; left:50%; transform:translateX(-50%); width:30%; height:22px; background:#000; border-radius:20px; z-index:2; }
.phone img { width:100%; height:100%; object-fit:cover; object-position:top; border-radius:34px; background:#eee; }
.badge { position:absolute; z-index:3; bottom:12%; inset-inline-start:-6%; background:#fff; border-radius:16px; box-shadow:0 18px 40px rgba(0,0,0,.12); padding:10px 14px; display:flex; gap:10px; align-items:center; font-weight:800; font-size:14px; }
.badge i { font-style:normal; width:34px; height:34px; display:grid; place-items:center; background:#DCFCE7; border-radius:10px; }
.badge small { display:block; font-weight:400; color:var(--muted); font-size:12px; }

section.steps-sec { padding:clamp(56px,8vw,96px) 0; }
.center { text-align:center; }
h2 { font-size:clamp(26px,3.8vw,40px); font-weight:800; line-height:1.25; }
.sub { color:var(--muted); margin-top:8px; font-size:17px; }
.steps { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; margin-top:40px; counter-reset:s; }
.step { position:relative; background:var(--soft); border-radius:22px; padding:26px 22px 22px; }
.step .num { position:absolute; top:14px; inset-inline-end:18px; font-size:44px; font-weight:800; color:var(--rose-2); line-height:1; }
.step .ic { width:48px; height:48px; border-radius:14px; background:var(--red); color:#fff; display:grid; place-items:center; font-size:22px; margin-bottom:14px; }
.step h3 { font-size:19px; font-weight:800; margin-bottom:4px; }
.step p { color:var(--muted); font-size:15px; }
.tip { margin-top:20px; display:flex; gap:14px; align-items:flex-start; background:#FFFBEB; border:1px solid #FDE68A; border-radius:18px; padding:16px 20px; color:#78350F; font-size:15px; }
.tip b { color:#78350F; }
.faq { max-width:760px; margin:36px auto 0; display:grid; gap:12px; }
details { border:1px solid var(--line); border-radius:18px; padding:16px 20px; background:#fff; }
details[open] { border-color:#F5C2C2; background:#FFFBFB; }
summary { cursor:pointer; font-weight:800; font-size:17px; list-style:none; display:flex; justify-content:space-between; gap:16px; }
summary::-webkit-details-marker { display:none; }
summary::after { content:"+"; color:var(--red); font-size:22px; line-height:1; transition:transform .2s; }
details[open] summary::after { transform:rotate(45deg); }
details p { color:var(--muted); margin-top:8px; }
.hash { font-family:ui-monospace, monospace; font-size:12px; direction:ltr; text-align:left; word-break:break-all; background:var(--soft); border-radius:10px; padding:8px 10px; margin-top:8px; color:#444; }
footer { border-top:1px solid var(--line); padding:28px 0 calc(28px + env(safe-area-inset-bottom)); color:var(--muted); font-size:14px; }
.foot { display:flex; flex-wrap:wrap; justify-content:space-between; gap:12px; }
.foot nav { display:flex; gap:16px; font-weight:700; }
.foot nav a:hover { color:var(--red); }
.ios-only { display:none; }
body.paused .steps-sec, body.paused .pills { display:none; }
body.is-ios .ios-only { display:inline-flex; }
body.is-ios .android-only { display:none; }
@media (max-width:900px) {
  .grid { grid-template-columns:1fr; text-align:center; }
  .lead { margin-inline:auto; }
  .pills, .alt { justify-content:center; }
  .art { margin-top:12px; }
  .badge { inset-inline-start:2%; }
  .steps { grid-template-columns:repeat(2,1fr); }
}
@media (max-width:520px) {
  .steps { grid-template-columns:1fr; }
  .btn.big { width:100%; justify-content:center; }
  .art .phone { width:min(240px,64vw); }
}
</style>
</head>
<body${paused ? ' class="paused"' : ""}>
<header><div class="wrap nav">
  <a class="brand" href="/"><img src="/site/img/icon-64.png" alt="" width="36" height="36">زبوني</a>
  <a class="home" href="/">← الصفحة الرئيسية</a>
</div></header>

<section class="hero"><div class="wrap grid">
  <div>
    <span class="eyebrow">📲 تحميل مباشر من موقعنا</span>
    <h1 class="android-only">نزّل زبوني على موبايلك<br><em>بدون VPN</em></h1>
    <h1 class="ios-only" style="display:none">زبوني للآيفون<br><em>من App Store</em></h1>
    <p class="lead android-only">غوغل بلاي بسوريا ما بيفتح بدون VPN، فحطّينا التطبيق هون. نفس النسخة الرسمية تماماً، بتنزّلها بكبسة وبتثبّتها بأقل من دقيقة.</p>
    <p class="lead ios-only" style="display:none">على الآيفون نزّل زبوني من App Store مباشرة.</p>
    <div class="android-only">${androidCta}</div>
    <a class="btn btn-dark big ios-only" href="${IOS_URL}"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.37 12.6c-.02-2.2 1.8-3.26 1.88-3.31-1.03-1.5-2.62-1.7-3.18-1.73-1.35-.14-2.64.8-3.33.8-.69 0-1.74-.78-2.87-.76-1.47.02-2.83.86-3.59 2.18-1.53 2.66-.39 6.6 1.1 8.75.73 1.05 1.6 2.24 2.73 2.2 1.1-.05 1.51-.71 2.84-.71 1.32 0 1.7.71 2.86.69 1.18-.02 1.93-1.07 2.65-2.13.84-1.22 1.18-2.4 1.2-2.46-.03-.01-2.3-.88-2.32-3.5zM14.2 6.13c.6-.73 1.01-1.75.9-2.76-.87.04-1.92.58-2.54 1.31-.56.65-1.05 1.68-.92 2.67.97.08 1.96-.49 2.56-1.22z"/></svg><span class="t"><b>حمّل من App Store</b><small>للآيفون والآيباد</small></span></a>
    <div class="pills android-only">
      <span class="pill"><i>✓</i> بدون VPN</span>
      <span class="pill"><i>✓</i> النسخة الرسمية موقّعة من غوغل</span>
      ${info ? `<span class="pill"><i>✓</i> ${size}</span>` : ""}
    </div>
    <div class="alt">
      <span class="android-only">عندك VPN؟ <a href="${PLAY_URL}" rel="noopener">Google Play</a><span class="tag">بيحتاج VPN</span></span>
      <span class="android-only">عندك آيفون؟ <a href="${IOS_URL}">App Store</a></span>
      <span class="ios-only" style="display:none">عندك أندرويد؟ افتح هالصفحة من موبايلك الأندرويد.</span>
    </div>
  </div>
  <div class="art">
    <div class="phone"><img src="/site/img/screen-home.webp" alt="تطبيق زبوني" width="600" height="1300"></div>
    <div class="badge android-only"><i>✅</i><div>تحميل آمن<small>من zaboni.site</small></div></div>
  </div>
</div></section>

<section class="steps-sec android-only"><div class="wrap">
  <div class="center"><h2>كيف بثبّت التطبيق؟</h2><p class="sub">أربع خطوات، ومرة وحدة بس.</p></div>
  <div class="steps">
    ${step(1, "⬇️", "حمّل الملف", "اكبس «حمّل التطبيق لأندرويد» واستنّى لحتى يخلص التحميل.")}
    ${step(2, "📂", "افتح الملف", "من الإشعار يلي بيطلع، أو من مجلد «التنزيلات» افتح ملف zaboni.")}
    ${step(3, "🔓", "اسمح بالتثبيت", "إذا طلع «السماح بالتثبيت من هذا المصدر»، فعّلو وارجع.")}
    ${step(4, "✅", "ثبّت وافتح", "اكبس «تثبيت» وبعدها «فتح»، وسجّل برقمك.")}
  </div>
  <div class="tip"><span>💡</span><div>إذا طلعلك تنبيه من <b>Play Protect</b>، اكبس «تفاصيل إضافية» ← «التثبيت على أي حال». هاد تنبيه عادي بيطلع مع أي تطبيق بتنزّلو من برّا المتجر، والملف نفسو يلي على غوغل بلاي.</div></div>

  <div class="faq">
    <details><summary>التطبيق آمن؟</summary><p>إي. هاد الملف هو نفس النسخة الرسمية يلي على غوغل بلاي، وموقّع بمفتاح غوغل نفسو. ما في أي تعديل عليه.</p>${info ? `<div class="hash">SHA-256: ${info.sha256}</div>` : ""}</details>
    <details><summary>كيف بحدّث التطبيق بعدين؟</summary><p>لما تنزل نسخة جديدة، ارجع لهالصفحة ونزّلها وثبّتها فوق القديمة، وما بتنمسح بياناتك. وإذا صار عندك غوغل بلاي، بيتحدّث منو عادي.</p></details>
    <details><summary>ما عم يتثبّت، شو أعمل؟</summary><p>تأكد إنو التحميل خلص كامل${info ? ` (الملف حجمو ${size})` : ""}، وإنو عندك مساحة فاضية كافية على الموبايل. وإذا ما زبط، تواصل معنا من صفحة <a href="/support" style="color:var(--red);font-weight:700">الدعم</a>.</p></details>
  </div>
</div></section>

<footer><div class="wrap foot">
  <span>© زبوني — توصيل بحمص</span>
  <nav><a href="/">الرئيسية</a><a href="/support">الدعم</a><a href="/privacy">الخصوصية</a></nav>
</div></footer>
<script>
  if (/iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) {
    document.body.classList.add("is-ios");
  }
</script>
</body>
</html>`;
}

// Admin switch (Settings → direct_apk_enabled). Off unless explicitly "true",
// so the direct download can be paused without a deploy.
let enabledCache: { value: boolean; exp: number } | null = null;
export async function directDownloadEnabled(): Promise<boolean> {
  if (enabledCache && enabledCache.exp > Date.now()) return enabledCache.value;
  let value = false;
  try {
    const [row] = await db.select({ value: systemSettingsTable.value }).from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, "direct_apk_enabled")).limit(1);
    value = row?.value === "true";
  } catch {
    value = false;
  }
  enabledCache = { value, exp: Date.now() + 30_000 };
  return value;
}

router.get(["/download", "/download/"], async (_req, res) => {
  const enabled = await directDownloadEnabled();
  const info = enabled ? await getApkInfo() : null;
  res.set("Cache-Control", "no-cache").type("html").send(downloadPage(info, !enabled));
});

router.get(APK_PATH, async (req, res) => {
  const info = (await directDownloadEnabled()) ? await getApkInfo() : null;
  if (!info) {
    res.redirect(302, "/download");
    return;
  }
  logger.info({ version: info.version, ip: clientIp(req), range: req.headers.range ?? null }, "[apk] direct download");
  res.set({
    "Content-Type": "application/vnd.android.package-archive",
    "Content-Disposition": `attachment; filename="zaboni-${info.version}.apk"`,
    "Cache-Control": "no-cache",
    "X-Content-Type-Options": "nosniff",
  });
  // sendFile handles Range requests, so interrupted downloads on weak
  // connections can resume instead of starting over.
  res.sendFile(apkFilePath(info), { headers: { "Content-Type": "application/vnd.android.package-archive" } });
});

/** For the app (and anyone) to check which direct-download version is current. */
router.get("/api/app/android", async (_req, res) => {
  const info = (await directDownloadEnabled()) ? await getApkInfo() : null;
  res.set("Cache-Control", "no-cache").json(
    info
      ? { available: true, version: info.version, versionCode: info.versionCode, size: info.size, sha256: info.sha256, url: APK_PATH, page: "/download" }
      : { available: false, page: "/download" },
  );
});

router.post("/api/admin/apk/sync", requireAdmin, async (_req, res) => {
  try {
    res.json({ apk: await syncApk() });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "sync failed" });
  }
});

export default router;

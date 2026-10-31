import { Router, type IRouter } from "express";
import { requireAdmin } from "../middleware/adminAuth";
import { apkFilePath, getApkInfo, syncApk, type ApkInfo } from "../lib/apkMirror";
import { ZABONI_ICON_DATA_URI } from "../lib/brandIcon";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const IOS_URL = "https://apps.apple.com/app/zaboni/id6763415681";
const PLAY_URL = "https://play.google.com/store/apps/details?id=com.zaboni.delivery";
const APK_PATH = "/download/zaboni.apk";

const mb = (bytes: number) => (bytes / 1_048_576).toFixed(1);

/** Self-contained (no external fonts/scripts) so it loads where Google hosts are blocked. */
export function downloadPage(info: ApkInfo | null): string {
  const androidButton = info
    ? `<a class="btn primary" href="${APK_PATH}" id="apk">
         <span class="big">حمّل التطبيق لأندرويد</span>
         <span class="small">النسخة ${info.version} · ${mb(info.size)} ميغا · تحميل مباشر</span>
       </a>`
    : `<div class="btn disabled"><span class="big">نسخة أندرويد المباشرة عم تتجهّز</span>
         <span class="small">جرّب بعد شوي</span></div>`;
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>حمّل زبوني — توصيل سريع بحمص</title>
<meta name="description" content="حمّل تطبيق زبوني مباشرة لأندرويد بدون غوغل بلاي، أو من آب ستور للآيفون.">
<meta property="og:title" content="حمّل تطبيق زبوني">
<meta property="og:description" content="تحميل مباشر لأندرويد بدون غوغل بلاي">
<link rel="icon" href="${ZABONI_ICON_DATA_URI}">
<style>
  :root { --red:#DC2626; --dark:#991B1B; --ink:#1A1A1A; --muted:#6B6B6B; --line:#EBEBEB; --bg:#F8F8F8; }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family: Tajawal, "Segoe UI", Tahoma, "Noto Sans Arabic", system-ui, sans-serif; background:var(--bg); color:var(--ink); line-height:1.7; }
  .hero { background:radial-gradient(ellipse at 50% 20%, #EF4444 0%, var(--red) 45%, var(--dark) 100%); color:#fff; text-align:center; padding:40px 16px 72px; }
  .hero img { width:96px; height:96px; filter:drop-shadow(0 8px 20px rgba(0,0,0,.25)); }
  .hero h1 { font-size:34px; font-weight:800; margin-top:10px; }
  .hero p { opacity:.92; font-size:17px; }
  main { max-width:520px; margin:-48px auto 40px; padding:0 16px; }
  .card { background:#fff; border-radius:20px; box-shadow:0 10px 30px rgba(0,0,0,.08); padding:20px; margin-bottom:16px; }
  .btn { display:flex; flex-direction:column; align-items:center; gap:2px; text-decoration:none; border-radius:16px; padding:16px; text-align:center; }
  .btn .big { font-size:19px; font-weight:800; }
  .btn .small { font-size:13px; opacity:.9; }
  .primary { background:var(--red); color:#fff; box-shadow:0 8px 20px rgba(220,38,38,.35); }
  .primary:active { background:var(--dark); }
  .secondary { background:#fff; color:var(--ink); border:1.5px solid var(--line); margin-top:10px; }
  .disabled { background:#F0F0F0; color:var(--muted); }
  h2 { font-size:17px; margin-bottom:10px; }
  ol { padding-right:20px; color:#333; }
  ol li { margin-bottom:8px; }
  .note { font-size:13px; color:var(--muted); margin-top:8px; }
  .hash { font-family:monospace; font-size:11px; color:var(--muted); direction:ltr; text-align:left; word-break:break-all; margin-top:6px; }
  .ios { display:none; }
  body.is-ios .ios { display:block; }
  body.is-ios .android-only { display:none; }
  footer { text-align:center; font-size:13px; color:var(--muted); padding:8px 16px 28px; }
  footer a { color:var(--muted); }
</style>
</head>
<body>
<section class="hero">
  <img src="${ZABONI_ICON_DATA_URI}" alt="زبوني" width="96" height="96">
  <h1>زبوني</h1>
  <p>أكلك وأغراضك لباب البيت بحمص</p>
</section>
<main>
  <div class="card ios">
    <a class="btn primary" href="${IOS_URL}"><span class="big">حمّل من App Store</span><span class="small">للآيفون</span></a>
  </div>
  <div class="card android-only">
    ${androidButton}
    <a class="btn secondary" href="${PLAY_URL}" rel="noopener"><span class="big" style="font-size:16px">أو من Google Play</span><span class="small">إذا كان غوغل بلاي شغّال عندك</span></a>
  </div>
  <div class="card android-only">
    <h2>كيف بثبّت التطبيق؟</h2>
    <ol>
      <li>اكبس <b>حمّل التطبيق لأندرويد</b> واستنّى لحتى يخلص التحميل.</li>
      <li>افتح الملف <b>zaboni</b> من الإشعارات أو من مجلد <b>التنزيلات</b>.</li>
      <li>إذا طلع لك «السماح بالتثبيت من هذا المصدر»، فعّلو وارجع.</li>
      <li>اكبس <b>تثبيت</b>، وبعدها <b>فتح</b>.</li>
    </ol>
    <p class="note">هي نفس النسخة الرسمية يلي على غوغل بلاي وموقّعة من غوغل، فإذا اشتغل عندك غوغل بلاي لاحقاً بتتحدّث منو عادي بدون ما تمسح التطبيق.</p>
    ${info ? `<p class="hash">SHA-256: ${info.sha256}</p>` : ""}
  </div>
  <div class="card android-only">
    <h2>عندك آيفون؟</h2>
    <a class="btn secondary" href="${IOS_URL}"><span class="big" style="font-size:16px">حمّل من App Store</span></a>
  </div>
</main>
<footer><a href="/support">الدعم</a> · <a href="/privacy">الخصوصية</a></footer>
<script>
  if (/iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) {
    document.body.classList.add("is-ios");
  }
</script>
</body>
</html>`;
}

router.get(["/download", "/download/"], async (_req, res) => {
  const info = await getApkInfo();
  res.set("Cache-Control", "no-cache").type("html").send(downloadPage(info));
});

router.get(APK_PATH, async (req, res) => {
  const info = await getApkInfo();
  if (!info) {
    res.redirect(302, "/download");
    return;
  }
  logger.info({ version: info.version, ip: req.ip, range: req.headers.range ?? null }, "[apk] direct download");
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
  const info = await getApkInfo();
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

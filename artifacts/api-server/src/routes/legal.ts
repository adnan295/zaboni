import { Router } from "express";

const router = Router();

const HTML_SHELL = (title: string, body: string) => `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} — زبوني</title>
  <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap" rel="stylesheet" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Tajawal', system-ui, sans-serif;
      background: #F8F8F8;
      color: #1a1a1a;
      line-height: 1.7;
      padding: 0;
    }
    header {
      background: #fff;
      border-bottom: 1px solid #e8e8e8;
      padding: 20px 24px;
      display: flex;
      align-items: center;
      gap: 14px;
      position: sticky;
      top: 0;
      z-index: 10;
    }
    .logo {
      width: 42px;
      height: 42px;
      background: #DC2626;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-size: 22px;
      font-weight: 800;
      flex-shrink: 0;
    }
    .header-text { line-height: 1.3; }
    .header-text h1 { font-size: 18px; font-weight: 800; color: #1a1a1a; }
    .header-text p { font-size: 13px; color: #888; }
    main {
      max-width: 720px;
      margin: 0 auto;
      padding: 32px 20px 64px;
    }
    .last-updated {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #fff3e8;
      color: #DC2626;
      font-size: 13px;
      font-weight: 500;
      padding: 6px 14px;
      border-radius: 20px;
      margin-bottom: 20px;
    }
    .intro {
      font-size: 15px;
      color: #555;
      margin-bottom: 28px;
      padding: 16px;
      background: #fff;
      border-radius: 14px;
      border: 1px solid #e8e8e8;
    }
    .section {
      background: #fff;
      border: 1px solid #e8e8e8;
      border-radius: 16px;
      padding: 20px;
      margin-bottom: 16px;
    }
    .section h2 {
      font-size: 16px;
      font-weight: 700;
      color: #1a1a1a;
      margin-bottom: 10px;
    }
    .section p {
      font-size: 14px;
      color: #555;
      line-height: 1.8;
    }
    .contact-box {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      background: #fff3e8;
      border: 1px solid rgba(220,38,38,0.2);
      border-radius: 16px;
      padding: 18px;
      margin-top: 8px;
      font-size: 14px;
      color: #555;
      line-height: 1.7;
    }
    .contact-icon {
      color: #DC2626;
      font-size: 22px;
      flex-shrink: 0;
      margin-top: 2px;
    }
    footer {
      text-align: center;
      color: #aaa;
      font-size: 13px;
      padding: 32px 0 16px;
    }
    @media (max-width: 480px) {
      header { padding: 16px; }
      main { padding: 20px 16px 48px; }
    }
  </style>
</head>
<body>
  <header>
    <div class="logo">م</div>
    <div class="header-text">
      <h1>${title}</h1>
      <p>زبوني — توصيل سريع في حمص</p>
    </div>
  </header>
  <main>${body}</main>
  <footer>© 2025 زبوني. جميع الحقوق محفوظة.</footer>
</body>
</html>`;

const PRIVACY_BODY = `
<div class="last-updated">📅 آخر تحديث: ١ يناير ٢٠٢٥</div>
<div class="intro">
  تصف هذه السياسة كيفية جمع معلوماتك واستخدامها وحمايتها عند استخدامك لتطبيق زبوني.
</div>
<div class="section">
  <h2>١. المعلومات التي نجمعها</h2>
  <p>نجمع المعلومات التي تزودنا بها عند التسجيل مثل رقم هاتفك واسمك. كما نجمع بيانات الموقع الجغرافي لتحديد عنوان التوصيل، وبيانات الاستخدام كالطلبات والعناوين وتاريخ المعاملات.</p>
</div>
<div class="section">
  <h2>٢. كيف نستخدم معلوماتك</h2>
  <p>نستخدم معلوماتك لتقديم الخدمة، ومعالجة الطلبات، وإبلاغك بتحديثات التوصيل، وتحسين تجربة التطبيق.</p>
</div>
<div class="section">
  <h2>٣. مشاركة المعلومات</h2>
  <p>لا نبيع معلوماتك الشخصية. نشارك البيانات الضرورية فقط مع المندوبين لإتمام عمليات التوصيل.</p>
</div>
<div class="section">
  <h2>٤. أمان البيانات</h2>
  <p>نطبّق معايير أمان صارمة لحماية بياناتك. يتم تشفير جميع الاتصالات عبر بروتوكول HTTPS.</p>
</div>
<div class="section">
  <h2>٥. حقوقك</h2>
  <p>يحق لك طلب الاطلاع على بياناتك أو تعديلها أو حذفها. يمكنك التواصل معنا عبر قسم الدعم في التطبيق.</p>
</div>
<div class="section">
  <h2>٦. ملفات تعريف الارتباط</h2>
  <p>يستخدم التطبيق تخزيناً محلياً للحفاظ على جلستك وتذكّر تفضيلاتك. لا نستخدم ملفات تعريف ارتباط إعلانية.</p>
</div>
<div class="section">
  <h2>٧. التعديلات على هذه السياسة</h2>
  <p>قد نُحدّث هذه السياسة من وقت لآخر. سنُخطرك بأي تغييرات جوهرية عبر التطبيق.</p>
</div>
<div class="contact-box">
  <span class="contact-icon">✉️</span>
  <span>للاستفسارات المتعلقة بالخصوصية، تواصل معنا عبر قسم الدعم داخل التطبيق.</span>
</div>`;

const TERMS_BODY = `
<div class="last-updated">📅 آخر تحديث: ١ يناير ٢٠٢٥</div>
<div class="intro">
  تحكم هذه الشروط استخدامك لتطبيق زبوني وجميع الخدمات المرتبطة به. يرجى قراءتها بعناية قبل استخدام التطبيق.
</div>
<div class="section">
  <h2>١. قبول الشروط</h2>
  <p>باستخدامك لتطبيق زبوني، فأنت توافق على الالتزام بهذه الشروط. إذا كنت لا توافق على أي جزء منها، يرجى عدم استخدام التطبيق.</p>
</div>
<div class="section">
  <h2>٢. وصف الخدمة</h2>
  <p>زبوني منصة وساطة تربط بين العملاء والمندوبين في حمص وريفها. نحن لسنا طرفاً في عملية التوصيل بل نوفر الوسيلة التقنية لإتمامها.</p>
</div>
<div class="section">
  <h2>٣. التسجيل والحساب</h2>
  <p>يجب أن يكون رقم هاتفك صحيحاً وأن تكون مسؤولاً عن جميع الأنشطة التي تتم عبر حسابك. أنت توافق على عدم مشاركة بيانات دخولك مع أي شخص آخر.</p>
</div>
<div class="section">
  <h2>٤. الطلبات والدفع</h2>
  <p>جميع المدفوعات تتم نقداً لدى الاستلام بالليرة السورية. يُعدّ الطلب ملزماً بمجرد قبوله من قبل المندوب.</p>
</div>
<div class="section">
  <h2>٥. سلوك المستخدم</h2>
  <p>تلتزم باستخدام الخدمة بشكل قانوني ومحترم. يُحظر الطلب بنية الإلغاء أو مضايقة المندوبين أو استخدام التطبيق لأغراض احتيالية.</p>
</div>
<div class="section">
  <h2>٦. إلغاء الطلبات</h2>
  <p>يمكنك إلغاء طلبك قبل قبوله من المندوب. بعد القبول، يُنصح بالتواصل مع المندوب مباشرةً عبر المحادثة.</p>
</div>
<div class="section">
  <h2>٧. حدود المسؤولية</h2>
  <p>لا تتحمل زبوني مسؤولية التأخير الناجم عن ظروف خارجة عن إرادتها كحوادث السير أو ظروف الطقس القاهرة.</p>
</div>
<div class="section">
  <h2>٨. التعديلات على الشروط</h2>
  <p>نحتفظ بالحق في تعديل هذه الشروط في أي وقت. سيتم إشعارك بالتغييرات الجوهرية عبر التطبيق قبل نفاذها.</p>
</div>
<div class="contact-box">
  <span class="contact-icon">⚖️</span>
  <span>باستمرارك في استخدام التطبيق فأنت توافق على هذه الشروط. للاستفسارات، تواصل معنا عبر قسم الدعم.</span>
</div>`;

router.get("/legal/privacy", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(HTML_SHELL("سياسة الخصوصية", PRIVACY_BODY));
});

router.get("/legal/terms", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(HTML_SHELL("شروط الاستخدام", TERMS_BODY));
});

export default router;

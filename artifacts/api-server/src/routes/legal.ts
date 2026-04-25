import { Router } from "express";

const router = Router();

const HTML_PAGE = (titleEn: string, titleAr: string, contentEn: string, contentAr: string, activePage: "support" | "privacy" | "delete-account") => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${titleEn} — Zaboni</title>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', system-ui, sans-serif; background: #f9fafb; color: #1f2937; line-height: 1.7; -webkit-font-smoothing: antialiased; }
    body[dir="rtl"] { font-family: 'IBM Plex Sans Arabic', system-ui, sans-serif; }
    header { background: #fff; border-bottom: 1px solid #f3f4f6; padding: 14px 24px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 10; }
    .logo-area { display: flex; align-items: center; gap: 10px; }
    .logo-icon { width: 34px; height: 34px; background: #f97316; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 700; font-size: 15px; }
    .logo-name { font-weight: 700; font-size: 17px; color: #111827; }
    nav { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
    nav a, nav button { padding: 6px 12px; border-radius: 8px; font-size: 13px; font-weight: 500; text-decoration: none; border: none; background: none; cursor: pointer; transition: background 0.15s, color 0.15s; color: #6b7280; font-family: inherit; }
    nav a:hover, nav button:hover { background: #f3f4f6; color: #374151; }
    nav a.active { background: #fff7ed; color: #f97316; }
    .divider { width: 1px; height: 16px; background: #e5e7eb; margin: 0 4px; }
    main { max-width: 720px; margin: 0 auto; padding: 40px 20px 80px; }
    h1 { font-size: 1.875rem; font-weight: 700; color: #111827; margin-bottom: 6px; }
    .subtitle { font-size: 14px; color: #9ca3af; margin-bottom: 32px; }
    .lead { font-size: 1.05rem; color: #6b7280; margin-bottom: 28px; }
    h2 { font-size: 1.1rem; font-weight: 600; color: #111827; margin-top: 36px; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid #f3f4f6; }
    h3 { font-size: 1rem; font-weight: 600; color: #374151; margin-top: 20px; margin-bottom: 6px; }
    p { color: #4b5563; margin-bottom: 14px; font-size: 15px; }
    ul { color: #4b5563; padding-left: 20px; margin-bottom: 14px; font-size: 15px; }
    [dir="rtl"] ul { padding-left: 0; padding-right: 20px; }
    ul li { margin-bottom: 6px; }
    a { color: #f97316; text-decoration: none; font-weight: 500; }
    a:hover { text-decoration: underline; }
    .contact-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin: 24px 0; }
    .contact-card { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 20px 16px; border-radius: 16px; border: 1px solid #e5e7eb; text-align: center; text-decoration: none; color: inherit; transition: border-color 0.15s, box-shadow 0.15s; }
    .contact-card:hover { border-color: #f97316; box-shadow: 0 2px 8px rgba(249,115,22,0.1); text-decoration: none; }
    .contact-card-icon { font-size: 28px; line-height: 1; }
    .contact-card-title { font-weight: 600; font-size: 14px; color: #111827; }
    .contact-card-sub { font-size: 12px; color: #9ca3af; }
    .cta-box { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 16px; padding: 22px; margin-top: 40px; }
    .cta-box h3 { font-size: 1rem; font-weight: 600; color: #111827; margin-bottom: 6px; }
    .cta-box p { font-size: 14px; color: #6b7280; margin-bottom: 14px; }
    .cta-btn { display: inline-block; background: #f97316; color: #fff !important; font-weight: 500; font-size: 14px; padding: 10px 22px; border-radius: 12px; text-decoration: none !important; transition: background 0.15s; }
    .cta-btn:hover { background: #ea6c0a; }
    strong { color: #374151; }
    footer { text-align: center; color: #9ca3af; font-size: 13px; padding: 28px 0 16px; border-top: 1px solid #f3f4f6; margin-top: 60px; }
    footer a { color: #9ca3af; }
    footer a:hover { color: #6b7280; }
    @media (max-width: 480px) { main { padding: 24px 16px 60px; } h1 { font-size: 1.5rem; } }
  </style>
  <script>
    function switchLang(lang) {
      var body = document.body;
      document.getElementById('content-en').style.display = lang === 'ar' ? 'none' : 'block';
      document.getElementById('content-ar').style.display = lang === 'ar' ? 'block' : 'none';
      document.getElementById('btn-en').classList.toggle('active', lang !== 'ar');
      document.getElementById('btn-ar').classList.toggle('active', lang === 'ar');
      body.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
      body.setAttribute('lang', lang);
      document.querySelector('title').textContent = lang === 'ar' ? '${titleAr} — زبوني' : '${titleEn} — Zaboni';
      ['support','privacy','delete-account'].forEach(function(key) {
        document.getElementById('nav-'+key+'-en').style.display = lang === 'ar' ? 'none' : 'inline';
        document.getElementById('nav-'+key+'-ar').style.display = lang === 'ar' ? 'inline' : 'none';
      });
      localStorage.setItem('zaboni_lang', lang);
    }
    window.addEventListener('DOMContentLoaded', function() { switchLang(localStorage.getItem('zaboni_lang') || 'en'); });
  </script>
</head>
<body>
  <header>
    <div class="logo-area">
      <div class="logo-icon">Z</div>
      <span class="logo-name">Zaboni</span>
    </div>
    <nav>
      <a href="/support" ${activePage === "support" ? 'class="active"' : ""}>
        <span id="nav-support-en">Support</span><span id="nav-support-ar" style="display:none">الدعم</span>
      </a>
      <a href="/privacy" ${activePage === "privacy" ? 'class="active"' : ""}>
        <span id="nav-privacy-en">Privacy</span><span id="nav-privacy-ar" style="display:none">الخصوصية</span>
      </a>
      <a href="/delete-account" ${activePage === "delete-account" ? 'class="active"' : ""}>
        <span id="nav-delete-account-en">Delete Account</span><span id="nav-delete-account-ar" style="display:none">حذف الحساب</span>
      </a>
      <div class="divider"></div>
      <button id="btn-en" onclick="switchLang('en')" class="active">English</button>
      <button id="btn-ar" onclick="switchLang('ar')">عربي</button>
    </nav>
  </header>
  <main>
    <div id="content-en">${contentEn}</div>
    <div id="content-ar" style="display:none">${contentAr}</div>
  </main>
  <footer>
    <p>© ${new Date().getFullYear()} Zaboni &nbsp;·&nbsp; <a href="mailto:adnan.alhomsi.789@gmail.com">support@zaboni.app</a> &nbsp;·&nbsp; <a href="https://zaboni.app">zaboni.app</a></p>
  </footer>
</body>
</html>`;

const SUPPORT_EN = `
<h1>Support Center</h1>
<p class="lead">We're here to help. Find answers to common questions below, or reach out directly.</p>
<div class="contact-grid">
  <a href="mailto:adnan.alhomsi.789@gmail.com" class="contact-card">
    <div class="contact-card-icon">✉️</div>
    <div class="contact-card-title">Email Support</div>
    <div class="contact-card-sub">support@zaboni.app</div>
  </a>
  <a href="https://wa.me/963000000000" target="_blank" rel="noopener" class="contact-card">
    <div class="contact-card-icon">💬</div>
    <div class="contact-card-title">WhatsApp</div>
    <div class="contact-card-sub">Chat with us</div>
  </a>
  <div class="contact-card">
    <div class="contact-card-icon">🕐</div>
    <div class="contact-card-title">Hours</div>
    <div class="contact-card-sub">Daily: 9 AM – 11 PM</div>
  </div>
</div>
<h2>Frequently Asked Questions</h2>
<h3>How do I place an order?</h3>
<p>Open the Zaboni app, browse restaurants, add items to your cart, confirm your delivery address, and tap "Place Order." You'll receive live updates at every step.</p>
<h3>Can I order anything, not just from a menu?</h3>
<p>Yes! Use the <strong>Custom Order</strong> feature — type what you want in plain words (e.g. "cola and chicken shawarma from Al-Shater Hassan") and a courier will handle the rest.</p>
<h3>How do I pay?</h3>
<p>Zaboni uses <strong>cash on delivery only</strong>. Pay the courier when your order arrives. No cards required.</p>
<h3>How do I track my order?</h3>
<p>Once a courier accepts your order, you'll see their live location on the map inside the app. Push notifications keep you updated at every step.</p>
<h3>Can I chat with my courier?</h3>
<p>Yes. Once your order is accepted, an in-app chat opens automatically — no need to share phone numbers.</p>
<h3>How do I use a promo code?</h3>
<p>During checkout, tap "Add Promo Code" and enter your code. Valid codes apply discounts automatically.</p>
<h3>My order is taking too long — what should I do?</h3>
<p>Check the live tracking map first. You can also chat with your courier directly in the app. Still concerned? Email us at <a href="mailto:adnan.alhomsi.789@gmail.com">support@zaboni.app</a>.</p>
<h3>How do I become a Zaboni courier?</h3>
<p>Tap "Join as Courier" from the main menu, fill in your details and vehicle type, and submit. Our team reviews applications and gets back to you.</p>
<h3>How do I delete my account?</h3>
<p>Email <a href="mailto:adnan.alhomsi.789@gmail.com">support@zaboni.app</a> with your registered phone number. We'll delete your account and data within 7 business days.</p>
<div class="cta-box">
  <h3>Still need help?</h3>
  <p>Our team is available daily from 9 AM to 11 PM and typically responds within a few hours.</p>
  <a href="mailto:adnan.alhomsi.789@gmail.com" class="cta-btn">Contact Support</a>
</div>`;

const SUPPORT_AR = `
<h1>مركز الدعم</h1>
<p class="lead">نحن هنا لمساعدتك. اعثر على إجابات للأسئلة الشائعة أدناه، أو تواصل مع فريقنا مباشرةً.</p>
<div class="contact-grid">
  <a href="mailto:adnan.alhomsi.789@gmail.com" class="contact-card">
    <div class="contact-card-icon">✉️</div>
    <div class="contact-card-title">البريد الإلكتروني</div>
    <div class="contact-card-sub">support@zaboni.app</div>
  </a>
  <a href="https://wa.me/963000000000" target="_blank" rel="noopener" class="contact-card">
    <div class="contact-card-icon">💬</div>
    <div class="contact-card-title">واتساب</div>
    <div class="contact-card-sub">تحدّث معنا</div>
  </a>
  <div class="contact-card">
    <div class="contact-card-icon">🕐</div>
    <div class="contact-card-title">ساعات العمل</div>
    <div class="contact-card-sub">يومياً: ٩ ص – ١١ م</div>
  </div>
</div>
<h2>الأسئلة الشائعة</h2>
<h3>كيف أضع طلباً؟</h3>
<p>افتح تطبيق زبوني، تصفّح المطاعم، أضف العناصر إلى سلّة التسوق، أكّد عنوان التوصيل، ثم اضغط "تأكيد الطلب". ستتلقى تحديثات فورية في كل خطوة.</p>
<h3>هل يمكنني طلب أي شيء، وليس فقط من القائمة؟</h3>
<p>نعم! استخدم ميزة <strong>الطلب الحر</strong> — اكتب ما تريده بكلامك العادي (مثلاً: "كولا ودجاج شاورما من الشاطر حسن") وسيتكفّل المندوب بالباقي.</p>
<h3>كيف أدفع؟</h3>
<p>يقبل زبوني <strong>الدفع نقداً عند الاستلام فقط</strong>. ادفع للمندوب عند وصول طلبك. لا حاجة لبطاقات.</p>
<h3>كيف أتابع طلبي؟</h3>
<p>بمجرد قبول المندوب لطلبك، شاهد موقعه الحي على الخريطة داخل التطبيق. ستتلقى أيضاً إشعارات فورية في كل مرحلة.</p>
<h3>هل يمكنني الدردشة مع مندوبي؟</h3>
<p>نعم. بمجرد قبول طلبك، تُفتح دردشة داخل التطبيق تلقائياً — دون الحاجة لمشاركة أرقام الهواتف.</p>
<h3>كيف أستخدم كود الخصم؟</h3>
<p>أثناء الدفع، اضغط "إضافة كود خصم" وأدخل الكود. ستُطبَّق الرموز الصالحة خصماً تلقائياً.</p>
<h3>طلبي يتأخر — ماذا أفعل؟</h3>
<p>تحقق أولاً من خريطة التتبع الحي. يمكنك أيضاً الدردشة مع مندوبك مباشرةً في التطبيق. ما زلت قلقاً؟ تواصل معنا على <a href="mailto:adnan.alhomsi.789@gmail.com">support@zaboni.app</a>.</p>
<h3>كيف أصبح مندوب توصيل في زبوني؟</h3>
<p>اضغط "انضم كمندوب" من القائمة الرئيسية، أدخل بياناتك ونوع مركبتك وقدّم الطلب. سيراجعه فريقنا ويتواصل معك.</p>
<h3>كيف أحذف حسابي؟</h3>
<p>أرسل بريداً إلكترونياً إلى <a href="mailto:adnan.alhomsi.789@gmail.com">support@zaboni.app</a> مع رقم هاتفك المسجّل. سنحذف حسابك وبياناتك خلال ٧ أيام عمل.</p>
<div class="cta-box">
  <h3>لا تزال بحاجة للمساعدة؟</h3>
  <p>يتوفر فريقنا يومياً من ٩ ص حتى ١١ م، ونردّ عادةً في غضون ساعات قليلة.</p>
  <a href="mailto:adnan.alhomsi.789@gmail.com" class="cta-btn">تواصل مع الدعم</a>
</div>`;

const PRIVACY_EN = `
<h1>Privacy Policy</h1>
<p class="subtitle">Last updated: April 25, 2026</p>
<p>Zaboni ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use the Zaboni mobile application and related services.</p>
<h2>1. Information We Collect</h2>
<h3>Information You Provide</h3>
<ul>
  <li><strong>Phone Number:</strong> Used to verify your identity and create your account.</li>
  <li><strong>Delivery Addresses:</strong> Addresses you save in the app for delivery purposes.</li>
  <li><strong>Order Information:</strong> Details of the orders you place, including items and special instructions.</li>
  <li><strong>Courier Application Data:</strong> If you apply to become a courier, we collect your name, vehicle information, and contact details.</li>
</ul>
<h3>Information Collected Automatically</h3>
<ul>
  <li><strong>Location Data:</strong> With your permission, we collect your device's location to provide delivery services, show nearby restaurants, and enable real-time order tracking.</li>
  <li><strong>Device Information:</strong> Device type, operating system, app version, and unique device identifiers.</li>
  <li><strong>Usage Data:</strong> How you interact with the app, including pages visited and features used.</li>
  <li><strong>Push Notification Tokens:</strong> Used to send you order status updates and relevant notifications.</li>
</ul>
<h2>2. How We Use Your Information</h2>
<ul>
  <li>Process and fulfill your delivery orders</li>
  <li>Verify your phone number and authenticate your account</li>
  <li>Connect you with available couriers in your area</li>
  <li>Enable real-time order tracking on the map</li>
  <li>Send order status notifications via push notifications</li>
  <li>Enable in-app chat between customers and couriers</li>
  <li>Calculate delivery fees based on your location and delivery zones</li>
  <li>Improve our services and user experience</li>
  <li>Respond to customer support inquiries</li>
  <li>Detect and prevent fraud or unauthorized use</li>
</ul>
<h2>3. Sharing Your Information</h2>
<p>We do not sell your personal information. We may share your information with:</p>
<ul>
  <li><strong>Couriers:</strong> Your delivery address and first name are shared with the assigned courier to complete the delivery.</li>
  <li><strong>Restaurants:</strong> Your order details are shared with the restaurant preparing your food.</li>
  <li><strong>Service Providers:</strong> Third-party services such as Firebase (push notifications) and mapping services. These providers are contractually required to protect your data.</li>
  <li><strong>Legal Requirements:</strong> If required by law, court order, or governmental authority.</li>
</ul>
<h2>4. Location Data</h2>
<p>Location access is required for core features including finding nearby restaurants, calculating delivery fees, and enabling real-time tracking. We collect location data only while you are actively using the app and do not track your location in the background without your knowledge.</p>
<h2>5. Data Retention</h2>
<p>We retain your personal information as long as your account is active or as needed to provide our services. Order history is retained for at least 12 months. You may request deletion of your account and data at any time.</p>
<h2>6. Your Rights</h2>
<ul>
  <li>Access the personal information we hold about you</li>
  <li>Request correction of inaccurate data</li>
  <li>Request deletion of your account and personal data</li>
  <li>Withdraw consent for location access at any time via your device settings</li>
  <li>Opt out of marketing communications</li>
</ul>
<p>To exercise these rights, contact us at <a href="mailto:adnan.alhomsi.789@gmail.com">support@zaboni.app</a>.</p>
<h2>7. Children's Privacy</h2>
<p>Our Service is not directed to children under the age of 13. We do not knowingly collect personal information from children under 13.</p>
<h2>8. Security</h2>
<p>We implement industry-standard security measures including encrypted data transmission and secure storage. No method of transmission over the internet is 100% secure.</p>
<h2>9. Changes to This Policy</h2>
<p>We may update this Privacy Policy from time to time. We will notify you of significant changes through the app or via push notification.</p>
<h2>10. Contact Us</h2>
<ul>
  <li>Email: <a href="mailto:adnan.alhomsi.789@gmail.com">support@zaboni.app</a></li>
  <li>Website: <a href="https://zaboni.app">zaboni.app</a></li>
</ul>`;

const PRIVACY_AR = `
<h1>سياسة الخصوصية</h1>
<p class="subtitle">آخر تحديث: ٢٥ أبريل ٢٠٢٦</p>
<p>تلتزم شركة زبوني ("نحن") بحماية خصوصيتك. توضّح سياسة الخصوصية هذه كيفية جمعنا لمعلوماتك واستخدامها والكشف عنها وحمايتها عند استخدامك لتطبيق زبوني والخدمات المرتبطة به.</p>
<h2>١. المعلومات التي نجمعها</h2>
<h3>المعلومات التي تقدّمها</h3>
<ul>
  <li><strong>رقم الهاتف:</strong> يُستخدم للتحقق من هويتك وإنشاء حسابك.</li>
  <li><strong>عناوين التوصيل:</strong> العناوين التي تحفظها في التطبيق لأغراض التوصيل.</li>
  <li><strong>معلومات الطلب:</strong> تفاصيل الطلبات التي تقدّمها، بما فيها العناصر والتعليمات الخاصة.</li>
  <li><strong>بيانات طلب الانضمام كمندوب:</strong> إذا تقدّمت للعمل كمندوب، نجمع اسمك ومعلومات مركبتك وبيانات التواصل.</li>
</ul>
<h3>المعلومات المجمّعة تلقائياً</h3>
<ul>
  <li><strong>بيانات الموقع:</strong> بإذنك، نجمع موقع جهازك لتقديم خدمات التوصيل وعرض المطاعم القريبة وتمكين تتبّع الطلب في الوقت الفعلي.</li>
  <li><strong>معلومات الجهاز:</strong> نوع الجهاز ونظام التشغيل وإصدار التطبيق والمعرّفات الفريدة.</li>
  <li><strong>بيانات الاستخدام:</strong> طريقة تفاعلك مع التطبيق.</li>
  <li><strong>رموز الإشعارات الفورية:</strong> تُستخدم لإرسال تحديثات حالة طلبك.</li>
</ul>
<h2>٢. كيف نستخدم معلوماتك</h2>
<ul>
  <li>معالجة طلبات التوصيل وتنفيذها</li>
  <li>التحقق من رقم هاتفك ومصادقة حسابك</li>
  <li>ربطك بالمندوبين المتاحين في منطقتك</li>
  <li>تمكين تتبّع الطلب في الوقت الفعلي على الخريطة</li>
  <li>إرسال إشعارات حالة الطلب عبر الإشعارات الفورية</li>
  <li>تمكين الدردشة داخل التطبيق بين العملاء والمندوبين</li>
  <li>حساب رسوم التوصيل بناءً على موقعك ومناطق التوصيل</li>
  <li>تحسين خدماتنا وتجربة المستخدم</li>
  <li>الرد على استفسارات دعم العملاء</li>
  <li>اكتشاف الاحتيال ومنعه</li>
</ul>
<h2>٣. مشاركة معلوماتك</h2>
<p>نحن لا نبيع معلوماتك الشخصية. قد نشارك معلوماتك مع:</p>
<ul>
  <li><strong>المندوبين:</strong> يُشارَك عنوان التوصيل واسمك الأول مع المندوب المعيَّن لإتمام عملية التوصيل.</li>
  <li><strong>المطاعم:</strong> تُشارَك تفاصيل طلبك مع المطعم الذي يُعدّ طعامك.</li>
  <li><strong>مزوّدي الخدمة:</strong> مثل Firebase (الإشعارات الفورية) وخدمات الخرائط. يُلزَم هؤلاء تعاقدياً بحماية بياناتك.</li>
  <li><strong>المتطلبات القانونية:</strong> إذا استلزم القانون أو أمر المحكمة أو الجهة الحكومية ذلك.</li>
</ul>
<h2>٤. بيانات الموقع</h2>
<p>يُعدّ الوصول إلى الموقع ضرورياً لاستخدام الميزات الأساسية. نجمع بيانات الموقع فقط عند استخدامك النشط للتطبيق، ولا نتتبّع موقعك في الخلفية دون علمك.</p>
<h2>٥. الاحتفاظ بالبيانات</h2>
<p>نحتفظ بمعلوماتك طالما كان حسابك نشطاً. يُحتفظ بسجل الطلبات لمدة ١٢ شهراً على الأقل. يمكنك طلب حذف حسابك وبياناتك في أي وقت.</p>
<h2>٦. حقوقك</h2>
<ul>
  <li>الوصول إلى المعلومات الشخصية التي نحتفظ بها عنك</li>
  <li>طلب تصحيح البيانات غير الدقيقة</li>
  <li>طلب حذف حسابك وبياناتك الشخصية</li>
  <li>سحب الموافقة على الوصول إلى الموقع في أي وقت عبر إعدادات جهازك</li>
  <li>إلغاء الاشتراك في الاتصالات التسويقية</li>
</ul>
<p>للممارسة هذه الحقوق، تواصل معنا على <a href="mailto:adnan.alhomsi.789@gmail.com">support@zaboni.app</a>.</p>
<h2>٧. خصوصية الأطفال</h2>
<p>لا تستهدف خدمتنا الأطفال دون سن ١٣ عاماً. لا نجمع معلومات شخصية منهم عن قصد.</p>
<h2>٨. الأمان</h2>
<p>نطبّق تدابير أمنية وفق معايير الصناعة، بما في ذلك نقل البيانات المشفّر والتخزين الآمن.</p>
<h2>٩. التغييرات على هذه السياسة</h2>
<p>قد نحدّث هذه السياسة من وقت لآخر. سنُعلمك بالتغييرات الجوهرية عبر التطبيق أو الإشعارات الفورية.</p>
<h2>١٠. تواصل معنا</h2>
<ul>
  <li>البريد الإلكتروني: <a href="mailto:adnan.alhomsi.789@gmail.com">support@zaboni.app</a></li>
  <li>الموقع الإلكتروني: <a href="https://zaboni.app">zaboni.app</a></li>
</ul>`;

const DELETE_ACCOUNT_EN = `
<h1>Delete Your Account</h1>
<p class="lead">You can request to permanently delete your Zaboni account and all associated data at any time.</p>
<h2>What Gets Deleted</h2>
<ul>
  <li>Your profile and phone number</li>
  <li>All saved delivery addresses</li>
  <li>Your order history</li>
  <li>Any active promo codes linked to your account</li>
  <li>In-app chat messages</li>
</ul>
<h2>What May Be Retained</h2>
<p>We may retain certain information for a limited period as required by law or for legitimate business purposes, such as:</p>
<ul>
  <li>Transaction records needed for accounting or legal compliance (up to 12 months)</li>
  <li>Information needed to resolve disputes or enforce our terms</li>
</ul>
<h2>How to Request Deletion</h2>
<p>Send an email from your registered account or include your registered phone number so we can locate your account.</p>
<div class="contact-grid" style="grid-template-columns:1fr;">
  <a href="mailto:adnan.alhomsi.789@gmail.com?subject=Account%20Deletion%20Request&body=Please%20delete%20my%20Zaboni%20account.%0A%0ARegistered%20phone%20number%3A%20" class="contact-card" style="flex-direction:row;justify-content:flex-start;gap:16px;text-align:left;">
    <div class="contact-card-icon">✉️</div>
    <div>
      <div class="contact-card-title">Email Deletion Request</div>
      <div class="contact-card-sub">support@zaboni.app — tap to open a pre-filled email</div>
    </div>
  </a>
</div>
<h2>Processing Time</h2>
<p>We will process your deletion request within <strong>7 business days</strong>. You will receive a confirmation email once your account and data have been deleted.</p>
<h2>Before You Delete</h2>
<p>Please note that deleting your account is <strong>permanent and irreversible</strong>. Any pending orders should be completed or cancelled before requesting deletion. Courier accounts with outstanding earnings should contact support first.</p>
<div class="cta-box">
  <h3>Ready to delete your account?</h3>
  <p>Tap the button below to open a pre-filled email request. Add your registered phone number and send.</p>
  <a href="mailto:adnan.alhomsi.789@gmail.com?subject=Account%20Deletion%20Request&body=Please%20delete%20my%20Zaboni%20account.%0A%0ARegistered%20phone%20number%3A%20" class="cta-btn">Send Deletion Request</a>
</div>`;

const DELETE_ACCOUNT_AR = `
<h1>حذف حسابك</h1>
<p class="lead">يمكنك طلب حذف حساب زبوني وجميع بياناتك المرتبطة به بشكل دائم في أي وقت.</p>
<h2>ما الذي سيُحذف</h2>
<ul>
  <li>ملفك الشخصي ورقم هاتفك</li>
  <li>جميع عناوين التوصيل المحفوظة</li>
  <li>سجل طلباتك</li>
  <li>أي أكواد خصم مرتبطة بحسابك</li>
  <li>رسائل الدردشة داخل التطبيق</li>
</ul>
<h2>ما الذي قد يُحتفظ به</h2>
<p>قد نحتفظ ببعض المعلومات لفترة محدودة كما يقتضيه القانون أو لأغراض تجارية مشروعة، مثل:</p>
<ul>
  <li>سجلات المعاملات اللازمة للمحاسبة أو الامتثال القانوني (حتى ١٢ شهراً)</li>
  <li>المعلومات اللازمة لحل النزاعات أو تطبيق شروطنا</li>
</ul>
<h2>كيفية طلب الحذف</h2>
<p>أرسل بريداً إلكترونياً من حسابك المسجّل أو أدرج رقم هاتفك المسجّل حتى نتمكن من تحديد حسابك.</p>
<div class="contact-grid" style="grid-template-columns:1fr;">
  <a href="mailto:adnan.alhomsi.789@gmail.com?subject=%D8%B7%D9%84%D8%A8%20%D8%AD%D8%B0%D9%81%20%D8%A7%D9%84%D8%AD%D8%B3%D8%A7%D8%A8&body=%D9%85%D8%B1%D8%AD%D8%A8%D8%A7%D8%8C%0A%D8%A3%D8%B1%D8%AC%D9%88%20%D8%AD%D8%B0%D9%81%20%D8%AD%D8%B3%D8%A7%D8%A8%20%D8%B2%D8%A8%D9%88%D9%86%D9%8A%20%D8%A7%D9%84%D8%AE%D8%A7%D8%B5%20%D8%A8%D9%8A.%0A%0A%D8%B1%D9%82%D9%85%20%D8%A7%D9%84%D9%87%D8%A7%D8%AA%D9%81%20%D8%A7%D9%84%D9%85%D8%B3%D8%AC%D9%91%D9%84%3A%20" class="contact-card" style="flex-direction:row;justify-content:flex-start;gap:16px;text-align:right;">
    <div class="contact-card-icon">✉️</div>
    <div>
      <div class="contact-card-title">إرسال طلب حذف بالبريد الإلكتروني</div>
      <div class="contact-card-sub">support@zaboni.app — اضغط لفتح بريد إلكتروني جاهز</div>
    </div>
  </a>
</div>
<h2>مدة المعالجة</h2>
<p>سنعالج طلب الحذف خلال <strong>٧ أيام عمل</strong>. ستتلقى رسالة تأكيد بالبريد الإلكتروني بعد حذف حسابك وبياناتك.</p>
<h2>قبل أن تحذف حسابك</h2>
<p>يُرجى ملاحظة أن حذف الحساب <strong>دائم ولا يمكن التراجع عنه</strong>. يجب إتمام أي طلبات معلّقة أو إلغاؤها قبل طلب الحذف. على حسابات المندوبين التي لديها أرباح معلّقة التواصل مع الدعم أولاً.</p>
<div class="cta-box">
  <h3>هل أنت مستعد لحذف حسابك؟</h3>
  <p>اضغط على الزر أدناه لفتح بريد إلكتروني جاهز. أضف رقم هاتفك المسجّل وأرسله.</p>
  <a href="mailto:adnan.alhomsi.789@gmail.com?subject=%D8%B7%D9%84%D8%A8%20%D8%AD%D8%B0%D9%81%20%D8%A7%D9%84%D8%AD%D8%B3%D8%A7%D8%A8&body=%D9%85%D8%B1%D8%AD%D8%A8%D8%A7%D8%8C%0A%D8%A3%D8%B1%D8%AC%D9%88%20%D8%AD%D8%B0%D9%81%20%D8%AD%D8%B3%D8%A7%D8%A8%20%D8%B2%D8%A8%D9%88%D9%86%D9%8A%20%D8%A7%D9%84%D8%AE%D8%A7%D8%B5%20%D8%A8%D9%8A.%0A%0A%D8%B1%D9%82%D9%85%20%D8%A7%D9%84%D9%87%D8%A7%D8%AA%D9%81%20%D8%A7%D9%84%D9%85%D8%B3%D8%AC%D9%91%D9%84%3A%20" class="cta-btn">إرسال طلب الحذف</a>
</div>`;

router.get("/support", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(HTML_PAGE("Support Center", "مركز الدعم", SUPPORT_EN, SUPPORT_AR, "support"));
});

router.get("/privacy", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(HTML_PAGE("Privacy Policy", "سياسة الخصوصية", PRIVACY_EN, PRIVACY_AR, "privacy"));
});

router.get("/delete-account", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(HTML_PAGE("Delete Account", "حذف الحساب", DELETE_ACCOUNT_EN, DELETE_ACCOUNT_AR, "delete-account"));
});

router.get("/legal/privacy", (_req, res) => res.redirect(301, "/privacy"));
router.get("/legal/terms", (_req, res) => res.redirect(301, "/support"));

export default router;

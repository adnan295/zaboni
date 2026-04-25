import { useState } from "react";
import Layout from "@/components/Layout";

export default function PrivacyPage() {
  const [lang, setLang] = useState<"en" | "ar">("en");
  const isAr = lang === "ar";

  return (
    <Layout lang={lang} setLang={setLang} activePage="privacy">
      {isAr ? <PrivacyAr /> : <PrivacyEn />}
    </Layout>
  );
}

function PrivacyEn() {
  return (
    <article className="prose max-w-none">
      <h1>Privacy Policy</h1>
      <p className="text-gray-500 text-sm">Last updated: April 25, 2026</p>

      <p>
        Marsool ("we," "our," or "us") is committed to protecting your privacy.
        This Privacy Policy explains how we collect, use, disclose, and safeguard
        your information when you use the Marsool mobile application and related
        services (collectively, the "Service").
      </p>

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
      <p>We use the information we collect to:</p>
      <ul>
        <li>Process and fulfill your delivery orders</li>
        <li>Verify your phone number and authenticate your account</li>
        <li>Connect you with available couriers in your area</li>
        <li>Enable real-time order tracking on the map</li>
        <li>Send you order status notifications via push notifications</li>
        <li>Enable in-app chat between customers and couriers</li>
        <li>Calculate delivery fees based on your location and delivery zones</li>
        <li>Improve our services and user experience</li>
        <li>Respond to customer support inquiries</li>
        <li>Detect and prevent fraud or unauthorized use</li>
      </ul>

      <h2>3. Sharing Your Information</h2>
      <p>We do not sell your personal information. We may share your information with:</p>
      <ul>
        <li><strong>Couriers:</strong> Your delivery address and first name are shared with the courier assigned to your order so they can complete the delivery.</li>
        <li><strong>Restaurants:</strong> Your order details are shared with the restaurant preparing your food.</li>
        <li><strong>Service Providers:</strong> Third-party services we use to operate the app, such as Firebase (push notifications) and mapping services. These providers are contractually required to protect your data.</li>
        <li><strong>Legal Requirements:</strong> If required by law, court order, or governmental authority.</li>
      </ul>

      <h2>4. Location Data</h2>
      <p>
        Location access is required to use core features of Marsool, including finding nearby restaurants,
        calculating delivery fees, and enabling real-time tracking. We collect location data only while
        you are actively using the app. We do not track your location in the background without your knowledge.
      </p>

      <h2>5. Data Retention</h2>
      <p>
        We retain your personal information for as long as your account is active or as needed to provide
        our services. Order history is retained for at least 12 months to support customer service and
        legal requirements. You may request deletion of your account and data at any time.
      </p>

      <h2>6. Your Rights</h2>
      <p>You have the right to:</p>
      <ul>
        <li>Access the personal information we hold about you</li>
        <li>Request correction of inaccurate data</li>
        <li>Request deletion of your account and personal data</li>
        <li>Withdraw consent for location access at any time via your device settings</li>
        <li>Opt out of marketing communications</li>
      </ul>
      <p>To exercise these rights, contact us at <a href="mailto:privacy@zaboni.app">privacy@zaboni.app</a>.</p>

      <h2>7. Children's Privacy</h2>
      <p>
        Our Service is not directed to children under the age of 13. We do not knowingly collect
        personal information from children under 13. If you believe we have inadvertently collected
        such information, please contact us immediately.
      </p>

      <h2>8. Security</h2>
      <p>
        We implement industry-standard security measures to protect your information, including
        encrypted data transmission and secure storage. However, no method of transmission over
        the internet is 100% secure, and we cannot guarantee absolute security.
      </p>

      <h2>9. Changes to This Policy</h2>
      <p>
        We may update this Privacy Policy from time to time. We will notify you of significant
        changes through the app or via push notification. Continued use of the Service after
        changes are posted constitutes your acceptance of the updated policy.
      </p>

      <h2>10. Contact Us</h2>
      <p>
        If you have any questions or concerns about this Privacy Policy, please contact us at:
      </p>
      <ul>
        <li>Email: <a href="mailto:privacy@zaboni.app">privacy@zaboni.app</a></li>
        <li>Website: <a href="https://zaboni.app">zaboni.app</a></li>
      </ul>
    </article>
  );
}

function PrivacyAr() {
  return (
    <article className="prose max-w-none text-right" dir="rtl">
      <h1>سياسة الخصوصية</h1>
      <p className="text-gray-500 text-sm">آخر تحديث: ٢٥ أبريل ٢٠٢٦</p>

      <p>
        تلتزم شركة مرسول ("نحن" أو "لنا") بحماية خصوصيتك. توضّح سياسة الخصوصية هذه كيفية جمعنا
        لمعلوماتك واستخدامها والكشف عنها وحمايتها عند استخدامك لتطبيق مرسول والخدمات المرتبطة به
        (المشار إليها مجتمعةً بـ"الخدمة").
      </p>

      <h2>١. المعلومات التي نجمعها</h2>
      <h3>المعلومات التي تقدّمها</h3>
      <ul>
        <li><strong>رقم الهاتف:</strong> يُستخدم للتحقق من هويتك وإنشاء حسابك.</li>
        <li><strong>عناوين التوصيل:</strong> العناوين التي تحفظها في التطبيق لأغراض التوصيل.</li>
        <li><strong>معلومات الطلب:</strong> تفاصيل الطلبات التي تقدّمها، بما فيها العناصر والتعليمات الخاصة.</li>
        <li><strong>بيانات طلب الانضمام كمندوب:</strong> إذا تقدّمت للعمل كمندوب توصيل، نجمع اسمك ومعلومات مركبتك وبيانات التواصل معك.</li>
      </ul>

      <h3>المعلومات المجمّعة تلقائياً</h3>
      <ul>
        <li><strong>بيانات الموقع:</strong> بإذنك، نجمع موقع جهازك لتقديم خدمات التوصيل وعرض المطاعم القريبة وتمكين تتبّع الطلب في الوقت الفعلي.</li>
        <li><strong>معلومات الجهاز:</strong> نوع الجهاز ونظام التشغيل وإصدار التطبيق والمعرّفات الفريدة للجهاز.</li>
        <li><strong>بيانات الاستخدام:</strong> طريقة تفاعلك مع التطبيق، بما في ذلك الصفحات التي تزورها والميزات التي تستخدمها.</li>
        <li><strong>رموز الإشعارات الفورية:</strong> تُستخدم لإرسال تحديثات حالة طلبك والإشعارات ذات الصلة إليك.</li>
      </ul>

      <h2>٢. كيف نستخدم معلوماتك</h2>
      <p>نستخدم المعلومات التي نجمعها من أجل:</p>
      <ul>
        <li>معالجة طلبات التوصيل وتنفيذها</li>
        <li>التحقق من رقم هاتفك ومصادقة حسابك</li>
        <li>ربطك بالمندوبين المتاحين في منطقتك</li>
        <li>تمكين تتبّع الطلب في الوقت الفعلي على الخريطة</li>
        <li>إرسال إشعارات حالة الطلب إليك عبر الإشعارات الفورية</li>
        <li>تمكين الدردشة داخل التطبيق بين العملاء والمندوبين</li>
        <li>حساب رسوم التوصيل بناءً على موقعك ومناطق التوصيل</li>
        <li>تحسين خدماتنا وتجربة المستخدم</li>
        <li>الرد على استفسارات دعم العملاء</li>
        <li>اكتشاف الاحتيال والاستخدام غير المصرح به ومنعه</li>
      </ul>

      <h2>٣. مشاركة معلوماتك</h2>
      <p>نحن لا نبيع معلوماتك الشخصية. قد نشارك معلوماتك مع:</p>
      <ul>
        <li><strong>المندوبين:</strong> تُشارَك عنوان التوصيل واسمك الأول مع المندوب المعيَّن لطلبك لإتمام عملية التوصيل.</li>
        <li><strong>المطاعم:</strong> تُشارَك تفاصيل طلبك مع المطعم الذي يُعدّ طعامك.</li>
        <li><strong>مزوّدي الخدمة:</strong> خدمات الطرف الثالث التي نستخدمها لتشغيل التطبيق، مثل Firebase (الإشعارات الفورية) وخدمات الخرائط. يُلزَم هؤلاء المزوّدون تعاقدياً بحماية بياناتك.</li>
        <li><strong>المتطلبات القانونية:</strong> إذا استلزم القانون أو أمر المحكمة أو الجهة الحكومية ذلك.</li>
      </ul>

      <h2>٤. بيانات الموقع</h2>
      <p>
        يُعدّ الوصول إلى الموقع ضرورياً لاستخدام الميزات الأساسية في مرسول، بما في ذلك العثور على المطاعم
        القريبة وحساب رسوم التوصيل وتمكين التتبّع في الوقت الفعلي. نجمع بيانات الموقع فقط عند استخدامك
        النشط للتطبيق، ولا نتتبّع موقعك في الخلفية دون علمك.
      </p>

      <h2>٥. الاحتفاظ بالبيانات</h2>
      <p>
        نحتفظ بمعلوماتك الشخصية طالما كان حسابك نشطاً أو حسب الحاجة لتقديم خدماتنا. يُحتفظ بسجل
        الطلبات لمدة ١٢ شهراً على الأقل لدعم خدمة العملاء والمتطلبات القانونية. يمكنك طلب حذف
        حسابك وبياناتك في أي وقت.
      </p>

      <h2>٦. حقوقك</h2>
      <p>يحق لك:</p>
      <ul>
        <li>الوصول إلى المعلومات الشخصية التي نحتفظ بها عنك</li>
        <li>طلب تصحيح البيانات غير الدقيقة</li>
        <li>طلب حذف حسابك وبياناتك الشخصية</li>
        <li>سحب الموافقة على الوصول إلى الموقع في أي وقت عبر إعدادات جهازك</li>
        <li>إلغاء الاشتراك في الاتصالات التسويقية</li>
      </ul>
      <p>لممارسة هذه الحقوق، تواصل معنا على <a href="mailto:privacy@zaboni.app">privacy@zaboni.app</a>.</p>

      <h2>٧. خصوصية الأطفال</h2>
      <p>
        لا تستهدف خدمتنا الأطفال دون سن ١٣ عاماً. لا نجمع معلومات شخصية من الأطفال دون ١٣ عاماً عن
        قصد. إذا كنت تعتقد أننا جمعنا مثل هذه المعلومات عن غير قصد، فيُرجى التواصل معنا فوراً.
      </p>

      <h2>٨. الأمان</h2>
      <p>
        نطبّق تدابير أمنية وفق معايير الصناعة لحماية معلوماتك، بما في ذلك نقل البيانات المشفّر والتخزين
        الآمن. غير أن أي طريقة إرسال عبر الإنترنت ليست آمنة بنسبة ١٠٠٪، ولا يمكننا ضمان الأمان المطلق.
      </p>

      <h2>٩. التغييرات على هذه السياسة</h2>
      <p>
        قد نحدّث سياسة الخصوصية هذه من وقت لآخر. سنُعلمك بالتغييرات الجوهرية عبر التطبيق أو من
        خلال إشعار فوري. يُعدّ استمرارك في استخدام الخدمة بعد نشر التغييرات قبولاً للسياسة المحدَّثة.
      </p>

      <h2>١٠. تواصل معنا</h2>
      <p>
        إذا كانت لديك أي أسئلة أو مخاوف بشأن سياسة الخصوصية هذه، فيُرجى التواصل معنا على:
      </p>
      <ul>
        <li>البريد الإلكتروني: <a href="mailto:privacy@zaboni.app">privacy@zaboni.app</a></li>
        <li>الموقع الإلكتروني: <a href="https://zaboni.app">zaboni.app</a></li>
      </ul>
    </article>
  );
}

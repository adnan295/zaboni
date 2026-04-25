import { useState } from "react";
import Layout from "@/components/Layout";

export default function SupportPage() {
  const [lang, setLang] = useState<"en" | "ar">("en");
  const isAr = lang === "ar";

  return (
    <Layout lang={lang} setLang={setLang} activePage="support">
      {isAr ? <SupportAr /> : <SupportEn />}
    </Layout>
  );
}

function SupportEn() {
  return (
    <article className="prose max-w-none">
      <h1>Support Center</h1>
      <p className="lead">
        We're here to help. Find answers to common questions below, or reach out to our team directly.
      </p>

      <div className="not-prose grid grid-cols-1 md:grid-cols-3 gap-4 my-8">
        <a
          href="mailto:support@zaboni.app"
          className="flex flex-col items-center gap-3 p-6 rounded-2xl border border-gray-200 hover:border-orange-400 hover:shadow-md transition-all text-center group"
        >
          <div className="w-12 h-12 rounded-full bg-orange-50 flex items-center justify-center text-2xl group-hover:bg-orange-100 transition-colors">
            ✉️
          </div>
          <div>
            <p className="font-semibold text-gray-900">Email Support</p>
            <p className="text-sm text-gray-500 mt-1">support@zaboni.app</p>
          </div>
        </a>
        <a
          href="https://wa.me/963000000000"
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-col items-center gap-3 p-6 rounded-2xl border border-gray-200 hover:border-green-400 hover:shadow-md transition-all text-center group"
        >
          <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center text-2xl group-hover:bg-green-100 transition-colors">
            💬
          </div>
          <div>
            <p className="font-semibold text-gray-900">WhatsApp</p>
            <p className="text-sm text-gray-500 mt-1">Chat with us</p>
          </div>
        </a>
        <div className="flex flex-col items-center gap-3 p-6 rounded-2xl border border-gray-200 text-center">
          <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-2xl">
            🕐
          </div>
          <div>
            <p className="font-semibold text-gray-900">Hours</p>
            <p className="text-sm text-gray-500 mt-1">Daily: 9 AM – 11 PM</p>
          </div>
        </div>
      </div>

      <h2>Frequently Asked Questions</h2>

      <h3>How do I place an order?</h3>
      <p>
        Open the Marsool app, browse restaurants or search for what you want, add items to your cart,
        confirm your delivery address, and tap "Place Order." You'll receive real-time updates as your
        order is prepared and delivered.
      </p>

      <h3>Can I order anything, not just from a menu?</h3>
      <p>
        Yes! Use the <strong>Custom Order</strong> feature to type exactly what you want in your own
        words — for example: "One large pepperoni pizza from Al-Nour restaurant." A courier will pick
        it up and deliver it to you.
      </p>

      <h3>How do I pay?</h3>
      <p>
        Marsool currently accepts <strong>cash on delivery only</strong>. Simply pay the courier when
        your order arrives. No cards or online payment is required.
      </p>

      <h3>How do I track my order?</h3>
      <p>
        Once a courier accepts your order, you'll see their live location on the map inside the app.
        You'll also receive push notifications at each step: accepted, picked up, and on the way.
      </p>

      <h3>Can I chat with my courier?</h3>
      <p>
        Yes. Once your order is accepted, an in-app chat opens automatically so you can communicate
        directly with your courier without sharing personal phone numbers.
      </p>

      <h3>How do I use a promo code?</h3>
      <p>
        During checkout, tap "Add Promo Code" and enter your code. Valid codes will automatically
        apply a discount to your delivery fee or order total.
      </p>

      <h3>My order is taking too long — what do I do?</h3>
      <p>
        First, check the live tracking map to see your courier's current location. You can also
        chat with them directly in the app. If you still have concerns, contact our support team
        at <a href="mailto:support@zaboni.app">support@zaboni.app</a>.
      </p>

      <h3>How do I become a Marsool courier?</h3>
      <p>
        Open the app and tap "Join as Courier" from the main menu. Fill in your details, vehicle
        type, and submit your application. Our team will review it and get back to you.
      </p>

      <h3>How do I delete my account?</h3>
      <p>
        To request account deletion, email us at <a href="mailto:privacy@zaboni.app">privacy@zaboni.app</a>{" "}
        with your registered phone number. We'll delete your account and personal data within 7 business days.
      </p>

      <h3>Where is Marsool available?</h3>
      <p>
        Marsool currently operates in <strong>Homs, Syria</strong>. We're working on expanding to more cities soon.
      </p>

      <div className="not-prose mt-10 p-6 rounded-2xl bg-orange-50 border border-orange-100">
        <h3 className="font-semibold text-gray-900 text-lg mb-1">Still need help?</h3>
        <p className="text-gray-600 text-sm mb-4">
          Our support team is available daily from 9 AM to 11 PM. We typically respond within a few hours.
        </p>
        <a
          href="mailto:support@zaboni.app"
          className="inline-block bg-orange-500 text-white font-medium px-6 py-2.5 rounded-xl hover:bg-orange-600 transition-colors text-sm"
        >
          Contact Support
        </a>
      </div>
    </article>
  );
}

function SupportAr() {
  return (
    <article className="prose max-w-none text-right" dir="rtl">
      <h1>مركز الدعم</h1>
      <p className="lead">
        نحن هنا لمساعدتك. اعثر على إجابات للأسئلة الشائعة أدناه، أو تواصل مع فريقنا مباشرةً.
      </p>

      <div className="not-prose grid grid-cols-1 md:grid-cols-3 gap-4 my-8" dir="rtl">
        <a
          href="mailto:support@zaboni.app"
          className="flex flex-col items-center gap-3 p-6 rounded-2xl border border-gray-200 hover:border-orange-400 hover:shadow-md transition-all text-center group"
        >
          <div className="w-12 h-12 rounded-full bg-orange-50 flex items-center justify-center text-2xl group-hover:bg-orange-100 transition-colors">
            ✉️
          </div>
          <div>
            <p className="font-semibold text-gray-900">البريد الإلكتروني</p>
            <p className="text-sm text-gray-500 mt-1">support@zaboni.app</p>
          </div>
        </a>
        <a
          href="https://wa.me/963000000000"
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-col items-center gap-3 p-6 rounded-2xl border border-gray-200 hover:border-green-400 hover:shadow-md transition-all text-center group"
        >
          <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center text-2xl group-hover:bg-green-100 transition-colors">
            💬
          </div>
          <div>
            <p className="font-semibold text-gray-900">واتساب</p>
            <p className="text-sm text-gray-500 mt-1">تحدّث معنا</p>
          </div>
        </a>
        <div className="flex flex-col items-center gap-3 p-6 rounded-2xl border border-gray-200 text-center">
          <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-2xl">
            🕐
          </div>
          <div>
            <p className="font-semibold text-gray-900">ساعات العمل</p>
            <p className="text-sm text-gray-500 mt-1">يومياً: ٩ ص – ١١ م</p>
          </div>
        </div>
      </div>

      <h2>الأسئلة الشائعة</h2>

      <h3>كيف أضع طلباً؟</h3>
      <p>
        افتح تطبيق مرسول، تصفّح المطاعم أو ابحث عمّا تريده، أضف العناصر إلى سلّة التسوق، أكّد عنوان
        التوصيل، ثم اضغط على "تأكيد الطلب". ستتلقى تحديثات فورية أثناء تحضير طلبك وتسليمه.
      </p>

      <h3>هل يمكنني طلب أي شيء، وليس فقط من القائمة؟</h3>
      <p>
        نعم! استخدم ميزة <strong>الطلب الحر</strong> لكتابة ما تريده بكلامك العادي — على سبيل المثال:
        "بيتزا بيبروني كبيرة من مطعم النور." سيقوم مندوب بانتزاع الطلب وتوصيله إليك.
      </p>

      <h3>كيف أدفع؟</h3>
      <p>
        يقبل مرسول حالياً <strong>الدفع نقداً عند الاستلام فقط</strong>. ادفع للمندوب عند وصول طلبك.
        لا حاجة لبطاقات أو دفع إلكتروني.
      </p>

      <h3>كيف أتابع طلبي؟</h3>
      <p>
        بمجرد قبول المندوب لطلبك، ستشاهد موقعه الحي على الخريطة داخل التطبيق. ستتلقى أيضاً إشعارات
        فورية في كل خطوة: تم القبول، تم الاستلام، في الطريق.
      </p>

      <h3>هل يمكنني الدردشة مع مندوبي؟</h3>
      <p>
        نعم. بمجرد قبول طلبك، تُفتح دردشة داخل التطبيق تلقائياً لتتواصل مع مندوبك مباشرةً دون
        مشاركة أرقام الهواتف الشخصية.
      </p>

      <h3>كيف أستخدم كود الخصم؟</h3>
      <p>
        أثناء الدفع، اضغط على "إضافة كود خصم" وأدخل الكود. ستُطبَّق الرموز الصالحة تلقائياً لخصم
        على رسوم التوصيل أو إجمالي الطلب.
      </p>

      <h3>طلبي يتأخر — ماذا أفعل؟</h3>
      <p>
        تحقق أولاً من خريطة التتبع الحي لمعرفة الموقع الحالي لمندوبك. يمكنك أيضاً الدردشة معه
        مباشرةً في التطبيق. إذا استمرت مخاوفك، تواصل مع فريق الدعم على{" "}
        <a href="mailto:support@zaboni.app">support@zaboni.app</a>.
      </p>

      <h3>كيف أصبح مندوب توصيل في مرسول؟</h3>
      <p>
        افتح التطبيق واضغط على "انضم كمندوب" من القائمة الرئيسية. أدخل بياناتك ونوع مركبتك وقدّم
        طلبك. سيراجعه فريقنا وسيتواصل معك.
      </p>

      <h3>كيف أحذف حسابي؟</h3>
      <p>
        لطلب حذف الحساب، أرسل بريداً إلكترونياً إلى{" "}
        <a href="mailto:privacy@zaboni.app">privacy@zaboni.app</a> مع رقم هاتفك المسجّل. سنحذف حسابك
        وبياناتك الشخصية خلال ٧ أيام عمل.
      </p>

      <h3>أين يتوفر مرسول؟</h3>
      <p>
        يعمل مرسول حالياً في <strong>حمص، سوريا</strong>. نعمل على التوسّع إلى مزيد من المدن قريباً.
      </p>

      <div className="not-prose mt-10 p-6 rounded-2xl bg-orange-50 border border-orange-100" dir="rtl">
        <h3 className="font-semibold text-gray-900 text-lg mb-1">لا تزال بحاجة للمساعدة؟</h3>
        <p className="text-gray-600 text-sm mb-4">
          يتوفر فريق الدعم يومياً من الساعة ٩ صباحاً حتى ١١ مساءً. نردّ عادةً في غضون ساعات قليلة.
        </p>
        <a
          href="mailto:support@zaboni.app"
          className="inline-block bg-orange-500 text-white font-medium px-6 py-2.5 rounded-xl hover:bg-orange-600 transition-colors text-sm"
        >
          تواصل مع الدعم
        </a>
      </div>
    </article>
  );
}

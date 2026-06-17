import { Link } from "wouter";
import { useEffect, useState } from "react";

const PLAY_URL = "https://play.google.com/store/apps/details?id=com.zaboni.delivery";
const IOS_URL = "https://apps.apple.com/de/app/zaboni/id6763415681";

export default function HomePage() {
  const [expoUrl, setExpoUrl] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/config/expo-link")
      .then((r) => r.json())
      .then((d) => { if (d.url) setExpoUrl(d.url); })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col" dir="rtl">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-red-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">ز</span>
            </div>
            <span className="font-bold text-gray-900 text-lg">زبوني</span>
          </div>

          <div className="flex items-center gap-3">
            <nav className="hidden sm:flex items-center gap-1">
              <Link
                href="/support"
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              >
                الدعم
              </Link>
              <Link
                href="/privacy"
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              >
                الخصوصية
              </Link>
            </nav>
            <a
              href={PLAY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-red-600 text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-red-700 transition-colors"
            >
              حمّل التطبيق
            </a>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="bg-red-600 text-white text-center px-6 py-16 sm:py-24">
          <div className="max-w-lg mx-auto">
            <div className="w-20 h-20 rounded-3xl bg-white flex items-center justify-center mx-auto mb-6 shadow-lg">
              <span className="text-red-600 font-black text-4xl">ز</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-black mb-3 leading-tight">
              حمّل زبوني الآن
            </h1>
            <p className="text-red-100 text-base sm:text-lg mb-10">
              مجاني تماماً – ابدأ طلبك الأول خلال دقيقة
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a
                href={PLAY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-3 bg-white text-gray-900 rounded-2xl px-6 py-4 hover:bg-gray-50 transition-colors shadow-sm"
              >
                <span className="text-2xl">▶</span>
                <div className="text-right">
                  <p className="text-xs text-gray-500 leading-none mb-0.5">حمّل من</p>
                  <p className="text-base font-bold leading-none">Google Play</p>
                </div>
              </a>

              <a
                href={IOS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-3 bg-white text-gray-900 rounded-2xl px-6 py-4 hover:bg-gray-50 transition-colors shadow-sm"
              >
                <span className="text-2xl">🍎</span>
                <div className="text-right">
                  <p className="text-xs text-gray-500 leading-none mb-0.5">حمّل من</p>
                  <p className="text-base font-bold leading-none">App Store</p>
                </div>
              </a>
            </div>
          </div>
        </section>

        {expoUrl && (
          <section className="py-8 px-6 bg-amber-50 border-y border-amber-200">
            <div className="max-w-lg mx-auto text-center">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-3">
                بيئة تجريبية · للمطورين فقط
              </p>
              <a
                href={expoUrl}
                className="inline-flex items-center justify-center gap-3 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl px-8 py-4 transition-colors shadow-sm font-bold text-base"
              >
                <span className="text-xl">📱</span>
                افتح في Expo Go
              </a>
              <p className="text-xs text-amber-600 mt-3">
                يتطلب تطبيق Expo Go مثبّتاً على الجوال
              </p>
            </div>
          </section>
        )}

        <section className="py-14 px-6">
          <div className="max-w-2xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <div className="text-3xl mb-3">🍔</div>
              <h3 className="font-bold text-gray-900 mb-1">كل ما تريد</h3>
              <p className="text-sm text-gray-500">اطلب من أي مطعم أو محل في المنطقة</p>
            </div>
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <div className="text-3xl mb-3">⚡</div>
              <h3 className="font-bold text-gray-900 mb-1">توصيل سريع</h3>
              <p className="text-sm text-gray-500">تابع طلبك لحظةً بلحظة على الخريطة</p>
            </div>
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <div className="text-3xl mb-3">💰</div>
              <h3 className="font-bold text-gray-900 mb-1">ادفع عند الاستلام</h3>
              <p className="text-sm text-gray-500">نقداً فقط، بدون بطاقات أو دفع مسبق</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-gray-900 text-gray-400 mt-auto">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 flex flex-col items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-red-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">ز</span>
            </div>
            <span className="text-white font-bold text-base">زبوني</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="hover:text-gray-200 transition-colors">
              سياسة الخصوصية
            </Link>
            <span>·</span>
            <Link href="/support" className="hover:text-gray-200 transition-colors">
              شروط الاستخدام
            </Link>
            <span>·</span>
            <a href="mailto:support@zaboni.app" className="hover:text-gray-200 transition-colors">
              support@zaboni.app
            </a>
          </div>
          <p className="text-xs">© {new Date().getFullYear()} زبوني. جميع الحقوق محفوظة.</p>
        </div>
      </footer>
    </div>
  );
}

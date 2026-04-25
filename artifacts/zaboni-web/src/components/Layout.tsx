import { Link } from "wouter";

interface LayoutProps {
  lang: "en" | "ar";
  setLang: (l: "en" | "ar") => void;
  activePage: "support" | "privacy";
  children: React.ReactNode;
}

export default function Layout({ lang, setLang, activePage, children }: LayoutProps) {
  const isAr = lang === "ar";

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col" dir={isAr ? "rtl" : "ltr"}>
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-orange-500 flex items-center justify-center">
              <span className="text-white font-bold text-sm">م</span>
            </div>
            <span className="font-bold text-gray-900 text-lg">مرسول</span>
          </div>

          <nav className="flex items-center gap-1">
            <Link
              href="/support"
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                activePage === "support"
                  ? "bg-orange-50 text-orange-600"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
              }`}
            >
              {isAr ? "الدعم" : "Support"}
            </Link>
            <Link
              href="/privacy"
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                activePage === "privacy"
                  ? "bg-orange-50 text-orange-600"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
              }`}
            >
              {isAr ? "الخصوصية" : "Privacy"}
            </Link>

            <div className="w-px h-4 bg-gray-200 mx-1" />

            <button
              onClick={() => setLang(isAr ? "en" : "ar")}
              className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            >
              {isAr ? "English" : "عربي"}
            </button>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
          {children}
        </div>
      </main>

      <footer className="bg-white border-t border-gray-100 mt-auto">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-gray-400">
          <p>
            {isAr
              ? `© ${new Date().getFullYear()} مرسول. جميع الحقوق محفوظة.`
              : `© ${new Date().getFullYear()} Marsool. All rights reserved.`}
          </p>
          <div className="flex items-center gap-4">
            <a href="mailto:support@zaboni.app" className="hover:text-gray-600 transition-colors">
              support@zaboni.app
            </a>
            <span>·</span>
            <a href="https://zaboni.app" className="hover:text-gray-600 transition-colors">
              zaboni.app
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

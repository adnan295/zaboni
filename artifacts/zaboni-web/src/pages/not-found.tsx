import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl bg-orange-100 flex items-center justify-center mx-auto mb-4 text-3xl">
          🔍
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Page Not Found</h1>
        <p className="text-gray-500 mb-6">The page you're looking for doesn't exist.</p>
        <Link
          href="/support"
          className="inline-block bg-orange-500 text-white font-medium px-6 py-2.5 rounded-xl hover:bg-orange-600 transition-colors text-sm"
        >
          Go to Support
        </Link>
      </div>
    </div>
  );
}

"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="min-h-screen flex items-center justify-center p-6 bg-base text-on-surface">
    <div className="max-w-md text-center space-y-4"><h1 className="text-2xl font-bold">Something went wrong</h1>
      <p>We couldn’t load this page. Please try again.</p>
      <button onClick={reset} className="btn-3d-lime px-5 py-3 rounded-xl">Try again</button>
      <p lang="ur" dir="rtl">صفحہ لوڈ نہیں ہو سکا۔ براہ کرم دوبارہ کوشش کریں۔</p>
    </div>
  </main>;
}

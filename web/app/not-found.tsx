import Link from "next/link";
export default function NotFound() {
  return <main className="min-h-screen flex items-center justify-center bg-base text-on-surface p-6">
    <div className="text-center space-y-4"><h1 className="text-2xl font-bold">Page not found</h1>
      <p>This page may have moved or the address may be incorrect.</p>
      <Link href="/" className="inline-block btn-3d-lime px-5 py-3 rounded-xl">Back to TDX</Link>
    </div>
  </main>;
}

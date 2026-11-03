import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center px-6 text-center">
      <div>
        <p className="text-sm font-semibold text-forge">404</p>
        <h1 className="mt-2 text-2xl font-semibold">Page not found</h1>
        <Link href="/dashboard" className="mt-4 inline-block text-brand">
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}

import Link from 'next/link';
import {
  CheckCircle2,
  FileSearch,
  GitCompare,
  ListChecks,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { Logo } from '@/components/brand';

const features = [
  {
    icon: FileSearch,
    title: 'Evidence, not guesses',
    body: 'Every job requirement is mapped to exact lines in your resume, or marked as needing clarification. Nothing is invented.',
  },
  {
    icon: ListChecks,
    title: 'Three honest states',
    body: 'Demonstrated, confirmed by you, or missing. Unanswered questions are never counted against you.',
  },
  {
    icon: Sparkles,
    title: 'Career-stage aware',
    body: 'An architect with 18 years is assessed on architecture and leadership, not the checklist of a graduate role.',
  },
  {
    icon: GitCompare,
    title: 'Controlled editing',
    body: 'Accept or reject each suggestion. Every change creates a new immutable version with a full audit trail.',
  },
  {
    icon: CheckCircle2,
    title: 'Explainable scores',
    body: 'Job Match, ATS Compatibility and Evidence Quality, each with its calculation, gaps and uncertainty.',
  },
  {
    icon: ShieldCheck,
    title: 'Private by design',
    body: 'Your original resume is never overwritten. Export or delete all of your data at any time.',
  },
];

export default function Landing() {
  return (
    <div className="bg-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
        <nav className="flex items-center gap-3 text-sm">
          <Link href="/privacy" className="text-muted hover:text-ink">
            Privacy
          </Link>
          <Link href="/login" className="rounded-md px-3 py-2 hover:bg-canvas">
            Sign in
          </Link>
          <Link
            href="/signup"
            className="rounded-md bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark"
          >
            Create account
          </Link>
        </nav>
      </header>
      <main>
        <section className="mx-auto max-w-6xl px-6 pb-16 pt-12">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-forge">
            Resume Intelligence
          </p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
            Your experience. Your evidence. Your next opportunity.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-muted">
            CVForge shows exactly how your documented experience lines up with a job, asks about
            what is missing, and helps you produce tailored, ATS-friendly versions without
            fabricating a single claim.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/signup"
              className="rounded-md bg-brand px-5 py-3 font-medium text-white hover:bg-brand-dark"
            >
              Start with your resume
            </Link>
            <Link
              href="/login"
              className="rounded-md border border-line px-5 py-3 font-medium hover:bg-canvas"
            >
              I already have an account
            </Link>
          </div>
          <p className="mt-4 text-xs text-muted">
            For technology professionals with 2–30 years of experience. Scores are guidance, not an
            employer&apos;s ATS result or an interview prediction.
          </p>
        </section>
        <section className="border-t border-line bg-canvas">
          <div className="mx-auto grid max-w-6xl gap-5 px-6 py-14 md:grid-cols-3">
            {features.map((f) => (
              <div key={f.title} className="rounded-xl border border-line bg-white p-5">
                <f.icon className="h-5 w-5 text-brand" aria-hidden />
                <h2 className="mt-3 font-semibold">{f.title}</h2>
                <p className="mt-1 text-sm text-muted">{f.body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
      <footer className="mx-auto flex max-w-6xl justify-between px-6 py-8 text-xs text-muted">
        <span>CVForge is a NEXORA product. Intelligence that moves you forward.</span>
        <Link href="/privacy">Privacy &amp; data handling</Link>
      </footer>
    </div>
  );
}

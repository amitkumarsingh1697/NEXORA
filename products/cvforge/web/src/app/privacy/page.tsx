import Link from 'next/link';
import { Logo } from '@/components/brand';

export const metadata = { title: 'Privacy and data handling' };

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Logo />
      <article className="prose mt-8 space-y-4 text-sm leading-relaxed">
        <h1 className="text-2xl font-semibold">Privacy and data handling</h1>
        <p className="text-muted">
          Version 2026-11-01. This notice describes how the software handles data. It has not been
          reviewed by a lawyer and is not a statement of legal compliance with GDPR or any other
          regime.
        </p>
        <h2 className="text-lg font-semibold">What we store</h2>
        <ul className="list-disc pl-5">
          <li>
            Your account: email, display name, a salted scrypt hash of your password, and your
            settings.
          </li>
          <li>
            Your original uploaded resume file, stored privately and never modified, plus the text
            extracted from it.
          </li>
          <li>
            Structured resume versions you review, edit and approve, and the record of every change.
          </li>
          <li>
            Job descriptions you paste or capture with the extension, analyses, your clarification
            answers, suggestions and your decisions.
          </li>
          <li>Exported files, kept for 30 days by default and then deleted automatically.</li>
          <li>
            Security audit events (for example sign-ins and exports). These never include resume
            content, passwords or tokens.
          </li>
        </ul>
        <h2 className="text-lg font-semibold">What we never do</h2>
        <ul className="list-disc pl-5">
          <li>
            We do not add date of birth, photograph, nationality or marital status to your resume.
          </li>
          <li>We do not infer visa status or work authorisation from your resume.</li>
          <li>
            The browser extension only reads a page when you click Extract, and never reads cookies
            or credentials of job sites.
          </li>
          <li>
            AI assistance runs on a local model by default. Hosted AI providers are off unless an
            administrator configures them and you consent.
          </li>
        </ul>
        <h2 className="text-lg font-semibold">Your controls</h2>
        <ul className="list-disc pl-5">
          <li>
            Download a complete machine-readable export of your account from Settings → Privacy.
          </li>
          <li>Delete any resume, workspace or export at any time. Deletion is permanent.</li>
          <li>
            Delete your account, which permanently removes all rows and stored files. An anonymous
            record that a deletion occurred is kept.
          </li>
        </ul>
        <p>
          <Link href="/" className="text-brand underline">
            Back to CVForge
          </Link>
        </p>
      </article>
    </div>
  );
}

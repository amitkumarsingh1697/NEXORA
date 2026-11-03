'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileUp } from 'lucide-react';
import { Alert, Button, Card, Field, Input, PageHeader } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';

export default function UploadPage() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Upload your resume"
        description="PDF or DOCX, up to 10 MB. We extract the text and structure, then you review and correct it before any analysis."
      />
      <Card>
        <form
          className="space-y-5"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!file) return;
            setBusy(true);
            setError(null);
            try {
              const fd = new FormData();
              fd.append('file', file);
              if (title) fd.append('title', title);
              const r = await api<{ resumeId: string; versionId: string }>('/api/resumes', {
                method: 'POST',
                body: fd,
              });
              router.push(`/resumes/${r.resumeId}/versions/${r.versionId}?fresh=1`);
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          {error && <Alert tone="error">{error}</Alert>}
          <div
            className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-line bg-canvas px-6 py-10 text-center hover:border-brand"
            onClick={() => input.current?.click()}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) setFile(f);
            }}
            role="button"
            tabIndex={0}
            aria-label="Choose resume file"
          >
            <FileUp className="h-8 w-8 text-brand" aria-hidden />
            <p className="mt-2 font-medium">
              {file ? file.name : 'Drop your resume here or click to choose'}
            </p>
            <p className="text-xs text-muted">
              {file
                ? `${(file.size / 1024).toFixed(0)} KB`
                : 'PDF or DOCX. Scanned image PDFs cannot be read in v1.'}
            </p>
            <input
              ref={input}
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="sr-only"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <Field
            label="Title (optional)"
            htmlFor="title"
            hint="Defaults to the name found in the resume."
          >
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Button type="submit" loading={busy} disabled={!file}>
            Upload and extract
          </Button>
          <p className="text-xs text-muted">
            The file type is verified from its contents, not its name. Macro-enabled documents are
            rejected.
          </p>
        </form>
      </Card>
    </div>
  );
}

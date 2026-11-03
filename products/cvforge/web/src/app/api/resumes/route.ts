import { AppError } from '@nexora/validation';
import { MAX_UPLOAD_BYTES } from '@nexora/cvforge-core';
import { resumesService } from '@nexora/cvforge-backend';
import { ctx } from '@/server/context';
import { withUser } from '@/server/http';

export const GET = withUser(async (_req, user) => ({
  resumes: await resumesService.listResumes(ctx(), user.id),
}));

export const POST = withUser(async (req, user) => {
  const len = Number(req.headers.get('content-length') ?? '0');
  if (len > MAX_UPLOAD_BYTES + 64 * 1024)
    throw new AppError('PAYLOAD_TOO_LARGE', 'The file exceeds the 10 MB limit.');
  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File))
    throw new AppError('VALIDATION_FAILED', 'Choose a PDF or DOCX file to upload.');
  if (file.size > MAX_UPLOAD_BYTES)
    throw new AppError('PAYLOAD_TOO_LARGE', 'The file exceeds the 10 MB limit.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const title = typeof form.get('title') === 'string' ? (form.get('title') as string) : undefined;
  const out = await resumesService.uploadResume(ctx(), user.id, {
    filename: file.name,
    bytes,
    title,
  });
  return {
    resumeId: out.resume.id,
    versionId: out.versionId,
    confidence: out.confidence,
    warnings: out.warnings,
    unassignedLines: out.unassignedLines,
  };
});

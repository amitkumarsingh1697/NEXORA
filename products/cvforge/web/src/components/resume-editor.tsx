'use client';

import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import type { ResumeContent } from '@/lib/types';
import { Button, Card, Input, Textarea } from './ui';

const SECTION_LABELS: Record<string, string> = {
  summary: 'Summary',
  skills: 'Skills',
  experience: 'Experience',
  projects: 'Projects',
  education: 'Education',
  certifications: 'Certifications',
  achievements: 'Achievements',
  publications: 'Publications',
  languages: 'Languages',
  custom: 'Custom sections',
};

let n = 0;
const newId = (p: string) => `${p}_${Date.now().toString(36)}${(n++).toString(36)}`;

function move<T>(arr: T[], i: number, d: -1 | 1): T[] {
  const j = i + d;
  if (j < 0 || j >= arr.length) return arr;
  const copy = [...arr];
  [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
  return copy;
}

function RowTools({
  onUp,
  onDown,
  onRemove,
  label,
}: {
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
  label: string;
}) {
  return (
    <div className="flex shrink-0 gap-1">
      <button
        type="button"
        aria-label={`Move ${label} up`}
        onClick={onUp}
        className="rounded p-1 text-muted hover:bg-canvas"
      >
        <ArrowUp className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label={`Move ${label} down`}
        onClick={onDown}
        className="rounded p-1 text-muted hover:bg-canvas"
      >
        <ArrowDown className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label={`Remove ${label}`}
        onClick={onRemove}
        className="rounded p-1 text-missing hover:bg-missing-soft"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function L({ children, htmlFor }: { children: React.ReactNode; htmlFor: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium text-muted">
      {children}
    </label>
  );
}

function DateInput({
  id,
  value,
  onChange,
  label,
}: {
  id: string;
  value: string | null;
  onChange: (v: string | null) => void;
  label: string;
}) {
  return (
    <div>
      <L htmlFor={id}>{label}</L>
      <Input
        id={id}
        placeholder="YYYY-MM"
        value={value ?? ''}
        pattern="\d{4}(-(0[1-9]|1[0-2]))?"
        onChange={(e) => onChange(e.target.value.trim() || null)}
      />
    </div>
  );
}

function Bullets({
  items,
  onChange,
  prefix,
}: {
  items: { id: string; text: string }[];
  onChange: (b: { id: string; text: string }[]) => void;
  prefix: string;
}) {
  return (
    <div className="space-y-2">
      {items.map((b, i) => (
        <div key={b.id} className="flex items-start gap-2">
          <span aria-hidden className="mt-2.5 text-muted">
            •
          </span>
          <Textarea
            aria-label={`Bullet ${i + 1}`}
            rows={2}
            value={b.text}
            onChange={(e) =>
              onChange(items.map((x) => (x.id === b.id ? { ...x, text: e.target.value } : x)))
            }
          />
          <RowTools
            label={`bullet ${i + 1}`}
            onUp={() => onChange(move(items, i, -1))}
            onDown={() => onChange(move(items, i, 1))}
            onRemove={() => onChange(items.filter((x) => x.id !== b.id))}
          />
        </div>
      ))}
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => onChange([...items, { id: newId(prefix), text: '' }])}
      >
        <Plus className="h-4 w-4" /> Add bullet
      </Button>
    </div>
  );
}

/** Structured editor for a draft resume version. Purely presentational: changes go to onChange. */
export function ResumeEditor({
  value,
  onChange,
}: {
  value: ResumeContent;
  onChange: (v: ResumeContent) => void;
}) {
  const set = <K extends keyof ResumeContent>(k: K, v: ResumeContent[K]) =>
    onChange({ ...value, [k]: v });
  const p = value.personal;
  return (
    <div className="space-y-5">
      <Card
        title="Personal information"
        description="Only include what you want employers to see. CVForge never adds date of birth, photo, nationality or marital status."
      >
        <div className="grid gap-3 md:grid-cols-2">
          {(['fullName', 'headline', 'email', 'phone', 'location'] as const).map((k) => (
            <div key={k}>
              <L htmlFor={`p-${k}`}>
                {
                  {
                    fullName: 'Full name',
                    headline: 'Headline',
                    email: 'Email',
                    phone: 'Phone',
                    location: 'Location',
                  }[k]
                }
              </L>
              <Input
                id={`p-${k}`}
                value={p[k]}
                onChange={(e) => set('personal', { ...p, [k]: e.target.value })}
              />
            </div>
          ))}
        </div>
        <div className="mt-3 space-y-2">
          <p className="text-xs font-medium text-muted">Links</p>
          {p.links.map((l, i) => (
            <div key={l.id} className="flex gap-2">
              <Input
                aria-label="Link label"
                className="w-36"
                value={l.label}
                onChange={(e) =>
                  set('personal', {
                    ...p,
                    links: p.links.map((x) =>
                      x.id === l.id ? { ...x, label: e.target.value } : x,
                    ),
                  })
                }
              />
              <Input
                aria-label="Link URL"
                value={l.url}
                onChange={(e) =>
                  set('personal', {
                    ...p,
                    links: p.links.map((x) => (x.id === l.id ? { ...x, url: e.target.value } : x)),
                  })
                }
              />
              <RowTools
                label={`link ${i + 1}`}
                onUp={() => set('personal', { ...p, links: move(p.links, i, -1) })}
                onDown={() => set('personal', { ...p, links: move(p.links, i, 1) })}
                onRemove={() =>
                  set('personal', { ...p, links: p.links.filter((x) => x.id !== l.id) })
                }
              />
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() =>
              set('personal', {
                ...p,
                links: [...p.links, { id: newId('ln'), label: 'Website', url: '' }],
              })
            }
          >
            <Plus className="h-4 w-4" /> Add link
          </Button>
        </div>
      </Card>

      <Card title="Section order" description="Order in which sections appear in exports.">
        <ol className="grid gap-1 sm:grid-cols-2">
          {value.sectionOrder.map((s, i) => (
            <li
              key={s}
              className="flex items-center justify-between rounded-md border border-line px-3 py-1.5 text-sm"
            >
              <span>
                {i + 1}. {SECTION_LABELS[s]}
              </span>
              <span className="flex gap-1">
                <button
                  type="button"
                  aria-label={`Move ${SECTION_LABELS[s]} up`}
                  onClick={() => set('sectionOrder', move(value.sectionOrder, i, -1))}
                  className="rounded p-1 text-muted hover:bg-canvas"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label={`Move ${SECTION_LABELS[s]} down`}
                  onClick={() => set('sectionOrder', move(value.sectionOrder, i, 1))}
                  className="rounded p-1 text-muted hover:bg-canvas"
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
              </span>
            </li>
          ))}
        </ol>
      </Card>

      <Card title="Summary">
        <Textarea
          aria-label="Summary"
          rows={4}
          value={value.summary}
          onChange={(e) => set('summary', e.target.value)}
        />
      </Card>

      <Card title="Skills" description="Group with a category (optional), e.g. Languages, Cloud.">
        <div className="space-y-2">
          {value.skills.map((s, i) => (
            <div key={s.id} className="flex gap-2">
              <Input
                aria-label="Skill"
                value={s.name}
                onChange={(e) =>
                  set(
                    'skills',
                    value.skills.map((x) => (x.id === s.id ? { ...x, name: e.target.value } : x)),
                  )
                }
              />
              <Input
                aria-label="Category"
                className="w-48"
                placeholder="Category"
                value={s.category ?? ''}
                onChange={(e) =>
                  set(
                    'skills',
                    value.skills.map((x) =>
                      x.id === s.id ? { ...x, category: e.target.value || undefined } : x,
                    ),
                  )
                }
              />
              <RowTools
                label={s.name || 'skill'}
                onUp={() => set('skills', move(value.skills, i, -1))}
                onDown={() => set('skills', move(value.skills, i, 1))}
                onRemove={() =>
                  set(
                    'skills',
                    value.skills.filter((x) => x.id !== s.id),
                  )
                }
              />
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => set('skills', [...value.skills, { id: newId('sk'), name: '' }])}
          >
            <Plus className="h-4 w-4" /> Add skill
          </Button>
        </div>
      </Card>

      <Card title="Experience">
        <div className="space-y-4">
          {value.experience.map((e, i) => {
            const up = (patch: Partial<typeof e>) =>
              set(
                'experience',
                value.experience.map((x) => (x.id === e.id ? { ...x, ...patch } : x)),
              );
            return (
              <fieldset key={e.id} className="rounded-lg border border-line p-4">
                <legend className="sr-only">Role {i + 1}</legend>
                <div className="mb-3 flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold">
                    {[e.title, e.company].filter(Boolean).join(' at ') || `Role ${i + 1}`}
                  </p>
                  <RowTools
                    label={`role ${i + 1}`}
                    onUp={() => set('experience', move(value.experience, i, -1))}
                    onDown={() => set('experience', move(value.experience, i, 1))}
                    onRemove={() =>
                      set(
                        'experience',
                        value.experience.filter((x) => x.id !== e.id),
                      )
                    }
                  />
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <div>
                    <L htmlFor={`${e.id}-t`}>Title</L>
                    <Input
                      id={`${e.id}-t`}
                      value={e.title}
                      onChange={(ev) => up({ title: ev.target.value })}
                    />
                  </div>
                  <div>
                    <L htmlFor={`${e.id}-c`}>Company</L>
                    <Input
                      id={`${e.id}-c`}
                      value={e.company}
                      onChange={(ev) => up({ company: ev.target.value })}
                    />
                  </div>
                  <div>
                    <L htmlFor={`${e.id}-l`}>Location</L>
                    <Input
                      id={`${e.id}-l`}
                      value={e.location}
                      onChange={(ev) => up({ location: ev.target.value })}
                    />
                  </div>
                  <DateInput
                    id={`${e.id}-s`}
                    label="Start (YYYY-MM)"
                    value={e.startDate}
                    onChange={(v) => up({ startDate: v })}
                  />
                  <DateInput
                    id={`${e.id}-e`}
                    label="End (YYYY-MM)"
                    value={e.endDate}
                    onChange={(v) => up({ endDate: v })}
                  />
                  <label className="mt-6 flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={e.current}
                      onChange={(ev) =>
                        up({
                          current: ev.target.checked,
                          endDate: ev.target.checked ? null : e.endDate,
                        })
                      }
                    />{' '}
                    Current role
                  </label>
                </div>
                <div className="mt-3">
                  <Bullets prefix="b" items={e.bullets} onChange={(b) => up({ bullets: b })} />
                </div>
              </fieldset>
            );
          })}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() =>
              set('experience', [
                ...value.experience,
                {
                  id: newId('ex'),
                  title: '',
                  company: '',
                  location: '',
                  startDate: null,
                  endDate: null,
                  current: false,
                  bullets: [],
                },
              ])
            }
          >
            <Plus className="h-4 w-4" /> Add role
          </Button>
        </div>
      </Card>

      <Card title="Projects">
        <div className="space-y-4">
          {value.projects.map((pr, i) => {
            const up = (patch: Partial<typeof pr>) =>
              set(
                'projects',
                value.projects.map((x) => (x.id === pr.id ? { ...x, ...patch } : x)),
              );
            return (
              <div key={pr.id} className="rounded-lg border border-line p-4">
                <div className="mb-2 flex justify-end">
                  <RowTools
                    label={`project ${i + 1}`}
                    onUp={() => set('projects', move(value.projects, i, -1))}
                    onDown={() => set('projects', move(value.projects, i, 1))}
                    onRemove={() =>
                      set(
                        'projects',
                        value.projects.filter((x) => x.id !== pr.id),
                      )
                    }
                  />
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <div>
                    <L htmlFor={`${pr.id}-n`}>Name</L>
                    <Input
                      id={`${pr.id}-n`}
                      value={pr.name}
                      onChange={(ev) => up({ name: ev.target.value })}
                    />
                  </div>
                  <div>
                    <L htmlFor={`${pr.id}-r`}>Role</L>
                    <Input
                      id={`${pr.id}-r`}
                      value={pr.role}
                      onChange={(ev) => up({ role: ev.target.value })}
                    />
                  </div>
                  <div>
                    <L htmlFor={`${pr.id}-u`}>URL</L>
                    <Input
                      id={`${pr.id}-u`}
                      value={pr.url}
                      onChange={(ev) => up({ url: ev.target.value })}
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <Bullets prefix="pb" items={pr.bullets} onChange={(b) => up({ bullets: b })} />
                </div>
              </div>
            );
          })}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() =>
              set('projects', [
                ...value.projects,
                { id: newId('pr'), name: '', role: '', url: '', bullets: [] },
              ])
            }
          >
            <Plus className="h-4 w-4" /> Add project
          </Button>
        </div>
      </Card>

      <Card title="Education">
        <div className="space-y-3">
          {value.education.map((ed, i) => {
            const up = (patch: Partial<typeof ed>) =>
              set(
                'education',
                value.education.map((x) => (x.id === ed.id ? { ...x, ...patch } : x)),
              );
            return (
              <div
                key={ed.id}
                className="grid gap-3 rounded-lg border border-line p-4 md:grid-cols-3"
              >
                <div>
                  <L htmlFor={`${ed.id}-d`}>Degree</L>
                  <Input
                    id={`${ed.id}-d`}
                    value={ed.degree}
                    onChange={(ev) => up({ degree: ev.target.value })}
                  />
                </div>
                <div>
                  <L htmlFor={`${ed.id}-f`}>Field</L>
                  <Input
                    id={`${ed.id}-f`}
                    value={ed.field}
                    onChange={(ev) => up({ field: ev.target.value })}
                  />
                </div>
                <div>
                  <L htmlFor={`${ed.id}-i`}>Institution</L>
                  <Input
                    id={`${ed.id}-i`}
                    value={ed.institution}
                    onChange={(ev) => up({ institution: ev.target.value })}
                  />
                </div>
                <DateInput
                  id={`${ed.id}-s`}
                  label="Start"
                  value={ed.startDate}
                  onChange={(v) => up({ startDate: v })}
                />
                <DateInput
                  id={`${ed.id}-e`}
                  label="End"
                  value={ed.endDate}
                  onChange={(v) => up({ endDate: v })}
                />
                <div className="flex items-end justify-between gap-2">
                  <div className="flex-1">
                    <L htmlFor={`${ed.id}-x`}>Details</L>
                    <Input
                      id={`${ed.id}-x`}
                      value={ed.details}
                      onChange={(ev) => up({ details: ev.target.value })}
                    />
                  </div>
                  <RowTools
                    label={`education ${i + 1}`}
                    onUp={() => set('education', move(value.education, i, -1))}
                    onDown={() => set('education', move(value.education, i, 1))}
                    onRemove={() =>
                      set(
                        'education',
                        value.education.filter((x) => x.id !== ed.id),
                      )
                    }
                  />
                </div>
              </div>
            );
          })}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() =>
              set('education', [
                ...value.education,
                {
                  id: newId('ed'),
                  institution: '',
                  degree: '',
                  field: '',
                  startDate: null,
                  endDate: null,
                  details: '',
                },
              ])
            }
          >
            <Plus className="h-4 w-4" /> Add education
          </Button>
        </div>
      </Card>

      <Card title="Certifications">
        <div className="space-y-2">
          {value.certifications.map((c, i) => (
            <div key={c.id} className="flex flex-wrap gap-2">
              <Input
                aria-label="Certification name"
                className="min-w-60 flex-1"
                value={c.name}
                onChange={(e) =>
                  set(
                    'certifications',
                    value.certifications.map((x) =>
                      x.id === c.id ? { ...x, name: e.target.value } : x,
                    ),
                  )
                }
              />
              <Input
                aria-label="Issuer"
                className="w-48"
                placeholder="Issuer"
                value={c.issuer}
                onChange={(e) =>
                  set(
                    'certifications',
                    value.certifications.map((x) =>
                      x.id === c.id ? { ...x, issuer: e.target.value } : x,
                    ),
                  )
                }
              />
              <Input
                aria-label="Year"
                className="w-28"
                placeholder="YYYY"
                value={c.date ?? ''}
                onChange={(e) =>
                  set(
                    'certifications',
                    value.certifications.map((x) =>
                      x.id === c.id ? { ...x, date: e.target.value || null } : x,
                    ),
                  )
                }
              />
              <RowTools
                label={`certification ${i + 1}`}
                onUp={() => set('certifications', move(value.certifications, i, -1))}
                onDown={() => set('certifications', move(value.certifications, i, 1))}
                onRemove={() =>
                  set(
                    'certifications',
                    value.certifications.filter((x) => x.id !== c.id),
                  )
                }
              />
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() =>
              set('certifications', [
                ...value.certifications,
                { id: newId('ce'), name: '', issuer: '', date: null },
              ])
            }
          >
            <Plus className="h-4 w-4" /> Add certification
          </Button>
        </div>
      </Card>

      {(['achievements', 'publications'] as const).map((key) => (
        <Card key={key} title={SECTION_LABELS[key]}>
          <Bullets prefix={key.slice(0, 2)} items={value[key]} onChange={(b) => set(key, b)} />
        </Card>
      ))}

      <Card title="Languages">
        <div className="space-y-2">
          {value.languages.map((l, i) => (
            <div key={l.id} className="flex gap-2">
              <Input
                aria-label="Language"
                value={l.name}
                onChange={(e) =>
                  set(
                    'languages',
                    value.languages.map((x) =>
                      x.id === l.id ? { ...x, name: e.target.value } : x,
                    ),
                  )
                }
              />
              <Input
                aria-label="Proficiency"
                className="w-48"
                placeholder="e.g. Fluent, C1"
                value={l.proficiency}
                onChange={(e) =>
                  set(
                    'languages',
                    value.languages.map((x) =>
                      x.id === l.id ? { ...x, proficiency: e.target.value } : x,
                    ),
                  )
                }
              />
              <RowTools
                label={l.name || 'language'}
                onUp={() => set('languages', move(value.languages, i, -1))}
                onDown={() => set('languages', move(value.languages, i, 1))}
                onRemove={() =>
                  set(
                    'languages',
                    value.languages.filter((x) => x.id !== l.id),
                  )
                }
              />
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() =>
              set('languages', [...value.languages, { id: newId('la'), name: '', proficiency: '' }])
            }
          >
            <Plus className="h-4 w-4" /> Add language
          </Button>
        </div>
      </Card>

      <Card title="Custom sections">
        <div className="space-y-4">
          {value.custom.map((c) => (
            <div key={c.id} className="rounded-lg border border-line p-4">
              <div className="mb-2 flex gap-2">
                <Input
                  aria-label="Section title"
                  value={c.title}
                  onChange={(e) =>
                    set(
                      'custom',
                      value.custom.map((x) =>
                        x.id === c.id ? { ...x, title: e.target.value } : x,
                      ),
                    )
                  }
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    set(
                      'custom',
                      value.custom.filter((x) => x.id !== c.id),
                    )
                  }
                  aria-label="Remove section"
                >
                  <Trash2 className="h-4 w-4 text-missing" />
                </Button>
              </div>
              <Bullets
                prefix="ci"
                items={c.items}
                onChange={(items) =>
                  set(
                    'custom',
                    value.custom.map((x) => (x.id === c.id ? { ...x, items } : x)),
                  )
                }
              />
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() =>
              set('custom', [...value.custom, { id: newId('cu'), title: 'New section', items: [] }])
            }
          >
            <Plus className="h-4 w-4" /> Add custom section
          </Button>
        </div>
      </Card>
    </div>
  );
}

/** Read-only rendering of a resume version. */
export function ResumeView({ value }: { value: ResumeContent }) {
  const p = value.personal;
  return (
    <article className="rounded-xl border border-line bg-white p-6 text-sm leading-relaxed">
      <h2 className="text-xl font-semibold">{p.fullName || 'Unnamed'}</h2>
      {p.headline && <p className="text-muted">{p.headline}</p>}
      <p className="mt-1 text-xs text-muted">
        {[p.email, p.phone, p.location, ...p.links.map((l) => l.url)].filter(Boolean).join(' · ')}
      </p>
      {value.sectionOrder.map((s) => {
        const h = (
          <h3 className="mt-5 border-b border-line pb-1 text-xs font-semibold uppercase tracking-wider text-muted">
            {SECTION_LABELS[s]}
          </h3>
        );
        switch (s) {
          case 'summary':
            return value.summary ? (
              <section key={s}>
                {h}
                <p className="mt-2 whitespace-pre-line">{value.summary}</p>
              </section>
            ) : null;
          case 'skills':
            return value.skills.length ? (
              <section key={s}>
                {h}
                <p className="mt-2">{value.skills.map((k) => k.name).join(', ')}</p>
              </section>
            ) : null;
          case 'experience':
            return value.experience.length ? (
              <section key={s}>
                {h}
                {value.experience.map((e) => (
                  <div key={e.id} className="mt-3">
                    <p className="font-medium">{[e.title, e.company].filter(Boolean).join(', ')}</p>
                    <p className="text-xs text-muted">
                      {[e.startDate, e.current ? 'Present' : e.endDate].filter(Boolean).join(' – ')}
                      {e.location ? ` · ${e.location}` : ''}
                    </p>
                    <ul className="mt-1 list-disc pl-5">
                      {e.bullets.map((b) => (
                        <li key={b.id}>{b.text}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            ) : null;
          case 'projects':
            return value.projects.length ? (
              <section key={s}>
                {h}
                {value.projects.map((pr) => (
                  <div key={pr.id} className="mt-2">
                    <p className="font-medium">
                      {pr.name}
                      {pr.role ? ` — ${pr.role}` : ''}
                    </p>
                    <ul className="list-disc pl-5">
                      {pr.bullets.map((b) => (
                        <li key={b.id}>{b.text}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            ) : null;
          case 'education':
            return value.education.length ? (
              <section key={s}>
                {h}
                {value.education.map((ed) => (
                  <p key={ed.id} className="mt-2">
                    {[[ed.degree, ed.field].filter(Boolean).join(' in '), ed.institution]
                      .filter(Boolean)
                      .join(', ')}{' '}
                    <span className="text-xs text-muted">{ed.endDate}</span>
                  </p>
                ))}
              </section>
            ) : null;
          case 'certifications':
            return value.certifications.length ? (
              <section key={s}>
                {h}
                <ul className="mt-2 list-disc pl-5">
                  {value.certifications.map((c) => (
                    <li key={c.id}>{[c.name, c.issuer, c.date].filter(Boolean).join(' — ')}</li>
                  ))}
                </ul>
              </section>
            ) : null;
          case 'achievements':
          case 'publications':
            return value[s].length ? (
              <section key={s}>
                {h}
                <ul className="mt-2 list-disc pl-5">
                  {value[s].map((a) => (
                    <li key={a.id}>{a.text}</li>
                  ))}
                </ul>
              </section>
            ) : null;
          case 'languages':
            return value.languages.length ? (
              <section key={s}>
                {h}
                <p className="mt-2">
                  {value.languages
                    .map((l) => (l.proficiency ? `${l.name} (${l.proficiency})` : l.name))
                    .join(', ')}
                </p>
              </section>
            ) : null;
          case 'custom':
            return value.custom.map((c) =>
              c.items.length ? (
                <section key={c.id}>
                  <h3 className="mt-5 border-b border-line pb-1 text-xs font-semibold uppercase tracking-wider text-muted">
                    {c.title}
                  </h3>
                  <ul className="mt-2 list-disc pl-5">
                    {c.items.map((it) => (
                      <li key={it.id}>{it.text}</li>
                    ))}
                  </ul>
                </section>
              ) : null,
            );
          default:
            return null;
        }
      })}
    </article>
  );
}

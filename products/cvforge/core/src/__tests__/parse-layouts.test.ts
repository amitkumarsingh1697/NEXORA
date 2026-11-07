import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractDocument } from '../resume/extract';
import { parseResumeText, type ParseResult } from '../resume/parse';

/**
 * Regression tests for the resume-extraction defects reported on 2026-11-06 with a real
 * resume (three-page PDF exported from a word processor). `layout-two-line-header.pdf`
 * redraws that PDF's text items at their original positions, fonts and widths with the
 * contact details replaced, so these tests exercise the same layout: ALL-CAPS name,
 * wrapped skill lines with bracketed groups, "Title <gap> Dates" over "Company <gap>
 * Location", hanging-indent bullets that wrap, sub-bullets, title + paragraph projects.
 * `layout-company-first.*` is a second synthetic layout (generator in fixtures/generators).
 */
const fixture = (name: string) =>
  new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));

async function parseFile(name: string): Promise<ParseResult> {
  const ex = await extractDocument(fixture(name));
  return parseResumeText(ex.text);
}

function expectTwoLineHeaderResume(r: ParseResult) {
  const c = r.content;
  // 1. Personal information is filled, and the name is not mistaken for a section.
  expect(c.personal).toMatchObject({
    fullName: 'ARJUN VERMA',
    headline: 'Senior Java Full Stack Developer | AI-Agentic Development',
    email: 'arjun.verma@example.com',
    phone: '+91-9000000001',
  });
  expect(c.custom.map((s) => s.title)).toEqual(['LEADERSHIP & MENTORSHIP']);
  // 2./3. Every skill has its category; bracketed groups and wrapped lines stay whole.
  expect(c.skills.every((s) => s.category)).toBe(true);
  const names = c.skills.map((s) => s.name);
  expect(names).toEqual(
    expect.arrayContaining([
      'LLM API Integration (function-calling, tool-use)',
      'Software Development Methodologies (Scrum, Agile, Kanban)',
      'Spring Framework (Core, Boot, MVC)',
      'Elastic Stack (Elasticsearch, Kibana)',
      'Build Tools (Ant, Maven, Gradle)',
      'Scalable System Design',
    ]),
  );
  expect(names.some((n) => /^\(|\)$/.test(n) && !n.includes('('))).toBe(false);
  expect(names.filter((n) => parenBalance(n) !== 0)).toEqual([]);
  expect(c.skills.find((s) => s.name === 'Microservices Architecture')?.category).toBe('Backend');
  expect(c.skills.find((s) => s.name === 'Prompt Engineering')?.category).toBe(
    'AI & Agentic Development',
  );
  expect(c.skills).toHaveLength(60);
  // 4. One experience entry per job, with the right fields, and every bullet kept whole.
  expect(
    c.experience.map((e) => [e.title, e.company, e.location, e.startDate, e.endDate, e.current]),
  ).toEqual([
    ['Senior Developer', 'Northwind (Client: Contoso)', 'Noida, India', '2024-10', null, true],
    [
      'Associate Technical Lead',
      'Fabrikam (Client: Tailspin Hardware Inc)',
      'Gurgaon, India',
      '2021-09',
      '2024-10',
      false,
    ],
    [
      'Senior Software Engineer',
      'Litware (Client: Woodgrove Investment Bank Ltd)',
      'Pune, India',
      '2019-12',
      '2021-09',
      false,
    ],
    ['Software Engineer', 'Q7Logic Technology', 'Noida, India', '2019-03', '2019-11', false],
  ]);
  expect(c.experience.map((e) => e.bullets.length)).toEqual([12, 8, 8, 6]);
  const first = c.experience[0]?.bullets.map((b) => b.text) ?? [];
  expect(first[0]).toBe(
    'Working with a modern tech stack that includes Java 17, Docker, Google Cloud Platform (GCP), BigQuery, Cloud Data Fusion (CDF), and Data Transfer Service (DTS), along with multiple databases such as CData, MySQL, SQL Server, MongoDB, and Oracle, to build scalable, cloud-native data integration solutions.',
  );
  expect(first[8]).toBe('Key Project: AI-Powered PR/CL Code Review Agent');
  // 5. Projects: one entry per project, its description intact.
  expect(c.projects.map((p) => [p.name, p.bullets.length])).toEqual([
    ['Prompt Smith – AI Prompt Refinement Engine', 1],
    ['Airline Reservation System', 1],
    ['Banking Management System', 1],
    ['Campus Planner – Classroom Scheduling System', 1],
    ['Grade Sense – Student Performance Predictor', 1],
  ]);
  expect(c.projects[3]?.bullets[0]?.text).toMatch(
    /allocations\. Helped simulate real-time conflict resolution .* institutions\.$/,
  );
  // 6. Education: every field that the resume states.
  expect(
    c.education.map((e) => [e.institution, e.degree, e.field, e.startDate, e.endDate, e.details]),
  ).toEqual([
    [
      'Dr. A.B.C. Example Technical University',
      'BTech',
      'Computer Science and Engineering',
      '2015-08',
      '2019-06',
      '71.18%',
    ],
    ['Elm Public School', 'Higher Secondary Certificate', '', '2013-04', '2014-03', '68%'],
    ['Elm Public School', 'Secondary School Certificate', '', '2011-04', '2012-03', 'CGPA: 7.8'],
  ]);
  // 7. Custom sections hold one item per bullet; achievements keep title and description.
  expect(c.custom[0]?.items).toHaveLength(4);
  expect(c.custom[0]?.items[0]?.text).toBe(
    'Mentored junior developers across multiple projects, offering guidance on code quality, design patterns, and best practices, leading to a 30% increase in team productivity.',
  );
  expect(c.achievements.map((a) => a.text)).toEqual([
    'Best Annual Performance: Consistently awarded the highest annual performance rating throughout my tenure, placing me among the top ~5% of employees.',
  ]);
  expect(c.certifications.map((x) => x.name)).toEqual([
    'Oracle Certified Professional: Java SE 8 Programmer',
    'Oracle Certified Associate: Java SE 8 Programmer',
  ]);
  expect(c.summary).toMatch(/^Full Stack Java Developer .* complex business needs\.$/);
  expect(r.unassignedLines).toEqual([]);
}

function parenBalance(s: string) {
  return (s.match(/\(/g)?.length ?? 0) - (s.match(/\)/g)?.length ?? 0);
}

describe('real-resume layout: title/dates over company/location (PDF)', () => {
  it('extracts every section correctly', async () => {
    const r = await parseFile('layout-two-line-header.pdf');
    expectTwoLineHeaderResume(r);
    // The visible "LinkedIn" label has no address in the file: flagged, not invented.
    expect(r.content.personal.links).toEqual([]);
    expect(r.warnings.join(' ')).toMatch(/shows "LinkedIn" but the file does not contain/);
    expect(r.confidence.overall).toBeGreaterThan(0.85);
  });

  it('rejoins wrapped PDF lines using the page layout', async () => {
    const ex = await extractDocument(fixture('layout-two-line-header.pdf'));
    expect(ex.lines).toContain(
      'AI & Agentic Development: GitHub Copilot, Claude Code, Cursor (AI-augmented development workflows); LLM API Integration (function-calling, tool-use); Prompt Engineering; Agentic Workflow Design; Retrieval-Augmented Generation (RAG) concepts',
    );
    expect(ex.lines).toContain('Senior Developer\tOctober 2024 - Current');
    expect(ex.lines).toContain('Northwind (Client: Contoso)\tNoida, India');
    // Headings and bold titles are never glued onto the paragraph above them.
    expect(ex.lines).toContain('PERSONAL PROJECTS');
    expect(ex.lines).toContain('Airline Reservation System');
  });
});

describe('same resume as plain text with hard line wraps (pdftotext output)', () => {
  it('still keeps jobs, bullets, brackets and education together', () => {
    const text = readFileSync(
      new URL('./fixtures/layout-two-line-header.pdftotext.txt', import.meta.url),
      'utf8',
    );
    const c = parseResumeText(text).content;
    expect(c.personal.fullName).toBe('ARJUN VERMA');
    expect(c.experience.map((e) => [e.title, e.company, e.location])).toEqual([
      ['Senior Developer', 'Northwind (Client: Contoso)', 'Noida, India'],
      ['Associate Technical Lead', 'Fabrikam (Client: Tailspin Hardware Inc)', 'Gurgaon, India'],
      [
        'Senior Software Engineer',
        'Litware (Client: Woodgrove Investment Bank Ltd)',
        'Pune, India',
      ],
      ['Software Engineer', 'Q7Logic Technology', 'Noida, India'],
    ]);
    expect(c.experience.every((e) => e.bullets.every((b) => !/^[●○]$/.test(b.text)))).toBe(true);
    expect(c.skills.map((s) => s.name)).toEqual(
      expect.arrayContaining([
        'LLM API Integration (function-calling, tool-use)',
        'Software Development Methodologies (Scrum, Agile, Kanban)',
      ]),
    );
    expect(c.skills.filter((s) => parenBalance(s.name) !== 0)).toEqual([]);
    expect(c.skills.every((s) => s.category)).toBe(true);
    expect(c.education.map((e) => e.institution)).toEqual([
      'Dr. A.B.C. Example Technical University',
      'Elm Public School',
      'Elm Public School',
    ]);
    expect(c.projects).toHaveLength(5);
  });
});

describe('company-first layout with Word bullets (DOCX and its PDF export)', () => {
  for (const file of ['layout-company-first.docx', 'layout-company-first.pdf']) {
    it(`extracts every section from ${file}`, async () => {
      const r = await parseFile(file);
      const c = r.content;
      expect(c.personal).toMatchObject({
        fullName: 'NEHA KAPOOR',
        headline: 'Lead Backend Engineer',
        email: 'neha.kapoor@example.com',
        phone: '+91 90000 00002',
        location: 'Bengaluru, India',
      });
      // The LinkedIn label is a hyperlink; its address is recovered from the file.
      expect(c.personal.links).toEqual([
        expect.objectContaining({
          label: 'LinkedIn',
          url: 'https://www.linkedin.com/in/neha-kapoor-example',
        }),
      ]);
      expect(c.skills.find((s) => s.name === 'AWS (EKS, Lambda, SQS)')?.category).toBe(
        'Cloud & Infrastructure',
      );
      expect(
        c.experience.map((e) => [e.title, e.company, e.location, e.startDate, e.endDate]),
      ).toEqual([
        ['Lead Backend Engineer', 'Acme Logistics Pvt Ltd', 'Bengaluru, India', '2021-01', null],
        ['Senior Software Engineer', 'Globex Fintech', 'Pune, India', '2017-07', '2020-12'],
        ['Software Engineer', 'Initech Systems', 'Noida, India', '2015-06', '2017-06'],
      ]);
      // The description paragraph is the first bullet of its job, not a job of its own.
      expect(c.experience[0]?.bullets.map((b) => b.text.slice(0, 22))).toEqual([
        'Own the shipment-track',
        'Re-architected the tra',
        'Introduced contract te',
        'Mentored four engineer',
      ]);
      expect(c.experience[0]?.bullets[1]?.text).toMatch(/during festive peaks\.$/);
      expect(c.projects.map((p) => [p.name, p.url, p.bullets.length])).toEqual([
        ['OpenRoute – Route Optimisation Library', 'github.com/example/openroute', 2],
        ['Expense Splitter', '', 1],
      ]);
      expect(
        c.education.map((e) => [
          e.institution,
          e.degree,
          e.field,
          e.startDate,
          e.endDate,
          e.details,
        ]),
      ).toEqual([
        [
          'RV College of Engineering',
          'B.E.',
          'Electronics and Communication',
          '2011',
          '2015',
          'CGPA 8.2/10',
        ],
        ['Kendriya Vidyalaya', 'Class XII', 'CBSE', null, '2011', '91%'],
      ]);
      expect(c.certifications.map((x) => [x.name, x.issuer, x.date])).toEqual([
        ['AWS Certified Solutions Architect – Professional', 'Amazon Web Services', '2022'],
        ['Certified Kubernetes Administrator (CKA)', 'CNCF', '2021'],
      ]);
      // Personal Details: languages go to Languages; facts without a field stay together.
      expect(c.languages.map((l) => l.name)).toEqual(['English', 'Hindi', 'Kannada']);
      expect(c.custom).toEqual([
        expect.objectContaining({
          title: 'PERSONAL DETAILS',
          items: [
            expect.objectContaining({ text: 'Date of Birth: 01 January 1993' }),
            expect.objectContaining({ text: 'Nationality: Indian' }),
          ],
        }),
      ]);
      expect(r.unassignedLines).toEqual([]);
      expect(r.warnings).toEqual([]);
    });
  }
});

describe('parser edge cases', () => {
  it('does not treat an ALL-CAPS name or headline at the top as a section', () => {
    const r = parseResumeText(
      'JOHN DOE\nDATA ENGINEER\njohn@example.com\nSKILLS\nPython, SQL\nVOLUNTEERING\n• Taught coding at a local school',
    );
    expect(r.content.personal.fullName).toBe('JOHN DOE');
    expect(r.content.personal.headline).toBe('DATA ENGINEER');
    expect(r.content.custom.map((c) => c.title)).toEqual(['VOLUNTEERING']);
  });

  it('keeps comma lists inside brackets as one skill and joins bracket continuations', () => {
    const r = parseResumeText(
      'A Person\na@example.com\nSKILLS\nTools: Git, Build Tools (Ant,\nMaven, Gradle), LLM API Integration\n(function-calling, tool-use)\nDocker',
    );
    expect(r.content.skills.map((s) => [s.name, s.category])).toEqual([
      ['Git', 'Tools'],
      ['Build Tools (Ant, Maven, Gradle)', 'Tools'],
      ['LLM API Integration (function-calling, tool-use)', 'Tools'],
      ['Docker', 'Tools'],
    ]);
  });

  it('joins wrapped bullet lines instead of starting new jobs', () => {
    const r = parseResumeText(
      [
        'A Person',
        'a@example.com',
        'EXPERIENCE',
        'Senior Engineer | Acme | Pune',
        'Jan 2020 - Present',
        '• Led the migration of the billing platform to Kubernetes, reducing deploy time by',
        'half and cutting incidents, with the lead architect',
        '• Mentored engineers',
        'Engineer, Beta Ltd, Mumbai',
        'Jun 2017 - Dec 2019',
        '• Built APIs',
      ].join('\n'),
    );
    expect(
      r.content.experience.map((e) => [e.title, e.company, e.location, e.bullets.length]),
    ).toEqual([
      ['Senior Engineer', 'Acme', 'Pune', 2],
      ['Engineer', 'Beta Ltd', 'Mumbai', 1],
    ]);
    expect(r.content.experience[0]?.bullets[0]?.text).toMatch(/by half and cutting incidents/);
  });

  it('keeps over-long content within limits instead of failing the upload', () => {
    const long = `${'Delivered a measurable improvement to the platform. '.repeat(60)}`.trim();
    const r = parseResumeText(`A Person\na@example.com\nPROJECTS\nBig Project\n${long}`);
    const bullets = r.content.projects[0]?.bullets ?? [];
    expect(bullets.length).toBeGreaterThan(1);
    expect(bullets.every((b) => b.text.length <= 1500)).toBe(true);
    expect(bullets.map((b) => b.text).join(' ')).toBe(long);
  });
});

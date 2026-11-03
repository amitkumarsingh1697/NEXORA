import { describe, expect, it } from 'vitest';
import { parseResumeText, detectHeading } from '../resume/parse';
import { parseDateRange, normaliseDate } from '../resume/dates';
import { SAMPLE_RESUME_TEXT } from './fixtures/samples';

describe('dates', () => {
  it('normalises common formats', () => {
    expect(normaliseDate('Jan 2019')).toBe('2019-01');
    expect(normaliseDate('September 2020')).toBe('2020-09');
    expect(normaliseDate('03/2018')).toBe('2018-03');
    expect(normaliseDate('2015')).toBe('2015');
    expect(normaliseDate('13/2018')).toBeNull();
  });
  it('parses ranges including present', () => {
    expect(parseDateRange('Jan 2019 – Present')).toMatchObject({
      start: '2019-01',
      end: null,
      current: true,
    });
    expect(parseDateRange('Jun 2015 - Dec 2018')).toMatchObject({
      start: '2015-06',
      end: '2018-12',
      current: false,
    });
  });
});

describe('detectHeading', () => {
  it('recognises synonyms and custom all-caps headings', () => {
    expect(detectHeading('Work Experience:')).toBe('experience');
    expect(detectHeading('CORE COMPETENCIES')).toBe('skills');
    expect(detectHeading('VOLUNTEERING')).toBe('custom');
    expect(detectHeading('Designed and built Java services')).toBeNull();
  });
});

describe('parseResumeText', () => {
  const r = parseResumeText(SAMPLE_RESUME_TEXT);
  it('extracts personal details', () => {
    expect(r.content.personal.fullName).toBe('Priya Sharma');
    expect(r.content.personal.email).toBe('priya.sharma@example.com');
    expect(r.content.personal.phone).toContain('98765');
    expect(r.content.personal.location).toBe('Pune, India');
    expect(r.content.personal.links[0]?.label).toBe('LinkedIn');
    expect(r.content.personal.headline).toBe('Senior Software Engineer');
  });
  it('extracts skills with categories', () => {
    const names = r.content.skills.map((s) => s.name);
    expect(names).toEqual(expect.arrayContaining(['Java', 'Spring Boot', 'AWS', 'Docker']));
    expect(r.content.skills.find((s) => s.name === 'Java')?.category).toBe('Languages');
  });
  it('extracts experience entries with dates and bullets', () => {
    expect(r.content.experience).toHaveLength(2);
    const [a, b] = r.content.experience;
    expect(a).toMatchObject({
      title: 'Senior Software Engineer',
      company: 'FinPay Technologies',
      location: 'Pune',
      startDate: '2019-01',
      current: true,
    });
    expect(a?.bullets).toHaveLength(4);
    expect(b).toMatchObject({
      title: 'Software Engineer',
      company: 'DataWorks Ltd',
      startDate: '2015-06',
      endDate: '2018-12',
    });
  });
  it('extracts education, certifications and languages', () => {
    expect(r.content.education[0]).toMatchObject({
      degree: 'B.Tech',
      field: 'Computer Science',
      institution: 'Pune Institute of Technology',
      endDate: '2015',
    });
    expect(r.content.certifications[0]?.name).toContain('AWS Certified');
    expect(r.content.languages.map((l) => l.name)).toEqual(['English', 'Hindi']);
  });
  it('reports confidence and preserves section order', () => {
    expect(r.confidence.overall).toBeGreaterThan(0.7);
    expect(r.content.sectionOrder.slice(0, 3)).toEqual(['summary', 'skills', 'experience']);
    expect(r.unassignedLines).toEqual([]);
  });
  it('flags missing content instead of inventing it', () => {
    const p = parseResumeText('Just a name\nSome random text');
    expect(p.warnings.join(' ')).toMatch(/No employment history/);
    expect(p.content.experience).toHaveLength(0);
  });
});

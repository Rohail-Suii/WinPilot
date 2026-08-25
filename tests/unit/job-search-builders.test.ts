import { describe, it, expect } from 'vitest';
import {
  splitKeywords,
  buildLinkedInSearchURL,
  buildIndeedSearchURL,
} from '@/lib/services/job-search-builders';

describe('splitKeywords', () => {
  it('splits, trims, and dedupes comma-separated phrases', () => {
    expect(splitKeywords('React, Node.js , React, backend')).toEqual([
      'React',
      'Node.js',
      'backend',
    ]);
  });

  it('returns an empty array for blank input', () => {
    expect(splitKeywords('')).toEqual([]);
    expect(splitKeywords('   ')).toEqual([]);
  });
});

describe('buildLinkedInSearchURL', () => {
  it('builds a URL with keywords, location, date range, experience, remote and easy-apply', () => {
    const url = buildLinkedInSearchURL(
      {
        location: 'San Francisco',
        remote: true,
        experienceLevel: ['entry', 'mid-senior'],
        datePosted: 'past-week',
        easyApplyOnly: true,
      },
      'Software Engineer'
    );
    const parsed = new URL(url);
    expect(parsed.hostname).toBe('www.linkedin.com');
    expect(parsed.searchParams.get('keywords')).toBe('Software Engineer');
    expect(parsed.searchParams.get('location')).toBe('San Francisco');
    expect(parsed.searchParams.get('f_TPR')).toBe('r604800');
    expect(parsed.searchParams.get('f_E')).toBe('2,4');
    expect(parsed.searchParams.get('f_WT')).toBe('2');
    expect(parsed.searchParams.get('f_AL')).toBe('true');
  });

  it('omits optional params when not set', () => {
    const url = buildLinkedInSearchURL({}, 'Designer');
    const parsed = new URL(url);
    expect(parsed.searchParams.has('location')).toBe(false);
    expect(parsed.searchParams.has('f_TPR')).toBe(false);
    expect(parsed.searchParams.has('f_E')).toBe(false);
    expect(parsed.searchParams.has('f_WT')).toBe(false);
    expect(parsed.searchParams.has('f_AL')).toBe(false);
  });
});

describe('buildIndeedSearchURL', () => {
  it('builds a URL with keywords, location, and date range', () => {
    const url = buildIndeedSearchURL(
      { location: 'Austin, TX', datePosted: 'past-24h' },
      'Backend Engineer'
    );
    const parsed = new URL(url);
    expect(parsed.hostname).toBe('www.indeed.com');
    expect(parsed.pathname).toBe('/jobs');
    expect(parsed.searchParams.get('q')).toBe('Backend Engineer');
    expect(parsed.searchParams.get('l')).toBe('Austin, TX');
    expect(parsed.searchParams.get('fromage')).toBe('1');
  });

  it('uses "Remote" as the location when remote is set, overriding an explicit location', () => {
    const url = buildIndeedSearchURL({ location: 'Austin, TX', remote: true }, 'Backend Engineer');
    expect(new URL(url).searchParams.get('l')).toBe('Remote');
  });

  it('omits l and fromage when neither location nor remote nor datePosted is set', () => {
    const url = buildIndeedSearchURL({}, 'Designer');
    const parsed = new URL(url);
    expect(parsed.searchParams.has('l')).toBe(false);
    expect(parsed.searchParams.has('fromage')).toBe(false);
  });

  it('has no query-param collisions with the LinkedIn builder', () => {
    const linkedinUrl = new URL(buildLinkedInSearchURL({ location: 'X', remote: true, datePosted: 'past-week' }, 'k'));
    const indeedUrl = new URL(buildIndeedSearchURL({ location: 'X', remote: true, datePosted: 'past-week' }, 'k'));
    const linkedinParams = new Set(linkedinUrl.searchParams.keys());
    const indeedParams = new Set(indeedUrl.searchParams.keys());
    for (const p of indeedParams) expect(linkedinParams.has(p)).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import { parseIndeedJobUrl, parseIndeedJobListUrl, buildIndeedJobUrl } from '@/lib/utils/indeed-url';

describe('parseIndeedJobUrl', () => {
  it('parses a viewjob permalink', () => {
    expect(parseIndeedJobUrl('https://www.indeed.com/viewjob?jk=abc123de')).toEqual({
      jobId: 'abc123de',
      jobUrl: 'https://www.indeed.com/viewjob?jk=abc123de',
    });
  });

  it('parses a tracked redirect link', () => {
    expect(
      parseIndeedJobUrl('https://www.indeed.com/rc/clk?jk=abc123de&fccid=deadbeef&vjs=3')?.jobId
    ).toBe('abc123de');
  });

  it('parses a pagead click link', () => {
    expect(
      parseIndeedJobUrl('https://www.indeed.com/pagead/clk?jk=abc123de&mo=r')?.jobId
    ).toBe('abc123de');
  });

  it('accepts a bare job id and a host without a scheme', () => {
    expect(parseIndeedJobUrl('abc123de')?.jobUrl).toBe(buildIndeedJobUrl('abc123de'));
    expect(parseIndeedJobUrl('indeed.com/viewjob?jk=abc123de')?.jobId).toBe('abc123de');
  });

  it('lowercases the job id', () => {
    expect(parseIndeedJobUrl('ABC123DE')?.jobId).toBe('abc123de');
  });

  it('rejects non-Indeed and id-less links', () => {
    expect(parseIndeedJobUrl('https://example.com/viewjob?jk=abc123de')).toBeNull();
    expect(parseIndeedJobUrl('https://www.indeed.com/jobs?q=engineer')).toBeNull();
    expect(parseIndeedJobUrl('not a url')).toBeNull();
    expect(parseIndeedJobUrl('')).toBeNull();
  });
});

describe('parseIndeedJobListUrl', () => {
  const searchUrl =
    'https://www.indeed.com/jobs?q=software+engineer&l=Remote&vjk=abc123de&tk=1h2i3j4k5l&advn=987654321';

  it('recognizes a search-results page and keeps the params that rebuild it', () => {
    const parsed = parseIndeedJobListUrl(searchUrl);
    expect(parsed).not.toBeNull();
    expect(parsed!.listUrl).toContain('q=software+engineer');
    expect(parsed!.listUrl).toContain('l=Remote');
    expect(parsed!.listUrl).not.toContain('tk=');
    expect(parsed!.listUrl).not.toContain('advn=');
  });

  it('lists the job id the link names via vjk', () => {
    expect(parseIndeedJobListUrl(searchUrl)!.jobIds).toEqual(['abc123de']);
  });

  it('rejects single job pages and non-list pages', () => {
    expect(parseIndeedJobListUrl('https://www.indeed.com/viewjob?jk=abc123de')).toBeNull();
    expect(parseIndeedJobListUrl('https://www.indeed.com/')).toBeNull();
    expect(parseIndeedJobListUrl('https://example.com/jobs?q=engineer')).toBeNull();
  });
});

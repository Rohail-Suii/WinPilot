import { describe, it, expect } from 'vitest';
import { parseLinkedInJobUrl, parseLinkedInJobListUrl, buildJobUrl } from '@/lib/utils/linkedin-url';

describe('parseLinkedInJobUrl', () => {
  it('parses a job permalink', () => {
    expect(parseLinkedInJobUrl('https://www.linkedin.com/jobs/view/4453464449/')).toEqual({
      jobId: '4453464449',
      jobUrl: 'https://www.linkedin.com/jobs/view/4453464449/',
    });
  });

  it('parses a slugged permalink', () => {
    expect(
      parseLinkedInJobUrl('https://www.linkedin.com/jobs/view/senior-engineer-at-acme-4453464449?refId=abc')
    ).toEqual({ jobId: '4453464449', jobUrl: buildJobUrl('4453464449') });
  });

  it('parses a search-results URL with currentJobId', () => {
    const url =
      'https://www.linkedin.com/jobs/search-results/?currentJobId=4453464449&trackingId=UgLYU4%2F2THGBmEG1jkT%2BmA%3D%3D&origin=QUALIFICATION_BOARD_FEED_MIXER_LANDING&originToLandingJobPostings=4453464449%2C4452849001';
    expect(parseLinkedInJobUrl(url)?.jobId).toBe('4453464449');
  });

  it('parses a collections feed URL', () => {
    expect(
      parseLinkedInJobUrl('https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4449145152')?.jobId
    ).toBe('4449145152');
  });

  it('falls back to the first originToLandingJobPostings entry', () => {
    expect(
      parseLinkedInJobUrl('https://www.linkedin.com/jobs/search-results/?originToLandingJobPostings=4452849001%2C4447355619')?.jobId
    ).toBe('4452849001');
  });

  it('accepts a bare job id and a host without a scheme', () => {
    expect(parseLinkedInJobUrl('4453464449')?.jobUrl).toBe(buildJobUrl('4453464449'));
    expect(parseLinkedInJobUrl('linkedin.com/jobs/view/4453464449')?.jobId).toBe('4453464449');
  });

  it('rejects non-LinkedIn and id-less links', () => {
    expect(parseLinkedInJobUrl('https://example.com/jobs/view/4453464449')).toBeNull();
    expect(parseLinkedInJobUrl('https://www.linkedin.com/feed/')).toBeNull();
    expect(parseLinkedInJobUrl('not a url')).toBeNull();
    expect(parseLinkedInJobUrl('')).toBeNull();
  });
});

describe('parseLinkedInJobListUrl', () => {
  const feedUrl =
    'https://www.linkedin.com/jobs/search-results/?currentJobId=4452849001&eBP=CwEAAAGgG2JxDI6FYw&refId=%2BdwGGpHX0nAr5CpglOEFug%3D%3D&trackingId=wKrnZLKdNXPTrLfQLZ3D6w%3D%3D&showHowYouFit=HOW_YOU_FIT&origin=QUALIFICATION_BOARD_FEED_MIXER_LANDING&originToLandingJobPostings=4453464449%2C4452849001%2C4447355619';

  it('recognizes a search-results feed and keeps the params that rebuild it', () => {
    const parsed = parseLinkedInJobListUrl(feedUrl);
    expect(parsed).not.toBeNull();
    expect(parsed!.listUrl).toContain('eBP=');
    expect(parsed!.listUrl).toContain('origin=QUALIFICATION_BOARD_FEED_MIXER_LANDING');
    expect(parsed!.listUrl).not.toContain('trackingId');
    expect(parsed!.listUrl).not.toContain('refId');
  });

  it('lists the job ids the link names, starting with the landing postings', () => {
    expect(parseLinkedInJobListUrl(feedUrl)!.jobIds).toEqual([
      '4453464449',
      '4452849001',
      '4447355619',
    ]);
  });

  it('recognizes keyword searches and collections', () => {
    expect(parseLinkedInJobListUrl('https://www.linkedin.com/jobs/search/?keywords=react&f_AL=true')).not.toBeNull();
    expect(parseLinkedInJobListUrl('https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4449145152')?.jobIds).toEqual([
      '4449145152',
    ]);
  });

  it('rejects single job pages and non-list pages', () => {
    expect(parseLinkedInJobListUrl('https://www.linkedin.com/jobs/view/4453464449/')).toBeNull();
    expect(parseLinkedInJobListUrl('https://www.linkedin.com/feed/')).toBeNull();
    expect(parseLinkedInJobListUrl('https://example.com/jobs/search/')).toBeNull();
  });
});

import { describe, it, expect } from 'vitest';
import {
  applyOptimisticFloor,
  estimateCareerYears,
  isExperienceQuestion,
  isZeroishAnswer,
  pickOptimisticOption,
  resolveOptimismSettings,
} from '@/lib/services/experience-optimism';

const settings = resolveOptimismSettings();

describe('isExperienceQuestion', () => {
  it('matches skill and duration questions', () => {
    expect(isExperienceQuestion('How many years of video editing experience do you have?')).toBe(true);
    expect(isExperienceQuestion('Are you proficient in Figma?')).toBe(true);
    expect(isExperienceQuestion('Have you worked with Kubernetes?')).toBe(true);
  });

  it('leaves legal attestations alone', () => {
    expect(isExperienceQuestion('Do you require visa sponsorship?')).toBe(false);
    expect(isExperienceQuestion('Do you have a Bachelor degree?')).toBe(false);
    expect(isExperienceQuestion('Have you ever been convicted of a felony?')).toBe(false);
  });

  it('ignores numeric prompts that only look like duration questions', () => {
    expect(isExperienceQuestion('What is your notice period in months?')).toBe(false);
    expect(isExperienceQuestion('What are your salary expectations?')).toBe(false);
  });
});

describe('isZeroishAnswer', () => {
  it('flags every flavour of "no experience"', () => {
    for (const answer of ['', '0', '0 years', '0 months', 'none', 'No', 'n/a', 'no experience']) {
      expect(isZeroishAnswer(answer)).toBe(true);
    }
  });

  it('leaves positive answers untouched', () => {
    for (const answer of ['3', '2 years', 'Yes', '5+']) {
      expect(isZeroishAnswer(answer)).toBe(false);
    }
  });
});

describe('applyOptimisticFloor', () => {
  it('replaces a zero with the year floor', () => {
    expect(
      applyOptimisticFloor({
        question: 'How many years of experience do you have with Premiere Pro?',
        answer: '0',
        expectedFormat: 'digits',
        settings,
      })
    ).toBe('3');
  });

  it('answers in months when the field asks in months', () => {
    expect(
      applyOptimisticFloor({
        question: 'How many months of experience do you have with Docker?',
        answer: '0',
        expectedFormat: 'digits',
        settings,
      })
    ).toBe('18');
  });

  it('turns a "No" into a "Yes" on capability questions', () => {
    expect(
      applyOptimisticFloor({
        question: 'Do you have experience with motion graphics?',
        answer: 'No',
        expectedFormat: 'yes_no',
        options: ['Yes', 'No'],
        settings,
      })
    ).toBe('Yes');
  });

  it('skips the "None" bucket in a range dropdown', () => {
    expect(
      applyOptimisticFloor({
        question: 'Years of experience with React',
        answer: 'None',
        fieldType: 'select',
        options: ['None', '1-2 years', '3-5 years', '5+ years'],
        settings,
      })
    ).toBe('3-5 years');
  });

  it('keeps a positive answer exactly as the model gave it', () => {
    expect(
      applyOptimisticFloor({
        question: 'How many years of Python experience?',
        answer: '7',
        expectedFormat: 'digits',
        settings,
      })
    ).toBe('7');
  });

  it('never rewrites a legal attestation', () => {
    expect(
      applyOptimisticFloor({
        question: 'Do you require visa sponsorship to work in the US?',
        answer: 'No',
        expectedFormat: 'yes_no',
        options: ['Yes', 'No'],
        settings,
      })
    ).toBe('No');
  });
});

describe('pickOptimisticOption', () => {
  it('prefers the first bucket that covers the floor', () => {
    expect(pickOptimisticOption(['None', '0-1 years', '2-4 years', '5+ years'], settings)).toBe('2-4 years');
  });

  it('falls back to any positive bucket when none reaches the floor', () => {
    expect(pickOptimisticOption(['None', '1 year'], settings)).toBe('1 year');
  });
});

describe('resolveOptimismSettings', () => {
  it('honours user preferences', () => {
    const custom = resolveOptimismSettings({ minYearsExperience: '5', minMonthsExperience: '24' });
    expect(custom.minYears).toBe(5);
    expect(custom.minMonths).toBe(24);
  });

  it('caps the floor at the real career length so answers stay credible', () => {
    const junior = resolveOptimismSettings({}, 2);
    expect(junior.minYears).toBe(2);
    expect(junior.minMonths).toBeLessThanOrEqual(24);
  });
});

describe('estimateCareerYears', () => {
  it('measures from the earliest start date', () => {
    const years = estimateCareerYears([
      { startDate: '2020-01-01', endDate: '2022-01-01' },
      { startDate: '2022-02-01', current: true },
    ]);
    expect(years).toBeGreaterThan(5);
  });

  it('returns undefined without usable dates', () => {
    expect(estimateCareerYears([])).toBeUndefined();
    expect(estimateCareerYears([{ startDate: 'sometime' }])).toBeUndefined();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getUserAIProvider, findById } = vi.hoisted(() => ({
  getUserAIProvider: vi.fn(),
  findById: vi.fn(),
}));

vi.mock('@/lib/ai/key-manager', () => ({ getUserAIProvider }));
vi.mock('@/lib/db/connection', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/db/models/user', () => ({ default: { findById } }));
vi.mock('@/lib/services/career-profile', () => ({
  getCareerProfile: vi.fn().mockResolvedValue(null),
  careerProfileHasContent: () => false,
}));
vi.mock('@/lib/services/resume-service', () => ({
  getDefaultResume: vi.fn().mockResolvedValue(null),
  resumeToText: () => '',
}));

import { generateOutreachMessage, MAX_MESSAGE_LENGTH } from '@/lib/services/company-outreach';

const input = {
  channel: 'company_page' as const,
  jobTitle: 'Frontend Engineer',
  company: 'Acme',
};

beforeEach(() => {
  vi.clearAllMocks();
  findById.mockReturnValue({ lean: vi.fn().mockResolvedValue({ name: 'Alex Doe' }) });
});

describe('generateOutreachMessage', () => {
  it('falls back to a template when no AI provider is configured', async () => {
    getUserAIProvider.mockResolvedValue(null);

    const result = await generateOutreachMessage('user1', input);

    expect(result.source).toBe('template');
    expect(result.message).toContain('Frontend Engineer');
    expect(result.message).toContain('Acme');
    expect(result.message).toContain('Alex Doe');
  });

  it('uses the AI message when one comes back', async () => {
    getUserAIProvider.mockResolvedValue({
      generateJSON: vi.fn().mockResolvedValue({
        message: 'Hi — I just applied for the Frontend Engineer role.',
        personalizationPoint: 'React work',
      }),
    });

    const result = await generateOutreachMessage('user1', input);

    expect(result.source).toBe('ai');
    expect(result.message).toBe('Hi — I just applied for the Frontend Engineer role.');
    expect(result.personalizationPoint).toBe('React work');
  });

  it('strips markdown and any subject line the model adds', async () => {
    getUserAIProvider.mockResolvedValue({
      generateJSON: vi.fn().mockResolvedValue({
        message: 'Subject: Application\n\n**Hi there** — I applied today.',
      }),
    });

    const result = await generateOutreachMessage('user1', input);

    expect(result.message).not.toContain('Subject:');
    expect(result.message).not.toContain('**');
    expect(result.message).toBe('Hi there — I applied today.');
  });

  it('truncates an over-long message and falls back when the AI call fails', async () => {
    getUserAIProvider.mockResolvedValue({
      generateJSON: vi.fn().mockResolvedValue({ message: 'x'.repeat(2000) }),
    });
    const long = await generateOutreachMessage('user1', input);
    expect(long.message.length).toBeLessThanOrEqual(MAX_MESSAGE_LENGTH);

    getUserAIProvider.mockResolvedValue({
      generateJSON: vi.fn().mockRejectedValue(new Error('quota exhausted')),
    });
    const failed = await generateOutreachMessage('user1', input);
    expect(failed.source).toBe('template');
    expect(failed.message).toContain('Acme');
  });
});

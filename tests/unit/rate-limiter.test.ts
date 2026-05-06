import { describe, it, expect, vi } from 'vitest';
import { checkCooldown, checkActionCooldown } from '@/lib/anti-detection/rate-limiter';

// Mock the DB-dependent modules so we can test the synchronous functions
vi.mock('@/lib/db/connection', () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/db/models', () => ({
  DailyUsage: {
    findOne: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
    findOneAndUpdate: vi.fn().mockResolvedValue(null),
  },
}));

describe('Rate Limiter - checkCooldown', () => {
  it('should allow the first action for a user', () => {
    const userId = `cooldown-test-${Date.now()}-${Math.random()}`;
    const result = checkCooldown(userId, 'applies', 'balanced');
    expect(result.allowed).toBe(true);
    expect(result.waitMs).toBe(0);
  });

  it('should block a second action within the cooldown period', () => {
    const userId = `cooldown-block-${Date.now()}-${Math.random()}`;
    // First action should be allowed
    const first = checkCooldown(userId, 'applies', 'balanced');
    expect(first.allowed).toBe(true);

    // Second action immediately after should be blocked
    const second = checkCooldown(userId, 'applies', 'balanced');
    expect(second.allowed).toBe(false);
    expect(second.waitMs).toBeGreaterThan(0);
  });

  it('should apply different cooldown durations per speed preset', () => {
    const baseId = `speed-test-${Date.now()}`;

    // Conservative = 60s cooldown
    const conservativeUser = `${baseId}-conservative`;
    checkCooldown(conservativeUser, 'applies', 'conservative');
    const conservativeResult = checkCooldown(conservativeUser, 'applies', 'conservative');
    expect(conservativeResult.allowed).toBe(false);
    // Conservative wait should be around 60s (60000ms)
    expect(conservativeResult.waitMs).toBeGreaterThan(50000);
    expect(conservativeResult.waitMs).toBeLessThanOrEqual(60000);

    // Aggressive = 15s cooldown
    const aggressiveUser = `${baseId}-aggressive`;
    checkCooldown(aggressiveUser, 'applies', 'aggressive');
    const aggressiveResult = checkCooldown(aggressiveUser, 'applies', 'aggressive');
    expect(aggressiveResult.allowed).toBe(false);
    // Aggressive wait should be around 15s (15000ms)
    expect(aggressiveResult.waitMs).toBeGreaterThan(10000);
    expect(aggressiveResult.waitMs).toBeLessThanOrEqual(15000);
  });

  it('should track different action types independently', () => {
    const userId = `action-type-${Date.now()}-${Math.random()}`;

    // Perform an 'applies' action
    const appliesResult = checkCooldown(userId, 'applies', 'balanced');
    expect(appliesResult.allowed).toBe(true);

    // 'scrapes' should still be allowed for the same user
    const scrapesResult = checkCooldown(userId, 'scrapes', 'balanced');
    expect(scrapesResult.allowed).toBe(true);

    // But another 'applies' should be blocked
    const appliesAgain = checkCooldown(userId, 'applies', 'balanced');
    expect(appliesAgain.allowed).toBe(false);
  });

  it('should track different users independently', () => {
    const user1 = `user1-${Date.now()}-${Math.random()}`;
    const user2 = `user2-${Date.now()}-${Math.random()}`;

    checkCooldown(user1, 'applies', 'balanced');
    // User 2 should be able to perform the same action
    const user2Result = checkCooldown(user2, 'applies', 'balanced');
    expect(user2Result.allowed).toBe(true);
  });
});

describe('Rate Limiter - checkActionCooldown', () => {
  it('should allow the first action', () => {
    const userId = `action-cooldown-${Date.now()}-${Math.random()}`;
    const result = checkActionCooldown(userId, 'test-action', 3000);
    expect(result.allowed).toBe(true);
    expect(result.waitMs).toBe(0);
  });

  it('should block rapid consecutive actions', () => {
    const userId = `action-cooldown-block-${Date.now()}-${Math.random()}`;
    const first = checkActionCooldown(userId, 'test-action', 5000);
    expect(first.allowed).toBe(true);

    const second = checkActionCooldown(userId, 'test-action', 5000);
    expect(second.allowed).toBe(false);
    expect(second.waitMs).toBeGreaterThan(0);
    expect(second.waitMs).toBeLessThanOrEqual(5000);
  });

  it('should use default cooldown of 3000ms when not specified', () => {
    const userId = `default-cooldown-${Date.now()}-${Math.random()}`;
    checkActionCooldown(userId, 'default-test');
    const result = checkActionCooldown(userId, 'default-test');
    expect(result.allowed).toBe(false);
    expect(result.waitMs).toBeLessThanOrEqual(3000);
  });

  it('should allow different action types independently', () => {
    const userId = `multi-action-${Date.now()}-${Math.random()}`;
    checkActionCooldown(userId, 'action-a', 5000);

    const resultB = checkActionCooldown(userId, 'action-b', 5000);
    expect(resultB.allowed).toBe(true);
  });
});

describe('Rate Limiter - DAILY_LIMITS and SPEED_PRESETS', () => {
  it('should have reasonable daily limits defined', async () => {
    const { DAILY_LIMITS, SPEED_PRESETS } = await import('@/lib/anti-detection/human-simulator');

    expect(DAILY_LIMITS.applies).toBeGreaterThan(0);
    expect(DAILY_LIMITS.posts).toBeGreaterThan(0);
    expect(DAILY_LIMITS.scrapes).toBeGreaterThan(0);
    expect(DAILY_LIMITS.profileViews).toBeGreaterThan(0);
    expect(DAILY_LIMITS.messages).toBeGreaterThan(0);
  });

  it('should have speed presets that scale correctly', async () => {
    const { SPEED_PRESETS } = await import('@/lib/anti-detection/human-simulator');

    expect(SPEED_PRESETS.conservative).toBeLessThan(SPEED_PRESETS.balanced);
    expect(SPEED_PRESETS.balanced).toBeLessThan(SPEED_PRESETS.aggressive);
    expect(SPEED_PRESETS.balanced).toBe(1.0);
  });

  it('should calculate effective limits correctly', async () => {
    const { DAILY_LIMITS, SPEED_PRESETS } = await import('@/lib/anti-detection/human-simulator');

    // Conservative should give lower limits
    const conservativeApplies = Math.floor(DAILY_LIMITS.applies * SPEED_PRESETS.conservative);
    const balancedApplies = Math.floor(DAILY_LIMITS.applies * SPEED_PRESETS.balanced);
    const aggressiveApplies = Math.floor(DAILY_LIMITS.applies * SPEED_PRESETS.aggressive);

    expect(conservativeApplies).toBeLessThan(balancedApplies);
    expect(balancedApplies).toBeLessThan(aggressiveApplies);
  });
});

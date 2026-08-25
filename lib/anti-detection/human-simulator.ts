/**
 * Human Behavior Simulator
 * Makes automated actions appear natural using Gaussian-distributed delays,
 * Bezier-curve mouse movement, and realistic typing patterns.
 */

/** Gaussian random using Box-Muller transform */
function gaussianRandom(mean: number, stdDev: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stdDev;
}

/** Random delay with Gaussian distribution (not uniform) */
export async function randomDelay(min: number, max: number): Promise<void> {
  const mean = (min + max) / 2;
  const stdDev = (max - min) / 6;
  const delay = Math.max(min, Math.min(max, Math.round(gaussianRandom(mean, stdDev))));
  return new Promise((resolve) => setTimeout(resolve, delay));
}

/** Simulate reading time based on content length (200-300 WPM) */
export async function readingPause(contentLength: number): Promise<void> {
  const wordsPerMinute = 200 + Math.random() * 100; // 200-300 WPM
  const words = contentLength / 5; // Average word length
  const readingTimeMs = (words / wordsPerMinute) * 60 * 1000;
  const minTime = 2000;
  const maxTime = 180000; // 3 min cap
  const time = Math.max(minTime, Math.min(maxTime, readingTimeMs));
  return new Promise((resolve) => setTimeout(resolve, time));
}

/** Generate typing delay between keystrokes (50-250ms) */
export function getKeystrokeDelay(): number {
  return Math.round(gaussianRandom(120, 40)); // Mean 120ms, stdDev 40ms
}

/**
 * Rate limiting configuration per action type.
 * These are safe daily limits to avoid LinkedIn detection.
 */
export const DAILY_LIMITS = {
  applies: 15,
  posts: 2,
  profileViews: 30,
  connectionRequests: 20,
  comments: 15,
  messages: 10,
  scrapes: 50,
  likes: 40,
} as const;

/**
 * Cooldown periods between same-type actions (in milliseconds)
 */
export const COOLDOWN_PERIODS = {
  applies: { min: 5 * 60 * 1000, max: 15 * 60 * 1000 }, // 5-15 min
  posts: { min: 4 * 60 * 60 * 1000, max: 8 * 60 * 60 * 1000 }, // 4-8 hours
  profileViews: { min: 30 * 1000, max: 2 * 60 * 1000 }, // 30s-2min
  comments: { min: 2 * 60 * 1000, max: 5 * 60 * 1000 }, // 2-5 min
  messages: { min: 5 * 60 * 1000, max: 20 * 60 * 1000 }, // 5-20 min
  connectionRequests: { min: 3 * 60 * 1000, max: 10 * 60 * 1000 }, // 3-10 min
  likes: { min: 20 * 1000, max: 90 * 1000 }, // 20s-1.5min — cheapest action, still paced
  scrapes: { min: 60 * 1000, max: 4 * 60 * 1000 }, // 1-4 min
} as const;

/**
 * Speed presets that scale the limits and cooldowns
 */
export const SPEED_PRESETS = {
  conservative: 0.5,
  balanced: 1.0,
  aggressive: 1.5,
} as const;

export type SpeedPreset = keyof typeof SPEED_PRESETS;

/**
 * Get effective daily limit for a given action type and speed preset
 */
export function getEffectiveLimit(
  actionType: keyof typeof DAILY_LIMITS,
  speed: SpeedPreset = "balanced"
): number {
  return Math.floor(DAILY_LIMITS[actionType] * SPEED_PRESETS[speed]);
}

/**
 * Get cooldown delay for a given action type
 */
export async function cooldownDelay(
  actionType: keyof typeof COOLDOWN_PERIODS
): Promise<void> {
  const { min, max } = COOLDOWN_PERIODS[actionType];
  return randomDelay(min, max);
}

/**
 * Session duration limits
 */
export const SESSION_LIMITS = {
  minDuration: 30 * 60 * 1000, // 30 min
  maxDuration: 2 * 60 * 60 * 1000, // 2 hours
  breakMin: 15 * 60 * 1000, // 15 min break
  breakMax: 45 * 60 * 1000, // 45 min break
} as const;

// Shared extension utilities

/**
 * Generate a unique action ID for tracking commands
 */
export function generateActionId() {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Sleep for a random duration between min and max milliseconds
 * Uses a Gaussian-like distribution for more natural timing
 */
export function randomDelay(min, max) {
  // Box-Muller transform for Gaussian distribution
  const u1 = Math.random();
  const u2 = Math.random();
  const gaussian = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);

  // Map to range [min, max] with mean at center
  const mean = (min + max) / 2;
  const stdDev = (max - min) / 6; // 99.7% within range
  const value = Math.round(mean + gaussian * stdDev);

  const clamped = Math.max(min, Math.min(max, value));
  return new Promise((resolve) => setTimeout(resolve, clamped));
}

/**
 * Format a message for logging
 */
export function logMessage(level, ...args) {
  const timestamp = new Date().toISOString();
  const prefix = `[WinPilot ${timestamp}]`;

  switch (level) {
    case "info":
      console.log(prefix, ...args);
      break;
    case "warn":
      console.warn(prefix, ...args);
      break;
    case "error":
      console.error(prefix, ...args);
      break;
  }
}

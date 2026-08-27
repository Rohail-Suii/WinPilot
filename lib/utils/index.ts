import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 30) return `${diffDay}d ago`;
  return formatDate(date);
}

/**
 * Sanitize text that will be sent to AI prompts.
 * Strips common prompt injection patterns while preserving legitimate content.
 */
export function sanitizeForAI(text: string): string {
  return text
    // Remove common prompt injection markers
    .replace(/\b(ignore previous instructions|disregard above|system prompt|you are now|act as|pretend to be)\b/gi, "[filtered]")
    // Remove attempts to override system instructions with delimiters
    .replace(/---+\s*(system|instruction|prompt)/gi, "[filtered]")
    // Limit length to prevent token stuffing
    .slice(0, 50000);
}

export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function generateId(): string {
  return crypto.randomUUID();
}

/** Bare employment labels that must never stand alone as a resume entry. */
const WEAK_EMPLOYER_LABELS = [
  "freelance",
  "freelancer",
  "freelancing",
  "contract",
  "contractor",
  "self employed",
  "various clients",
  "independent",
];

/**
 * True for an "employer" that is really just a work arrangement. Recruiters
 * read a standalone "Freelance" entry as a gap filler, so the generator folds
 * that work into a neighbouring role and the renderer never prints the label.
 */
export function isWeakEmployerLabel(value: string): boolean {
  const normalized = value.toLowerCase().replace(/[^a-z\s-]/g, "").replace(/-/g, " ").trim();
  return WEAK_EMPLOYER_LABELS.includes(normalized);
}

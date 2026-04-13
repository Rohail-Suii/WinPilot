import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const registerSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(50, "Name must be at most 50 characters"),
  email: z.string().email("Invalid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be at most 128 characters")
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      "Password must contain at least one uppercase letter, one lowercase letter, and one number"
    ),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be at most 128 characters")
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      "Password must contain at least one uppercase letter, one lowercase letter, and one number"
    ),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export const verifyEmailSchema = z.object({
  email: z.string().email("Invalid email address"),
  otp: z.string().length(6, "Verification code must be 6 digits"),
});

export const aiApiKeySchema = z.object({
  provider: z.enum(["gemini", "openai", "anthropic", "groq", "openrouter"]),
  apiKey: z.string().min(10, "API key is too short"),
});

export const jobSearchSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  keywords: z.string().min(1, "Keywords are required"),
  location: z.string().optional(),
  remote: z.boolean().default(false),
  experienceLevel: z.array(z.enum(["internship", "entry", "associate", "mid-senior", "director", "executive"])).default([]),
  datePosted: z.enum(["any", "past-24h", "past-week", "past-month"]).default("any"),
  easyApplyOnly: z.boolean().default(true),
  salary: z.object({
    min: z.number().optional(),
    max: z.number().optional(),
  }).optional(),
  excludeCompanies: z.array(z.string()).default([]),
  excludeKeywords: z.array(z.string()).default([]),
});

export const heroProfileSchema = z.object({
  niche: z.string().min(1, "Niche is required"),
  targetAudience: z.string().min(1, "Target audience is required"),
  contentPillars: z.array(z.string()).min(1).max(5),
  voiceTone: z.enum(["professional", "casual", "inspirational", "educational", "humorous"]),
  postingSchedule: z.object({
    days: z.array(z.number().min(0).max(6)),
    timesPerWeek: z.number().min(1).max(14),
    preferredTimes: z.array(z.string()),
  }),
});

export const scraperConfigSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  type: z.enum(["posts", "profiles", "companies"]),
  keywords: z.array(z.string()).min(1, "At least one keyword is required"),
  filters: z.object({
    location: z.string().optional(),
    industry: z.string().optional(),
    datePosted: z.enum(["any", "past-24h", "past-week", "past-month"]).optional(),
    connectionDegree: z.enum(["1st", "2nd", "3rd+"]).optional(),
    companySize: z.string().optional(),
  }).optional(),
  maxResults: z.number().min(1).max(100).default(50),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type AiApiKeyInput = z.infer<typeof aiApiKeySchema>;
export type JobSearchInput = z.infer<typeof jobSearchSchema>;
export type HeroProfileInput = z.infer<typeof heroProfileSchema>;
export type ScraperConfigInput = z.infer<typeof scraperConfigSchema>;

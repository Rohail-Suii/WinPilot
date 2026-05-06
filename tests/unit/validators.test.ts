import { describe, it, expect } from 'vitest';
import {
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  verifyEmailSchema,
  aiApiKeySchema,
  jobSearchSchema,
} from '@/lib/validators';

describe('loginSchema', () => {
  it('should accept valid login data', () => {
    const result = loginSchema.safeParse({
      email: 'user@example.com',
      password: 'password123',
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid email', () => {
    const result = loginSchema.safeParse({
      email: 'not-an-email',
      password: 'password123',
    });
    expect(result.success).toBe(false);
  });

  it('should reject empty email', () => {
    const result = loginSchema.safeParse({
      email: '',
      password: 'password123',
    });
    expect(result.success).toBe(false);
  });

  it('should reject password shorter than 8 characters', () => {
    const result = loginSchema.safeParse({
      email: 'user@example.com',
      password: 'short',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const passwordError = result.error.issues.find(i => i.path.includes('password'));
      expect(passwordError?.message).toContain('at least 8 characters');
    }
  });

  it('should reject missing fields', () => {
    const result = loginSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('registerSchema', () => {
  const validData = {
    name: 'John Doe',
    email: 'john@example.com',
    password: 'Password1',
    confirmPassword: 'Password1',
  };

  it('should accept valid registration data', () => {
    const result = registerSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('should reject name shorter than 2 characters', () => {
    const result = registerSchema.safeParse({ ...validData, name: 'J' });
    expect(result.success).toBe(false);
  });

  it('should reject name longer than 50 characters', () => {
    const result = registerSchema.safeParse({ ...validData, name: 'A'.repeat(51) });
    expect(result.success).toBe(false);
  });

  it('should reject invalid email', () => {
    const result = registerSchema.safeParse({ ...validData, email: 'invalid' });
    expect(result.success).toBe(false);
  });

  it('should reject password without uppercase letter', () => {
    const result = registerSchema.safeParse({
      ...validData,
      password: 'password1',
      confirmPassword: 'password1',
    });
    expect(result.success).toBe(false);
  });

  it('should reject password without lowercase letter', () => {
    const result = registerSchema.safeParse({
      ...validData,
      password: 'PASSWORD1',
      confirmPassword: 'PASSWORD1',
    });
    expect(result.success).toBe(false);
  });

  it('should reject password without number', () => {
    const result = registerSchema.safeParse({
      ...validData,
      password: 'PasswordNoNum',
      confirmPassword: 'PasswordNoNum',
    });
    expect(result.success).toBe(false);
  });

  it('should reject password shorter than 8 characters', () => {
    const result = registerSchema.safeParse({
      ...validData,
      password: 'Pass1',
      confirmPassword: 'Pass1',
    });
    expect(result.success).toBe(false);
  });

  it('should reject password longer than 128 characters', () => {
    const longPassword = 'Aa1' + 'x'.repeat(126);
    const result = registerSchema.safeParse({
      ...validData,
      password: longPassword,
      confirmPassword: longPassword,
    });
    expect(result.success).toBe(false);
  });

  it('should reject mismatched passwords', () => {
    const result = registerSchema.safeParse({
      ...validData,
      confirmPassword: 'DifferentPass1',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const confirmError = result.error.issues.find(i => i.path.includes('confirmPassword'));
      expect(confirmError?.message).toContain("don't match");
    }
  });
});

describe('forgotPasswordSchema', () => {
  it('should accept valid email', () => {
    const result = forgotPasswordSchema.safeParse({ email: 'user@example.com' });
    expect(result.success).toBe(true);
  });

  it('should reject invalid email', () => {
    const result = forgotPasswordSchema.safeParse({ email: 'not-email' });
    expect(result.success).toBe(false);
  });
});

describe('verifyEmailSchema', () => {
  it('should accept valid data', () => {
    const result = verifyEmailSchema.safeParse({
      email: 'user@example.com',
      otp: '123456',
    });
    expect(result.success).toBe(true);
  });

  it('should reject OTP that is not 6 digits', () => {
    const result = verifyEmailSchema.safeParse({
      email: 'user@example.com',
      otp: '12345',
    });
    expect(result.success).toBe(false);
  });

  it('should reject OTP that is too long', () => {
    const result = verifyEmailSchema.safeParse({
      email: 'user@example.com',
      otp: '1234567',
    });
    expect(result.success).toBe(false);
  });
});

describe('aiApiKeySchema', () => {
  it('should accept valid provider and API key', () => {
    const result = aiApiKeySchema.safeParse({
      provider: 'gemini',
      apiKey: 'sk-1234567890',
    });
    expect(result.success).toBe(true);
  });

  it('should accept all valid providers', () => {
    const providers = ['gemini', 'openai', 'anthropic', 'groq'] as const;
    for (const provider of providers) {
      const result = aiApiKeySchema.safeParse({
        provider,
        apiKey: 'sk-1234567890',
      });
      expect(result.success).toBe(true);
    }
  });

  it('should reject invalid provider', () => {
    const result = aiApiKeySchema.safeParse({
      provider: 'invalid-provider',
      apiKey: 'sk-1234567890',
    });
    expect(result.success).toBe(false);
  });

  it('should reject API key that is too short', () => {
    const result = aiApiKeySchema.safeParse({
      provider: 'openai',
      apiKey: 'short',
    });
    expect(result.success).toBe(false);
  });
});

describe('jobSearchSchema', () => {
  it('should accept valid minimal job search data', () => {
    const result = jobSearchSchema.safeParse({
      name: 'My Search',
      keywords: 'software engineer',
    });
    expect(result.success).toBe(true);
  });

  it('should accept full job search data', () => {
    const result = jobSearchSchema.safeParse({
      name: 'Full Search',
      keywords: 'react developer',
      location: 'New York, NY',
      remote: true,
      experienceLevel: ['mid-senior', 'director'],
      datePosted: 'past-week',
      easyApplyOnly: true,
      salary: { min: 100000, max: 200000 },
      excludeCompanies: ['Bad Corp'],
      excludeKeywords: ['junior'],
    });
    expect(result.success).toBe(true);
  });

  it('should reject empty name', () => {
    const result = jobSearchSchema.safeParse({
      name: '',
      keywords: 'software engineer',
    });
    expect(result.success).toBe(false);
  });

  it('should reject empty keywords', () => {
    const result = jobSearchSchema.safeParse({
      name: 'My Search',
      keywords: '',
    });
    expect(result.success).toBe(false);
  });

  it('should reject name that is too long', () => {
    const result = jobSearchSchema.safeParse({
      name: 'A'.repeat(101),
      keywords: 'software engineer',
    });
    expect(result.success).toBe(false);
  });

  it('should apply defaults for optional fields', () => {
    const result = jobSearchSchema.safeParse({
      name: 'My Search',
      keywords: 'engineer',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.remote).toBe(false);
      expect(result.data.experienceLevel).toEqual([]);
      expect(result.data.datePosted).toBe('any');
      expect(result.data.easyApplyOnly).toBe(true);
      expect(result.data.excludeCompanies).toEqual([]);
      expect(result.data.excludeKeywords).toEqual([]);
    }
  });

  it('should reject invalid experience level', () => {
    const result = jobSearchSchema.safeParse({
      name: 'My Search',
      keywords: 'engineer',
      experienceLevel: ['invalid-level'],
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid datePosted value', () => {
    const result = jobSearchSchema.safeParse({
      name: 'My Search',
      keywords: 'engineer',
      datePosted: 'invalid-date',
    });
    expect(result.success).toBe(false);
  });

  it('should accept valid experience levels', () => {
    const levels = ['internship', 'entry', 'associate', 'mid-senior', 'director', 'executive'];
    const result = jobSearchSchema.safeParse({
      name: 'All Levels',
      keywords: 'engineer',
      experienceLevel: levels,
    });
    expect(result.success).toBe(true);
  });
});

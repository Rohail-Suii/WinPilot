"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2, Check, X, Mail, Lock, User, ArrowRight } from "lucide-react";

import { registerSchema, type RegisterInput } from "@/lib/validators";
import { PremiumCard } from "@/components/premium-card";
import { PremiumButton } from "@/components/premium-button";
import { PremiumInput } from "@/components/premium-input";

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: "8+ characters", met: password.length >= 8 },
    { label: "Uppercase letter", met: /[A-Z]/.test(password) },
    { label: "Lowercase letter", met: /[a-z]/.test(password) },
    { label: "Number", met: /\d/.test(password) },
  ];

  if (!password) return null;

  return (
    <div className="mt-2 space-y-1">
      {checks.map((check) => (
        <div key={check.label} className="flex items-center gap-2 text-xs">
          {check.met ? (
            <Check className="h-3 w-3 text-var(--accent-cyan)" />
          ) : (
            <X className="h-3 w-3 text-var(--text-tertiary)" />
          )}
          <span className={check.met ? "text-var(--accent-cyan)" : "text-var(--text-tertiary)"}>
            {check.label}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function RegisterPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
  });

  const password = watch("password", "");

  async function onSubmit(data: RegisterInput) {
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const result = await res.json();

      if (!res.ok) {
        toast.error(result.error || "Registration failed");
        return;
      }

      toast.success("Account created! Check your email for a verification code.");
      router.push(`/verify-email?email=${encodeURIComponent(data.email)}`);
    } catch {
      toast.error("Something went wrong");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <PremiumCard
      glassEffect
      className="w-full max-w-md p-8 space-y-6"
    >
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-gradient-to-br from-var(--accent-cyan) to-var(--accent-magenta) shadow-lg shadow-var(--accent-cyan)/20">
          <User className="h-7 w-7 text-var(--text-inverse)" />
        </div>
        <h1 className="text-2xl font-bold text-var(--text-primary)">Create account</h1>
        <p className="text-sm text-var(--text-secondary)">
          Start automating your LinkedIn presence
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <PremiumInput
          id="name"
          label="Full Name"
          placeholder="John Doe"
          autoComplete="name"
          icon={<User className="h-4 w-4" />}
          error={errors.name?.message}
          {...register("name")}
        />

        <PremiumInput
          id="email"
          type="email"
          label="Email"
          placeholder="you@example.com"
          autoComplete="email"
          icon={<Mail className="h-4 w-4" />}
          error={errors.email?.message}
          {...register("email")}
        />

        <div className="space-y-2">
          <label
            htmlFor="password"
            className="block text-sm font-medium text-var(--text-primary)"
          >
            Password
          </label>
          <PremiumInput
            id="password"
            type="password"
            placeholder="••••••••"
            autoComplete="new-password"
            icon={<Lock className="h-4 w-4" />}
            error={errors.password?.message}
            {...register("password")}
          />
          <PasswordStrength password={password} />
        </div>

        <PremiumInput
          id="confirmPassword"
          type="password"
          label="Confirm Password"
          placeholder="••••••••"
          autoComplete="new-password"
          icon={<Lock className="h-4 w-4" />}
          error={errors.confirmPassword?.message}
          {...register("confirmPassword")}
        />

        <PremiumButton
          type="submit"
          variant="primary"
          size="lg"
          className="w-full justify-center mt-6"
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Creating account...
            </>
          ) : (
            <>
              Create Account
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </PremiumButton>
      </form>

      {/* Footer */}
      <div className="text-center pt-4 border-t border-var(--border-color)">
        <p className="text-sm text-var(--text-secondary)">
          Already have an account?{" "}
          <Link
            href="/login"
            className="text-var(--accent-cyan) hover:text-var(--accent-cyan-light) font-semibold transition-colors"
          >
            Sign in
          </Link>
        </p>
      </div>
    </PremiumCard>
  );
}

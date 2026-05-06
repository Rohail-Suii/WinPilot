"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff, Check, X } from "lucide-react";

import { registerSchema, type RegisterInput } from "@/lib/validators";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function GoogleIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: "8+ chars", met: password.length >= 8 },
    { label: "Uppercase", met: /[A-Z]/.test(password) },
    { label: "Lowercase", met: /[a-z]/.test(password) },
    { label: "Number", met: /\d/.test(password) },
  ];

  if (!password) return null;

  const metCount = checks.filter((c) => c.met).length;
  const barColor =
    metCount <= 1 ? "#FF5F57" : metCount === 2 ? "#FEBC2E" : metCount === 3 ? "#00E5FF" : "#28C840";

  return (
    <div className="mt-2 space-y-2">
      <div className="flex gap-1">
        {checks.map((_, i) => (
          <div
            key={i}
            className="h-1 flex-1 rounded-full transition-all duration-300"
            style={{ background: i < metCount ? barColor : "rgba(255,255,255,0.07)" }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {checks.map((check) => (
          <div key={check.label} className="flex items-center gap-1.5 text-[11px]">
            {check.met ? (
              <Check className="h-3 w-3 text-[#28C840]" />
            ) : (
              <X className="h-3 w-3 text-white/20" />
            )}
            <span className={check.met ? "text-white/50" : "text-white/20"}>{check.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function WinpilotLogo() {
  return (
    <div className="mb-8 flex items-center justify-center gap-3 lg:hidden">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#00E5FF] to-[#6366F1] shadow-lg shadow-[#00E5FF]/20">
        <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
          <path d="M13 2L4.5 13H11L10 22L19.5 11H13L13 2Z" fill="white" strokeLinejoin="round" />
        </svg>
      </div>
      <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
        Winpilot
      </span>
    </div>
  );
}

export default function RegisterPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

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

  async function handleGoogleSignUp() {
    setIsGoogleLoading(true);
    try {
      await signIn("google", { callbackUrl: "/dashboard" });
    } catch {
      toast.error("Google sign-up failed");
      setIsGoogleLoading(false);
    }
  }

  return (
    <div className="relative z-10 w-full max-w-[400px]">
      <WinpilotLogo />

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-[1.75rem] font-bold tracking-tight text-white">Create your account</h1>
        <p className="mt-1.5 text-sm text-white/40">
          Free forever. Start automating LinkedIn today.
        </p>
      </div>

      {/* Google — always visible, no env check */}
      <Button
        type="button"
        className="w-full h-11 gap-2.5 border border-white/10 bg-white/[0.04] text-white/80 hover:bg-white/[0.08] hover:text-white hover:border-white/20 transition-all font-medium"
        variant="ghost"
        onClick={handleGoogleSignUp}
        disabled={isLoading || isGoogleLoading}
      >
        {isGoogleLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            <GoogleIcon />
            Continue with Google
          </>
        )}
      </Button>

      {/* Divider */}
      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-white/[0.07]" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-[#080810] px-3 text-[11px] font-medium text-white/20 uppercase tracking-[0.15em]">
            or sign up with email
          </span>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name" className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">
            Full Name
          </Label>
          <Input
            id="name"
            placeholder="John Doe"
            autoComplete="name"
            className="h-11 rounded-lg bg-white/[0.04] border-white/10 text-white placeholder:text-white/20 focus-visible:border-[#00E5FF]/40 focus-visible:ring-2 focus-visible:ring-[#00E5FF]/10 transition-colors"
            {...register("name")}
          />
          {errors.name && <p className="text-xs text-red-400">{errors.name.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">
            Email
          </Label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            className="h-11 rounded-lg bg-white/[0.04] border-white/10 text-white placeholder:text-white/20 focus-visible:border-[#00E5FF]/40 focus-visible:ring-2 focus-visible:ring-[#00E5FF]/10 transition-colors"
            {...register("email")}
          />
          {errors.email && <p className="text-xs text-red-400">{errors.email.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">
            Password
          </Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              autoComplete="new-password"
              className="h-11 rounded-lg bg-white/[0.04] border-white/10 text-white placeholder:text-white/20 focus-visible:border-[#00E5FF]/40 focus-visible:ring-2 focus-visible:ring-[#00E5FF]/10 pr-10 transition-colors"
              {...register("password")}
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/50 transition-colors"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.password && <p className="text-xs text-red-400">{errors.password.message}</p>}
          <PasswordStrength password={password} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirmPassword" className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">
            Confirm Password
          </Label>
          <div className="relative">
            <Input
              id="confirmPassword"
              type={showConfirm ? "text" : "password"}
              placeholder="••••••••"
              autoComplete="new-password"
              className="h-11 rounded-lg bg-white/[0.04] border-white/10 text-white placeholder:text-white/20 focus-visible:border-[#00E5FF]/40 focus-visible:ring-2 focus-visible:ring-[#00E5FF]/10 pr-10 transition-colors"
              {...register("confirmPassword")}
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowConfirm((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/50 transition-colors"
              aria-label={showConfirm ? "Hide" : "Show"}
            >
              {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.confirmPassword && (
            <p className="text-xs text-red-400">{errors.confirmPassword.message}</p>
          )}
        </div>

        <Button
          type="submit"
          className="w-full h-11 bg-gradient-to-r from-[#00E5FF] to-[#6366F1] text-[#080810] font-semibold hover:opacity-90 active:opacity-95 transition-opacity shadow-lg shadow-[#00E5FF]/15 border-0"
          disabled={isLoading || isGoogleLoading}
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create account"}
        </Button>
      </form>

      <p className="mt-7 text-center text-sm text-white/25">
        Already have an account?{" "}
        <Link href="/login" className="text-[#00E5FF] hover:text-[#00E5FF]/80 font-semibold transition-colors">
          Sign in
        </Link>
      </p>
    </div>
  );
}

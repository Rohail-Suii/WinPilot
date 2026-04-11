"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2, Github, Mail, Lock, ArrowRight } from "lucide-react";

import { loginSchema, type LoginInput } from "@/lib/validators";
import { PremiumCard } from "@/components/premium-card";
import { PremiumButton } from "@/components/premium-button";
import { PremiumInput } from "@/components/premium-input";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  async function onSubmit(data: LoginInput) {
    setIsLoading(true);
    try {
      const result = await signIn("credentials", {
        email: data.email,
        password: data.password,
        redirect: false,
      });

      if (result?.error) {
        if (result.error.includes("EMAIL_NOT_VERIFIED")) {
          toast.error("Please verify your email first");
          router.push(`/verify-email?email=${encodeURIComponent(data.email)}`);
          return;
        }
        toast.error("Invalid email or password");
      } else {
        toast.success("Welcome back!");
        router.push(callbackUrl);
        router.refresh();
      }
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
          <Lock className="h-7 w-7 text-var(--text-inverse)" />
        </div>
        <h1 className="text-2xl font-bold text-var(--text-primary)">Welcome back</h1>
        <p className="text-sm text-var(--text-secondary)">
          Sign in to your LinkedBoost account
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
          <div className="flex items-center justify-between">
            <label
              htmlFor="password"
              className="block text-sm font-medium text-var(--text-primary)"
            >
              Password
            </label>
            <Link
              href="/forgot-password"
              className="text-xs text-var(--accent-cyan) hover:text-var(--accent-cyan-light) transition-colors font-medium"
            >
              Forgot password?
            </Link>
          </div>
          <PremiumInput
            id="password"
            type="password"
            placeholder="••••••••"
            autoComplete="current-password"
            icon={<Lock className="h-4 w-4" />}
            error={errors.password?.message}
            {...register("password")}
          />
        </div>

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
              Signing in...
            </>
          ) : (
            <>
              Sign In
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </PremiumButton>
      </form>

      {/* Social auth */}
      {(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
        process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID) && (
        <>
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-var(--border-color)" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-var(--bg-secondary) px-2 text-xs text-var(--text-tertiary) uppercase tracking-wider font-medium">
                Or continue with
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <PremiumButton
              variant="outline"
              size="md"
              onClick={() => signIn("google", { callbackUrl })}
              disabled={isLoading}
              className="justify-center"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              <span className="hidden sm:inline">Google</span>
            </PremiumButton>
            <PremiumButton
              variant="outline"
              size="md"
              onClick={() => signIn("github", { callbackUrl })}
              disabled={isLoading}
              className="justify-center"
            >
              <Github className="h-4 w-4" />
              <span className="hidden sm:inline">GitHub</span>
            </PremiumButton>
          </div>
        </>
      )}

      {/* Footer */}
      <div className="text-center pt-4 border-t border-var(--border-color)">
        <p className="text-sm text-var(--text-secondary)">
          Don&apos;t have an account?{" "}
          <Link
            href="/register"
            className="text-var(--accent-cyan) hover:text-var(--accent-cyan-light) font-semibold transition-colors"
          >
            Sign up
          </Link>
        </p>
      </div>
    </PremiumCard>
  );
}

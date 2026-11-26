"use client";

import { SubmitEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AxiosError } from "axios";
import toast from "react-hot-toast";
import { ArrowRightIcon } from "lucide-react";
import AuthField from "@/components/auth/AuthField";
import AuthShell from "@/components/auth/AuthShell";
import Loader from "@/components/common/Loader";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/contexts/AuthContext";

const LoginPage = () => {
  const searchParams = useSearchParams();
  const { handleLogin, isAuthenticated } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const router = useRouter();

  const from = searchParams.get("from") ?? "/dashboard";

  useEffect(() => {
    if (isAuthenticated) {
      router.push(from);
    }
  }, [isAuthenticated, from, router]);

  const onSubmit = async (e: SubmitEvent) => {
    e.preventDefault();

    setLoading(true);

    try {
      await handleLogin(email, password);
      router.push(from);
    } catch (err) {
      const message =
        err instanceof AxiosError && err.response?.data?.error
          ? (err.response.data.error as string)
          : err instanceof Error
            ? err.message
            : "Login failed";

      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  if (isAuthenticated) {
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center px-4">
        <Loader size="lg" />
      </div>
    );
  }

  return (
    <AuthShell
      headline="Back on site"
      tagline="Your board, your CVs and every application you've sent are right where you left them."
    >
      <h1 className="text-[44px]">Sign in</h1>
      <p className="mt-2 text-[15px] text-neutral-600">
        New to Candido?{" "}
        <Link href={`/register?from=${encodeURIComponent(from)}`} className="font-semibold text-candido-black underline underline-offset-4 decoration-[var(--landing-amber)] decoration-2 hover:decoration-candido-black">
          Create an account
        </Link>
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-5">
        <AuthField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={loading}
        />
        <AuthField
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={loading}
        />

        <Button type="submit" disabled={loading} className="group mt-3 h-12 w-full rounded-lg text-[16px] font-semibold hover:bg-black">
          {loading ? (
            "Signing in…"
          ) : (
            <>
              Sign in
              <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
            </>
          )}
        </Button>
      </form>
    </AuthShell>
  );
};

export default LoginPage;

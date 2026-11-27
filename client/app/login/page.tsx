"use client";

import { SubmitEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AxiosError } from "axios";
import toast from "react-hot-toast";
import { AuthLink, AuthSubmit } from "@/components/auth/AuthControls";
import AuthField from "@/components/auth/AuthField";
import AuthShell from "@/components/auth/AuthShell";
import Loader from "@/components/common/Loader";
import { useAuth } from "@/contexts/AuthContext";
import Crew from "@/lib/images/Crew.webp";
import { safeRedirectPath } from "@/lib/routes";

const LoginPage = () => {
  const searchParams = useSearchParams();
  const { handleLogin, isAuthenticated } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const router = useRouter();

  const from = safeRedirectPath(searchParams.get("from"), "/dashboard");

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
      art={Crew}
      tagline="Your board, your CVs and every application you've sent are right where you left them."
    >
      <h1 className="text-[44px]">Sign in</h1>
      <p className="mt-2 text-[15px] text-neutral-600">
        New to Candido?{" "}
        <AuthLink href={`/register?from=${encodeURIComponent(from)}`} disabled={loading}>
          Create an account
        </AuthLink>
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

        <AuthSubmit loading={loading} label="Sign in" loadingLabel="Signing in…" />
      </form>
    </AuthShell>
  );
};

export default LoginPage;

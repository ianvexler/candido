"use client";

import { SubmitEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AxiosError } from "axios";
import toast from "react-hot-toast";
import { MailCheckIcon } from "lucide-react";
import { AuthLink, AuthSubmit, authCtaClass } from "@/components/auth/AuthControls";
import AuthField from "@/components/auth/AuthField";
import AuthShell from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { safeRedirectPath } from "@/lib/routes";

const RegisterPage = () => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { handleRegister, isAuthenticated } = useAuth();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);

  const from = safeRedirectPath(searchParams.get("from"), "/");
  const loginHref = `/login?from=${encodeURIComponent(from)}`;

  useEffect(() => {
    if (isAuthenticated) {
      router.push(from);
    }
  }, [isAuthenticated, from, router]);

  const onSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await handleRegister(email, password, name);
      setRegistered(true);
      toast.success("Check your email to verify your account");
    } catch (err) {
      const message =
        err instanceof AxiosError && err.response?.data?.error
          ? (err.response.data.error as string)
          : err instanceof Error
            ? err.message
            : "Registration failed";

      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      headline="Build your way to the offer"
      tagline="Track every application on one board, and tailor your CV to each job before you send it."
    >
      {registered ? (
        <div>
          <span className="mb-6 flex size-14 items-center justify-center rounded-2xl bg-[var(--landing-amber)]">
            <MailCheckIcon className="size-7" strokeWidth={1.75} />
          </span>
          <h1 className="text-[44px]">Check your email</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-neutral-600">
            We sent a verification link to <strong className="text-candido-black">{email}</strong>. Click it to
            confirm your account, then sign in.
          </p>
          <Button asChild className={cn("mt-8", authCtaClass)}>
            <Link href={loginHref}>Go to sign in</Link>
          </Button>
        </div>
      ) : (
        <>
          <h1 className="text-[44px]">Create your account</h1>
          <p className="mt-2 text-[15px] text-neutral-600">
            Already have one?{" "}
            <AuthLink href={loginHref} disabled={loading}>
              Sign in
            </AuthLink>
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-5">
            <AuthField
              id="name"
              label="Name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={loading}
            />
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
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
            />

            <AuthSubmit loading={loading} label="Create account" loadingLabel="Creating account…" />
          </form>
        </>
      )}
    </AuthShell>
  );
};

export default RegisterPage;

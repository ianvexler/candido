"use client";

import { SubmitEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AxiosError } from "axios";
import toast from "react-hot-toast";
import { ArrowRightIcon, MailCheckIcon } from "lucide-react";
import AuthField from "@/components/auth/AuthField";
import AuthShell from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/contexts/AuthContext";

const linkClass =
  "font-semibold text-candido-black underline underline-offset-4 decoration-[var(--landing-amber)] decoration-2 hover:decoration-candido-black";

const RegisterPage = () => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { handleRegister, isAuthenticated } = useAuth();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);

  const from = searchParams.get("from") ?? "/";
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
          <Button asChild className="mt-8 h-12 w-full rounded-lg text-[16px] font-semibold hover:bg-black">
            <Link href={loginHref}>Go to sign in</Link>
          </Button>
        </div>
      ) : (
        <>
          <h1 className="text-[44px]">Create your account</h1>
          <p className="mt-2 text-[15px] text-neutral-600">
            Already have one?{" "}
            <Link href={loginHref} className={linkClass}>
              Sign in
            </Link>
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

            <Button
              type="submit"
              disabled={loading}
              className="group mt-3 h-12 w-full rounded-lg text-[16px] font-semibold hover:bg-black"
            >
              {loading ? (
                "Creating account…"
              ) : (
                <>
                  Create account
                  <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </Button>
          </form>
        </>
      )}
    </AuthShell>
  );
};

export default RegisterPage;

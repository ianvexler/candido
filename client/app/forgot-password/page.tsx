"use client";

import { SubmitEvent, useState } from "react";
import Link from "next/link";
import { AxiosError } from "axios";
import toast from "react-hot-toast";
import { MailCheckIcon } from "lucide-react";
import { forgotPassword } from "@/api/resources/sessions/forgotPassword";
import { AuthLink, AuthSubmit, authCtaClass } from "@/components/auth/AuthControls";
import AuthField from "@/components/auth/AuthField";
import AuthShell from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

const ForgotPasswordPage = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const onSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await forgotPassword(email);
      setSent(true);
    } catch (err) {
      const message =
        err instanceof AxiosError && err.response?.data?.error
          ? (err.response.data.error as string)
          : "Couldn't send the reset link";

      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      headline="Locked out? Let's get you back in"
      tagline="We'll email you a link to choose a new password. Your board and CVs are safe in the meantime."
    >
      {sent ? (
        <div>
          <span className="mb-6 flex size-14 items-center justify-center rounded-2xl bg-[var(--landing-amber)]">
            <MailCheckIcon className="size-7" strokeWidth={1.75} />
          </span>
          <h1 className="text-[44px]">Check your email</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-neutral-600">
            If <strong className="text-candido-black">{email}</strong> has a Candido account, we&apos;ve sent it a link to
            reset your password. The link works for an hour.
          </p>
          <p className="mt-3 text-[15px] leading-relaxed text-neutral-600">
            Nothing arrived? Check your spam folder, or{" "}
            <button
              type="button"
              onClick={() => setSent(false)}
              className="font-semibold text-candido-black underline decoration-[var(--landing-amber)] decoration-2 underline-offset-4 hover:decoration-candido-black"
            >
              try another email
            </button>
            .
          </p>
          <Button asChild className={cn("mt-8", authCtaClass)}>
            <Link href="/login">Back to sign in</Link>
          </Button>
        </div>
      ) : (
        <>
          <h1 className="text-[44px]">Reset your password</h1>
          <p className="mt-2 text-[15px] text-neutral-600">
            Remembered it?{" "}
            <AuthLink href="/login" disabled={loading}>
              Sign in
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

            <AuthSubmit loading={loading} label="Send reset link" loadingLabel="Sending…" />
          </form>
        </>
      )}
    </AuthShell>
  );
};

export default ForgotPasswordPage;

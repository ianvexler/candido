"use client";

import { SubmitEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AxiosError } from "axios";
import toast from "react-hot-toast";
import { resetPassword } from "@/api/resources/sessions/resetPassword";
import { AuthLink, AuthSubmit, authCtaClass } from "@/components/auth/AuthControls";
import AuthField from "@/components/auth/AuthField";
import AuthShell from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

const ResetPasswordPage = () => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    if (!token) return;

    if (password !== confirmation) {
      toast.error("The passwords don't match");
      return;
    }

    setLoading(true);

    try {
      await resetPassword(token, password);
      toast.success("Password reset. Sign in with your new password.");
      router.push("/login");
    } catch (err) {
      const message =
        err instanceof AxiosError && err.response?.data?.error
          ? (err.response.data.error as string)
          : "Couldn't reset your password";

      toast.error(message);
      setLoading(false);
    }
  };

  return (
    <AuthShell
      headline="A fresh start"
      tagline="Pick a new password and you'll be back to your board and CVs."
    >
      {token ? (
        <>
          <h1 className="text-[44px]">Choose a new password</h1>
          <p className="mt-2 text-[15px] text-neutral-600">
            Link expired?{" "}
            <AuthLink href="/forgot-password" disabled={loading}>
              Send a new one
            </AuthLink>
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-5">
            <AuthField
              id="password"
              label="New password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
            />
            <AuthField
              id="password-confirmation"
              label="Confirm new password"
              type="password"
              autoComplete="new-password"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              required
              disabled={loading}
            />

            <AuthSubmit loading={loading} label="Reset password" loadingLabel="Resetting…" />
          </form>
        </>
      ) : (
        <div>
          <h1 className="text-[44px]">This link isn&apos;t complete</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-neutral-600">
            Open the link from your reset email again, or ask for a new one.
          </p>
          <Button asChild className={cn("mt-8", authCtaClass)}>
            <Link href="/forgot-password">Send a new link</Link>
          </Button>
        </div>
      )}
    </AuthShell>
  );
};

export default ResetPasswordPage;

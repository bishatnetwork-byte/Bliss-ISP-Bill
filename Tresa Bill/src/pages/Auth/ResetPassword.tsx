/* eslint-disable @typescript-eslint/no-explicit-any */
import { redirectToAccountSubdomain, renultApi } from "@/api/foreform";
import { useAuth } from "@/lib/auth";
import { Loader2 } from "lucide-react";
import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import AuthShell from "./AuthShell";
import { AuthInput, PasswordInput, SubmitButton } from "./auth-ui";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { login } = useAuth();
  const [email, setEmail] = useState(params.get("email") || "");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (code.length !== 6) {
      toast.error("Enter the 6 digit reset code");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setIsLoading(true);
    try {
      const auth = await renultApi.auth.resetPassword({ email, code, new_password: password });
      login(auth);
      toast.success("Password reset");
      if (!redirectToAccountSubdomain(auth)) {
        navigate("/", { replace: true });
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to reset password");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell title="Create new password" subtitle="Use the 6 digit code from your email" seoTitle="Reset Password" path="/reset-password">
      <form className="w-full space-y-2" onSubmit={handleSubmit}>
        <AuthInput type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="youremail@mail.host" autoComplete="email" />
        <AuthInput type="text" inputMode="numeric" required minLength={6} maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} className="text-[18px] tracking-[0.35em] text-center" placeholder="000000" autoFocus />
        <PasswordInput show={showPassword} onToggle={() => setShowPassword((next) => !next)} required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password" autoComplete="new-password" />
        <PasswordInput show={showPassword} onToggle={() => setShowPassword((next) => !next)} required minLength={8} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm password" autoComplete="new-password" />
        <SubmitButton isLoading={isLoading}>
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Reset Password
        </SubmitButton>
      </form>
      <Link to="/login" className="mt-8 text-[13px] text-slate-900 hover:underline font-medium black-ops-one-regular">Back to login</Link>
    </AuthShell>
  );
}

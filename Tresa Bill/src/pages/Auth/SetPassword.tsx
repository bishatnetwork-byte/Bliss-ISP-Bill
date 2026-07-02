/* eslint-disable @typescript-eslint/no-explicit-any */
import { renultApi } from "@/api/foreform";
import { useAuth } from "@/lib/auth";
import { Loader2 } from "lucide-react";
import React, { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { authErrorMessage } from "./auth-errors";
import AuthShell from "./AuthShell";
import { PasswordInput, SubmitButton } from "./auth-ui";

export default function SetPassword() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated, refreshUser } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const from = (location.state as any)?.from || "/";

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (user?.auth_provider !== "google") {
    return <Navigate to={from} replace />;
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
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
      await renultApi.auth.setPassword({ new_password: password });
      await refreshUser();
      toast.success("Password set");
      navigate(from, { replace: true });
    } catch (err: unknown) {
      toast.error(authErrorMessage(err, "Failed to set password"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell title="Set your password" subtitle={user?.email || "Add a password to your Google account"} seoTitle="Set Password" path="/set-password">
      <form className="w-full space-y-2" onSubmit={handleSubmit}>
        <PasswordInput show={showPassword} onToggle={() => setShowPassword((next) => !next)} required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" autoComplete="new-password" autoFocus />
        <PasswordInput show={showPassword} onToggle={() => setShowPassword((next) => !next)} required minLength={8} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm password" autoComplete="new-password" />
        <SubmitButton isLoading={isLoading}>
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Save Password
        </SubmitButton>
      </form>
    </AuthShell>
  );
}

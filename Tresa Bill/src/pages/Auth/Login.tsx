/* eslint-disable @typescript-eslint/no-explicit-any */
import { redirectToAccountSubdomain, renultApi } from "@/api/foreform";
import { useAuth } from "@/lib/auth";
import { GoogleLogin, type CredentialResponse } from "@react-oauth/google";
import { Loader2 } from "lucide-react";
import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import AuthShell from "./AuthShell";
import { AuthInput, Divider, GoogleButtonContainer, PasswordInput, SubmitButton } from "./auth-ui";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const from = (location.state as any)?.from?.pathname || "/";

  const finishLogin = async (auth: Awaited<ReturnType<typeof renultApi.auth.login>>, targetPath = from) => {
    login(auth);
    if (await redirectToAccountSubdomain(auth, targetPath)) return;
    navigate(targetPath, { replace: true });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    try {
      const auth = await renultApi.auth.login({ email, password });
      await finishLogin(auth);
    } catch (err: any) {
      toast.error(err.message || "Failed to log in");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse: CredentialResponse) => {
    if (!credentialResponse.credential) {
      toast.error("Google sign in failed");
      return;
    }
    setIsGoogleLoading(true);
    try {
      const auth = await renultApi.auth.google({ id_token: credentialResponse.credential });
      if (auth.user.auth_provider === "google") {
        await finishLogin(auth, "/set-password");
      } else {
        await finishLogin(auth);
      }
    } catch (err: any) {
      toast.error(err.message || "Google sign in failed");
    } finally {
      setIsGoogleLoading(false);
    }
  };

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to manage your billing workspace" seoTitle="Log In" path="/login">
      <div className="w-full">
        <GoogleButtonContainer>
          {(width) => (
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={() => toast.error("Google sign in failed")}
              shape="pill"
              size="large"
              text="continue_with"
              logo_alignment="center"
              width={width}
            />
          )}
        </GoogleButtonContainer>
        {isGoogleLoading && (
          <div className="mt-2 flex items-center justify-center gap-2 text-[12px] text-slate-500">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Signing you in...
          </div>
        )}
        <Divider />
        <form className="space-y-2" onSubmit={handleSubmit}>
          <AuthInput type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="youremail@mail.host" autoComplete="email" autoFocus />
          <PasswordInput show={showPassword} onToggle={() => setShowPassword((next) => !next)} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" autoComplete="current-password" />
          <Link to="/forgot-password" className="block pt-1 text-[13px] text-slate-900 hover:underline font-medium text-right">
            Forgot password?
          </Link>
          <SubmitButton isLoading={isLoading}>
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Log In
          </SubmitButton>
        </form>
      </div>
      <div className="mt-8 text-center">
        <p className="text-[13px] text-slate-600 font-medium black-ops-one-regular">
          New to Bliss ISP? <Link to="/signup" className="text-slate-900 hover:underline">Create an account</Link>
        </p>
      </div>
    </AuthShell>
  );
}

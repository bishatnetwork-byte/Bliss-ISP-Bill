/* eslint-disable @typescript-eslint/no-explicit-any */
import { renultApi } from "@/api/foreform";
import { useAuth } from "@/lib/auth";
import { GoogleLogin, type CredentialResponse } from "@react-oauth/google";
import { Loader2 } from "lucide-react";
import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import AuthShell from "./AuthShell";
import { AuthInput, Divider, GoogleButtonContainer, PasswordInput, SubmitButton } from "./auth-ui";

type SignupStep = "details" | "verify";

export default function Signup() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [step, setStep] = useState<SignupStep>("details");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const handleRegister = async () => {
    if (fullName.trim().length < 2) {
      toast.error("Full name must be at least 2 characters");
      return;
    }
    if (phoneNumber.trim().length < 5) {
      toast.error("Phone number must be at least 5 characters");
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
      await renultApi.auth.register({
        email,
        password,
        full_name: fullName,
        phone_number: phoneNumber,
      });
      toast.success("Account created. Enter the verification code sent to your email.");
      setStep("verify");
    } catch (err: any) {
      toast.error(err.message || "Failed to create account");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async () => {
    if (code.length !== 6) {
      toast.error("Enter the 6 digit verification code");
      return;
    }
    setIsLoading(true);
    try {
      const auth = await renultApi.auth.verifyEmail({ email, code });
      login(auth);
      toast.success("Account verified");
      navigate("/", { replace: true });
    } catch (err: any) {
      toast.error(err.message || "Failed to verify account");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (step === "details") void handleRegister();
    if (step === "verify") void handleVerify();
  };

  const handleGoogleSuccess = async (credentialResponse: CredentialResponse) => {
    if (!credentialResponse.credential) {
      toast.error("Google sign up failed");
      return;
    }
    setIsGoogleLoading(true);
    try {
      const auth = await renultApi.auth.google({ id_token: credentialResponse.credential });
      login(auth);
      navigate(auth.user.auth_provider === "google" ? "/set-password" : "/", { replace: true });
    } catch (err: any) {
      toast.error(err.message || "Google sign up failed");
    } finally {
      setIsGoogleLoading(false);
    }
  };

  return (
    <AuthShell
      title={step === "verify" ? "Verify your email" : "Create account"}
      subtitle={step === "verify" ? `Enter the 6 digit code sent to ${email}` : "Start with your details, then verify your email"}
      seoTitle="Sign Up"
      path="/signup"
    >
      <div className="w-full">
        {step === "details" ? (
          <>
            <GoogleButtonContainer>
              {(width) => (
                <GoogleLogin
                  onSuccess={handleGoogleSuccess}
                  onError={() => toast.error("Google sign up failed")}
                  shape="pill"
                  size="large"
                  text="signup_with"
                  logo_alignment="center"
                  width={width}
                />
              )}
            </GoogleButtonContainer>
            {isGoogleLoading && (
              <div className="mt-2 flex items-center justify-center gap-2 text-[12px] text-slate-500">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Creating your account...
              </div>
            )}
            <Divider />
          </>
        ) : null}

        <form className="space-y-2" onSubmit={handleSubmit}>
          {step === "details" ? (
            <>
              <AuthInput required minLength={2} maxLength={120} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" autoComplete="name" autoFocus />
              <AuthInput type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="youremail@mail.host" autoComplete="email" />
              <AuthInput type="tel" required minLength={5} maxLength={30} value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="+256 700 000000" autoComplete="tel" />
              <PasswordInput show={showPassword} onToggle={() => setShowPassword((next) => !next)} required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" autoComplete="new-password" />
              <PasswordInput show={showConfirmPassword} onToggle={() => setShowConfirmPassword((next) => !next)} required minLength={8} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm password" autoComplete="new-password" />
            </>
          ) : (
            <>
              <AuthInput type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="youremail@mail.host" autoComplete="email" />
              <AuthInput type="text" inputMode="numeric" required minLength={6} maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} className="text-[18px] tracking-[0.35em] text-center" placeholder="000000" autoFocus />
              <button
                type="button"
                disabled={isLoading}
                onClick={async () => {
                  try {
                    await renultApi.auth.resendCode({ email });
                    toast.success("Verification code sent");
                  } catch (err: any) {
                    toast.error(err.message || "Failed to resend code");
                  }
                }}
                className="text-[12px] text-slate-900 hover:underline font-medium"
              >
                Resend code
              </button>
            </>
          )}
          <SubmitButton isLoading={isLoading}>
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {step === "details" ? "Create Account" : "Verify Account"}
          </SubmitButton>
        </form>
      </div>
      <div className="mt-8 text-center">
        <p className="text-[13px] text-slate-600 font-medium">
          Already have an account? <Link to="/login" className="text-slate-900 hover:underline">Sign in</Link>
        </p>
      </div>
    </AuthShell>
  );
}

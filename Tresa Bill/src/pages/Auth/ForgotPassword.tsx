/* eslint-disable @typescript-eslint/no-explicit-any */
import { renultApi } from "@/api/foreform";
import { Loader2 } from "lucide-react";
import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { authErrorMessage } from "./auth-errors";
import AuthShell from "./AuthShell";
import { AuthInput, SubmitButton } from "./auth-ui";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    try {
      await renultApi.auth.forgotPassword({ email });
      toast.success("Reset code sent");
      navigate(`/reset-password?email=${encodeURIComponent(email)}`);
    } catch (err: unknown) {
      toast.error(authErrorMessage(err, "Failed to send reset code"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell title="Reset password" subtitle="Enter your email to receive a reset code" seoTitle="Forgot Password" path="/forgot-password">
      <form className="w-full space-y-2" onSubmit={handleSubmit}>
        <AuthInput type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="youremail@mail.host" autoComplete="email" autoFocus />
        <SubmitButton isLoading={isLoading}>
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Send Code
        </SubmitButton>
      </form>
      <Link to="/login" className="mt-8 text-[13px] text-foreground hover:text-primary hover:underline font-medium black-ops-one-regular">Back to login</Link>
    </AuthShell>
  );
}

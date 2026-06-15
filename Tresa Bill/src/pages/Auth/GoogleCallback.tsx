/* eslint-disable @typescript-eslint/no-explicit-any */
import { redirectToAccountSubdomain, renultApi } from "@/api/foreform";
import { useAuth } from "@/lib/auth";
import { Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { clearGoogleRedirectUri, readGoogleRedirectUri } from "./google-auth";

export default function GoogleCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();
  const exchangedCode = useRef<string | null>(null);

  useEffect(() => {
    const code = params.get("code");
    if (!code) {
      toast.error("Google code missing");
      navigate("/login", { replace: true });
      return;
    }

    if (exchangedCode.current === code) return;
    exchangedCode.current = code;

    const redirectUri = readGoogleRedirectUri();
    renultApi.auth.google({ code, redirect_uri: redirectUri })
      .then(async (auth) => {
        clearGoogleRedirectUri();
        login(auth);
        const target = auth.user.auth_provider === "google" ? "/set-password" : "/";
        if (!await redirectToAccountSubdomain(auth, target)) {
          navigate(target, { replace: true });
        }
      })
      .catch((err: any) => {
        toast.error(err.message || "Google sign in failed");
        navigate("/login", { replace: true });
      });
  }, [params, navigate, login]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-white text-sm text-slate-600">
      <Loader2 className="w-4 h-4 animate-spin mr-2" />
      Finishing Google sign in...
    </div>
  );
}

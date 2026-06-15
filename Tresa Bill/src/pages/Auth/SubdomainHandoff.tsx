import { renultApi } from "@/api/foreform";
import { useAuth } from "@/lib/auth";
import { Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export default function SubdomainHandoff() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const exchanged = useRef(false);

  useEffect(() => {
    if (exchanged.current) return;
    exchanged.current = true;

    const params = new URLSearchParams(window.location.hash.slice(1));
    const code = params.get("code");
    const next = params.get("next") || "/";
    const subdomain = window.location.hostname.split(".")[0];
    window.history.replaceState(null, "", window.location.pathname);

    if (!code || !subdomain) {
      toast.error("The account login link is invalid.");
      navigate("/login", { replace: true });
      return;
    }

    renultApi.auth.exchangeSubdomainHandoff({ code, subdomain })
      .then((auth) => {
        login(auth);
        navigate(next.startsWith("/") ? next : "/", { replace: true });
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "Account login failed.");
        navigate("/login", { replace: true });
      });
  }, [login, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-white text-sm text-slate-600">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      Opening your account...
    </div>
  );
}

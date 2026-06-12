import SEO from "@/components/SEO";
import { Activity, Radio, Ticket } from "lucide-react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";

interface AuthShellProps {
  title: string;
  subtitle: string;
  seoTitle: string;
  path: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

const highlights = [
  { icon: Activity, text: "Live router monitoring & alerts" },
  { icon: Ticket, text: "Automated hotspot voucher sales" },
  { icon: Radio, text: "Remote Winbox & API access" },
];

export default function AuthShell({ title, subtitle, seoTitle, path, children, footer }: AuthShellProps) {
  return (
    <div className="min-h-screen flex bg-white font-sans">
      <Helmet>
        <link rel="preload" as="image" href="/bg/bg.png" />
      </Helmet>
      <SEO title={seoTitle} path={path} />

      {/* Left branding panel */}
      <div className="hidden lg:flex lg:w-1/2 relative flex-col justify-between overflow-hidden bg-gradient-to-br from-slate-900 via-slate-900 to-primary/30 p-12 text-white">
        <img
          src="/bg/bg.png"
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-20 blur-sm pointer-events-none select-none"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-900/60 to-slate-900/30" />

        <div className="relative z-10">
          <Link to="/" className="inline-flex items-center bg-white rounded-xl px-4 py-2.5 shadow-lg">
            <img src="/icons/logo_2.png" alt="Renult" className="h-7 w-auto object-contain" />
          </Link>
        </div>

        <div className="relative z-10 max-w-md">
          <h2 className="text-3xl font-bold leading-tight mb-3">
            Run your ISP business from one dashboard.
          </h2>
          <p className="text-sm text-slate-300 mb-8">
            Manage routers, hotspot vouchers, and customer billing — all in real time, from anywhere.
          </p>
          <ul className="space-y-3">
            {highlights.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm text-slate-200">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/15">
                  <Icon className="h-4 w-4 text-emerald-400" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative z-10 text-[11px] text-slate-400 font-medium">
          Renult © {new Date().getFullYear()}
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 relative overflow-hidden">
        <img
          src="/bg/bg.png"
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-[0.04] blur-sm pointer-events-none select-none z-0 lg:hidden"
        />

        <div className="w-full max-w-[380px] flex flex-col items-center z-10 pb-16">
          <Link to="/" className="mx-auto w-12 h-12 flex items-center justify-center mb-3 lg:hidden">
            <img src="/icons/mini.png" alt="Renult" className="w-10 h-10 object-contain" />
          </Link>
          <div className="text-center mb-6">
            <h1 className="text-[22px] font-bold text-slate-800 mb-1">{title}</h1>
            <p className="text-[13px] text-slate-500">{subtitle}</p>
          </div>
          {children}
          {footer}
        </div>

        <div className="absolute bottom-6 flex flex-wrap items-center justify-center gap-6 text-[10px] text-slate-500 font-bold w-full px-4 lg:hidden">
          <span>Renult © {new Date().getFullYear()}</span>
        </div>
      </div>
    </div>
  );
}

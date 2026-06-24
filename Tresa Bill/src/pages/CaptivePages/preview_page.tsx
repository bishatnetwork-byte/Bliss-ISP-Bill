import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Wifi,
  CheckCircle2,
  Loader2,
  Clock,
  ArrowRight,
  Shield,
  Smartphone,
  Info,
  LogOut,
  Phone,
  Mail,
  Key,
  Globe,
  Lock,
  Sun,
  Moon,
  Search,
  ChevronRight,
  X,
  Tv
} from "lucide-react";
import { toast } from "sonner";
import { useSearchParams } from "react-router-dom";

export interface CaptivePortal {
  id?: string | null;
  router_id?: string | null;
  router_name?: string;
  title: string;
  description: string;
  phone_one?: string | null;
  phone_two?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
  portal_template: string;
  last_pushed_at?: string | null;
}

// Blends a hex color toward white (positive percent) or black (negative percent),
// used to derive hover/gradient shades from the single admin-picked brand color.
function shadeColor(hex: string, percent: number): string {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!match) return hex;
  const num = parseInt(match[1], 16);
  let r = (num >> 16) & 0xff;
  let g = (num >> 8) & 0xff;
  let b = num & 0xff;
  const t = percent < 0 ? 0 : 255;
  const p = Math.abs(percent) / 100;
  r = Math.round((t - r) * p + r);
  g = Math.round((t - g) * p + g);
  b = Math.round((t - b) * p + b);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

const FALLBACK_PORTAL: CaptivePortal = {
  id: "fallback",
  title: "Renault WIFI",
  description: "High-speed internet access portal",
  phone_one: "+256771234567",
  phone_two: "+256752345678",
  logo_url: "⚡ Renault Custom Portal",
  portal_template: "renault"
};

const RENAULT_PACKAGES = {
  Lite: [
    { id: 'l1', name: '6 Hour Pass', limit: '6 Hours', data: '24 Hours · 2 Mbps', devices: 1, total: 500 },
    { id: 'l2', name: 'Day Pass', limit: '24 Hours', data: '7 Days · 2 Mbps', devices: 1, total: 1000 },
    { id: 'l3', name: 'Week Pass', limit: '7 Days', data: '24 Hours · 5 Mbps', devices: 2, total: 5000 },
  ],
  Normal: [
    { id: 'n1', name: '1 Hour Normal', limit: '1 Hour', data: '1 Hour · 5 Mbps', devices: 2, total: 2000 },
    { id: 'n2', name: 'Day Normal', limit: '24 Hours', data: '24 Hours · 5 Mbps', devices: 2, total: 8000 },
    { id: 'n3', name: 'Week Normal', limit: '7 Days', data: '7 Days · 5 Mbps', devices: 2, total: 40000 },
    { id: 'n4', name: 'Monthly Normal', limit: '30 Days', data: '30 Days · 5 Mbps', devices: 2, total: 120000 },
  ],
  SuperFast: [
    { id: 's1', name: '1 Hour Super', limit: '1 Hour', data: '1 Hour · 20 Mbps', devices: 3, total: 3000 },
    { id: 's2', name: 'Day SuperFast', limit: '24 Hours', data: '24 Hours · 20 Mbps', devices: 3, total: 15000 },
    { id: 's3', name: 'Week SuperFast', limit: '7 Days', data: '7 Days · 20 Mbps', devices: 3, total: 70000 },
    { id: 's4', name: 'Monthly Super', limit: '30 Days', data: '30 Days · 20 Mbps', devices: 3, total: 200000 },
  ]
};

export default function CaptivePreview() {
  const [searchParams] = useSearchParams();
  const requestedTemplate = searchParams.get("template");
  const [config, setConfig] = useState<CaptivePortal>(() => {
    const saved = localStorage.getItem("foreform_captive_portal_preview");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // Fallback
      }
    }
    return FALLBACK_PORTAL;
  });

  useEffect(() => {
    if (!requestedTemplate) return;
    setConfig((current) => ({
      ...current,
      portal_template: requestedTemplate,
    }));
  }, [requestedTemplate]);

  // Step state: 'login' | 'otp' | 'connecting' | 'success'
  const [step, setStep] = useState<"login" | "otp" | "connecting" | "success">("login");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [voucher, setVoucher] = useState("");
  const [otpInput, setOtpInput] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);

  // Renault specific state
  const [renaultTheme, setRenaultTheme] = useState<"light" | "dark">("light");
  const [renaultSpeedTab, setRenaultSpeedTab] = useState<"Lite" | "Normal" | "SuperFast">("Lite");
  const [selectedPkg, setSelectedPkg] = useState<any | null>(null);
  const [mmNumber, setMmNumber] = useState("");
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchPhone, setSearchPhone] = useState("");
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // Time remaining count down (starts at 2 hours)
  const [timeLeft, setTimeLeft] = useState(7200);

  // Ad carousel state
  const [currentAdIndex, setCurrentAdIndex] = useState(0);
  const ads = [
    { title: "🚀 Turbo Internet Speed", desc: "Upgrade to our SuperFast package for seamless 4K video streaming and downloads!" },
    { title: "⚡ Instant Mobile Money", desc: "Pay with MTN or Airtel Money for immediate voucher activation. Fully secured gateway." },
    { title: "📞 24/7 Helpline Support", desc: "Need assistance? Contact our team on WhatsApp using support numbers listed below." }
  ];

  useEffect(() => {
    if (config.portal_template !== "blue_modern") return;
    const interval = setInterval(() => {
      setCurrentAdIndex(prev => (prev + 1) % ads.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [config.portal_template]);

  useEffect(() => {
    if (step !== "success") return;
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [step]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return [
      h.toString().padStart(2, "0"),
      m.toString().padStart(2, "0"),
      s.toString().padStart(2, "0")
    ].join(":");
  };

  // Connect simulations
  const handleVoucherConnect = (codeVal: string) => {
    if (!codeVal) {
      toast.error("Please enter a voucher code.");
      return;
    }
    setStep("connecting");
    setTimeout(() => {
      setStep("success");
      toast.success("Voucher activated. Connection granted!");
    }, 2000);
  };

  const handleFreeConnect = () => {
    setStep("connecting");
    setTimeout(() => {
      setStep("success");
      toast.success("Connected to Free Wi-Fi!");
    }, 1500);
  };

  const handleDisconnect = () => {
    setStep("login");
    setOtpInput("");
    setPhone("");
    setVoucher("");
    setEmail("");
    setTimeLeft(7200);
    toast.info("Disconnected from Wi-Fi.");
  };

  // Payment simulation
  const handleInitiatePayment = (type: 'self' | 'another') => {
    if (!mmNumber) {
      toast.error("Please enter a Mobile Money number.");
      return;
    }
    setIsProcessingPayment(true);
    setTimeout(() => {
      setIsProcessingPayment(false);
      const code = 'NC-' + Math.random().toString(36).substring(2, 8).toUpperCase();
      setSelectedPkg(null);
      if (type === 'self') {
        setVoucher(code);
        toast.success(`Payment successful! Voucher ${code} copied to input. Click Connect to go online!`);
      } else {
        toast.success(`Payment successful! Voucher code is ${code}. Copy and share it!`);
      }
    }, 3000);
  };

  // Search lost code simulation
  const handleSearchVoucher = () => {
    if (!searchPhone) {
      toast.error("Please enter a phone number.");
      return;
    }
    setIsSearching(true);
    setTimeout(() => {
      setIsSearching(false);
      setSearchResults([
        { code: "NC-A3F9B1", profile: "Day Normal", amount: 8000, date: new Date().toLocaleDateString() },
        { code: "NC-D5X9Y2", profile: "6 Hour Pass", amount: 500, date: new Date(Date.now() - 86400000).toLocaleDateString() }
      ]);
    }, 1500);
  };

  const handleConnectVoucher = (code: string) => {
    setVoucher(code);
    setSearchOpen(false);
    toast.success(`Voucher code ${code} loaded! Tap Connect.`);
  };

  // Theme visual classes for standard portal
  const getThemeClasses = (themeName: string) => {
    switch (themeName) {
      case "classic":
        return {
          wrapper: "bg-slate-50 text-slate-800 min-h-screen flex flex-col justify-between",
          card: "bg-white border border-slate-200 shadow-md text-slate-800 rounded-none",
          input: "bg-slate-50 border-slate-300 text-slate-900 focus:ring-slate-900 placeholder-slate-400 rounded-none",
          button: "bg-slate-950 text-white hover:bg-slate-850 font-bold rounded-none",
          logo: "text-slate-950 font-black font-serif",
          pill: "bg-slate-100 text-slate-700 border border-slate-200"
        };
      case "modern":
        return {
          wrapper: "bg-slate-950 text-slate-100 min-h-screen flex flex-col justify-between",
          card: "bg-slate-900/70 backdrop-blur-md border border-purple-500/20 text-slate-100 shadow-2xl rounded-2xl shadow-purple-500/5",
          input: "bg-slate-800/80 border-slate-700 text-slate-100 focus:ring-purple-500 placeholder-slate-500 rounded-xl",
          button: "bg-gradient-to-r from-purple-500 to-indigo-500 text-white hover:opacity-95 font-semibold rounded-xl shadow-lg shadow-purple-500/20",
          logo: "text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-indigo-400 font-black",
          pill: "bg-purple-950/40 text-purple-300 border border-purple-800/30"
        };
      case "blue_modern":
      case "college_sample":
        return {
          wrapper: "bg-gradient-to-br from-blue-700 via-indigo-800 to-slate-900 text-white min-h-screen flex flex-col justify-between",
          card: "bg-white/10 backdrop-blur-md border border-white/20 text-white shadow-xl rounded-xl",
          input: "bg-white/15 border-white/20 text-white placeholder-white/50 focus:bg-white/20 focus:ring-blue-400 rounded-lg",
          button: "bg-gradient-to-r from-blue-500 to-cyan-500 text-white hover:opacity-95 font-bold rounded-lg shadow-lg shadow-blue-500/20",
          logo: "text-blue-300 font-extrabold tracking-wide",
          pill: "bg-blue-950/60 text-blue-200 border border-blue-500/30"
        };
      case "brown_cards":
        return {
          wrapper: "bg-[#F5F2EB] text-[#4A3C31] min-h-screen flex flex-col justify-between",
          card: "bg-[#EFEBE4] border border-[#DDD5C7] text-[#4A3C31] shadow-lg rounded-2xl",
          input: "bg-[#FAF8F5] border-[#C8BDB0] text-[#4A3C31] focus:ring-[#8B5A2B] placeholder-[#A09385] rounded-xl",
          button: "bg-[#8B5A2B] text-white hover:bg-[#724922] font-semibold rounded-xl shadow-md",
          logo: "text-[#5C3A21] font-bold",
          pill: "bg-[#E5DFD5] text-[#725E4D]"
        };
      case "dark":
        return {
          wrapper: "bg-slate-950 text-slate-100 min-h-screen flex flex-col justify-between",
          card: "bg-slate-900/90 border border-slate-800 text-slate-100",
          input: "bg-slate-800 border-slate-700 text-slate-100 focus:ring-primary placeholder-slate-500",
          button: "bg-primary text-primary-foreground hover:bg-primary/90",
          logo: "text-primary",
          pill: "bg-slate-800 text-slate-300"
        };
      case "glassmorphic":
        return {
          wrapper: "bg-gradient-to-tr from-violet-600 via-purple-600 to-indigo-600 text-white min-h-screen flex flex-col justify-between",
          card: "bg-white/10 backdrop-blur-xl border border-white/20 text-white shadow-2xl",
          input: "bg-white/10 border-white/25 text-white placeholder-white/60 focus:bg-white/20 focus:ring-white",
          button: "bg-white text-violet-700 hover:bg-slate-100 font-semibold shadow-lg",
          logo: "text-white drop-shadow-md",
          pill: "bg-white/10 text-white border border-white/15"
        };
      case "sunset":
        return {
          wrapper: "bg-gradient-to-br from-amber-500 via-red-500 to-pink-600 text-white min-h-screen flex flex-col justify-between",
          card: "bg-black/20 backdrop-blur-md border border-white/10 text-white shadow-xl",
          input: "bg-white/20 border-white/20 text-white placeholder-white/70 focus:bg-white/30",
          button: "bg-gradient-to-r from-amber-400 to-orange-500 text-slate-900 hover:opacity-90 font-bold",
          logo: "text-yellow-300 font-extrabold",
          pill: "bg-black/35 text-amber-200"
        };
      case "ocean":
        return {
          wrapper: "bg-gradient-to-br from-cyan-600 via-teal-600 to-emerald-600 text-white min-h-screen flex flex-col justify-between",
          card: "bg-teal-950/40 backdrop-blur-lg border border-teal-500/20 text-white shadow-xl",
          input: "bg-teal-950/50 border-teal-500/30 text-teal-50 placeholder-teal-200/50 focus:bg-teal-950/60",
          button: "bg-emerald-400 text-teal-950 hover:bg-emerald-300 font-bold",
          logo: "text-cyan-200",
          pill: "bg-teal-950/60 text-teal-200"
        };
      case "light":
      default:
        return {
          wrapper: "bg-slate-50 text-slate-900 min-h-screen flex flex-col justify-between",
          card: "bg-white border border-slate-200 shadow-xl text-slate-800",
          input: "bg-white border-slate-300 text-slate-900 focus:ring-slate-500 placeholder-slate-400",
          button: "bg-slate-900 text-white hover:bg-slate-800",
          logo: "text-slate-900 font-extrabold",
          pill: "bg-slate-100 text-slate-600"
        };
    }
  };

  const style = getThemeClasses(config.portal_template);
  const usesRenaultLayout = config.portal_template === "renault" || config.portal_template === "adsmob" || config.portal_template === "grid_portal";
  const isGridPortal = config.portal_template === "grid_portal";
  const accent = config.primary_color && /^#[0-9a-fA-F]{6}$/.test(config.primary_color) ? config.primary_color : "#FF6000";
  const accentDark = shadeColor(accent, -15);

  return (
    <div className={`min-h-screen flex flex-col justify-between transition-all duration-300 ${usesRenaultLayout ? (renaultTheme === "dark" ? "bg-[#000000] text-slate-100" : "bg-[#f9f9f9] text-slate-900") : style.wrapper}`}>

      {/* Top Banner Alert to let user know it's a simulation */}
      <div className="w-full bg-black/85 backdrop-blur-sm border-b border-slate-800 text-white p-3 flex items-center justify-between shadow-md text-xs z-50 sticky top-0">
        <div className="flex items-center gap-2 max-w-lg mx-auto w-full justify-between">
          <div className="flex items-center gap-1.5">
            <Smartphone className="w-4 h-4 text-orange-500 shrink-0 animate-bounce" />
            <span>Live Client Portal Simulation: <strong>{config.portal_template.toUpperCase()}</strong></span>
          </div>
          <button
            onClick={() => window.close()}
            className="bg-orange-500 hover:bg-orange-600 px-3 py-1 rounded text-white font-semibold transition-colors cursor-pointer"
          >
            Close Preview
          </button>
        </div>
      </div>

      {usesRenaultLayout ? (
        /* ════════════════════════════════════════════════════════
                     RENAULT CUSTOM TEMPLATE PREVIEW
           ════════════════════════════════════════════════════════ */
        <div className="flex-1 flex flex-col justify-between w-full max-w-[480px] mx-auto min-h-full shadow-2xl relative bg-inherit">
          {/* Header Banner */}
          <div className="relative min-h-[190px] flex flex-col justify-end p-6 bg-gradient-to-b from-[#1a1a1a] via-[#0d0d0d] to-[#000000] text-white overflow-hidden border-b-2" style={{ borderBottomColor: accent }}>
            <div className="absolute inset-0 opacity-10 pointer-events-none">
              {/* Decorative grid pattern */}
              <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                    <path d="M 40 0 L 0 0 0 40" fill="none" stroke={accent} strokeWidth="1" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid)" />
              </svg>
            </div>
            {/* Orange Radial Glow Blob */}
            <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full filter blur-3xl opacity-30 pointer-events-none" style={{ backgroundColor: accent }} />

            <div className="relative flex items-center justify-between gap-3 z-10 w-full">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 bg-white/10 border border-white/20 rounded-lg flex items-center justify-center shrink-0">
                  <img
                    src={config.logo_url && (config.logo_url.startsWith("http") || config.logo_url.endsWith(".jpg") || config.logo_url.endsWith(".png") || config.logo_url.includes("/")) ? config.logo_url : "/renault/mm_logo.jpg"}
                    alt="Logo"
                    className="w-9 h-9 object-contain rounded-md"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "/renault/mm_logo.jpg";
                    }}
                  />
                </div>
                <div className="space-y-0.5">
                  <h1 className="text-base font-extrabold tracking-tight text-white flex items-center gap-1.5">
                    {config.title || "Renault WIFI"}
                  </h1>
                  <p className="text-[10px] text-slate-300 font-medium">{config.description || "High-speed internet access portal"}</p>

                  {/* Contact numbers */}
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {config.phone_one && (
                      <a href={`tel:${config.phone_one}`} className="text-[9px] bg-white/10 hover:bg-white/20 px-1.5 py-0.5 rounded text-orange-400 font-semibold transition-colors">
                        {config.phone_one}
                      </a>
                    )}
                    {config.phone_two && (
                      <a href={`tel:${config.phone_two}`} className="text-[9px] bg-white/10 hover:bg-white/20 px-1.5 py-0.5 rounded text-orange-400 font-semibold transition-colors">
                        {config.phone_two}
                      </a>
                    )}
                  </div>
                </div>
              </div>

              {/* Action buttons (Search, Theme Toggle) */}
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => { setSearchOpen(true); setSearchResults(null); setSearchPhone(""); }}
                  className="w-9 h-9 rounded-full bg-white/10 border border-white/20 flex items-center justify-center hover:bg-white/20 transition-all text-white"
                  title="Search Lost Voucher"
                >
                  <Search className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setRenaultTheme(t => t === "light" ? "dark" : "light")}
                  className="w-9 h-9 rounded-full bg-white/10 border border-white/20 flex items-center justify-center hover:bg-white/20 transition-all text-white"
                >
                  {renaultTheme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Bottom wave decoration */}
            <div className="absolute bottom-0 left-0 right-0 h-4 bg-inherit transform translate-y-1/2 rounded-t-[100%]" />
          </div>

          <main className="p-4 space-y-6">
            {config.portal_template === "adsmob" && step === "login" && (
              <div className={`overflow-hidden rounded-xl border shadow-lg ${renaultTheme === "dark" ? "border-slate-800 bg-slate-900" : "border-orange-100 bg-white"}`}>
                <div className="relative h-32 overflow-hidden bg-gradient-to-br from-orange-600 via-orange-500 to-amber-300 p-5 text-white">
                  <div className="absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/15" />
                  <div className="relative">
                    <span className="text-[9px] font-black uppercase tracking-[0.2em]">Sponsored</span>
                    <h2 className="mt-3 text-lg font-black">Advertise where customers connect</h2>
                    <p className="mt-1 max-w-[280px] text-[11px] text-white/85">
                      Banner and video campaigns appear directly inside this captive portal.
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 p-3">
                  <div>
                    <p className="text-xs font-bold">AdsMob campaign preview</p>
                    <p className="text-[10px] text-muted-foreground">Uploaded media from Cloudflare R2 appears here.</p>
                  </div>
                  <span className="shrink-0 rounded bg-orange-500 px-2.5 py-1 text-[10px] font-bold text-white">
                    Learn more
                  </span>
                </div>
              </div>
            )}

            {step === "connecting" && (
              <div className="py-12 text-center space-y-4">
                <Loader2 className="w-12 h-12 animate-spin mx-auto" style={{ color: accent }} />
                <h3 className="text-base font-bold">Verifying Voucher...</h3>
                <p className="text-xs text-muted-foreground">Connecting you to Uganda's premium hotspot network tunnel...</p>
              </div>
            )}

            {step === "success" && (
              <Card className={`border-none shadow-xl ${renaultTheme === "dark" ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
                <CardContent className="p-5 text-center space-y-6">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center mx-auto border border-emerald-500/30">
                    <CheckCircle2 className="w-6 h-6 animate-bounce" />
                  </div>
                  <div className="space-y-1">
                    <h2 className="text-lg font-black text-emerald-500">Access Successfully Granted!</h2>
                    <p className="text-xs text-muted-foreground">You are now securely connected to the internet.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-left">
                    <div className="p-3 bg-slate-500/5 rounded border border-slate-500/10">
                      <span className="text-[10px] font-semibold text-muted-foreground block uppercase">Remaining Time</span>
                      <span className="text-sm font-bold font-mono">{formatTime(timeLeft)}</span>
                    </div>
                    <div className="p-3 bg-slate-500/5 rounded border border-slate-500/10">
                      <span className="text-[10px] font-semibold text-muted-foreground block uppercase">Logo Label</span>
                      <span className="text-xs font-bold truncate block">{config.logo_url || "Renault Hotspot"}</span>
                    </div>
                  </div>
                  <Button onClick={handleDisconnect} variant="ghost" className="w-full text-xs text-red-500 hover:bg-red-500/10 hover:text-red-600 gap-1.5">
                    <LogOut className="w-3.5 h-3.5" /> Disconnect Session
                  </Button>
                </CardContent>
              </Card>
            )}

            {step === "login" && (
              <>
                {/* 1. VOUCHER CONNECT CARD */}
                <Card className={`border-none shadow-lg ${renaultTheme === "dark" ? "bg-slate-900 text-white" : "bg-white text-slate-900"}`}>
                  <CardContent className="p-4 space-y-4">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      <Key className="w-4 h-4" style={{ color: accent }} />
                      Voucher Code
                    </div>
                    <div className="flex gap-2">
                      <Input
                        value={voucher}
                        onChange={(e) => setVoucher(e.target.value)}
                        placeholder="e.g. NC-A3F9B1 or TransactionID"
                        className={`text-sm uppercase ${renaultTheme === "dark" ? "bg-slate-800 border-slate-700" : "bg-slate-50 border-slate-200"}`}
                      />
                      <Button
                        onClick={() => handleVoucherConnect(voucher)}
                        className="hover:opacity-95 text-white font-bold shadow-lg"
                        style={{ backgroundImage: `linear-gradient(to right, ${accent}, ${accentDark})` }}
                      >
                        Connect
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* 2. INTERNET PACKAGES SECTION */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b pb-2">
                    <h3 className="text-sm font-bold flex items-center gap-1.5">
                      <Wifi className="w-4 h-4" style={{ color: accent }} />
                      {isGridPortal ? "Choose a WiFi Package" : "Internet Packages"}
                    </h3>
                    {!isGridPortal && (
                      <span className="text-xs font-semibold uppercase" style={{ color: accent }}>{config.logo_url || "RENAULT"}</span>
                    )}
                  </div>

                  {!isGridPortal && (
                    <div className="grid grid-cols-3 gap-1 p-1 bg-slate-500/10 rounded-lg">
                      {["Lite", "Normal", "SuperFast"].map((tab) => (
                        <button
                          key={tab}
                          onClick={() => setRenaultSpeedTab(tab as any)}
                          className="py-1.5 text-xs font-bold rounded-md transition-all"
                          style={renaultSpeedTab === tab ? { backgroundColor: accent, color: "#fff" } : undefined}
                        >
                          {tab}
                        </button>
                      ))}
                    </div>
                  )}

                  {isGridPortal ? (
                    /* Grid Portal: flat 2-column package grid (no speed tabs) */
                    <div className="grid grid-cols-2 gap-2.5">
                      {Object.values(RENAULT_PACKAGES).flat().map((pkg) => (
                        <div
                          key={pkg.id}
                          onClick={() => { setSelectedPkg(pkg); setMmNumber(""); }}
                          className={`flex flex-col items-center text-center gap-1 p-3 rounded-xl border transition-all cursor-pointer hover:-translate-y-0.5 ${renaultTheme === "dark" ? "bg-slate-900/40 border-slate-800" : "bg-white border-slate-200"}`}
                          onMouseEnter={(e) => (e.currentTarget.style.borderColor = accent)}
                          onMouseLeave={(e) => (e.currentTarget.style.borderColor = "")}
                        >
                          <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{pkg.limit}</span>
                          <span className="font-bold text-sm">{pkg.data}</span>
                          <span className="font-extrabold text-sm" style={{ color: accent }}>UGX {pkg.total.toLocaleString()}</span>
                          <span className="w-full text-white text-[10px] font-bold px-2 py-1.5 rounded-md mt-1" style={{ backgroundColor: accent }}>Buy Now</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {RENAULT_PACKAGES[renaultSpeedTab].map((pkg) => (
                        <div
                          key={pkg.id}
                          onClick={() => { setSelectedPkg(pkg); setMmNumber(""); }}
                          className={`flex items-center justify-between p-3 rounded-lg border transition-all cursor-pointer ${renaultTheme === "dark" ? "bg-slate-900/40 border-slate-800" : "bg-white border-slate-200"}`}
                        >
                          <div>
                            <div className="font-bold text-sm">{pkg.data}</div>
                            <div className="text-xs text-muted-foreground">{pkg.limit} · {pkg.devices} device{pkg.devices > 1 ? "s" : ""}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-sm" style={{ color: accent }}>UGX {pkg.total.toLocaleString()}</span>
                            <span className="text-white text-[10px] font-bold px-2 py-1 rounded" style={{ backgroundColor: accent }}>Buy</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </main>

          {/* Footer */}
          <footer className="p-4 border-t border-slate-500/10 text-center text-[10px] text-muted-foreground space-y-1">
            <p>© 2026 Renault Guest Access Network Gateway</p>
            <p className="flex items-center justify-center gap-1">
              <Shield className="w-3.5 h-3.5 text-emerald-500" /> Protected Mobile Money Transaction Gateway
            </p>
          </footer>

          {/* ════════════════════════════════════════
                MODAL: PAYMENT (Mobile Money Purchase)
             ═════════════════════════════════════════ */}
          {selectedPkg && (
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-40 flex flex-col justify-end">
              <div className={`p-6 rounded-t-2xl shadow-2xl space-y-4 transform transition-transform translate-y-0 ${renaultTheme === "dark" ? "bg-slate-900 text-white" : "bg-white text-slate-900"}`}>
                <div className="flex items-center justify-between border-b pb-2">
                  <h3 className="font-bold text-sm">Purchase Voucher: {selectedPkg.data}</h3>
                  <button onClick={() => setSelectedPkg(null)} className="p-1 hover:bg-slate-500/15 rounded-full">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-3 rounded-lg text-xs leading-relaxed" style={{ backgroundColor: `${accent}1a`, border: `1px solid ${accent}33`, color: accent }}>
                  <strong>Uganda Mobile Money Payment:</strong> Enter your MTN or Airtel Money phone number below to proceed. A prompt will be sent directly to your phone to authorise payment of <strong>UGX {selectedPkg.total.toLocaleString()}</strong>.
                </div>

                <div className="space-y-2">
                  <Label htmlFor="mmNumber" className="text-xs font-bold block">MTN / Airtel Phone Number</Label>
                  <Input
                    id="mmNumber"
                    value={mmNumber}
                    onChange={(e) => setMmNumber(e.target.value)}
                    placeholder="e.g. 0771234567 or 0752345678"
                    className={`text-sm ${renaultTheme === "dark" ? "bg-slate-800 border-slate-700" : "bg-slate-50 border-slate-200"}`}
                  />
                </div>

                {isProcessingPayment ? (
                  <div className="py-4 text-center space-y-2">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto" style={{ color: accent }} />
                    <p className="text-xs text-muted-foreground font-semibold">Processing Mobile Money Transaction... check phone prompt</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <Button onClick={() => handleInitiatePayment('self')} className="text-white text-xs font-bold py-2 hover:opacity-90" style={{ backgroundColor: accent }}>
                      Buy for Self
                    </Button>
                    <Button onClick={() => handleInitiatePayment('another')} variant="outline" className="text-xs font-bold py-2 hover:opacity-80" style={{ borderColor: `${accent}66`, color: accent }}>
                      Buy for Another
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════
                MODAL: SEARCH LOST VOUCHER (Bottom Sheet)
             ═════════════════════════════════════════ */}
          {searchOpen && (
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-40 flex flex-col justify-end">
              <div className={`p-6 rounded-t-2xl shadow-2xl space-y-4 max-h-[80vh] overflow-y-auto ${renaultTheme === "dark" ? "bg-slate-900 text-white" : "bg-white text-slate-900"}`}>
                <div className="flex items-center justify-between border-b pb-2">
                  <div>
                    <h3 className="font-bold text-sm">Search Lost Voucher</h3>
                    <p className="text-[10px] text-muted-foreground">Search by phone number used during payment</p>
                  </div>
                  <button onClick={() => setSearchOpen(false)} className="p-1 hover:bg-slate-500/15 rounded-full">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex gap-2">
                  <Input
                    value={searchPhone}
                    onChange={(e) => setSearchPhone(e.target.value)}
                    placeholder="e.g. 0771234567"
                    className={`text-sm ${renaultTheme === "dark" ? "bg-slate-800 border-slate-700" : "bg-slate-50 border-slate-200"}`}
                  />
                  <Button onClick={handleSearchVoucher} className="text-white text-xs font-bold hover:opacity-90" style={{ backgroundColor: accent }} disabled={isSearching}>
                    {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}
                  </Button>
                </div>

                {searchResults && (
                  <div className="space-y-2 pt-2">
                    <h4 className="text-xs font-bold text-muted-foreground uppercase">Found Vouchers</h4>
                    {searchResults.map((res, i) => (
                      <div key={i} className={`p-3 rounded border flex items-center justify-between ${renaultTheme === "dark" ? "bg-slate-800/40 border-slate-800" : "bg-slate-50 border-slate-200"}`}>
                        <div>
                          <div className="font-bold text-sm font-mono" style={{ color: accent }}>{res.code}</div>
                          <div className="text-[10px] text-muted-foreground">{res.profile} · UGX {res.amount}</div>
                        </div>
                        <Button onClick={() => handleConnectVoucher(res.code)} size="sm" className="text-[10px] h-7 px-2 hover:opacity-90" style={{ backgroundColor: accent }}>
                          Connect
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ════════════════════════════════════════════════════════
                     STANDARD CLIENT THEMES PREVIEW
           ════════════════════════════════════════════════════════ */
        <>
          <div className="my-auto w-full max-w-md mx-auto z-10 p-4">

            {/* LOADING STATE */}
            {step === "connecting" && (
              <Card className={`border-none ${style.card}`}>
                <CardContent className="p-8 text-center space-y-4">
                  <Loader2 className="w-12 h-12 animate-spin mx-auto text-primary" />
                  <div className="space-y-1">
                    <h3 className="text-base font-bold">Verifying Credentials</h3>
                    <p className="text-xs opacity-70">Securing your guest access session tunnel...</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* LOGIN SCREEN STEP */}
            {step === "login" && (
              <Card className={`border-none shadow-2xl ${style.card}`}>
                <CardContent className="p-5 sm:p-6 space-y-6">

                  {/* Heading */}
                  <div className="text-center space-y-2">
                    <h1 className="text-lg sm:text-xl font-extrabold tracking-tight">
                      {config.title || "Welcome to our Wi-Fi Zone"}
                    </h1>
                    <p className="text-xs opacity-80 leading-relaxed">
                      {config.description || "Enjoy complimentary high-speed internet connection."}
                    </p>
                  </div>

                  {/* Ads Carousel (Blue Modern only) */}
                  {config.portal_template === "blue_modern" && (
                    <div className="w-full bg-blue-950/40 border border-blue-500/20 rounded-lg p-3 space-y-1 relative overflow-hidden transition-all duration-300">
                      <div className="flex items-center gap-1.5 text-[9px] font-black uppercase text-blue-300 tracking-wider">
                        <Tv className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        Sponsored Promotion
                      </div>
                      <div className="min-h-[48px] flex flex-col justify-center">
                        <h4 className="text-[11px] font-bold text-white transition-opacity duration-300">
                          {ads[currentAdIndex].title}
                        </h4>
                        <p className="text-[10px] text-blue-100/70 leading-normal transition-opacity duration-300">
                          {ads[currentAdIndex].desc}
                        </p>
                      </div>
                      <div className="flex justify-center gap-1 pt-1.5">
                        {ads.map((_, idx) => (
                          <button
                            key={idx}
                            onClick={() => setCurrentAdIndex(idx)}
                            className={`w-1.5 h-1.5 rounded-full transition-all ${currentAdIndex === idx ? "bg-cyan-400 w-3" : "bg-white/30"}`}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Standard Connect Options */}
                  <div className="space-y-4">
                    {/* Free Connection */}
                    <div className="p-3 rounded-lg border border-current/10 bg-current/5 text-center space-y-2">
                      <p className="text-[11px] opacity-75">Connect immediately without registration.</p>
                      <Button onClick={handleFreeConnect} size="sm" className={`w-full font-bold ${style.button}`}>
                        One-Click Fast Connect
                      </Button>
                    </div>

                    {/* Voucher Connection */}
                    <form onSubmit={(e) => { e.preventDefault(); handleVoucherConnect(voucher); }} className="space-y-2.5 p-3 rounded-lg border border-current/10 bg-current/5">
                      <Label className="text-xs font-bold flex items-center gap-1.5">
                        <Key className="w-3.5 h-3.5 text-emerald-400" /> Prepaid Voucher Code
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          required
                          type="text"
                          value={voucher}
                          onChange={(e) => setVoucher(e.target.value)}
                          placeholder="WIFI-XXXX-XXXX"
                          className={`text-xs h-9 uppercase ${style.input}`}
                        />
                        <Button type="submit" size="sm" className={`h-9 font-bold shrink-0 ${style.button}`}>
                          Verify
                        </Button>
                      </div>
                    </form>
                  </div>

                  {/* Support Numbers */}
                  {(config.phone_one || config.phone_two) && (
                    <div className="text-[10px] text-center opacity-60 border-t pt-3 flex justify-center gap-3">
                      {config.phone_one && <span>Support: {config.phone_one}</span>}
                      {config.phone_two && <span>Alt: {config.phone_two}</span>}
                    </div>
                  )}

                  {/* Compliance Box */}
                  <div className="flex items-start gap-2.5 p-3 bg-current/5 border border-current/10 rounded-lg text-[11px] leading-relaxed">
                    <Switch
                      id="termsAccept"
                      checked={termsAccepted}
                      onCheckedChange={setTermsAccepted}
                      className="mt-0.5"
                    />
                    <Label htmlFor="termsAccept" className="opacity-80 select-none cursor-pointer leading-normal">
                      By connecting, you agree to our Terms of Service & Privacy Policy. We pledge to secure your network and session data.
                    </Label>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* SUCCESS / CONNECTED STATE */}
            {step === "success" && (
              <Card className={`border-none shadow-2xl ${style.card}`}>
                <CardContent className="p-5 sm:p-6 space-y-6 text-center">

                  {/* Checkmark icon */}
                  <div className="w-14 h-14 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/30">
                    <CheckCircle2 className="w-8 h-8 animate-bounce" />
                  </div>

                  <div className="space-y-1">
                    <h2 className="text-lg font-black tracking-tight">Access Successfully Granted!</h2>
                    <p className="text-xs opacity-75">You are now securely connected to the Guest Wi-Fi.</p>
                  </div>

                  {/* Connected Details Grid */}
                  <div className="grid grid-cols-2 gap-3 text-left">
                    <div className="p-3 bg-current/5 border border-current/10 rounded-lg space-y-1">
                      <span className="text-[9px] font-bold opacity-60 uppercase flex items-center gap-1">
                        <Clock className="w-3 h-3 text-primary" /> Remaining Time
                      </span>
                      <p className="text-sm font-black font-mono">{formatTime(timeLeft)}</p>
                    </div>

                    <div className="p-3 bg-current/5 border border-current/10 rounded-lg space-y-1">
                      <span className="text-[9px] font-bold opacity-60 uppercase flex items-center gap-1">
                        <Shield className="w-3 h-3 text-emerald-400" /> Security State
                      </span>
                      <p className="text-xs font-bold text-emerald-400 flex items-center gap-0.5">
                        <Lock className="w-2.5 h-2.5" /> Secured Tunnel
                      </p>
                    </div>
                  </div>

                  {/* Disconnect Action Button */}
                  <div className="space-y-2 pt-2 border-t border-current/10">
                    <Button
                      variant="ghost"
                      onClick={handleDisconnect}
                      className="w-full text-xs hover:bg-destructive/10 hover:text-destructive flex items-center justify-center gap-1.5"
                    >
                      <LogOut className="w-3.5 h-3.5" /> Disconnect Session
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Footer Branding Info */}
          <footer className="mt-auto pt-6 text-center text-[10px] opacity-60 flex justify-between items-center max-w-md w-full mx-auto select-none border-t border-current/10 p-4 pointer-events-none z-10">
            <span>© 2026 ForeForm Guest Network Access Gateway</span>
            <span className="flex items-center gap-0.5"><Shield className="w-3 h-3 text-emerald-400" /> Protected session</span>
          </footer>
        </>
      )}
    </div>
  );
}

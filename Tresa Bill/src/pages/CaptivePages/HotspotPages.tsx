import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import AppHeader from "@/components/Header/AppHeader";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Sparkles,
    Layout,
    ArrowRight,
    Eye,
    Megaphone,
    TicketCheck,
    LayoutGrid
} from "lucide-react";

const TEMPLATES = [
    {
        id: "offline",
        title: "Offline Voucher Portal",
        description: "Voucher-only captive portal with package pricing and automatic reconnect.",
        icon: <TicketCheck className="w-8 h-8 text-emerald-500" />,
        badge: "No Mobile Money",
        badgeColor: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
        gradient: "from-emerald-500/10 via-teal-500/5 to-transparent",
        borderHover: "hover:border-emerald-500 hover:shadow-emerald-500/10"
    },
    {
        id: "adsmob",
        title: "AdsMob Portal",
        description: "Monetized captive portal with banner, flash, image, and video ads.",
        icon: <Megaphone className="w-8 h-8 text-orange-500" />,
        badge: "Ads Ready",
        badgeColor: "bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300",
        gradient: "from-orange-500/10 via-amber-500/5 to-transparent",
        borderHover: "hover:border-orange-500 hover:shadow-orange-500/10"
    },
    {
        id: "classic",
        title: "Classic",
        description: "Clean and professional design with a focused login experience.",
        icon: <Layout className="w-8 h-8 text-slate-600" />,
        badge: "Professional",
        badgeColor: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
        gradient: "from-slate-500/10 via-slate-500/5 to-transparent",
        borderHover: "hover:border-slate-500 hover:shadow-slate-500/10"
    },
    {
        id: "modern",
        title: "Modern",
        description: "Sleek with smooth animations and modern aesthetics.",
        icon: <Sparkles className="w-8 h-8 text-purple-500" />,
        badge: "Sleek",
        badgeColor: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
        gradient: "from-purple-500/10 via-indigo-500/5 to-transparent",
        borderHover: "hover:border-purple-500 hover:shadow-purple-500/10"
    },
    {
        id: "grid_portal",
        title: "Grid Portal",
        description: "2-column package grid with mobile money and a custom brand color.",
        icon: <LayoutGrid className="w-8 h-8 text-orange-500" />,
        badge: "Customizable Color",
        badgeColor: "bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300",
        gradient: "from-orange-500/10 via-amber-500/5 to-transparent",
        borderHover: "hover:border-orange-500 hover:shadow-orange-500/10"
    },
];

// ── iframe scaled to fill its parent card exactly ──────────────────────────
const IFRAME_W = 1200;
const IFRAME_H = 780;
const PREVIEW_H = 220; // px — the visible card slot height

function ScaledPreview({ src, title }: { src: string; title: string }) {
    const wrapRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(0.34);

    const recalc = useCallback(() => {
        if (wrapRef.current) {
            setScale(wrapRef.current.offsetWidth / IFRAME_W);
        }
    }, []);

    useEffect(() => {
        recalc();
        const ro = new ResizeObserver(recalc);
        if (wrapRef.current) ro.observe(wrapRef.current);
        return () => ro.disconnect();
    }, [recalc]);

    return (
        // outer: fixed height, clips the scaled content
        <div
            ref={wrapRef}
            style={{ height: `${PREVIEW_H}px`, overflow: "hidden", position: "relative", width: "100%" }}
        >
            {/* inner: full iframe size, scaled down to container width */}
            <div
                style={{
                    width: `${IFRAME_W}px`,
                    height: `${IFRAME_H}px`,
                    transform: `scale(${scale})`,
                    transformOrigin: "top left",
                }}
            >
                <iframe
                    src={src}
                    title={title}
                    scrolling="no"
                    style={{
                        width: `${IFRAME_W}px`,
                        height: `${IFRAME_H}px`,
                        border: "none",
                        pointerEvents: "none",
                        display: "block",
                    }}
                />
            </div>
        </div>
    );
}

export default function HotspotPages() {
    const navigate = useNavigate();
    const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("sidebar-collapsed") === "true");

    useEffect(() => {
        const handler = (e: Event) => {
            setSidebarCollapsed(Boolean((e as CustomEvent<{ collapsed?: boolean }>).detail?.collapsed));
        };
        window.addEventListener("sidebar-collapse-change", handler);
        return () => window.removeEventListener("sidebar-collapse-change", handler);
    }, []);

    return (
        <div className={`min-h-screen bg-background transition-all duration-300 ${sidebarCollapsed ? "md:pl-[72px]" : "md:pl-[280px]"}`}>
            <SEO title="Captive Portal Templates" />
            <AppHeader />

            <main className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6 space-y-6">
                {/* Header section */}
                <div className="space-y-1">
                    <h2 className="text-sm font-extrabold tracking-tight bg-gradient-to-r from-foreground via-foreground/95 to-foreground/70 bg-clip-text text-transparent">
                        Captive Portal Templates
                    </h2>
                    <p className="text-muted-foreground text-xs md:text-sm leading-relaxed max-w-3xl">
                        Select from our premium, production-grade hotspot landing page templates.
                    </p>
                </div>

                {/* Grid layout */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2 gap-6">
                    {TEMPLATES.map((tmpl) => (
                        <Card
                            key={tmpl.id}
                            className={`flex flex-col border border-border/40 bg-card/40 backdrop-blur-sm shadow-sm transition-all duration-300 ${tmpl.borderHover} group`}
                        >
                            <CardHeader className="p-4 pb-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2.5">
                                        {tmpl.icon}
                                        <CardTitle className="text-sm font-extrabold group-hover:text-primary transition-colors">
                                            {tmpl.title}
                                        </CardTitle>
                                    </div>
                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${tmpl.badgeColor}`}>
                                        {tmpl.badge}
                                    </span>
                                </div>
                                <CardDescription className="text-[11px] mt-0.5 line-clamp-1 leading-relaxed">
                                    {tmpl.description}
                                </CardDescription>
                            </CardHeader>

                            {/* ── Live portal preview thumbnail ── */}
                            <div className="relative mx-3 rounded-xl mb-0 overflow-hidden border border-border/30 bg-white">
                                <ScaledPreview
                                    src={`/captive-portals/preview?template=${tmpl.id}&preview=1`}
                                    title={`${tmpl.title} preview`}
                                />
                                {/* overlay so card hover still works */}
                                <div className="absolute inset-0 bg-transparent" />
                                {/* full-preview button on hover */}
                                <button
                                    onClick={(e) => { e.stopPropagation(); window.open(`/captive-portals/preview?template=${tmpl.id}&preview=1`, "_blank"); }}
                                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 hover:bg-black/80 text-white rounded px-2 py-1 text-[10px] font-bold flex items-center gap-1"
                                >
                                    <Eye className="w-3 h-3" /> Full Preview
                                </button>
                            </div>

                            <CardContent className="p-4 pt-3 space-y-3">
                            </CardContent>

                            <CardFooter className="p-5 pt-0">
                                <div className="flex w-full gap-2">
                                    {tmpl.id === "adsmob" && (
                                        <Button
                                            variant="outline"
                                            onClick={() => navigate("/settings/adsmob")}
                                            className="flex-1 font-bold text-xs h-10"
                                        >
                                            Configure Ads
                                        </Button>
                                    )}
                                    <Button
                                        onClick={() => navigate(`/captive-portals/customize?template=${tmpl.id}`)}
                                        className="flex-1 bg-gradient-to-r from-primary to-primary-mid hover:opacity-95 font-bold text-xs h-10 shadow-sm flex items-center justify-center gap-1.5 group/btn"
                                    >
                                        {tmpl.id === "adsmob" ? "Deploy Portal" : "Use This"}
                                        <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover/btn:translate-x-1" />
                                    </Button>
                                </div>
                            </CardFooter>
                        </Card>
                    ))}
                </div>
            </main>
        </div>
    );
}

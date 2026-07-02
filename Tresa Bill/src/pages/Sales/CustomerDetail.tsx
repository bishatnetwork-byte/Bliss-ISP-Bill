import AppHeader from "@/components/Header/AppHeader";
import SEO from "@/components/SEO";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
    isVoucherRevenueSale,
    voucherPaymentMethod,
    voucherPaymentMode,
    voucherRevenueDate,
    voucherSalesStatus,
} from "@/lib/voucherSales";
import { useBranchVouchers, useRouters } from "@/hooks/useRouters";
import {
    ArrowLeft,
    Calendar,
    CheckCircle2,
    Clock,
    Copy,
    CreditCard,
    Printer,
    ShoppingBag,
    User,
    Wallet,
    XCircle,
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { VerifiedCustomerName } from ".";

interface SalesRecord {
    id: string;
    router: string;
    voucherCode: string;
    profile: string;
    amount: number;
    activatedAt: string;
    expiresAt: string;
    status: "Active" | "Expired" | "Unactivated" | "Sync Issue";
    paymentMode: "Online Payment" | "Voucher Printing";
    paymentMethod: string;
    buyerName: string;
    phone: string;
    email: string;
    transactionId: string;
    deviceMac: string;
    bytesUsed: string;
    createdDate: string;
}

const formatUGX = (val: number) => val.toLocaleString() + " UGX";

function StatusDot({ status }: { status: SalesRecord["status"] }) {
    const map: Record<string, string> = {
        Active: "bg-emerald-500 ring-emerald-500/20",
        Expired: "bg-slate-400 ring-slate-400/20",
        Unactivated: "bg-amber-400 ring-amber-400/20",
        "Sync Issue": "bg-red-400 ring-red-400/20",
    };
    return (
        <span
            className={cn(
                "inline-block w-2.5 h-2.5 rounded-full ring-4 shrink-0 mt-1",
                map[status] ?? "bg-muted ring-muted/20"
            )}
        />
    );
}

function StatusBadge({ status }: { status: SalesRecord["status"] }) {
    const map: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
        Active: {
            label: "Active",
            cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
            icon: <CheckCircle2 className="w-3 h-3" />,
        },
        Expired: {
            label: "Expired",
            cls: "bg-slate-500/10 text-slate-500 border-slate-500/20",
            icon: <XCircle className="w-3 h-3" />,
        },
        Unactivated: {
            label: "Unactivated",
            cls: "bg-amber-500/10 text-amber-600 border-amber-500/20",
            icon: <Clock className="w-3 h-3" />,
        },
        "Sync Issue": {
            label: "Sync Issue",
            cls: "bg-red-500/10 text-red-500 border-red-500/20",
            icon: <XCircle className="w-3 h-3" />,
        },
    };
    const s = map[status] ?? { label: status, cls: "bg-muted text-muted-foreground border-border", icon: null };
    return (
        <Badge
            variant="outline"
            className={cn("inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border", s.cls)}
        >
            {s.icon}
            {s.label}
        </Badge>
    );
}

export default function CustomerDetail() {
    const { phone } = useParams<{ phone: string }>();
    const navigate = useNavigate();
    const [sidebarCollapsed, setSidebarCollapsed] = useState(
        () => localStorage.getItem("sidebar-collapsed") === "true"
    );

    useEffect(() => {
        const handler = (e: any) => setSidebarCollapsed(e.detail.collapsed);
        window.addEventListener("sidebar-collapse-change", handler);
        return () => window.removeEventListener("sidebar-collapse-change", handler);
    }, []);

    const branchId = localStorage.getItem("selected-workspace") || "";
    const { data: vouchersData, isFetching } = useBranchVouchers(branchId, { limit: 1000 });

    const purchases = React.useMemo<SalesRecord[]>(() => {
        if (!vouchersData?.vouchers) return [];
        return vouchersData.vouchers
            .filter((v) => {
                const ph = v.phone_number === "BULK" ? "" : v.phone_number;
                return ph === phone && isVoucherRevenueSale(v);
            })
            .map((v) => ({
                id: v.id,
                router: v.router_name,
                voucherCode: v.voucher_code,
                profile: `${v.speed_type} ${v.profile}`,
                amount: v.amount,
                activatedAt: v.activated_at?.replace("T", " ").substring(0, 19) || "N/A",
                expiresAt: v.expires_at?.replace("T", " ").substring(0, 19) || "N/A",
                status: voucherSalesStatus(v),
                paymentMode: voucherPaymentMode(v) as SalesRecord["paymentMode"],
                paymentMethod: voucherPaymentMethod(v),
                buyerName: `Customer ${v.phone_number}`,
                phone: v.phone_number,
                email: "",
                transactionId: v.payment_reference || v.id.slice(0, 10).toUpperCase(),
                deviceMac: "N/A",
                bytesUsed: v.data || "N/A",
                createdDate: voucherRevenueDate(v).slice(0, 10),
            }))
            .sort((a, b) => b.createdDate.localeCompare(a.createdDate));
    }, [vouchersData, phone]);

    const totalSpent = purchases.reduce((s, p) => s + p.amount, 0);
    const activeCount = purchases.filter((p) => p.status === "Active").length;
    const lastPurchase = purchases[0]?.createdDate ?? "—";

    const handleCopy = (code: string) => {
        navigator.clipboard.writeText(code);
        toast.success("Voucher code copied!");
    };

    return (
        <div
            className={cn(
                "min-h-screen bg-background transition-all duration-300",
                sidebarCollapsed ? "md:pl-[72px]" : "md:pl-[280px]"
            )}
        >
            <SEO title={`Customer: ${phone}`} />
            <AppHeader />

            <main className="px-4 sm:px-6 py-6 max-w-4xl mx-auto space-y-6">
                {/* Back navigation */}
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate("/sales")}
                    className="flex items-center gap-1.5 -ml-2 text-muted-foreground hover:text-foreground h-8"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Back to Sales
                </Button>

                {/* Customer Header Card */}
                <Card className="border border-border/0 rounded overflow-hidden">
                    <div className="h-1.5 bg-gradient-to-r from-primary via-blue-500 to-cyan-400" />
                    <CardHeader className="pb-3 flex flex-col sm:flex-row sm:items-center gap-3">
                        <div>
                            <CardTitle className="text-base font-bold text-foreground">
                                <VerifiedCustomerName
                                    phone={phone}
                                    fallback={`Customer ${phone}`}
                                />
                            </CardTitle>
                            <p className="text-xs text-muted-foreground font-mono mt-0.5">{phone}</p>
                        </div>
                    </CardHeader>
                </Card>

                {/* Stats Row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                        {
                            label: "Total Vouchers",
                            value: isFetching ? "…" : String(purchases.length),
                            icon: <ShoppingBag className="w-4 h-4 text-blue-500" />,
                            accent: "border-l-blue-500",
                        },
                        {
                            label: "Total Spent",
                            value: isFetching ? "…" : formatUGX(totalSpent),
                            icon: <Wallet className="w-4 h-4 text-emerald-500" />,
                            accent: "border-l-emerald-500",
                        },
                        {
                            label: "Active Now",
                            value: isFetching ? "…" : String(activeCount),
                            icon: <CheckCircle2 className="w-4 h-4 text-cyan-500" />,
                            accent: "border-l-cyan-500",
                        },
                        {
                            label: "Last Purchase",
                            value: isFetching ? "…" : lastPurchase,
                            icon: <Calendar className="w-4 h-4 text-orange-500" />,
                            accent: "border-l-orange-500",
                        },
                    ].map((stat) => (
                        <Card
                            key={stat.label}
                            className={cn(
                                "rounded border border-border/40 border-l-2 p-4 flex flex-col gap-2",
                                stat.accent
                            )}
                        >
                            <div className="flex items-center justify-between">
                                <p className="text-[12px] font-bold  text-muted-foreground">
                                    {stat.label}
                                </p>
                                {stat.icon}
                            </div>
                            <p className="text-lg font-extrabold text-foreground leading-tight">{stat.value}</p>
                        </Card>
                    ))}
                </div>

                {/* Purchase Timeline */}
                <Card className="border border-border/40 rounded">
                    <CardHeader className="pb-3 border-b border-border/40">
                        <CardTitle className="text-sm font-bold text-foreground">Purchase Timeline</CardTitle>
                        <p className="text-xs text-muted-foreground">
                            {purchases.length} voucher{purchases.length !== 1 ? "s" : ""} purchased
                        </p>
                    </CardHeader>
                    <CardContent className="pt-5">
                        {isFetching ? (
                            <div className="flex flex-col gap-3">
                                {[1, 2, 3].map((i) => (
                                    <div key={i} className="h-20 rounded bg-muted/40 animate-pulse" />
                                ))}
                            </div>
                        ) : purchases.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                                <ShoppingBag className="w-10 h-10 mb-3 opacity-40" />
                                <p className="text-sm font-semibold">No purchases found</p>
                                <p className="text-xs mt-1">No vouchers are associated with {phone}</p>
                            </div>
                        ) : (
                            <div className="relative pl-5 border-l-2 border-border/60 space-y-5 ml-1">
                                {purchases.map((purchase) => (
                                    <div key={purchase.id} className="relative group">
                                        {/* Timeline node */}
                                        {/* <StatusDot status={purchase.status} /> */}
                                        <span className="absolute -left-[22px] top-1">
                                            <StatusDot status={purchase.status} />
                                        </span>

                                        {/* Card */}
                                        <div className="ml-3 p-2 rounded border border-border/40 cursor-alias transition-colors space-y-2">
                                            {/* Top row */}
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono text-xs font-bold text-primary">
                                                        {purchase.voucherCode}
                                                    </span>
                                                    <button
                                                        onClick={() => handleCopy(purchase.voucherCode)}
                                                        className="text-muted-foreground hover:text-foreground transition-colors"
                                                        title="Copy voucher code"
                                                    >
                                                        <Copy className="w-3 h-3" />
                                                    </button>
                                                </div>
                                                <StatusBadge status={purchase.status} />
                                            </div>

                                            {/* Middle row */}
                                            <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
                                                <span className="text-foreground/70">{purchase.profile}</span>
                                                <span className="font-bold text-foreground">
                                                    {formatUGX(purchase.amount)}
                                                </span>
                                            </div>

                                            {/* Bottom row */}
                                            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border/20 text-[10px] text-muted-foreground">
                                                <span className="flex items-center gap-1">
                                                    <Calendar className="w-3 h-3" />
                                                    {purchase.createdDate}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    {purchase.paymentMode === "Online Payment" ? (
                                                        <CreditCard className="w-3 h-3 text-blue-500" />
                                                    ) : (
                                                        <Printer className="w-3 h-3 text-amber-500" />
                                                    )}
                                                    {purchase.paymentMode}
                                                </span>
                                                <span className="text-muted-foreground/60 font-mono">
                                                    {purchase.router}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </main>
        </div>
    );
}

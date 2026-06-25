import AppHeader from "@/components/Header/AppHeader";
import SEO from "@/components/SEO";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
    Activity,
    Calendar,
    Check,
    ChevronLeft,
    ChevronRight,
    CircleDollarSign,
    Coins,
    Copy,
    Cpu,
    CreditCard,
    HardDrive,
    Mail,
    Phone,
    Plus,
    Printer,
    RefreshCcw,
    RotateCw,
    Router as RouterIcon,
    Search,
    Signal,
    Smartphone,
    Thermometer,
    Ticket,
    TrendingUp,
    User,
    Wallet,
    Wifi,
    WifiOff
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useBranchVouchers, useRouterActiveUsers, useRouters } from "@/hooks/useRouters";
import { voucherUiStatus } from "@/lib/voucherStatus";
import { usePhoneVerifed } from "@/hooks/usePhoneVerifed";

// ── Ugandan Phone Normalization & Verification Component ───────
function normalizeUgandanPhone(phone: string): string | null {
    if (!phone) return null;
    const digits = phone.replace(/\D/g, "");
    if (digits.startsWith("256") && digits.length === 12) return `+${digits}`;
    if (digits.startsWith("0") && digits.length === 10) return `+256${digits.substring(1)}`;
    if (/^(7|3)\d{8}$/.test(digits)) return `+256${digits}`;
    return null;
}

export function VerifiedCustomerName({ phone, fallback }: { phone: string; fallback: string }) {
    const normalized = normalizeUgandanPhone(phone);
    const { data: verification } = usePhoneVerifed(normalized);
    const verifiedName = verification?.success ? verification.identityname.trim() : "";
    return <span>{verifiedName || fallback}</span>;
}

// ── Sparkline SVG helper ─────────────────────────────────────────
function Sparkline({ data, color, height = 36 }: { data: number[]; color: string; height?: number }) {
    if (!data || data.length < 2) {
        return <div style={{ height }} className="w-full" />;
    }
    const width = 100;
    const max = Math.max(...data, 1);
    const step = width / (data.length - 1);
    const pts = data
        .map((v, i) => `${(i * step).toFixed(1)},${(height - (v / max) * (height - 4) - 2).toFixed(1)}`)
        .join(" ");
    return (
        <svg
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            className="w-full"
            style={{ height }}
        >
            <defs>
                <linearGradient id={`sg-${color.replace(/[^a-z]/gi, "")}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.25" />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
            </defs>
            <polygon
                points={`0,${height} ${pts} ${width},${height}`}
                fill={`url(#sg-${color.replace(/[^a-z]/gi, "")})`}
            />
            <polyline
                points={pts}
                fill="none"
                stroke={color}
                strokeWidth="0.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

// Interfaces
interface SalesRecord {
    id: string;
    router: string;
    voucherCode: string;
    profile: string;
    amount: number; // in UGX
    activatedAt: string;
    expiresAt: string;
    status: "Active" | "Expired" | "Unactivated" | "Sync Issue";
    paymentMode: "Online Payment" | "Voucher Printing";
    paymentMethod: "MTN Mobile Money" | "Airtel Money" | "Cash" | "Credit Card" | "PayPal";
    buyerName: string;
    phone: string;
    email: string;
    transactionId: string;
    deviceMac: string;
    bytesUsed: string;
    createdDate: string; // YYYY-MM-DD
}

interface ActiveSession {
    id: string;
    ip: string;
    mac: string;
    voucherCode: string;
    downloaded: string;
    uploaded: string;
    signal: number; // in dBm
    device: string;
    connectedSince: string;
}

// Relative Date Generator Helpers
const getRelativeDateString = (daysAgo: number) => {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return date.toISOString().slice(0, 10);
};

const getRelativeDateTimeString = (daysAgo: number, hoursAgo: number) => {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    date.setHours(date.getHours() - hoursAgo);
    return date.toISOString().replace("T", " ").slice(0, 19);
};

// Initial Mock Sales Records
const initialSales: SalesRecord[] = [];

const initialSessions: ActiveSession[] = [];

export default function SalesIndex() {
    const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("sidebar-collapsed") === "true");

    useEffect(() => {
        const handler = (e: any) => {
            setSidebarCollapsed(e.detail.collapsed);
        };
        window.addEventListener("sidebar-collapse-change", handler);
        return () => window.removeEventListener("sidebar-collapse-change", handler);
    }, []);

    // Main UI Tabs: "sales" | "activation"
    const [activeTab, setActiveTab] = useState<string>("sales");

    // State Databases
    const [sales, setSales] = useState<SalesRecord[]>(initialSales);
    const [sessions, setSessions] = useState<ActiveSession[]>(initialSessions);

    const branchId = localStorage.getItem("selected-workspace") || "biltra";
    const { data: vouchersData, refetch: refetchVouchers, isFetching: vouchersRefreshing } = useBranchVouchers(branchId, { limit: 1000 });
    const { data: routers = [] } = useRouters(branchId);
    const firstRouterId = routers[0]?.id || "";
    const { data: activeUsersData, refetch: refetchActiveUsers } = useRouterActiveUsers(firstRouterId);

    useEffect(() => {
        if (vouchersData?.vouchers) {
            const mappedSales: SalesRecord[] = vouchersData.vouchers.map((voucher) => ({
                id: voucher.id,
                router: voucher.router_name,
                voucherCode: voucher.voucher_code,
                profile: `${voucher.speed_type} ${voucher.profile}`,
                amount: voucher.amount,
                activatedAt: voucher.status === "ACTIVE" ? voucher.created_at : "N/A",
                expiresAt: ["EXPIRED", "ROUTER_MISSING"].includes(voucher.status) ? voucher.created_at : "N/A",
                status: voucherUiStatus(voucher.status),
                paymentMode: voucher.phone_number === "BULK" || voucher.payment_reference?.startsWith("BAT-") ? "Voucher Printing" : "Online Payment",
                paymentMethod: voucher.phone_number === "BULK" || voucher.payment_reference?.startsWith("BAT-") ? "Cash" : "MTN Mobile Money",
                buyerName: voucher.phone_number === "BULK" ? "Bulk Generated" : `Customer ${voucher.phone_number}`,
                phone: voucher.phone_number === "BULK" ? "" : voucher.phone_number,
                email: "",
                transactionId: voucher.payment_reference || voucher.id.slice(0, 10).toUpperCase(),
                deviceMac: "N/A",
                bytesUsed: voucher.data || "N/A",
                createdDate: voucher.created_at.slice(0, 10),
            }));
            setSales(mappedSales);
        }
    }, [vouchersData]);

    useEffect(() => {
        if (!activeUsersData?.active_users) return;
        setSessions(activeUsersData.active_users.map((item, index) => ({
            id: String(item.id || item[".id"] || index),
            ip: String(item.address || "N/A"),
            mac: String(item["mac-address"] || "N/A"),
            voucherCode: String(item.user || item.name || "N/A"),
            downloaded: String(item["bytes-out"] || "0 B"),
            uploaded: String(item["bytes-in"] || "0 B"),
            signal: 0,
            device: String(item["login-by"] || "Hotspot client"),
            connectedSince: String(item.uptime || "N/A"),
        })));
    }, [activeUsersData]);

    // Router activation status loading screen state
    const [activationProcessing, setActivationProcessing] = useState(false);
    const [hasProcessedActivation, setHasProcessedActivation] = useState(false);

    // Filters state
    const [selectedRouter, setSelectedRouter] = useState<string>("all");
    const [selectedProfile, setSelectedProfile] = useState<string>("all");
    const [selectedStatus, setSelectedStatus] = useState<string>("all");
    const [selectedPaymentMode, setSelectedPaymentMode] = useState<string>("all");
    const [selectedDateFilter, setSelectedDateFilter] = useState<string>("all");
    const [searchQuery, setSearchQuery] = useState<string>("");

    // Navigation for customer detail page
    const navigate = useNavigate();

    // Pagination
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [itemsPerPage, setItemsPerPage] = useState<number>(10);



    // New Sale Modal
    const [isSimulateOpen, setIsSimulateOpen] = useState(false);
    const [newSaleForm, setNewSaleForm] = useState({
        buyerName: "",
        phone: "",
        email: "",
        router: "Kampala Branch",
        profile: "24 Hours Unlimited",
        paymentMode: "Voucher Printing" as SalesRecord['paymentMode'],
        paymentMethod: "Cash" as SalesRecord['paymentMethod']
    });

    // Printer State
    const [isPrinting, setIsPrinting] = useState(false);

    // Trigger loading screen for Activation Status Tab
    const handleTabChange = (val: string) => {
        setActiveTab(val);
        if (val === "activation" && !hasProcessedActivation) {
            triggerActivationProcessing();
        }
    };

    const triggerActivationProcessing = () => {
        setActivationProcessing(true);
        setHasProcessedActivation(false);
        setTimeout(() => {
            setActivationProcessing(false);
            setHasProcessedActivation(true);
        }, 1500);
    };

    // Helper date matching math
    const todayStr = getRelativeDateString(0);
    const yesterdayStr = getRelativeDateString(1);

    const getMsAgo = (days: number) => days * 24 * 60 * 60 * 1000;
    const nowMs = Date.now();

    const isDateToday = (dStr: string) => dStr === todayStr;
    const isDateYesterday = (dStr: string) => dStr === yesterdayStr;
    const isDateThisWeek = (dStr: string) => {
        const d = new Date(dStr).getTime();
        return nowMs - d <= getMsAgo(7);
    };
    const isDateThisMonth = (dStr: string) => {
        const d = new Date(dStr).getTime();
        return nowMs - d <= getMsAgo(30);
    };

    // Dynamic KPI calculations based on total database (unfiltered)
    const getKpis = () => {
        const todayRecs = sales.filter(v => isDateToday(v.createdDate));
        const yesterdayRecs = sales.filter(v => isDateYesterday(v.createdDate));
        const weekRecs = sales.filter(v => isDateThisWeek(v.createdDate));
        const monthRecs = sales.filter(v => isDateThisMonth(v.createdDate));

        return {
            todaySales: todayRecs.reduce((sum, v) => sum + v.amount, 0),
            todayUsers: todayRecs.length,
            yesterdaySales: yesterdayRecs.reduce((sum, v) => sum + v.amount, 0),
            yesterdayUsers: yesterdayRecs.length,
            weekSales: weekRecs.reduce((sum, v) => sum + v.amount, 0),
            weekUsers: weekRecs.length,
            monthSales: monthRecs.reduce((sum, v) => sum + v.amount, 0),
            monthUsers: monthRecs.length,
        };
    };

    const kpis = getKpis();

    // Sparkline: returns last N days of daily revenue totals
    const getSparkline = React.useCallback((days: number, filterFn?: (r: typeof sales[0]) => boolean) => {
        return Array.from({ length: days }, (_, i) => {
            const dateStr = getRelativeDateString(days - 1 - i);
            return sales
                .filter(r => r.createdDate === dateStr && (filterFn ? filterFn(r) : true))
                .reduce((sum, r) => sum + r.amount, 0);
        });
    }, [sales]);

    const handleOpenUserDetail = (phone: string) => {
        navigate(`/sales/customer/${encodeURIComponent(phone)}`);
    };

    const formatDateLabel = (dateStr: string) => {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;
        return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    };

    // Handle Filtering
    const filteredRecords = React.useMemo(() => {
        return sales.filter(record => {
            // Router Filter
            if (selectedRouter !== "all" && record.router !== selectedRouter) {
                return false;
            }
            // Profile Filter
            if (selectedProfile !== "all" && record.profile !== selectedProfile) {
                return false;
            }
            // Status Filter
            if (selectedStatus !== "all" && record.status !== selectedStatus) {
                return false;
            }
            // Payment Mode Filter
            if (selectedPaymentMode !== "all" && record.paymentMode !== selectedPaymentMode) {
                return false;
            }
            // Date Filter
            if (selectedDateFilter === "today" && !isDateToday(record.createdDate)) return false;
            if (selectedDateFilter === "yesterday" && !isDateYesterday(record.createdDate)) return false;
            if (selectedDateFilter === "week" && !isDateThisWeek(record.createdDate)) return false;
            if (selectedDateFilter === "month" && !isDateThisMonth(record.createdDate)) return false;

            // Search Query (Voucher Code, Client Name, Client Phone)
            if (searchQuery.trim() !== "") {
                const q = searchQuery.toLowerCase();
                const codeMatch = record.voucherCode.toLowerCase().includes(q);
                const nameMatch = record.buyerName.toLowerCase().includes(q);
                const phoneMatch = record.phone.toLowerCase().includes(q);
                if (!codeMatch && !nameMatch && !phoneMatch) return false;
            }

            return true;
        });
    }, [sales, selectedRouter, selectedProfile, selectedStatus, selectedPaymentMode, selectedDateFilter, searchQuery]);

    const totalAmountFiltered = React.useMemo(() => {
        return filteredRecords.reduce((sum, v) => sum + v.amount, 0);
    }, [filteredRecords]);

    // Paginated Records
    const paginatedRecords = React.useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return filteredRecords.slice(startIndex, startIndex + itemsPerPage);
    }, [filteredRecords, currentPage, itemsPerPage]);

    const totalPages = Math.max(1, Math.ceil(filteredRecords.length / itemsPerPage));

    // Reset page when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [selectedRouter, selectedProfile, selectedStatus, selectedPaymentMode, selectedDateFilter, searchQuery]);

    // Format currencies
    const formatUGX = (val: number) => {
        return val.toLocaleString() + " UGX";
    };

    // Profile pricing lookup
    const getProfilePrice = (profName: string) => {
        switch (profName) {
            case "1 Hour High Speed": return 1000;
            case "2 Hours Standard": return 2500;
            case "24 Hours Unlimited": return 5000;
            case "7 Days Premium": return 15000;
            case "30 Days Enterprise": return 50000;
            default: return 5000;
        }
    };

    // Simulate Sale Submission
    const handleSimulateSaleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (!newSaleForm.buyerName || !newSaleForm.phone) {
            toast.error("Please fill in the client name and phone fields.");
            return;
        }

        const price = getProfilePrice(newSaleForm.profile);
        const voucherId = "VCH-" + Math.floor(1000 + Math.random() * 9000) + "-" + Math.random().toString(36).substring(2, 6).toUpperCase();
        const txnId = "TXN-" + Math.floor(100000 + Math.random() * 900000);

        const newRecord: SalesRecord = {
            id: String(sales.length + 1),
            router: newSaleForm.router,
            voucherCode: voucherId,
            profile: newSaleForm.profile,
            amount: price,
            activatedAt: newSaleForm.paymentMode === "Online Payment" ? getRelativeDateTimeString(0, 0) : "N/A",
            expiresAt: "N/A",
            status: newSaleForm.paymentMode === "Online Payment" ? "Active" : "Unactivated",
            paymentMode: newSaleForm.paymentMode,
            paymentMethod: newSaleForm.paymentMethod,
            buyerName: newSaleForm.buyerName,
            phone: newSaleForm.phone,
            email: newSaleForm.email || "N/A",
            transactionId: txnId,
            deviceMac: "N/A",
            bytesUsed: "0 B",
            createdDate: getRelativeDateString(0) // Today
        };

        setSales(prev => [newRecord, ...prev]);
        setIsSimulateOpen(false);

        // If online payment, also simulate adding a router session automatically
        if (newRecord.status === "Active") {
            const newSession: ActiveSession = {
                id: "s" + (sessions.length + 1),
                ip: "192.168.88." + Math.floor(10 + Math.random() * 200),
                mac: "00:E0:4C:" + Math.floor(10 + Math.random() * 89) + ":" + Math.floor(10 + Math.random() * 89) + ":" + Math.floor(10 + Math.random() * 89),
                voucherCode: voucherId,
                downloaded: "0 B",
                uploaded: "0 B",
                signal: -50 - Math.floor(Math.random() * 30),
                device: "Android Smartphone",
                connectedSince: "1m"
            };
            setSessions(prev => [newSession, ...prev]);
        }

        toast.success(`Sale recorded successfully! Voucher ${voucherId} created.`);



        // Reset Form
        setNewSaleForm({
            buyerName: "",
            phone: "",
            email: "",
            router: "Kampala Branch",
            profile: "24 Hours Unlimited",
            paymentMode: "Voucher Printing",
            paymentMethod: "Cash"
        });
    };

    // Disconnect active session from router
    const handleDisconnectSession = (id: string, voucherCode: string) => {
        setSessions(prev => prev.filter(s => s.id !== id));
        // Set matching sales status to Expired if they were active
        setSales(prev => prev.map(s => {
            if (s.voucherCode === voucherCode) {
                return { ...s, status: "Expired", expiresAt: getRelativeDateTimeString(0, 0) };
            }
            return s;
        }));
        toast.success(`Session disconnected successfully.`);
    };

    // Trigger copy login code
    const handleCopyCode = (code: string) => {
        navigator.clipboard.writeText(code);
        toast.success("Voucher code copied to clipboard!");
    };

    // Trigger Thermal Printer Simulation
    const handlePrintVoucher = (code: string) => {
        setIsPrinting(true);
        setTimeout(() => {
            setIsPrinting(false);
            toast.success(`Voucher ${code} successfully sent to the thermal printer!`);
        }, 1500);
    };

    // Badge Stylers
    const getStatusBadge = (status: SalesRecord['status']) => {
        switch (status) {
            case "Active":
                return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Active</Badge>;
            case "Expired":
                return <Badge variant="outline" className="bg-slate-500/10 text-slate-500 border-slate-500/20">Expired</Badge>;
            case "Unactivated":
                return <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20">Unactivated</Badge>;
            case "Sync Issue":
                return <Badge variant="outline" className="bg-orange-500/10 text-orange-500 border-orange-500/20">Sync Issue</Badge>;
        }
    };

    const getModeBadge = (mode: SalesRecord['paymentMode']) => {
        if (mode === "Online Payment") {
            return (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400">
                    <CreditCard className="w-3.5 h-3.5" />
                    Online Payment
                </span>
            );
        } else {
            return (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                    <Printer className="w-3.5 h-3.5" />
                    Voucher Printing
                </span>
            );
        }
    };

    return (
        <div className={cn(
            "min-h-screen bg-background transition-all duration-300",
            sidebarCollapsed ? "md:pl-[72px]" : "md:pl-[280px]"
        )}>
            <SEO title="WiFi Sales Records" />
            <AppHeader />

            <main className=" mx-auto px-4 sm:px-6 py-6">
                {/* Page Title & Tab Toggles */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4  pb-4 ">
                    <div>
                        <p className="text-sm text-muted-foreground mt-1">
                            Monitor day-to-day sales, generate vouchers, and track router activation sessions.
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => {
                                refetchVouchers();
                                if (firstRouterId) refetchActiveUsers();
                            }}
                            disabled={vouchersRefreshing}
                            className="bg-primary text-primary-foreground font-semibold text-xs sm:text-sm px-4 py-2 rounded shadow hover:bg-primary/95 flex items-center gap-2 transition-all"
                        >
                            <RefreshCcw className={cn("w-4 h-4", vouchersRefreshing && "animate-spin")} />
                            Refresh Sales
                        </button>
                    </div>
                </div>

                {/* Real-Time Sales Dashboard Panel */}
                {activeTab === "sales" && (
                    <div className="space-y-4 sm:space-y-6">
                        {/* KPI Cards Grid */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                            {/* Today Sales */}
                            <Card className="rounded bg-card border border-border/80 shadow-sm relative overflow-hidden group hover:shadow-md hover:scale-[1.01] transition-all flex flex-col min-h-[140px]">
                                <CardHeader className="pb-1 pt-3 px-3 sm:px-4 sm:pt-4">
                                    <span className="text-[12px] sm:text-xs font-bold  text-muted-foreground">Today</span>
                                    <CardTitle className="text-lg sm:text-2xl font-black mt-0.5 text-foreground leading-tight">
                                        {formatUGX(kpis.todaySales)}
                                    </CardTitle>
                                </CardHeader>
                                <div className="px-3 sm:px-4 pb-1 mt-auto">
                                    <Sparkline data={getSparkline(7, r => isDateToday(r.createdDate) || true).map((_, i, arr) => {
                                        const d = getRelativeDateString(6 - i);
                                        return sales.filter(r => r.createdDate === d).reduce((s, r) => s + r.amount, 0);
                                    }).slice(-7)} color="#2563eb" height={36} />
                                </div>
                                <CardContent className="pb-3 pt-0 px-3 sm:px-4">
                                    <div className="text-[10px] sm:text-xs text-muted-foreground font-semibold flex items-center justify-between">
                                        <span>{kpis.todayUsers} sales · {formatDateLabel(getRelativeDateString(0))}</span>
                                        <div className="p-1 rounded bg-blue-500/10 text-blue-600">
                                            <CircleDollarSign className="w-3.5 h-3.5" />
                                        </div>
                                    </div>
                                </CardContent>

                            </Card>

                            {/* Yesterday Sales */}
                            <Card className="rounded bg-card border border-border/80 shadow-none relative overflow-hidden group hover:shadow-md hover:scale-[1.01] transition-all flex flex-col min-h-[140px]">
                                <CardHeader className="pb-1 pt-3 px-3 sm:px-4 sm:pt-4">
                                    <span className="text-[12px] sm:text-xs font-bold  text-muted-foreground">Yesterday</span>
                                    <CardTitle className="text-lg sm:text-2xl font-black mt-0.5 text-foreground leading-tight">
                                        {formatUGX(kpis.yesterdaySales)}
                                    </CardTitle>
                                </CardHeader>
                                <div className="px-3 sm:px-4 pb-1 mt-auto">
                                    <Sparkline data={Array.from({ length: 7 }, (_, i) => {
                                        const d = getRelativeDateString(6 - i);
                                        return sales.filter(r => r.createdDate === d).reduce((s, r) => s + r.amount, 0);
                                    })} color="#10b981" height={36} />
                                </div>
                                <CardContent className="pb-3 pt-0 px-3 sm:px-4">
                                    <div className="text-[10px] sm:text-xs text-muted-foreground font-semibold flex items-center justify-between">
                                        <span>{kpis.yesterdayUsers} sales · {formatDateLabel(getRelativeDateString(1))}</span>
                                        <div className="p-1 rounded bg-emerald-500/10 text-emerald-500">
                                            <CircleDollarSign className="w-3.5 h-3.5" />
                                        </div>
                                    </div>
                                </CardContent>

                            </Card>

                            {/* This Week */}
                            <Card className="rounded bg-card border border-border/80 shadow-none relative overflow-hidden group hover:shadow-md hover:scale-[1.01] transition-all flex flex-col min-h-[140px]">
                                <CardHeader className="pb-1 pt-3 px-3 sm:px-4 sm:pt-4">
                                    <span className="text-[12px] sm:text-xs font-bold  text-muted-foreground">This Week</span>
                                    <CardTitle className="text-lg sm:text-2xl font-black mt-0.5 text-foreground leading-tight">
                                        {formatUGX(kpis.weekSales)}
                                    </CardTitle>
                                </CardHeader>
                                <div className="px-3 sm:px-4 pb-1 mt-auto">
                                    <Sparkline data={Array.from({ length: 7 }, (_, i) => {
                                        const d = getRelativeDateString(6 - i);
                                        return sales.filter(r => r.createdDate === d).reduce((s, r) => s + r.amount, 0);
                                    })} color="#06b6d4" height={36} />
                                </div>
                                <CardContent className="pb-3 pt-0 px-3 sm:px-4">
                                    <div className="text-[10px] sm:text-xs text-muted-foreground font-semibold flex items-center justify-between">
                                        <span>{kpis.weekUsers} sales · This Week</span>
                                        <div className="p-1 rounded bg-cyan-500/10 text-cyan-500">
                                            <CircleDollarSign className="w-3.5 h-3.5" />
                                        </div>
                                    </div>
                                </CardContent>

                            </Card>

                            {/* This Month */}
                            <Card className="rounded bg-card border border-border/80 shadow-none relative overflow-hidden group hover:shadow-md hover:scale-[1.01] transition-all flex flex-col min-h-[140px]">
                                <CardHeader className="pb-1 pt-3 px-3 sm:px-4 sm:pt-4">
                                    <span className="text-[12px] sm:text-xs font-bold  text-muted-foreground">This Month</span>
                                    <CardTitle className="text-lg sm:text-2xl font-black mt-0.5 text-foreground leading-tight">
                                        {formatUGX(kpis.monthSales)}
                                    </CardTitle>
                                </CardHeader>
                                <div className="px-3 sm:px-4 pb-1 mt-auto">
                                    <Sparkline data={Array.from({ length: 30 }, (_, i) => {
                                        const d = getRelativeDateString(29 - i);
                                        return sales.filter(r => r.createdDate === d).reduce((s, r) => s + r.amount, 0);
                                    })} color="#f97316" height={36} />
                                </div>
                                <CardContent className="pb-3 pt-0 px-3 sm:px-4">
                                    <div className="text-[10px] sm:text-xs text-muted-foreground font-semibold flex items-center justify-between">
                                        <span>{kpis.monthUsers} sales · This Month</span>
                                        <div className="p-1 rounded bg-orange-500/10 text-orange-500">
                                            <CircleDollarSign className="w-3.5 h-3.5" />
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Filters & Search Panel */}
                        <Card className="rounded-none border border-border/40 shadow-none  bg-card">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-sm font-bold tracking-tight text-foreground flex items-center justify-between">
                                    <p>Filters & Search</p>
                                    <div className="flex items-center justify-between ">
                                        {(selectedRouter !== "all" || selectedProfile !== "all" || selectedStatus !== "all" || selectedPaymentMode !== "all" || selectedDateFilter !== "all" || searchQuery !== "") && (
                                            <Button
                                                variant="destructive"
                                                size="sm"
                                                onClick={() => {
                                                    setSelectedRouter("all");
                                                    setSelectedProfile("all");
                                                    setSelectedStatus("all");
                                                    setSelectedPaymentMode("all");
                                                    setSelectedDateFilter("all");
                                                    setSearchQuery("");
                                                }}
                                                className="text-xs text-white hover:text-white h-8"
                                            >
                                                Clear Filters
                                            </Button>
                                        )}
                                    </div>
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
                                    {/* Router real data */}
                                    <div className="space-y-1.5">
                                        <Label htmlFor="routerFilter" className="text-xs font-semibold text-muted-foreground">Router</Label>
                                        <Select value={selectedRouter} onValueChange={setSelectedRouter}>
                                            <SelectTrigger id="routerFilter" className="h-9 text-xs bg-background">
                                                <SelectValue placeholder="All Routers" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">All Routers</SelectItem>
                                                {routers.map(r => (
                                                    <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {/* Profile derived from real sales data */}
                                    <div className="space-y-1.5">
                                        <Label htmlFor="profileFilter" className="text-xs font-semibold text-muted-foreground">Profile</Label>
                                        <Select value={selectedProfile} onValueChange={setSelectedProfile}>
                                            <SelectTrigger id="profileFilter" className="h-9 text-xs bg-background">
                                                <SelectValue placeholder="All Profiles" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">All Profiles</SelectItem>
                                                {[...new Set(sales.map(s => s.profile))].sort().map(p => (
                                                    <SelectItem key={p} value={p}>{p}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {/* Status Filter */}
                                    <div className="space-y-1.5">
                                        <Label htmlFor="statusFilter" className="text-xs font-semibold text-muted-foreground">Status</Label>
                                        <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                                            <SelectTrigger id="statusFilter" className="h-9 text-xs bg-background">
                                                <SelectValue placeholder="All Statuses" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">All Statuses</SelectItem>
                                                <SelectItem value="Active">Active</SelectItem>
                                                <SelectItem value="Expired">Expired</SelectItem>
                                                <SelectItem value="Unactivated">Unactivated</SelectItem>
                                                <SelectItem value="Sync Issue">Sync Issue</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {/* Payment Mode */}
                                    <div className="space-y-1.5">
                                        <Label htmlFor="modeFilter" className="text-xs font-semibold text-muted-foreground">Payment Mode</Label>
                                        <Select value={selectedPaymentMode} onValueChange={setSelectedPaymentMode}>
                                            <SelectTrigger id="modeFilter" className="h-9 text-xs bg-background">
                                                <SelectValue placeholder="All Modes" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">All Modes</SelectItem>
                                                <SelectItem value="Online Payment">Online Payment</SelectItem>
                                                <SelectItem value="Voucher Printing">Voucher Printing</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {/* Date Filter */}
                                    <div className="space-y-1.5">
                                        <Label htmlFor="dateFilter" className="text-xs font-semibold text-muted-foreground">Date Filter</Label>
                                        <Select value={selectedDateFilter} onValueChange={setSelectedDateFilter}>
                                            <SelectTrigger id="dateFilter" className="h-9 text-xs bg-background">
                                                <SelectValue placeholder="All Time" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">All Time</SelectItem>
                                                <SelectItem value="today">Today</SelectItem>
                                                <SelectItem value="yesterday">Yesterday</SelectItem>
                                                <SelectItem value="week">This Week</SelectItem>
                                                <SelectItem value="month">This Month</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {/* Items Per Page */}
                                    <div className="space-y-1.5">
                                        <Label htmlFor="pageSizeFilter" className="text-xs font-semibold text-muted-foreground">Show Rows</Label>
                                        <Select value={String(itemsPerPage)} onValueChange={(val) => setItemsPerPage(Number(val))}>
                                            <SelectTrigger id="pageSizeFilter" className="h-9 text-xs bg-background">
                                                <SelectValue placeholder="10 rows" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="5">5 rows</SelectItem>
                                                <SelectItem value="10">10 rows</SelectItem>
                                                <SelectItem value="20">20 rows</SelectItem>
                                                <SelectItem value="50">50 rows</SelectItem>
                                                <SelectItem value="100">100 rows</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {/* Search bar */}
                                    <div className="space-y-1.5">
                                        <Label htmlFor="searchQuery" className="text-xs font-semibold text-muted-foreground">Search Vouchers</Label>
                                        <div className="relative">
                                            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                            <Input
                                                id="searchQuery"
                                                type="text"
                                                placeholder="Search Voucher, name, phone..."
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                className="pl-9 h-9 text-xs bg-background border-input"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Sales Records Table */}
                        <Card className="border border-border/0 shadow-sm rounded-none">
                            <CardHeader className="pb-3 flex flex-row items-center justify-between">
                                <div>
                                    <CardTitle className="text-base font-bold tracking-tight text-foreground">Sales Records</CardTitle>
                                    <CardDescription className="text-xs text-muted-foreground">
                                        Displaying filtered Wi-Fi code transactions. Click on any record to view or print the voucher ticket.
                                    </CardDescription>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="overflow-x-auto -mx-4 sm:mx-0 border border-border/10 rounded">
                                    <Table className="min-w-[700px]">
                                        <TableHeader className="bg-muted/30">
                                            <TableRow>
                                                <TableHead className="w-[40px] font-bold text-xs uppercase text-foreground">#</TableHead>
                                                <TableHead className="font-bold text-xs uppercase text-foreground min-w-[140px]">User / Client</TableHead>
                                                <TableHead className="font-bold text-xs uppercase text-foreground">Router</TableHead>
                                                <TableHead className="font-bold text-xs uppercase text-foreground">Voucher Code</TableHead>
                                                <TableHead className="font-bold text-xs uppercase text-foreground">Profile</TableHead>
                                                <TableHead className="font-bold text-xs uppercase text-foreground">Amount</TableHead>
                                                <TableHead className="font-bold text-xs uppercase text-foreground">Activated At</TableHead>
                                                <TableHead className="font-bold text-xs uppercase text-foreground">Expires At</TableHead>
                                                <TableHead className="font-bold text-xs uppercase text-foreground">Payment Mode</TableHead>
                                                <TableHead className="font-bold text-xs uppercase text-foreground text-center">Status</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {paginatedRecords.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={10} className="h-44 text-center">
                                                        <div className="flex flex-col items-center justify-center text-muted-foreground">
                                                            <WifiOff className="w-10 h-10 mb-2 stroke-[1.5] text-muted-foreground/60" />
                                                            <span className="text-sm font-semibold">No sales records found</span>
                                                            <span className="text-xs mt-0.5">Try altering your filters or record a new sale.</span>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ) : (
                                                paginatedRecords.map((record, index) => {
                                                    const serialNum = (currentPage - 1) * itemsPerPage + index + 1;
                                                    return (
                                                        <TableRow
                                                            key={record.id}
                                                            className="hover:bg-muted/40 transition-colors"
                                                        >
                                                            <TableCell className="font-mono text-xs font-semibold text-muted-foreground">{serialNum}</TableCell>
                                                            <TableCell className="text-xs text-left">
                                                                {record.phone ? (
                                                                    <button
                                                                        onClick={() => handleOpenUserDetail(record.phone)}
                                                                        className="font-semibold text-primary hover:underline text-left flex flex-col focus:outline-none group/user"
                                                                        title="View purchase history"
                                                                    >
                                                                        <span className="font-bold group-hover/user:underline">
                                                                            <VerifiedCustomerName phone={record.phone} fallback={record.buyerName || "Unknown Customer"} />
                                                                        </span>
                                                                        <span className="text-[10px] text-muted-foreground font-mono">{record.phone}</span>
                                                                    </button>
                                                                ) : (
                                                                    <div className="flex flex-col text-left">
                                                                        <span className="font-medium text-muted-foreground">{record.buyerName || "Bulk / Walk-in"}</span>
                                                                        <span className="text-[10px] text-muted-foreground/60 font-mono">N/A</span>
                                                                    </div>
                                                                )}
                                                            </TableCell>
                                                            <TableCell className="font-medium text-xs text-foreground">{record.router}</TableCell>
                                                            <TableCell className="font-mono text-xs font-semibold text-primary">{record.voucherCode}</TableCell>
                                                            <TableCell className="text-xs font-semibold text-foreground/80 max-w-[120px] truncate">{record.profile}</TableCell>
                                                            <TableCell className="font-bold text-xs text-foreground whitespace-nowrap">{formatUGX(record.amount)}</TableCell>
                                                            <TableCell className="text-xs font-mono text-muted-foreground whitespace-nowrap">{record.activatedAt}</TableCell>
                                                            <TableCell className="text-xs font-mono text-muted-foreground whitespace-nowrap">{record.expiresAt}</TableCell>
                                                            <TableCell className="text-xs">{getModeBadge(record.paymentMode)}</TableCell>
                                                            <TableCell className="text-center">{getStatusBadge(record.status)}</TableCell>
                                                        </TableRow>
                                                    );
                                                })
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>

                                {/* Pagination Controls */}
                                {totalPages > 1 && (
                                    <div className="flex items-center justify-between pt-4">
                                        <span className="text-xs text-muted-foreground">
                                            Page {currentPage} of {totalPages} ({filteredRecords.length} records)
                                        </span>
                                        <div className="flex items-center gap-1.5">
                                            <Button
                                                variant="outline"
                                                size="icon"
                                                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                                disabled={currentPage === 1}
                                                className="w-8 h-8 rounded"
                                            >
                                                <ChevronLeft className="w-4 h-4" />
                                            </Button>
                                            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                                                <Button
                                                    key={p}
                                                    variant={currentPage === p ? "default" : "outline"}
                                                    size="icon"
                                                    onClick={() => setCurrentPage(p)}
                                                    className={cn("w-8 h-8 rounded text-xs font-bold", currentPage === p ? "bg-primary" : "")}
                                                >
                                                    {p}
                                                </Button>
                                            ))}
                                            <Button
                                                variant="outline"
                                                size="icon"
                                                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                                disabled={currentPage === totalPages}
                                                className="w-8 h-8 rounded"
                                            >
                                                <ChevronRight className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                )}

                {/* Activation Status Tab */}
                {activeTab === "activation" && (
                    <div className="space-y-6">
                        {activationProcessing ? (
                            /* Loading Spinner Card (Matches Screenshot 2) */
                            <Card className="border border-border/40 shadow-sm bg-card py-20 flex flex-col items-center justify-center text-center">
                                <div className="relative w-20 h-20 mb-6">
                                    {/* Custom Spinner */}
                                    <div className="absolute inset-0 rounded-full border-4 border-muted"></div>
                                    <div className="absolute inset-0 rounded-full border-4 border-orange-500 border-t-transparent animate-spin"></div>
                                    <Wifi className="w-8 h-8 text-orange-500 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse" />
                                </div>
                                <h3 className="text-xl font-semibold tracking-tight text-foreground">Processing activation data...</h3>
                                <p className="text-xs text-muted-foreground mt-2 max-w-sm">
                                    Please wait while we process router activation data
                                </p>
                            </Card>
                        ) : (
                            /* Actual Real-Time Active Sessions Layout */
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                {/* Router Hardware Health */}
                                <div className="space-y-6 lg:col-span-1">
                                    <Card className="border border-border/40 shadow-sm bg-card">
                                        <CardHeader className="pb-3 flex flex-row items-center justify-between">
                                            <div>
                                                <CardTitle className="text-sm font-bold tracking-tight text-foreground">Router Status</CardTitle>
                                                <CardDescription className="text-xs text-muted-foreground">Hardware metrics</CardDescription>
                                            </div>
                                            <Button
                                                variant="outline"
                                                size="icon"
                                                onClick={triggerActivationProcessing}
                                                className="w-8 h-8 text-muted-foreground hover:text-foreground"
                                            >
                                                <RotateCw className="w-4 h-4" />
                                            </Button>
                                        </CardHeader>
                                        <CardContent className="space-y-4">
                                            {/* Status indicator */}
                                            <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
                                                <div className="flex items-center gap-2">
                                                    <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping" />
                                                    <span className="text-xs font-bold text-emerald-500 uppercase">Gateway Online</span>
                                                </div>
                                                <span className="text-xs font-mono text-muted-foreground">Uptime: 4d 18h</span>
                                            </div>

                                            {/* CPU Usage */}
                                            <div className="space-y-1.5">
                                                <div className="flex items-center justify-between text-xs">
                                                    <span className="font-semibold text-foreground/80 flex items-center gap-1.5">
                                                        <Cpu className="w-3.5 h-3.5 text-primary" /> CPU Usage
                                                    </span>
                                                    <span className="font-bold text-muted-foreground">32%</span>
                                                </div>
                                                <Progress value={32} className="h-1.5 bg-muted/60 [&>div]:bg-primary" />
                                            </div>

                                            {/* Memory Usage */}
                                            <div className="space-y-1.5">
                                                <div className="flex items-center justify-between text-xs">
                                                    <span className="font-semibold text-foreground/80 flex items-center gap-1.5">
                                                        <HardDrive className="w-3.5 h-3.5 text-cyan-500" /> RAM Memory
                                                    </span>
                                                    <span className="font-bold text-muted-foreground">215MB / 512MB (42%)</span>
                                                </div>
                                                <Progress value={42} className="h-1.5 bg-muted/60 [&>div]:bg-cyan-500" />
                                            </div>

                                            {/* Temperature */}
                                            <div className="space-y-1.5">
                                                <div className="flex items-center justify-between text-xs">
                                                    <span className="font-semibold text-foreground/80 flex items-center gap-1.5">
                                                        <Thermometer className="w-3.5 h-3.5 text-orange-500" /> Temperature
                                                    </span>
                                                    <span className="font-bold text-muted-foreground">46 °C</span>
                                                </div>
                                                <Progress value={46} className="h-1.5 bg-muted/60 [&>div]:bg-orange-500" />
                                            </div>

                                            {/* Network Health */}
                                            <div className="border-t border-border/30 pt-3 space-y-2">
                                                <div className="flex items-center justify-between text-xs">
                                                    <span className="text-muted-foreground">Subnet IP:</span>
                                                    <span className="font-mono font-semibold">192.168.88.1/24</span>
                                                </div>
                                                <div className="flex items-center justify-between text-xs">
                                                    <span className="text-muted-foreground">Active DHCP Leases:</span>
                                                    <span className="font-mono font-semibold">{sessions.length} Clients</span>
                                                </div>
                                                <div className="flex items-center justify-between text-xs">
                                                    <span className="text-muted-foreground">SSID Broadcast:</span>
                                                    <span className="font-semibold text-primary">ForeForm_WiFi</span>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </div>

                                {/* Connected Clients */}
                                <div className="lg:col-span-2">
                                    <Card className="border border-border/40 shadow-sm bg-card h-full">
                                        <CardHeader className="pb-3 flex flex-row items-center justify-between">
                                            <div>
                                                <CardTitle className="text-sm font-bold tracking-tight text-foreground flex items-center gap-1.5">
                                                    <Activity className="w-4 h-4 text-primary animate-pulse" />
                                                    Active Connection Sessions
                                                </CardTitle>
                                                <CardDescription className="text-xs text-muted-foreground">
                                                    Devices currently authenticated and browsing via the Captive Portal.
                                                </CardDescription>
                                            </div>
                                            <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 font-bold">
                                                {sessions.length} Online
                                            </Badge>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="overflow-x-auto border border-border/20 rounded-md">
                                                <Table>
                                                    <TableHeader className="bg-muted/30">
                                                        <TableRow>
                                                            <TableHead className="font-bold text-xs uppercase text-foreground">Device/IP</TableHead>
                                                            <TableHead className="font-bold text-xs uppercase text-foreground">MAC Address</TableHead>
                                                            <TableHead className="font-bold text-xs uppercase text-foreground">Voucher Code</TableHead>
                                                            <TableHead className="font-bold text-xs uppercase text-foreground">TX / RX</TableHead>
                                                            <TableHead className="font-bold text-xs uppercase text-foreground text-center">Signal</TableHead>
                                                            <TableHead className="font-bold text-xs uppercase text-foreground text-right">Action</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {sessions.length === 0 ? (
                                                            <TableRow>
                                                                <TableCell colSpan={6} className="h-44 text-center">
                                                                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                                                                        <WifiOff className="w-10 h-10 mb-2 stroke-[1.5] text-muted-foreground/60" />
                                                                        <span className="text-sm font-semibold">No active sessions</span>
                                                                        <span className="text-xs mt-0.5">Activate a voucher code to connect client devices.</span>
                                                                    </div>
                                                                </TableCell>
                                                            </TableRow>
                                                        ) : (
                                                            sessions.map((session) => (
                                                                <TableRow key={session.id} className="hover:bg-muted/40 transition-colors">
                                                                    <TableCell>
                                                                        <div className="flex flex-col">
                                                                            <span className="text-xs font-bold text-foreground">{session.device}</span>
                                                                            <span className="text-[10px] font-mono text-muted-foreground">{session.ip}</span>
                                                                        </div>
                                                                    </TableCell>
                                                                    <TableCell className="font-mono text-xs font-medium text-muted-foreground">{session.mac}</TableCell>
                                                                    <TableCell className="font-mono text-xs font-semibold text-primary">{session.voucherCode}</TableCell>
                                                                    <TableCell className="text-xs text-foreground/80">
                                                                        <span className="font-bold text-emerald-500">↑ {session.uploaded}</span>
                                                                        <span className="text-muted-foreground mx-1">/</span>
                                                                        <span className="font-bold text-blue-500">↓ {session.downloaded}</span>
                                                                    </TableCell>
                                                                    <TableCell className="text-center">
                                                                        <div className="flex items-center justify-center gap-1.5">
                                                                            <Signal className="w-3.5 h-3.5 text-emerald-500" />
                                                                            <span className="text-xs font-semibold font-mono text-foreground/80">{session.signal} dBm</span>
                                                                        </div>
                                                                    </TableCell>
                                                                    <TableCell className="text-right">
                                                                        <Button
                                                                            variant="destructive"
                                                                            size="sm"
                                                                            onClick={() => handleDisconnectSession(session.id, session.voucherCode)}
                                                                            className="h-7 text-[10px] font-bold rounded shadow-sm"
                                                                        >
                                                                            Disconnect
                                                                        </Button>
                                                                    </TableCell>
                                                                </TableRow>
                                                            ))
                                                        )}
                                                    </TableBody>
                                                </Table>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </main>



            {/* Record Wifi Sale / Simulate Sale Modal */}
            <Dialog open={isSimulateOpen} onOpenChange={setIsSimulateOpen}>
                <DialogContent className="sm:max-w-md w-full bg-card border border-border/60 rounded p-6">
                    <DialogHeader className="pb-2 border-b border-border/40">
                        <DialogTitle className="text-base font-bold text-foreground">Record WiFi Voucher Sale</DialogTitle>
                        <DialogDescription className="text-xs text-muted-foreground">
                            Simulate cash voucher printout or online captive portal purchases to populate the sales statistics.
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleSimulateSaleSubmit} className="space-y-4 py-3">
                        {/* Buyer Name */}
                        <div className="space-y-1.5">
                            <Label htmlFor="simBuyerName" className="text-xs font-semibold text-foreground/80">Client Name</Label>
                            <Input
                                id="simBuyerName"
                                type="text"
                                placeholder="e.g. Juliet Nabassa"
                                value={newSaleForm.buyerName}
                                onChange={(e) => setNewSaleForm(prev => ({ ...prev, buyerName: e.target.value }))}
                                className="h-9 text-xs bg-background border-input"
                                required
                            />
                        </div>

                        {/* Phone & Email */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label htmlFor="simPhone" className="text-xs font-semibold text-foreground/80">Phone Number</Label>
                                <Input
                                    id="simPhone"
                                    type="text"
                                    placeholder="e.g. +256 770 000000"
                                    value={newSaleForm.phone}
                                    onChange={(e) => setNewSaleForm(prev => ({ ...prev, phone: e.target.value }))}
                                    className="h-9 text-xs bg-background border-input"
                                    required
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="simEmail" className="text-xs font-semibold text-foreground/80">Email (Optional)</Label>
                                <Input
                                    id="simEmail"
                                    type="email"
                                    placeholder="e.g. client@example.com"
                                    value={newSaleForm.email}
                                    onChange={(e) => setNewSaleForm(prev => ({ ...prev, email: e.target.value }))}
                                    className="h-9 text-xs bg-background border-input"
                                />
                            </div>
                        </div>

                        {/* Router & Profile */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label htmlFor="simRouter" className="text-xs font-semibold text-foreground/80">Gateway Router</Label>
                                <Select
                                    value={newSaleForm.router}
                                    onValueChange={(val) => setNewSaleForm(prev => ({ ...prev, router: val }))}
                                >
                                    <SelectTrigger id="simRouter" className="h-9 text-xs bg-background">
                                        <SelectValue placeholder="Select Router" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Kampala Branch">Kampala Branch</SelectItem>
                                        <SelectItem value="Gulu Branch">Gulu Branch</SelectItem>
                                        <SelectItem value="Arua Branch">Arua Branch</SelectItem>
                                        <SelectItem value="Mbarara Branch">Mbarara Branch</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="simProfile" className="text-xs font-semibold text-foreground/80">WiFi Profile Tier</Label>
                                <Select
                                    value={newSaleForm.profile}
                                    onValueChange={(val) => setNewSaleForm(prev => ({ ...prev, profile: val }))}
                                >
                                    <SelectTrigger id="simProfile" className="h-9 text-xs bg-background">
                                        <SelectValue placeholder="Select Profile" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="1 Hour High Speed">1 Hour High Speed (UGX 1,000)</SelectItem>
                                        <SelectItem value="2 Hours Standard">2 Hours Standard (UGX 2,500)</SelectItem>
                                        <SelectItem value="24 Hours Unlimited">24 Hours Unlimited (UGX 5,000)</SelectItem>
                                        <SelectItem value="7 Days Premium">7 Days Premium (UGX 15,000)</SelectItem>
                                        <SelectItem value="30 Days Enterprise">30 Days Enterprise (UGX 50,000)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* Mode & Method */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label htmlFor="simMode" className="text-xs font-semibold text-foreground/80">Payment Mode</Label>
                                <Select
                                    value={newSaleForm.paymentMode}
                                    onValueChange={(val: SalesRecord['paymentMode']) => {
                                        const method = val === "Online Payment" ? "MTN Mobile Money" : "Cash";
                                        setNewSaleForm(prev => ({ ...prev, paymentMode: val, paymentMethod: method }));
                                    }}
                                >
                                    <SelectTrigger id="simMode" className="h-9 text-xs bg-background">
                                        <SelectValue placeholder="Select Mode" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Voucher Printing">Voucher Printing (Cash)</SelectItem>
                                        <SelectItem value="Online Payment">Online Payment (MoMo / Card)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="simMethod" className="text-xs font-semibold text-foreground/80">Payment Gateway</Label>
                                <Select
                                    value={newSaleForm.paymentMethod}
                                    onValueChange={(val: SalesRecord['paymentMethod']) => setNewSaleForm(prev => ({ ...prev, paymentMethod: val }))}
                                >
                                    <SelectTrigger id="simMethod" className="h-9 text-xs bg-background">
                                        <SelectValue placeholder="Select Method" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {newSaleForm.paymentMode === "Online Payment" ? (
                                            <>
                                                <SelectItem value="MTN Mobile Money">MTN Mobile Money</SelectItem>
                                                <SelectItem value="Airtel Money">Airtel Money</SelectItem>
                                                <SelectItem value="Credit Card">Credit Card</SelectItem>
                                                <SelectItem value="PayPal">PayPal</SelectItem>
                                            </>
                                        ) : (
                                            <SelectItem value="Cash">Cash (Counter/POS)</SelectItem>
                                        )}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <DialogFooter className="pt-4 border-t border-border/40 gap-2 sm:gap-0">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setIsSimulateOpen(false)}
                                className="font-semibold text-xs h-9 rounded"
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                className="font-semibold text-xs h-9 rounded shadow-sm"
                            >
                                Record Wifi Sale & Print
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}

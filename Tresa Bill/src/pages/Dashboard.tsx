/* eslint-disable @typescript-eslint/no-explicit-any */

import { renultApi } from "@/api/foreform";
import AppHeader from "@/components/Header/AppHeader";
import SEO from "@/components/SEO";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  BellRing,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Coins,
  Cpu,
  Database,
  Eye,
  EyeOff,
  ExternalLink,
  RotateCw,
  Ticket,
  TrendingUp,
  User
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useRouters, useRouterStatus, useBranchVouchers, useBranchActiveUsers, useBranchRouterStatus } from "@/hooks/useRouters";
import { useBranchWallet } from "@/hooks/useWallet";
import { voucherUiStatus } from "@/lib/voucherStatus";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";

// Formats a byte count as B/KB/MB/GB/TB, e.g. 5368709120 -> "5.0 GB".
function formatBytes(bytes: number, decimals = 1) {
  if (!bytes) return "0 MB";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

// Picks the router's WAN-facing interface for traffic totals, preferring "ether1"
// to avoid double-counting bridge + slave-port traffic when summing usage.
function pickWanInterface(interfaces?: Record<string, any>[]) {
  if (!interfaces || interfaces.length === 0) return undefined;
  const ether1 = interfaces.find((iface) => String(iface.name).toLowerCase() === "ether1");
  if (ether1) return ether1;
  return interfaces.reduce((best, iface) => {
    const total = Number(iface["rx-byte"] ?? 0) + Number(iface["tx-byte"] ?? 0);
    const bestTotal = Number(best["rx-byte"] ?? 0) + Number(best["tx-byte"] ?? 0);
    return total > bestTotal ? iface : best;
  });
}

function PeriodBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary">
      {label}
    </span>
  );
}

function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-600">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
      Live
    </span>
  );
}

function isActivatedVoucher(voucher: { activated_at?: string | null; status: string }) {
  return Boolean(voucher.activated_at) || voucher.status === "ACTIVE" || voucher.status === "EXPIRED";
}

// Small bar-chart glyph used in place of a static icon on the stat cards.
function MiniBarChart({ bars }: { bars: { value: number; color: string }[] }) {
  const data = bars.map((bar, index) => ({ index, value: bar.value }));
  return (
    <div className="h-9 w-14 shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <Bar dataKey="value" radius={[2, 2, 1, 1]} barSize={7}>
            {bars.map((bar, index) => (
              <Cell key={index} fill={bar.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [chartType, setChartType] = useState<"area" | "bar">("area");
  const [balanceHidden, setBalanceHidden] = useState(
    () => localStorage.getItem("mobile-money-balance-hidden") !== "false",
  );
  const { user } = useAuth();

  const toggleBalanceHidden = () => {
    setBalanceHidden((prev) => {
      const next = !prev;
      localStorage.setItem("mobile-money-balance-hidden", String(next));
      return next;
    });
  };

  const getVoucherStatusBadgeClass = (status: string) => {
    switch (status) {
      case "Active":
        return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20";
      case "Expired":
        return "bg-slate-500/10 text-slate-500 border-slate-500/20 hover:bg-slate-500/20";
      case "Unactivated":
        return "bg-amber-500/10 text-amber-500 border-amber-500/20 hover:bg-amber-500/20";
      case "Sync Issue":
        return "bg-orange-500/10 text-orange-500 border-orange-500/20 hover:bg-orange-500/20";
      default:
        return "bg-slate-500/10 text-slate-500 border-slate-500/20 hover:bg-slate-500/20";
    }
  };

  const copyVoucherCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success(`Voucher code ${code} copied to clipboard!`);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      queryClient.invalidateQueries({ queryKey: ["branchWallet"] });
      queryClient.invalidateQueries({ queryKey: ["branchVouchers", branchId] });
      queryClient.invalidateQueries({ queryKey: ["revenueShare", branchId] });
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      toast.success("Dashboard data updated!");
    } catch (err) {
      toast.error("Failed to refresh dashboard data");
    } finally {
      setTimeout(() => {
        setIsRefreshing(false);
      }, 800);
    }
  };

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("sidebar-collapsed") === "true");

  useEffect(() => {
    const handler = (e: any) => {
      setSidebarCollapsed(e.detail.collapsed);
    };
    window.addEventListener("sidebar-collapse-change", handler);
    return () => window.removeEventListener("sidebar-collapse-change", handler);
  }, []);

  // Auto-cycle chart type every 8 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setChartType((prev) => (prev === "area" ? "bar" : "area"));
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  // Fetch real router status for the first configured router
  const branchId = localStorage.getItem("selected-workspace") || "biltra";
  const { data: routers = [], isLoading: isRoutersLoading } = useRouters(branchId);
  const firstRouterId = routers[0]?.id || "";
  const { data: statusData, refetch: refetchStatus } = useRouterStatus(firstRouterId);
  const { data: wallet, isLoading: isWalletLoading } = useBranchWallet(branchId, user?.account_type !== "staff");
  const { data: revenueShare } = useQuery({
    queryKey: ["revenueShare", branchId],
    queryFn: () => renultApi.staff.revenueShare(branchId),
    enabled: Boolean(branchId),
  });
  const { data: subscriptions = [], isLoading: isSubscriptionsLoading } = useQuery({
    queryKey: ["subscriptions", "dashboard"],
    queryFn: () => renultApi.subscriptions.list({ limit: 5, active_only: true }),
  });
  // Fetch branch vouchers (up to 1000) for recent purchases and heatmap metrics
  const { data: vouchersData, isLoading: isVouchersLoading } = useBranchVouchers(branchId, { limit: 1000 });

  // Active hotspot users and live router status across every router in the branch.
  const activeUsersQueries = useBranchActiveUsers(routers);
  const routerStatusQueries = useBranchRouterStatus(routers);

  const onlineUsersCount = activeUsersQueries.reduce((sum, query) => sum + (query.data?.count ?? 0), 0);
  // A DHCP lease still bound to a device counts as an active session even after
  // the device drops off the hotspot's "active users" (currently-connected) table.
  const sessionCount = routerStatusQueries.reduce((sum, query) => {
    const leases = query.data?.dhcp_leases || [];
    const bound = leases.filter((lease) => !lease.status || String(lease.status).toLowerCase() === "bound").length;
    return sum + bound;
  }, 0);
  const offlineWithSession = Math.max(0, sessionCount - onlineUsersCount);
  const isActiveUsersLoading = isRoutersLoading
    || activeUsersQueries.some((query) => query.isLoading)
    || routerStatusQueries.some((query) => query.isLoading);

  const dataUsageTotals = routerStatusQueries.reduce(
    (acc, query) => {
      const wanInterface = pickWanInterface(query.data?.interfaces);
      if (wanInterface) {
        acc.rx += Number(wanInterface["rx-byte"] ?? 0);
        acc.tx += Number(wanInterface["tx-byte"] ?? 0);
      }
      return acc;
    },
    { rx: 0, tx: 0 },
  );
  const dataUsageTotal = dataUsageTotals.rx + dataUsageTotals.tx;
  const isDataUsageLoading = isRoutersLoading || routerStatusQueries.some((query) => query.isLoading);

  const chartData = useMemo(() => {
    const grouped: Record<string, { sales: number; responses: number; sortKey: string }> = {};
    (vouchersData?.vouchers || []).forEach((voucher) => {
      const date = new Date(voucher.created_at);
      const sortKey = voucher.created_at.slice(0, 10);
      const key = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      if (!grouped[key]) grouped[key] = { sales: 0, responses: 0, sortKey };
      if (isActivatedVoucher(voucher)) {
        grouped[key].sales += voucher.amount;
      }
      grouped[key].responses += 1;
    });
    return Object.entries(grouped)
      .map(([date, values]) => ({ date, ...values }))
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
      .slice(-7);
  }, [vouchersData]);

  const todayVoucherSales = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return (vouchersData?.vouchers || [])
      .filter((voucher) => voucher.created_at.slice(0, 10) === today)
      .filter(isActivatedVoucher)
      .reduce((sum, voucher) => sum + voucher.amount, 0);
  }, [vouchersData]);

  // Derive recent voucher-style rows from real vouchers data
  const recentVouchers = useMemo(() => {
    if (!vouchersData?.vouchers) return [];
    return vouchersData.vouchers.slice(0, 5).map((v) => ({
      id: v.voucher_code,
      buyerName: v.phone_number === "BULK" ? "Bulk Generated" : `Customer (${v.phone_number})`,
      email: v.phone_number === "BULK" ? "bulk@tresa.com" : `${v.phone_number}@tresa.com`,
      phone: v.phone_number === "BULK" ? "N/A" : v.phone_number,
      packageName: `${v.speed_type} ${v.profile}`,
      pricePaid: v.amount,
      purchaseTime: v.created_at,
      status: voucherUiStatus(v.status),
      paymentMethod: (v.payment_reference?.startsWith("BAT-") ? "M-Pesa" : "Stripe") as any,
    }));
  }, [vouchersData]);

  const isOnline = statusData?.connected ?? false;
  const selectedRouterName = routers[0]?.name || "Router";
  const cpuUsage = statusData?.system_resource?.['cpu-load'] ?? 0;
  const totalMemory = statusData?.system_resource?.['total-memory'];
  const freeMemory = statusData?.system_resource?.['free-memory'];
  const memoryUsage = totalMemory ? Math.round(((totalMemory - freeMemory) / totalMemory) * 100) : 0;
  const activeClients = statusData?.dhcp_leases?.length ?? 0;
  const nearestSubscription = subscriptions[0];

  // Generate heatmap cells from real historical voucher creation data (last 84 days)
  const heatmapData = useMemo(() => {
    const cells = Array.from({ length: 84 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (83 - i));
      return {
        day: i,
        dateStr: date.toISOString().split("T")[0],
        count: 0,
        level: 0
      };
    });

    if (vouchersData?.vouchers) {
      vouchersData.vouchers.forEach((v) => {
        const dateStr = v.created_at.split("T")[0];
        const cell = cells.find((c) => c.dateStr === dateStr);
        if (cell) {
          cell.count += 1;
        }
      });
    }

    cells.forEach((cell) => {
      if (cell.count === 0) cell.level = 0;
      else if (cell.count < 3) cell.level = 1;
      else if (cell.count < 6) cell.level = 2;
      else if (cell.count < 10) cell.level = 3;
      else cell.level = 4;
    });

    return cells;
  }, [vouchersData]);

  return (
    <div className={`min-h-screen bg-background transition-all duration-300 ${sidebarCollapsed ? "md:pl-[72px]" : "md:pl-[280px]"}`}>
      <SEO title="Dashboard" />
      <AppHeader />

      <main className="max-w-screen mx-auto px-4 sm:px-6 py-4">
        {/* form */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold">Dashboard</h2>
            <div className="flex items-center gap-2">
              <Select defaultValue="today">
                <SelectTrigger className="w-[130px] h-9 text-xs bg-background">
                  <SelectValue placeholder="Date Range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="week">This Week</SelectItem>
                  <SelectItem value="month">This Month</SelectItem>
                  <SelectItem value="year">This Year</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                onClick={() => {
                  handleRefresh();
                  if (firstRouterId) refetchStatus();
                }}
                className="gap-1.5 h-9 px-3 flex items-center text-xs"
              >
                <RotateCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-primary" : ""}`} />
                <span>Refresh</span>
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <button
              onClick={() => navigate("/withdraw")}
              className="bg-card border border-primary/40 hover:border-primary/60 transition-all rounded p-5 flex flex-col justify-between text-left h-full w-full relative group shadow-[0_0_10px_hsl(var(--primary)/0.05)]"
            >
              <div className="flex justify-between items-start w-full">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-muted-foreground">Net Sales</span>
                  <PeriodBadge label="Today" />
                </div>
                <TrendingUp className="w-4 h-4 text-emerald-500 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </div>
              <div className="mt-3">
                {isVouchersLoading ? (
                  <Skeleton className="h-8 w-28" />
                ) : (
                  <h3 className="text-2xl font-black text-foreground tracking-tight">
                    UGX {todayVoucherSales.toLocaleString()}
                  </h3>
                )}
                <p className="text-[11px] text-muted-foreground mt-1.5 font-medium">
                  Voucher sales recorded today. Wallet credit is tracked separately.
                </p>
              </div>
            </button>
            {user?.account_type !== "staff" ? <div
              className="bg-card border border-primary/40 hover:border-primary/60 transition-all rounded p-5 flex flex-col justify-between text-left h-full w-full relative group shadow-[0_0_10px_hsl(var(--primary)/0.05)]"
            >
              <div className="flex justify-between items-start w-full">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-muted-foreground">Mobile Money Credits</span>
                  <LiveBadge />
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleBalanceHidden(); }}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={balanceHidden ? "Show balance" : "Hide balance"}
                  >
                    {balanceHidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  <button onClick={() => navigate("/withdraw")} className="cursor-pointer">
                    <Coins className="w-4 h-4 text-amber-500 transition-transform group-hover:scale-110" />
                  </button>
                </div>
              </div>
              <button onClick={() => navigate("/withdraw")} className="mt-3 text-left cursor-pointer">
                {isWalletLoading ? (
                  <Skeleton className="h-8 w-28" />
                ) : (
                  <h3 className={cn(
                    "text-2xl font-black text-foreground tracking-tight",
                    balanceHidden && "blur-sm select-none",
                  )}>
                    UGX {(wallet?.balance ?? 0).toLocaleString()}
                  </h3>
                )}
                <p className="text-[11px] text-muted-foreground mt-1.5 font-medium">Net prepaid balance.</p>
              </button>
            </div> : <div className="bg-card border border-primary/40 rounded p-5 flex flex-col justify-between">
              <span className="text-xs font-semibold text-muted-foreground">Agent Access</span>
              <h3 className="mt-3 text-xl font-black capitalize">{user?.staff_role || "Agent"}</h3>
              <p className="mt-1.5 text-[11px] text-muted-foreground">Branch operations only. Wallet and settings remain owner controlled.</p>
            </div>}
            <div className="col-span-2 md:col-span-1 bg-card border border-primary/40 rounded p-5 flex flex-col justify-between min-h-[150px]">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-xs font-semibold text-muted-foreground">
                    {user?.account_type === "staff" ? "My Agent Share" : "My Sales Voucher"}
                  </span>
                  <p className="mt-1 text-[10px] font-semibold text-primary">
                    {revenueShare?.current_user_percentage ?? 100}% of recorded sales
                  </p>
                </div>
                <BarChart3 className="h-4 w-4 text-primary" />
              </div>
              <h3 className="mt-2 text-2xl font-black">
                UGX {(revenueShare?.current_user_amount ?? 0).toLocaleString()}
              </h3>
              <div className="h-10 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <Area type="monotone" dataKey="sales" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.15)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
            <SystemInsightsPopover routerId={firstRouterId}>
              <button className="col-span-2 lg:col-span-1 bg-card border border-primary/40 hover:border-primary/60 transition-all rounded p-5 flex flex-col justify-between text-left h-full w-full relative group shadow-[0_0_10px_hsl(var(--primary)/0.05)] cursor-pointer">
                <div className="flex justify-between items-start w-full">
                  <span className="text-xs font-semibold text-muted-foreground truncate max-w-[150px]">
                    System Insights ({selectedRouterName})
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className={cn("w-1.5 h-1.5 rounded-full", isOnline ? "bg-emerald-500 animate-pulse" : "bg-rose-500")} />
                    <span className={cn("text-[12px] font-semibold", isOnline ? "text-emerald-500" : "text-rose-500")}>
                      {isOnline ? "Online" : "Offline"}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-4 w-full">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded flex items-center justify-center text-muted-foreground group-hover:text-primary transition-colors shrink-0">
                      <User className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-foreground leading-none">{isOnline ? activeClients : "–"}</h4>
                      <p className="text-[10px] text-muted-foreground mt-0.5 leading-none overflow-auto">Lease</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 border-l border-border/30 pl-2">
                    <div className="w-8 h-8 rounded flex items-center justify-center text-muted-foreground group-hover:text-primary transition-colors shrink-0">
                      <Cpu className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-foreground leading-none">{isOnline ? `${cpuUsage}%` : "–"}</h4>
                      <p className="text-[10px] text-muted-foreground mt-0.5 leading-none">CPU</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 border-l border-border/30 pl-2">
                    <div className="w-8 h-8 rounded flex items-center justify-center text-muted-foreground group-hover:text-primary transition-colors shrink-0">
                      <Database className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-foreground leading-none">{isOnline ? `${memoryUsage}%` : "–"}</h4>
                      <p className="text-[10px] text-muted-foreground mt-0.5 leading-none">RAM</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full mt-4 text-[10px] text-emerald-500/80">
                  <ChevronLeft className="w-3 h-3 cursor-pointer hover:text-emerald-500 shrink-0" />
                  <div className="flex-1 h-1.5 rounded-full bg-muted/30 overflow-hidden relative">
                    <div className="absolute left-0 top-0 bottom-0 bg-emerald-500 rounded-full transition-all duration-300" style={{ width: `${isOnline ? cpuUsage : 0}%` }} />
                  </div>
                  <ChevronRight className="w-3 h-3 cursor-pointer hover:text-emerald-500 shrink-0" />
                </div>
              </button>
            </SystemInsightsPopover>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mt-3">
            <div className="bg-card border border-primary/40 rounded p-5 flex flex-col justify-between min-h-[150px]">
              <div className="flex justify-between items-start w-full">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-muted-foreground">Active Users</span>
                  <LiveBadge />
                </div>
                <MiniBarChart
                  bars={[
                    { value: Math.max(onlineUsersCount, 0.4), color: "#10b981" },
                    { value: Math.max(offlineWithSession, 0.4), color: "#f59e0b" },
                  ]}
                />
              </div>
              <div className="mt-3">
                {isActiveUsersLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <h3 className="text-2xl font-black text-foreground tracking-tight">{onlineUsersCount}</h3>
                )}
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <Badge className="bg-emerald-500/10 text-emerald-600 border-none text-[10px] gap-1 font-semibold">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    {onlineUsersCount} online
                  </Badge>
                  <Badge className="bg-amber-500/10 text-amber-600 border-none text-[10px] gap-1 font-semibold">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    {offlineWithSession} offline · active session
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5 font-medium">
                  Connected to a hotspot now vs. holding an unused active voucher session.
                </p>
              </div>
            </div>

            <div className="bg-card border border-primary/40 rounded p-5 flex flex-col justify-between min-h-[150px]">
              <div className="flex justify-between items-start w-full">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-muted-foreground">Data Usage</span>
                  <PeriodBadge label="This Month" />
                </div>
                <MiniBarChart
                  bars={[
                    { value: Math.max(dataUsageTotals.rx, 1), color: "#10b981" },
                    { value: Math.max(dataUsageTotals.tx, 1), color: "#f59e0b" },
                  ]}
                />
              </div>
              <div className="mt-3">
                {isDataUsageLoading ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <h3 className="text-2xl font-black text-foreground tracking-tight">{formatBytes(dataUsageTotal)}</h3>
                )}
                <div className="flex items-center gap-3 mt-2 text-[11px] font-semibold">
                  <span className="flex items-center gap-1 text-emerald-600">
                    <ArrowDown className="w-3 h-3" /> {formatBytes(dataUsageTotals.rx)}
                  </span>
                  <span className="flex items-center gap-1 text-amber-600">
                    <ArrowUp className="w-3 h-3" /> {formatBytes(dataUsageTotals.tx)}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5 font-medium">
                  Download and upload totals across all branch routers.
                </p>
              </div>
            </div>

            <button
              onClick={() => navigate("/settings/subscriptions")}
              className="bg-card border border-primary/40 hover:border-primary/60 rounded p-5 flex flex-col justify-between min-h-[150px] text-left transition-all sm:col-span-2"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="text-xs font-semibold text-muted-foreground">Subscription Countdown</span>
                  <p className="mt-1 text-[10px] font-semibold text-primary">ISP bills and recurring payments</p>
                </div>
                <CalendarClock className="h-4 w-4 text-primary" />
              </div>
              {isSubscriptionsLoading ? (
                <Skeleton className="mt-5 h-10 w-44" />
              ) : nearestSubscription ? (
                <div className="mt-4 grid gap-4 lg:grid-cols-[220px_1fr]">
                  <div>
                    <h3 className="text-2xl font-black text-foreground">
                      {nearestSubscription.days_until_due < 0
                        ? `${Math.abs(nearestSubscription.days_until_due)} overdue`
                        : nearestSubscription.days_until_due === 0
                          ? "Due today"
                          : `${nearestSubscription.days_until_due} days`}
                    </h3>
                    <p className="mt-1 text-xs font-semibold text-foreground">{nearestSubscription.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {nearestSubscription.currency} {nearestSubscription.amount.toLocaleString()} · {nearestSubscription.provider || nearestSubscription.category}
                    </p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {subscriptions.slice(0, 4).map((item) => (
                      <div key={item.id} className="rounded border border-border/20 bg-muted/20 px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-[11px] font-semibold">{item.name}</span>
                          {item.reminder_due && <BellRing className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
                        </div>
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          {item.days_until_due < 0
                            ? `${Math.abs(item.days_until_due)} day(s) overdue`
                            : item.days_until_due === 0
                              ? "Due today"
                              : `${item.days_until_due} day(s) left`}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mt-4">
                  <h3 className="text-xl font-black text-foreground">No bills saved</h3>
                  <p className="mt-1 text-[11px] text-muted-foreground">Add your ISP bill or another subscription to start daily countdown reminders.</p>
                </div>
              )}
            </button>
          </div>
        </div>

        {/* Analytics Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8 mt-6">
          {/* Left: Chart Card */}
          <Card className="lg:col-span-2 bg-card border border-border/40 shadow-none rounded">
            <CardHeader className="pb-2">
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    Performance Analytics
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Voucher sales & form responses over the last 7 days
                  </CardDescription>
                </div>
                <div className="flex items-center gap-3 text-[10px] sm:text-xs">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <span className="w-2.5 h-2.5 rounded-full bg-primary" />
                    Voucher Sales
                  </span>
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    Responses
                  </span>
                  <button
                    onClick={() => setChartType((prev) => (prev === "area" ? "bar" : "area"))}
                    className={cn(
                      "ml-1 w-7 h-7 rounded flex items-center justify-center transition-all duration-300",
                      chartType === "bar"
                        ? "bg-primary/10 text-primary"
                        : "bg-muted/30 text-muted-foreground"
                    )}
                    title={chartType === "area" ? "Switch to Bar Chart" : "Switch to Line Chart"}
                  >
                    {chartType === "area" ? (
                      <ArrowUp className="w-3.5 h-3.5 transition-transform duration-300" />
                    ) : (
                      <BarChart3 className="w-3.5 h-3.5 transition-transform duration-300" />
                    )}
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="h-64 pt-4">
              <ResponsiveContainer width="100%" height="100%">
                {chartType === "area" ? (
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorResponses" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border)/0.5)" />
                    <XAxis dataKey="date" tickLine={false} axisLine={false} style={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tickLine={false} axisLine={false} style={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        borderColor: "hsl(var(--border))",
                        borderRadius: "8px",
                        fontSize: "11px",
                        color: "hsl(var(--foreground))"
                      }}
                    />
                    <Area type="monotone" dataKey="sales" stroke="hsl(var(--primary))" strokeWidth={2} fillOpacity={1} fill="url(#colorSales)" />
                    <Area type="monotone" dataKey="responses" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorResponses)" />
                  </AreaChart>
                ) : (
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorBarSales" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.85} />
                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                      </linearGradient>
                      <linearGradient id="colorBarResponses" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.85} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0.4} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border)/0.5)" />
                    <XAxis dataKey="date" tickLine={false} axisLine={false} style={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tickLine={false} axisLine={false} style={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        borderColor: "hsl(var(--border))",
                        borderRadius: "8px",
                        fontSize: "11px",
                        color: "hsl(var(--foreground))"
                      }}
                    />
                    <Bar dataKey="sales" fill="url(#colorBarSales)" radius={[4, 4, 0, 0]} barSize={18} />
                    <Bar dataKey="responses" fill="url(#colorBarResponses)" radius={[4, 4, 0, 0]} barSize={18} />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Right: Heatmap Card */}
          <Card className="bg-card border border-border/40 shadow-none rounded">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                Recent Sales
              </CardTitle>
              <CardDescription className="text-xs">
                Recent Voucher Purchases
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="flex flex-col gap-4">
                {/* Heatmap Grid */}
                <div className="grid grid-cols-12 gap-1.5 mt-2 select-none">
                  {heatmapData.map((cell) => {
                    let colorClass = "bg-muted/30";
                    if (cell.level === 1) colorClass = "bg-emerald-500/20 dark:bg-emerald-500/10";
                    else if (cell.level === 2) colorClass = "bg-emerald-500/40 dark:bg-emerald-500/25";
                    else if (cell.level === 3) colorClass = "bg-emerald-500/70 dark:bg-emerald-500/50";
                    else if (cell.level === 4) colorClass = "bg-emerald-500 dark:bg-emerald-500/85";
                    return (
                      <div
                        key={cell.day}
                        className={`aspect-square w-full rounded-[2px] transition-all hover:scale-125 hover:shadow-sm cursor-pointer ${colorClass}`}
                        title={`${cell.count} activities`}
                      />
                    );
                  })}
                </div>

                {/* Heatmap Legend */}
                <div className="flex justify-between items-center text-[10px] text-muted-foreground pt-1">
                  <span>Less active</span>
                  <div className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-[1px] bg-muted/30" />
                    <span className="w-2.5 h-2.5 rounded-[1px] bg-emerald-500/20" />
                    <span className="w-2.5 h-2.5 rounded-[1px] bg-emerald-500/40" />
                    <span className="w-2.5 h-2.5 rounded-[1px] bg-emerald-500/70" />
                    <span className="w-2.5 h-2.5 rounded-[1px] bg-emerald-500" />
                  </div>
                  <span>More active</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Bought Vouchers Section */}
        <Card className="bg-card border border-border/10 shadow-none mb-8 rounded">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Ticket className="w-4 h-4 text-amber-500" />
                Recent Bought Vouchers
              </CardTitle>
              <CardDescription className="text-xs">
                Real-time log of captive portal voucher transactions
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/voucher-support")}
              className="text-xs text-primary hover:text-primary/80 font-semibold flex items-center gap-1 p-0 h-auto"
            >
              View Registry <ExternalLink className="w-3 h-3" />
            </Button>
          </CardHeader>
          <CardContent className="p-5 flex-1 flex flex-col justify-between">
            <div className="overflow-x-auto rounded border border-border/10">
              <Table>
                <TableHeader className="bg-muted/40 font-semibold">
                  <TableRow>
                    <TableHead className="w-[140px] text-xs">Voucher Code</TableHead>
                    <TableHead className="text-xs">Buyer</TableHead>
                    <TableHead className="text-xs">Phone Number</TableHead>
                    <TableHead className="text-xs">Internet Package</TableHead>
                    <TableHead className="text-xs">Paid</TableHead>
                    <TableHead className="text-xs">Purchase Date</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="w-[80px] text-right text-xs">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentVouchers.map((voucher) => (
                    <TableRow
                      key={voucher.id}
                      className="cursor-pointer hover:bg-muted/30 group transition-colors"
                      onClick={() => copyVoucherCode(voucher.id)}
                    >
                      <TableCell className="font-mono text-xs font-semibold text-primary">{voucher.id}</TableCell>
                      <TableCell className="text-xs font-semibold">
                        <div>{voucher.buyerName}</div>
                        <div className="text-[10px] text-muted-foreground font-normal">{voucher.email}</div>
                      </TableCell>
                      <TableCell className="text-xs font-semibold font-mono text-foreground/80">{voucher.phone}</TableCell>
                      <TableCell className="text-xs text-muted-foreground font-medium">{voucher.packageName}</TableCell>
                      <TableCell className="text-xs font-bold text-foreground">UGX {voucher.pricePaid.toLocaleString()}</TableCell>
                      <TableCell className="text-xs text-muted-foreground font-medium">
                        {new Date(voucher.purchaseTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </TableCell>
                      <TableCell className="text-xs">
                        <Badge className={cn("text-[10px] px-2 py-0 border-none font-semibold rounded-full", getVoucherStatusBadgeClass(voucher.status))}>
                          {voucher.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            copyVoucherCode(voucher.id);
                          }}
                          className="h-8 px-2 text-xs text-primary hover:bg-primary/10 rounded font-semibold"
                        >
                          Copy
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </main>

    </div>
  );
}

function SystemInsightsPopover({ children, routerId }: { children: React.ReactNode; routerId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const { data: statusData } = useRouterStatus(routerId);

  const isOnline = statusData?.connected ?? false;
  const totalMemory = statusData?.system_resource?.['total-memory'] || 0;
  const freeMemory = statusData?.system_resource?.['free-memory'] || 0;
  const usedMemory = totalMemory - freeMemory;

  const memoryText = totalMemory ? `${formatBytes(usedMemory)} / ${formatBytes(totalMemory)}` : "–";

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        {children}
      </PopoverTrigger>
      <PopoverContent className="w-[calc(100vw-32px)] sm:w-[360px] p-5 bg-card rounded shadow-xl border border-border/50" align="end" sideOffset={12}>
        <div className="space-y-4">
          <div>
            <h4 className="font-bold text-sm text-foreground">Router Insights</h4>
            <p className="text-[11px] text-muted-foreground mt-0.5">Live status and network health check log</p>
          </div>

          {/* WireGuard Status */}
          <div className="p-3 bg-muted/30 rounded border border-border/10 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <span className={cn("w-2 h-2 rounded-full", isOnline ? "bg-emerald-500 animate-pulse" : "bg-rose-500")} />
                Tunnel Connection
              </span>
              <Badge className={cn("border-none text-[10px] py-0 font-semibold", isOnline ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500")} variant="outline">
                {isOnline ? "Online" : "Offline"}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[10px] text-muted-foreground pt-1 border-t border-border/20">
              <div>
                <p className="font-medium">Board Model</p>
                <p className="text-foreground font-semibold mt-0.5">{statusData?.system_resource?.['board-name'] || "–"}</p>
              </div>
              <div>
                <p className="font-medium">Uptime</p>
                <p className="text-foreground font-semibold mt-0.5">{statusData?.system_resource?.uptime || "–"}</p>
              </div>
            </div>
          </div>

          {/* Detailed stats */}
          <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
            <div className="p-2 bg-muted/10 rounded border border-border/0">
              <p className="text-muted-foreground text-[10px]">Memory Load</p>
              <p className="font-bold text-foreground mt-0.5">{memoryText}</p>
            </div>
            <div className="p-2 bg-muted/10 rounded border border-border/0">
              <p className="text-muted-foreground text-[10px]">OS Version</p>
              <p className="font-bold text-foreground mt-0.5">{statusData?.system_resource?.version ? `v${statusData.system_resource.version}` : "–"}</p>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

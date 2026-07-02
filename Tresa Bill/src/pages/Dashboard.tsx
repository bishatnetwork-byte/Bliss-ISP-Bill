/* eslint-disable @typescript-eslint/no-explicit-any */

import { renultApi } from "@/api/foreform";
import AppHeader from "@/components/Header/AppHeader";
import SEO from "@/components/SEO";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
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
  ExternalLink,
  RotateCw,
  Ticket,
  TrendingUp,
  User
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";
import { useNavigate } from "react-router-dom";
import { useRouters, useRouterStatus, useBranchVouchers, useBranchActiveUsers, useBranchRouterStatus } from "@/hooks/useRouters";
import {
  isVoucherRevenueSale,
  voucherPaymentMode,
  voucherRevenueDate,
  voucherSalesStatus,
} from "@/lib/voucherSales";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
    <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
      {label}
    </span>
  );
}

function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-emerald-600">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
      Live
    </span>
  );
}

const chartColors = {
  cash: "#20c997",
  cashSoft: "#8af0c6",
  mobile: "#6865f2",
  mobileSoft: "#a7a5ff",
  grid: "hsl(var(--border))",
  axis: "hsl(var(--muted-foreground))",
  cursor: "hsl(var(--muted))",
};

function voucherSoldAt(
  voucher: Parameters<typeof voucherRevenueDate>[0],
) {
  return voucherRevenueDate(voucher);
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date: Date) {
  const end = startOfDay(date);
  end.setDate(end.getDate() + 1);
  end.setMilliseconds(end.getMilliseconds() - 1);
  return end;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function defaultDashboardRange(): DateRange {
  const today = startOfDay(new Date());
  return { from: addDays(today, -29), to: today };
}

function formatShortDate(date: Date) {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatDateRangeLabel(range: DateRange | undefined) {
  if (!range?.from) return "All Time";
  if (!range.to || range.from.toDateString() === range.to.toDateString()) return formatShortDate(range.from);
  return `${formatShortDate(range.from)} - ${formatShortDate(range.to)}`;
}

function dateInRange(dateValue: string, range: DateRange | undefined) {
  if (!range?.from) return true;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return false;
  const from = startOfDay(range.from);
  const to = endOfDay(range.to || range.from);
  return date >= from && date <= to;
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
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => defaultDashboardRange());
  const { user } = useAuth();

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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["branchWallet"] }),
        refetchRouters(),
        refetchVouchers(),
        refetchRevenueShare(),
        refetchSubscriptions(),
        firstRouterId ? refetchStatus() : Promise.resolve(),
        ...activeUsersQueries.map((query) => query.refetch()),
        ...routerStatusQueries.map((query) => query.refetch()),
      ]);
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
  const { data: routers = [], isLoading: isRoutersLoading, refetch: refetchRouters } = useRouters(branchId);
  const firstRouterId = routers[0]?.id || "";
  const { data: statusData, refetch: refetchStatus } = useRouterStatus(firstRouterId);
  const { data: revenueShare, refetch: refetchRevenueShare } = useQuery({
    queryKey: ["revenueShare", branchId],
    queryFn: () => renultApi.staff.revenueShare(branchId),
    enabled: Boolean(branchId),
  });
  const { data: subscriptions = [], isLoading: isSubscriptionsLoading, refetch: refetchSubscriptions } = useQuery({
    queryKey: ["subscriptions", "dashboard"],
    queryFn: () => renultApi.subscriptions.list({ limit: 5, active_only: true }),
  });
  // Fetch branch vouchers for recent purchases and historical metrics.
  const { data: vouchersData, isLoading: isVouchersLoading, refetch: refetchVouchers } = useBranchVouchers(branchId, { limit: 5000, refresh_router_status: true });

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

  const rangedVouchers = useMemo(() => {
    return (vouchersData?.vouchers || [])
      .filter(isVoucherRevenueSale)
      .filter((voucher) => dateInRange(voucherSoldAt(voucher), dateRange));
  }, [dateRange, vouchersData]);

  const chartData = useMemo(() => {
    const grouped: Record<string, { sales: number; responses: number; sortKey: string }> = {};
    rangedVouchers.forEach((voucher) => {
      const soldAt = voucherSoldAt(voucher);
      const date = new Date(soldAt);
      const sortKey = soldAt.slice(0, 10);
      const key = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      if (!grouped[key]) grouped[key] = { sales: 0, responses: 0, sortKey };
      grouped[key].sales += voucher.amount;
      grouped[key].responses += 1;
    });
    return Object.entries(grouped)
      .map(([date, values]) => ({ date, ...values }))
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
      .slice(-7);
  }, [rangedVouchers]);

  const todayVoucherSales = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return (vouchersData?.vouchers || [])
      .filter(isVoucherRevenueSale)
      .filter((voucher) => voucherSoldAt(voucher).slice(0, 10) === today)
      .reduce((sum, voucher) => sum + voucher.amount, 0);
  }, [vouchersData]);

  // Derive recent voucher-style rows from real vouchers data
  const recentVouchers = useMemo(() => {
    return [...rangedVouchers]
      .sort((a, b) => voucherSoldAt(b).localeCompare(voucherSoldAt(a)))
      .slice(0, 5)
      .map((v) => ({
      id: v.voucher_code,
      buyerName: v.phone_number === "BULK" ? "Bulk Generated" : `Customer (${v.phone_number})`,
      email: v.phone_number === "BULK" ? "bulk@tresa.com" : `${v.phone_number}@tresa.com`,
      phone: v.phone_number === "BULK" ? "N/A" : v.phone_number,
      packageName: `${v.speed_type} ${v.profile}`,
      pricePaid: v.amount,
      purchaseTime: voucherSoldAt(v),
      status: voucherSalesStatus(v),
      paymentMethod: (voucherPaymentMode(v) === "Voucher Printing" ? "Cash" : "Mobile Money") as any,
    }));
  }, [rangedVouchers]);

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

    rangedVouchers.forEach((v) => {
      const dateStr = voucherSoldAt(v).split("T")[0];
      const cell = cells.find((c) => c.dateStr === dateStr);
      if (cell) {
        cell.count += 1;
      }
    });

    cells.forEach((cell) => {
      if (cell.count === 0) cell.level = 0;
      else if (cell.count < 3) cell.level = 1;
      else if (cell.count < 6) cell.level = 2;
      else if (cell.count < 10) cell.level = 3;
      else cell.level = 4;
    });

    return cells;
  }, [rangedVouchers]);

  const periodSummary = useMemo(() => {
    const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const addDays = (date: Date, days: number) => {
      const next = new Date(date);
      next.setDate(next.getDate() + days);
      return next;
    };
    const startOfWeek = (date: Date) => {
      const start = startOfDay(date);
      const day = start.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      start.setDate(start.getDate() + diff);
      return start;
    };
    const now = new Date();
    const today = startOfDay(now);
    const yesterday = addDays(today, -1);
    const thisWeek = startOfWeek(now);
    const lastWeek = addDays(thisWeek, -7);
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const thisYear = new Date(now.getFullYear(), 0, 1);

    const rows = [
      { label: "Today", start: today, end: addDays(today, 1), dot: "bg-emerald-500" },
      { label: "Yesterday", start: yesterday, end: today, dot: "bg-slate-400" },
      { label: "This Week", start: thisWeek, end: addDays(now, 1), dot: "bg-blue-500" },
      { label: "Last Week", start: lastWeek, end: thisWeek, dot: "bg-slate-500" },
      { label: "This Month", start: thisMonth, end: addDays(now, 1), dot: "bg-indigo-500" },
      { label: "Last Month", start: lastMonth, end: thisMonth, dot: "bg-cyan-500" },
      { label: "This Year", start: thisYear, end: addDays(now, 1), dot: "bg-violet-500" },
    ];

    return rows.map((row) => {
      const vouchers = (vouchersData?.vouchers || []).filter((voucher) => {
        if (!isVoucherRevenueSale(voucher)) return false;
        const soldAt = new Date(voucherSoldAt(voucher));
        return soldAt >= row.start && soldAt < row.end;
      });
      const cash = vouchers
        .filter((voucher) => voucherPaymentMode(voucher) === "Voucher Printing")
        .reduce((sum, voucher) => sum + voucher.amount, 0);
      const mobileMoney = vouchers
        .filter((voucher) => voucherPaymentMode(voucher) === "Online Payment")
        .reduce((sum, voucher) => sum + voucher.amount, 0);
      const total = cash + mobileMoney;

      return {
        ...row,
        cash,
        mobileMoney,
        total,
        totalItems: vouchers.length,
        cashItems: vouchers.filter((voucher) => voucherPaymentMode(voucher) === "Voucher Printing").length,
        mobileItems: vouchers.filter((voucher) => voucherPaymentMode(voucher) === "Online Payment").length,
      };
    });
  }, [vouchersData]);

  const paymentChartData = useMemo(() => {
    const grouped: Record<string, { date: string; sortKey: string; cash: number; mobileMoney: number; total: number; tans: number }> = {};
    rangedVouchers.forEach((voucher) => {
      const soldAt = voucherSoldAt(voucher);
      const createdAt = new Date(soldAt);
      const sortKey = soldAt.slice(0, 10);
      const date = createdAt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      if (!grouped[date]) grouped[date] = { date, sortKey, cash: 0, mobileMoney: 0, total: 0, tans: 0 };
      const amount = voucher.amount ?? 0;
      if (voucherPaymentMode(voucher) === "Voucher Printing") {
        grouped[date].cash += amount;
      } else {
        grouped[date].mobileMoney += amount;
      }
      grouped[date].total += amount;
      grouped[date].tans += 1;
    });
    return Object.values(grouped).sort((a, b) => a.sortKey.localeCompare(b.sortKey)).slice(-7);
  }, [rangedVouchers]);

  const todaysTransactions = periodSummary[0]?.totalItems ?? 0;
  const todaysRevenue = periodSummary[0]?.total ?? todayVoucherSales;
  const monthRevenue = periodSummary[4]?.total ?? 0;
  const displayName = user?.full_name?.split(" ")[0] || user?.email?.split("@")[0] || "there";
  const onlineRouterCount = routerStatusQueries.filter((query) => query.data?.connected).length || (isOnline ? 1 : 0);
  const updatedAt = new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div className={`min-h-screen bg-background text-foreground transition-all duration-300 ${sidebarCollapsed ? "md:pl-[72px]" : "md:pl-[280px]"}`}>
      <SEO title="Dashboard" />
      <AppHeader />

      <main className="mx-auto max-w-full px-3 py-3 sm:px-6 sm:py-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[12px] font-medium text-slate-500">Good morning, {displayName}</p>
            <h1 className="text-lg font-black tracking-tight text-slate-950 dark:text-foreground">
              {new Date().toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
            </h1>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto">
            <Badge className="rounded border border-orange-200 bg-orange-50 px-2 py-1 text-[12px] font-bold text-orange-600 hover:bg-orange-50 dark:border-orange-500/20 dark:bg-orange-500/10 dark:text-orange-300">
              {onlineRouterCount}/{routers.length || 0} Routers Online
            </Badge>
          </div>
        </div>

        <section className="mb-5 overflow-hidden rounded border border-border bg-card shadow-sm">
          <div className="flex flex-col gap-3 border-b border-border/70 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-black tracking-tight text-foreground">Revenue Overview</h2>
              <p className="text-[12px] text-muted-foreground">Only paid portal vouchers and activated admin vouchers are counted.</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded border border-border bg-background px-2 py-1 text-[11px] font-bold text-muted-foreground">
                {rangedVouchers.length} events
              </span>
              <LiveBadge />
            </div>
          </div>
          <div className="grid grid-cols-1 divide-y divide-border/70 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
            <MetricTile
              title="Today's Revenue"
              value={isVouchersLoading ? "..." : todaysRevenue.toLocaleString()}
              subtitle={`${todaysTransactions} transactions`}
              accent="emerald"
              icon={<TrendingUp className="h-4 w-4" />}
              onClick={() => navigate("/withdraw")}
            />
            <MetricTile
              title="Today's Sales"
              value={isVouchersLoading ? "..." : todaysTransactions.toLocaleString()}
              subtitle="vouchers sold"
              accent="indigo"
              icon={<BarChart3 className="h-4 w-4" />}
            />
            <MetricTile
              title="Active Users"
              value={isActiveUsersLoading ? "..." : onlineUsersCount.toLocaleString()}
              subtitle={`${offlineWithSession} waiting session`}
              accent="cyan"
              icon={<User className="h-4 w-4" />}
            />
            <MetricTile
              title="This Month"
              value={isVouchersLoading ? "..." : monthRevenue.toLocaleString()}
              subtitle="total revenue"
              accent="violet"
              icon={<Coins className="h-4 w-4" />}
            />
          </div>
        </section>

        <section className="mb-5">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <h2 className="text-base font-black tracking-tight">Analytics</h2>
              <p className="text-[12px] text-muted-foreground">{formatDateRangeLabel(dateRange)} · {rangedVouchers.length} revenue vouchers</p>
            </div>
            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-9 max-w-[210px] justify-start gap-2 rounded border-border bg-card px-3 text-left text-xs font-bold"
                  >
                    <CalendarClock className="h-3.5 w-3.5 shrink-0 text-[#6c5ce7]" />
                    <span className="truncate">{formatDateRangeLabel(dateRange)}</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto rounded border-border bg-card p-0" align="end">
                  <Calendar
                    mode="range"
                    selected={dateRange}
                    onSelect={setDateRange}
                    numberOfMonths={2}
                    className="hidden sm:block"
                  />
                  <Calendar
                    mode="range"
                    selected={dateRange}
                    onSelect={setDateRange}
                    numberOfMonths={1}
                    className="sm:hidden"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border p-3">
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="h-8 rounded text-xs" onClick={() => setDateRange({ from: startOfDay(new Date()), to: startOfDay(new Date()) })}>
                        Today
                      </Button>
                      <Button variant="outline" size="sm" className="h-8 rounded text-xs" onClick={() => setDateRange(defaultDashboardRange())}>
                        30 Days
                      </Button>
                    </div>
                    <Button variant="ghost" size="sm" className="h-8 rounded text-xs" onClick={() => setDateRange(undefined)}>
                      All Time
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
              <Button
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="h-9 gap-1.5 rounded bg-[#6c5ce7] px-3 text-xs font-bold hover:bg-[#5b4ad1]"
              >
                <RotateCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
                <span>Refresh</span>
              </Button>
            </div>
          </div>
          <div className="rounded border border-border bg-card p-3 shadow-sm">
            <div className="mb-3 flex items-start justify-between">
              <div>
                <h3 className="text-sm font-black">Payment Trends</h3>
                <p className="text-[12px] text-muted-foreground">Revenue grouped by day</p>
              </div>
              <button
                onClick={() => setChartType((prev) => (prev === "area" ? "bar" : "area"))}
                className="flex h-8 w-8 items-center justify-center rounded border border-border bg-card text-foreground transition hover:bg-muted"
                title={chartType === "area" ? "Switch to bar chart" : "Switch to area chart"}
              >
                {chartType === "area" ? <BarChart3 className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
              </button>
            </div>
            <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <SummaryPill label="Total" value={paymentChartData.reduce((sum, row) => sum + row.total, 0)} color="slate" />
              <SummaryPill label="Cash" value={paymentChartData.reduce((sum, row) => sum + row.cash, 0)} color="emerald" />
              <SummaryPill label="Mobile" value={paymentChartData.reduce((sum, row) => sum + row.mobileMoney, 0)} color="indigo" />
              <SummaryPill label="Trans" value={paymentChartData.reduce((sum, row) => sum + row.tans, 0)} color="slate" />
            </div>
            <div className="h-[300px] w-full rounded border border-border/60 bg-background/45 px-2 pb-2 pt-4">
              {paymentChartData.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
                  <BarChart3 className="mb-2 h-7 w-7 opacity-50" />
                  <p className="text-sm font-bold">No revenue in this range</p>
                  <p className="text-[12px]">Activated admin vouchers and paid portal vouchers will appear here.</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  {chartType === "area" ? (
                    <AreaChart data={paymentChartData} margin={{ top: 8, right: 10, left: -14, bottom: 0 }}>
                      <defs>
                        <linearGradient id="cashTrend" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={chartColors.cash} stopOpacity={0.34} />
                          <stop offset="95%" stopColor={chartColors.cash} stopOpacity={0.03} />
                        </linearGradient>
                        <linearGradient id="mobileTrend" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={chartColors.mobile} stopOpacity={0.32} />
                          <stop offset="95%" stopColor={chartColors.mobile} stopOpacity={0.03} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="4 4" vertical={false} stroke={chartColors.grid} opacity={0.7} />
                      <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: chartColors.axis, fontWeight: 700 }} dy={8} />
                      <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: chartColors.axis, fontWeight: 700 }} tickFormatter={(value) => Number(value).toLocaleString()} width={54} />
                      <Tooltip content={<DashboardTooltip />} cursor={{ stroke: chartColors.axis, strokeOpacity: 0.22, strokeWidth: 1 }} />
                      <Area type="monotone" dataKey="cash" stroke={chartColors.cash} fill="url(#cashTrend)" strokeWidth={2.5} activeDot={{ r: 4, strokeWidth: 0, fill: chartColors.cashSoft }} />
                      <Area type="monotone" dataKey="mobileMoney" stroke={chartColors.mobile} fill="url(#mobileTrend)" strokeWidth={2.5} activeDot={{ r: 4, strokeWidth: 0, fill: chartColors.mobileSoft }} />
                    </AreaChart>
                  ) : (
                    <BarChart data={paymentChartData} margin={{ top: 8, right: 10, left: -14, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="4 4" vertical={false} stroke={chartColors.grid} opacity={0.7} />
                      <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: chartColors.axis, fontWeight: 700 }} dy={8} />
                      <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: chartColors.axis, fontWeight: 700 }} tickFormatter={(value) => Number(value).toLocaleString()} width={54} />
                      <Tooltip content={<DashboardTooltip />} cursor={{ fill: chartColors.cursor, opacity: 0.42 }} />
                      <Bar dataKey="cash" fill={chartColors.cash} radius={[4, 4, 0, 0]} maxBarSize={18} />
                      <Bar dataKey="mobileMoney" fill={chartColors.mobile} radius={[4, 4, 0, 0]} maxBarSize={18} />
                    </BarChart>
                  )}
                </ResponsiveContainer>
              )}
            </div>
            <div className="mt-2 flex items-center justify-center gap-4 text-[12px] font-bold text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#20c997]" />Cash</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#6865f2]" />Mobile Money</span>
            </div>
          </div>
        </section>

        <section className="mb-5 grid gap-3 lg:grid-cols-[1fr_320px]">
          <div className="overflow-hidden rounded border border-border bg-card shadow-sm">
            <div className="flex items-start justify-between border-b border-border/70 px-3 py-3">
              <div>
                <h3 className="text-sm font-black">Period Summary</h3>
                <p className="text-[12px] text-muted-foreground">Updated {updatedAt}</p>
              </div>
              <Button variant="outline" size="icon" onClick={handleRefresh} disabled={isRefreshing} className="h-8 w-8 rounded border-border bg-card">
                <RotateCw className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="divide-y divide-border/70">
              {periodSummary.map((period) => (
                <div key={period.label} className="grid gap-3 bg-card px-3 py-3 transition hover:bg-muted/20 lg:grid-cols-[minmax(150px,0.9fr)_1.4fr] lg:items-center">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className={cn("h-2 w-2 rounded-full", period.dot)} />
                      <span className="truncate text-[12px] font-black text-foreground">{period.label}</span>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-black text-foreground">{period.total.toLocaleString()}</p>
                      <p className="text-[11px] font-semibold text-muted-foreground">{period.totalItems} tans</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <PaymentBreakdown label="Cash" value={period.cash} transactions={period.cashItems} tone="emerald" />
                    <PaymentBreakdown label="Mobile Money" value={period.mobileMoney} transactions={period.mobileItems} tone="indigo" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <SystemInsightsPopover routerId={firstRouterId}>
              <button className="w-full cursor-pointer rounded border border-[#8b7cf6] bg-card p-4 text-left transition hover:border-[#6c5ce7]">
                <div className="mb-6 flex items-center justify-between">
                  <span className="max-w-[210px] truncate text-xs font-black text-slate-700 dark:text-foreground">
                    System Insights ({selectedRouterName})
                  </span>
                  <span className={cn("flex items-center gap-1 text-xs font-bold", isOnline ? "text-emerald-500" : "text-rose-500")}>
                    <span className={cn("h-1.5 w-1.5 rounded-full", isOnline ? "bg-emerald-500" : "bg-rose-500")} />
                    {isOnline ? "Online" : "Offline"}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <InsightStat icon={<User className="h-4 w-4" />} value={isOnline ? activeClients : "–"} label="Lease" />
                  <InsightStat icon={<Cpu className="h-4 w-4" />} value={isOnline ? `${cpuUsage}%` : "–"} label="CPU" />
                  <InsightStat icon={<Database className="h-4 w-4" />} value={isOnline ? `${memoryUsage}%` : "–"} label="RAM" />
                </div>
                <div className="mt-5 flex items-center gap-3 text-emerald-400">
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-emerald-400" style={{ width: `${isOnline ? cpuUsage : 0}%` }} />
                  </div>
                  <ChevronRight className="h-3.5 w-3.5" />
                </div>
              </button>
            </SystemInsightsPopover>

            <button
              onClick={() => navigate("/settings/subscriptions")}
              className="w-full rounded border border-border bg-card p-4 text-left transition hover:border-[#6c5ce7]"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-black text-slate-700 dark:text-foreground">Subscription Countdown</p>
                  <p className="text-[12px] text-slate-500">ISP bills and recurring payments</p>
                </div>
                <CalendarClock className="h-4 w-4 text-[#6c5ce7]" />
              </div>
              {isSubscriptionsLoading ? (
                <Skeleton className="mt-4 h-8 w-32" />
              ) : nearestSubscription ? (
                <div className="mt-4">
                  <p className="text-2xl font-black">
                    {nearestSubscription.days_until_due < 0
                      ? `${Math.abs(nearestSubscription.days_until_due)} overdue`
                      : nearestSubscription.days_until_due === 0
                        ? "Due today"
                        : `${nearestSubscription.days_until_due} days`}
                  </p>
                  <p className="mt-1 text-xs font-bold">{nearestSubscription.name}</p>
                  <p className="text-[12px] text-slate-500">
                    {nearestSubscription.currency} {nearestSubscription.amount.toLocaleString()} · {nearestSubscription.provider || nearestSubscription.category}
                  </p>
                </div>
              ) : (
                <p className="mt-4 text-xs text-slate-500">No bills saved yet.</p>
              )}
            </button>

            <div className="hidden rounded border border-border bg-card p-4 shadow-sm lg:block">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black text-foreground">Revenue Activity</p>
                  <p className="text-[12px] text-muted-foreground">Last 84 days</p>
                </div>
                <span className="rounded border border-border bg-background px-2 py-1 text-[11px] font-bold text-muted-foreground">
                  {heatmapData.reduce((sum, cell) => sum + cell.count, 0)} events
                </span>
              </div>
              <div
                className="grid grid-flow-col gap-1 overflow-hidden"
                style={{ gridTemplateRows: "repeat(7, minmax(0, 1fr))" }}
              >
                {heatmapData.map((cell) => (
                  <span
                    key={cell.dateStr}
                    title={`${cell.dateStr}: ${cell.count} revenue event${cell.count === 1 ? "" : "s"}`}
                    className={cn("h-3 rounded-sm border border-border/40", heatmapLevelClass(cell.level))}
                  />
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
                <span>Less</span>
                <div className="flex items-center gap-1">
                  {[0, 1, 2, 3, 4].map((level) => (
                    <span key={level} className={cn("h-2.5 w-2.5 rounded-sm border border-border/40", heatmapLevelClass(level))} />
                  ))}
                </div>
                <span>More</span>
              </div>
            </div>
          </div>
        </section>
      </main>

    </div>
  );
}

function MetricTile({
  title,
  value,
  subtitle,
  accent,
  icon,
  onClick,
}: {
  title: string;
  value: string;
  subtitle: string;
  accent: "emerald" | "indigo" | "cyan" | "violet";
  icon: React.ReactNode;
  onClick?: () => void;
}) {
  const accentClasses = {
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
    indigo: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-300",
    cyan: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-300",
    violet: "bg-violet-500/10 text-violet-600 dark:text-violet-300",
  };
  const Component = onClick ? "button" : "div";

  return (
    <Component
      onClick={onClick}
      className="group min-h-[126px] bg-card p-3 text-left transition hover:bg-muted/25"
    >
      <div className="flex h-full flex-col justify-between rounded border border-border/70 bg-background/45 p-3 transition group-hover:border-primary/35">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[12px] font-bold text-muted-foreground">{title}</p>
            <p className="mt-2 break-words text-2xl font-black leading-tight text-foreground">{value}</p>
          </div>
          <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded border border-current/10", accentClasses[accent])}>
            {icon}
          </span>
        </div>
        <p className="mt-3 text-[12px] font-semibold text-muted-foreground">{subtitle}</p>
      </div>
    </Component>
  );
}

function SummaryPill({ label, value, color }: { label: string; value: number; color: "slate" | "emerald" | "indigo" }) {
  const colors = {
    slate: "text-foreground",
    emerald: "text-emerald-600 dark:text-emerald-300",
    indigo: "text-indigo-600 dark:text-indigo-300",
  };

  return (
    <div className="rounded border border-border/50 bg-background/55 px-3 py-2 text-center">
      <p className="text-[12px] font-bold text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-xs font-black", colors[color])}>{value.toLocaleString()}</p>
    </div>
  );
}

function PaymentBreakdown({
  label,
  value,
  transactions,
  tone,
}: {
  label: string;
  value: number;
  transactions: number;
  tone: "emerald" | "indigo";
}) {
  const toneClass = tone === "emerald"
    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
    : "border-indigo-500/20 bg-indigo-500/10 text-indigo-600 dark:text-indigo-300";

  return (
    <div className={cn("rounded border px-3 py-2", toneClass)}>
      <p className="text-[12px] font-bold">{label}</p>
      <p className="mt-1 text-xs font-black">{value.toLocaleString()}</p>
      <p className="mt-0.5 text-[12px] opacity-75">{transactions} tans</p>
    </div>
  );
}

function heatmapLevelClass(level: number) {
  if (level >= 4) return "bg-emerald-500";
  if (level === 3) return "bg-emerald-500/75";
  if (level === 2) return "bg-emerald-500/45";
  if (level === 1) return "bg-emerald-500/20";
  return "bg-muted/55";
}

function InsightStat({ icon, value, label }: { icon: React.ReactNode; value: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-slate-500">
        {icon}
      </span>
      <span>
        <span className="block text-sm font-black leading-none text-foreground">{value}</span>
        <span className="mt-1 block text-[12px] font-bold text-slate-500">{label}</span>
      </span>
    </div>
  );
}

function DashboardTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const cash = payload.find((item: any) => item.dataKey === "cash")?.value ?? 0;
  const mobileMoney = payload.find((item: any) => item.dataKey === "mobileMoney")?.value ?? 0;
  const total = Number(cash) + Number(mobileMoney);

  return (
    <div className="rounded border border-border bg-card/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
      <p className="mb-2 font-black text-foreground">{label}</p>
      <p className="flex items-center gap-2 font-bold text-emerald-600">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        Cash {Number(cash).toLocaleString()}
      </p>
      <p className="mt-1 flex items-center gap-2 font-bold text-indigo-600">
        <span className="h-2 w-2 rounded-full bg-indigo-500" />
        Mobile {Number(mobileMoney).toLocaleString()}
      </p>
      <p className="mt-2 border-t border-border/70 pt-2 font-black text-foreground">
        Total {total.toLocaleString()}
      </p>
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
      <PopoverContent className="w-[calc(100vw-32px)] sm:w-[360px] p-5 bg-card rounded border border-border/50" align="end" sideOffset={12}>
        <div className="space-y-4">
          <div>
            <h4 className="font-bold text-sm text-foreground">Router Insights</h4>
            <p className="text-[12px] text-muted-foreground mt-0.5">Live status and network health check log</p>
          </div>

          {/* WireGuard Status */}
          <div className="p-3 bg-muted/30 rounded border border-border/10 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <span className={cn("w-2 h-2 rounded-full", isOnline ? "bg-emerald-500 animate-pulse" : "bg-rose-500")} />
                Tunnel Connection
              </span>
              <Badge className={cn("border-none text-[12px] py-0 font-semibold", isOnline ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500")} variant="outline">
                {isOnline ? "Online" : "Offline"}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[12px] text-muted-foreground pt-1 border-t border-border/20">
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
              <p className="text-muted-foreground text-[12px]">Memory Load</p>
              <p className="font-bold text-foreground mt-0.5">{memoryText}</p>
            </div>
            <div className="p-2 bg-muted/10 rounded border border-border/0">
              <p className="text-muted-foreground text-[12px]">OS Version</p>
              <p className="font-bold text-foreground mt-0.5">{statusData?.system_resource?.version ? `v${statusData.system_resource.version}` : "–"}</p>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

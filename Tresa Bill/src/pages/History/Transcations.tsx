/* eslint-disable @typescript-eslint/no-explicit-any */
import AppHeader from "@/components/Header/AppHeader";
import SEO from "@/components/SEO";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { renultApi, WalletTransactionResponse } from "@/api/foreform";
import { useBranchTransactions, useBranchWallet } from "@/hooks/useWallet";
import { cn } from "@/lib/utils";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleDollarSign,
  Download,
  Loader2,
  RefreshCcw,
  RotateCcw,
  Search,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";

// ── Types ────────────────────────────────────────────────────────────
type TxType = "all" | "deposit" | "withdrawal";
type TxStatus = "all" | "completed" | "processing" | "failed";
type DateFilter = "all" | "today" | "yesterday" | "week" | "month";

// ── Sparkline SVG ────────────────────────────────────────────────────
function Sparkline({ data, color, height = 36 }: { data: number[]; color: string; height?: number }) {
  if (!data || data.length < 2) return <div style={{ height }} className="w-full" />;
  const width = 100;
  const max = Math.max(...data, 1);
  const step = width / (data.length - 1);
  const pts = data
    .map((v, i) => `${(i * step).toFixed(1)},${(height - (v / max) * (height - 4) - 2).toFixed(1)}`)
    .join(" ");
  const gradId = `sg-${color.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${height} ${pts} ${width},${height}`} fill={`url(#${gradId})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────
function fmt(n: number) {
  return `UGX ${n.toLocaleString()}`;
}
function fmtShort(n: number) {
  return n.toLocaleString();
}
function dayStr(daysAgo: number) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}
function txDay(iso: string) {
  return iso.slice(0, 10);
}
function fmtDate(iso: string) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("en-UG", { day: "2-digit", month: "short", year: "numeric" }),
    time: d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    full: d.toLocaleString("en-UG", { dateStyle: "long", timeStyle: "medium" }),
  };
}
const nowMs = Date.now();
const isToday = (iso: string) => txDay(iso) === dayStr(0);
const isYesterday = (iso: string) => txDay(iso) === dayStr(1);
const isThisWeek = (iso: string) => nowMs - new Date(iso).getTime() <= 7 * 86400000;
const isThisMonth = (iso: string) => nowMs - new Date(iso).getTime() <= 30 * 86400000;

// ── Status badge ─────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  if (s === "completed")
    return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px] font-bold">Completed</Badge>;
  if (s === "processing")
    return <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px] font-bold">Processing</Badge>;
  if (s === "failed")
    return <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/20 text-[10px] font-bold">Failed</Badge>;
  return <Badge variant="outline" className="bg-muted text-muted-foreground border-0 text-[10px] font-bold capitalize">{status}</Badge>;
}

// ── Expanded transaction detail row ──────────────────────────────────
function TxDetailRow({ txn }: { txn: WalletTransactionResponse & { runningBalance: number } }) {
  const { full } = fmtDate(txn.created_at);
  return (
    <TableRow className="bg-muted/20 hover:bg-muted/20 border-t-0">
      <TableCell colSpan={9} className="py-3 px-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-2 text-xs">
          <div>
            <p className="text-[10px] font-bold uppercase text-muted-foreground mb-0.5">Transaction ID</p>
            <p className="font-mono text-foreground/80 break-all">{txn.id}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase text-muted-foreground mb-0.5">Date & Time</p>
            <p className="text-foreground/80">{full}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase text-muted-foreground mb-0.5">Reference</p>
            <p className="font-mono text-foreground/80">{txn.reference ?? "—"}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase text-muted-foreground mb-0.5">Recipient Phone</p>
            <p className="text-foreground/80">{txn.recipient_phone ?? "—"}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase text-muted-foreground mb-0.5">Gross Amount</p>
            <p className="font-mono font-semibold">{fmt(txn.amount)}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase text-muted-foreground mb-0.5">Fee Charged</p>
            <p className={cn("font-mono", txn.fee_amount > 0 ? "text-orange-600 font-semibold" : "text-muted-foreground")}>
              {txn.fee_amount > 0 ? fmt(txn.fee_amount) : "No fee"}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase text-muted-foreground mb-0.5">Net Payout</p>
            <p className="font-mono font-semibold text-emerald-700">{txn.net_amount > 0 ? fmt(txn.net_amount) : "—"}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase text-muted-foreground mb-0.5">Balance After</p>
            <p className={cn("font-mono font-bold", txn.runningBalance < 0 ? "text-red-600" : "text-foreground")}>
              {fmt(txn.runningBalance)}
            </p>
          </div>
          {txn.gateway_status && (
            <div>
              <p className="text-[10px] font-bold uppercase text-muted-foreground mb-0.5">Gateway Status</p>
              <p className="font-mono text-foreground/80">{txn.gateway_status}</p>
            </div>
          )}
          {txn.failure_reason && (
            <div className="col-span-2 sm:col-span-3">
              <p className="text-[10px] font-bold uppercase text-muted-foreground mb-0.5">Failure Reason</p>
              <p className="text-red-600">{txn.failure_reason}</p>
            </div>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

// ── Main component ───────────────────────────────────────────────────
const PAGE_SIZE = 10;

export default function TransactionsPage() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("sidebar-collapsed") === "true"
  );
  const [branchId, setBranchId] = useState(
    () => localStorage.getItem("selected-workspace") || ""
  );

  const [typeFilter, setTypeFilter] = useState<TxType>("all");
  const [statusFilter, setStatusFilter] = useState<TxStatus>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [overrides, setOverrides] = useState<Record<string, WalletTransactionResponse>>({});
  const [checking, setChecking] = useState<Record<string, boolean>>({});
  const autoCheckedRef = useRef(false);

  useEffect(() => {
    const sidebarHandler = (e: Event) =>
      setSidebarCollapsed((e as CustomEvent<{ collapsed: boolean }>).detail.collapsed);
    const branchHandler = (e: Event) =>
      setBranchId((e as CustomEvent<{ id: string }>).detail.id);
    window.addEventListener("sidebar-collapse-change", sidebarHandler);
    window.addEventListener("renult-branch-change", branchHandler);
    return () => {
      window.removeEventListener("sidebar-collapse-change", sidebarHandler);
      window.removeEventListener("renult-branch-change", branchHandler);
    };
  }, []);

  const { data: wallet } = useBranchWallet(branchId);
  const { data: transactions, isLoading, refetch, isFetching } = useBranchTransactions(branchId, { limit: 200 });

  const allTxns = useMemo(() => transactions ?? [], [transactions]);

  // Running balance (oldest first → cumulative)
  const withBalance = useMemo(() => {
    const sorted = [...allTxns].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    let bal = 0;
    return sorted.map((t) => {
      bal += t.transaction_type === "deposit" ? t.amount : -t.amount;
      return { ...t, runningBalance: bal };
    });
  }, [allTxns]);

  const newestFirst = useMemo(() => [...withBalance].reverse(), [withBalance]);

  // Sparkline helpers sum per day over last N days
  const dailySum = React.useCallback(
    (days: number, type?: "deposit" | "withdrawal") =>
      Array.from({ length: days }, (_, i) => {
        const d = dayStr(days - 1 - i);
        return allTxns
          .filter(
            (t) =>
              txDay(t.created_at) === d &&
              t.status.toLowerCase() === "completed" &&
              (type ? t.transaction_type === type : true)
          )
          .reduce((s, t) => s + t.amount, 0);
      }),
    [allTxns]
  );

  // KPI stats
  const kpi = useMemo(() => {
    const done = allTxns.filter((t) => t.status.toLowerCase() === "completed");
    const totalIn = done.filter((t) => t.transaction_type === "deposit").reduce((s, t) => s + t.amount, 0);
    const totalOut = done.filter((t) => t.transaction_type === "withdrawal").reduce((s, t) => s + t.amount, 0);
    const totalFees = done.reduce((s, t) => s + (t.fee_amount ?? 0), 0);
    const thisMonth = done.filter((t) => isThisMonth(t.created_at));
    const monthIn = thisMonth.filter((t) => t.transaction_type === "deposit").reduce((s, t) => s + t.amount, 0);
    const monthOut = thisMonth.filter((t) => t.transaction_type === "withdrawal").reduce((s, t) => s + t.amount, 0);
    const pending = allTxns.filter((t) => t.status.toLowerCase() === "processing").length;
    const failed = allTxns.filter((t) => t.status.toLowerCase() === "failed").length;
    return { totalIn, totalOut, net: totalIn - totalOut, totalFees, monthIn, monthOut, pending, failed };
  }, [allTxns]);

  // Filtered records
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return newestFirst.filter((raw) => {
      const t = overrides[raw.id] ?? raw;
      if (typeFilter !== "all" && t.transaction_type !== typeFilter) return false;
      if (statusFilter !== "all" && t.status.toLowerCase() !== statusFilter) return false;
      if (dateFilter === "today" && !isToday(t.created_at)) return false;
      if (dateFilter === "yesterday" && !isYesterday(t.created_at)) return false;
      if (dateFilter === "week" && !isThisWeek(t.created_at)) return false;
      if (dateFilter === "month" && !isThisMonth(t.created_at)) return false;
      if (q) {
        const hay = [t.reference, t.recipient_phone, t.status, t.transaction_type, t.gateway_status]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [newestFirst, typeFilter, statusFilter, dateFilter, search, overrides]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const paginated = filtered.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  // Reset page when filters change
  useEffect(() => { setCurrentPage(1); }, [typeFilter, statusFilter, dateFilter, search, rowsPerPage]);

  const recheckOne = async (txn: WalletTransactionResponse) => {
    if (!branchId || txn.transaction_type !== "withdrawal" || checking[txn.id]) return;
    setChecking((p) => ({ ...p, [txn.id]: true }));
    try {
      const updated = await renultApi.wallets.checkWithdrawalStatus(branchId, txn.id);
      setOverrides((p) => ({ ...p, [txn.id]: updated }));
    } catch { /* ignore */ } finally {
      setChecking((p) => ({ ...p, [txn.id]: false }));
    }
  };

  useEffect(() => {
    if (autoCheckedRef.current || !branchId || allTxns.length === 0) return;
    const processing = allTxns.filter(
      (t) => t.transaction_type === "withdrawal" && t.status.toLowerCase() === "processing"
    );
    if (!processing.length) return;
    autoCheckedRef.current = true;
    processing.forEach((t) => recheckOne(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTxns.length, branchId]);

  const handleRefresh = () => { autoCheckedRef.current = false; refetch(); };

  const hasActiveFilters = typeFilter !== "all" || statusFilter !== "all" || dateFilter !== "all" || search !== "";
  const clearFilters = () => { setTypeFilter("all"); setStatusFilter("all"); setDateFilter("all"); setSearch(""); };

  const exportCsv = () => {
    const headers = ["Date", "Time", "Type", "Amount (UGX)", "Fee (UGX)", "Net (UGX)", "Balance After (UGX)", "Reference", "Recipient Phone", "Status", "Gateway Status", "Failure Reason"];
    const rows = filtered.map((raw) => {
      const t = overrides[raw.id] ?? raw;
      const { date, time } = fmtDate(t.created_at);
      return [date, time, t.transaction_type.toUpperCase(), t.amount, t.fee_amount ?? 0, t.net_amount ?? 0, raw.runningBalance, t.reference ?? "", t.recipient_phone ?? "", t.status, t.gateway_status ?? "", t.failure_reason ?? ""].join(",");
    });
    const blob = new Blob([[headers.join(","), ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ledger-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={cn("min-h-screen bg-background transition-all duration-300", sidebarCollapsed ? "md:pl-[72px]" : "md:pl-[280px]")}>
      <SEO title="Transaction Ledger" />
      <AppHeader />

      <main className="mx-auto px-4 sm:px-6 py-6">

        {/* ── Page header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 border-b border-border/40 pb-4">
          <div>
            <h1 className="text-base font-bold tracking-tight">Transaction Ledger</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Full money-in / money-out log for auditing
              {wallet ? ` · ${wallet.branch_name}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={exportCsv} disabled={filtered.length === 0}>
              <Download className="w-3.5 h-3.5" /> Export CSV
            </Button>
            <button
              onClick={handleRefresh}
              disabled={isFetching}
              className="bg-primary text-primary-foreground font-semibold text-xs sm:text-sm px-4 py-2 rounded shadow hover:bg-primary/95 flex items-center gap-2 transition-all"
            >
              <RefreshCcw className={cn("w-4 h-4", isFetching && "animate-spin")} />
              Refresh
            </button>
          </div>
        </div>

        <div className="space-y-4 sm:space-y-6">
          {/* ── KPI cards ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">

            {/* Total Deposited */}
            <Card className="rounded-lg bg-card border border-border/80 shadow-sm relative overflow-hidden group hover:shadow-md hover:scale-[1.01] transition-all flex flex-col min-h-[140px]">
              <CardHeader className="pb-1 pt-3 px-3 sm:px-4 sm:pt-4">
                <span className="text-[12px] sm:text-xs font-bold text-muted-foreground">Total Deposited</span>
                <CardTitle className="text-lg sm:text-2xl font-black mt-0.5 text-foreground leading-tight">
                  {fmtShort(kpi.totalIn)} <span className="text-xs font-semibold text-muted-foreground">UGX</span>
                </CardTitle>
              </CardHeader>
              <div className="px-3 sm:px-4 pb-1 mt-auto">
                <Sparkline data={dailySum(7, "deposit")} color="#10b981" height={36} />
              </div>
              <CardContent className="pb-3 pt-0 px-3 sm:px-4">
                <div className="text-[10px] sm:text-xs text-muted-foreground font-semibold flex items-center justify-between">
                  <span>Money in · {allTxns.filter((t) => t.transaction_type === "deposit").length} txns</span>
                  <div className="p-1 rounded bg-emerald-500/10 text-emerald-600">
                    <TrendingUp className="w-3.5 h-3.5" />
                  </div>
                </div>
              </CardContent>
              <div className="h-[2px] bg-emerald-500" />
            </Card>

            {/* Total Withdrawn */}
            <Card className="rounded-lg bg-card border border-border/80 shadow-sm relative overflow-hidden group hover:shadow-md hover:scale-[1.01] transition-all flex flex-col min-h-[140px]">
              <CardHeader className="pb-1 pt-3 px-3 sm:px-4 sm:pt-4">
                <span className="text-[12px] sm:text-xs font-bold text-muted-foreground">Total Withdrawn</span>
                <CardTitle className="text-lg sm:text-2xl font-black mt-0.5 text-foreground leading-tight">
                  {fmtShort(kpi.totalOut)} <span className="text-xs font-semibold text-muted-foreground">UGX</span>
                </CardTitle>
              </CardHeader>
              <div className="px-3 sm:px-4 pb-1 mt-auto">
                <Sparkline data={dailySum(7, "withdrawal")} color="#ef4444" height={36} />
              </div>
              <CardContent className="pb-3 pt-0 px-3 sm:px-4">
                <div className="text-[10px] sm:text-xs text-muted-foreground font-semibold flex items-center justify-between">
                  <span>Money out · {allTxns.filter((t) => t.transaction_type === "withdrawal").length} txns</span>
                  <div className="p-1 rounded bg-red-500/10 text-red-600">
                    <TrendingDown className="w-3.5 h-3.5" />
                  </div>
                </div>
              </CardContent>
              <div className="h-[2px] bg-red-500" />
            </Card>

            {/* Net Balance */}
            <Card className="rounded-lg bg-card border border-border/80 shadow-sm relative overflow-hidden group hover:shadow-md hover:scale-[1.01] transition-all flex flex-col min-h-[140px]">
              <CardHeader className="pb-1 pt-3 px-3 sm:px-4 sm:pt-4">
                <span className="text-[12px] sm:text-xs font-bold text-muted-foreground">Net Balance</span>
                <CardTitle className="text-lg sm:text-2xl font-black mt-0.5 text-foreground leading-tight">
                  {fmtShort(kpi.net)} <span className="text-xs font-semibold text-muted-foreground">UGX</span>
                </CardTitle>
              </CardHeader>
              <div className="px-3 sm:px-4 pb-1 mt-auto">
                <Sparkline data={dailySum(7)} color="#2563eb" height={36} />
              </div>
              <CardContent className="pb-3 pt-0 px-3 sm:px-4">
                <div className="text-[10px] sm:text-xs text-muted-foreground font-semibold flex items-center justify-between">
                  <span>{wallet ? `Live: UGX ${wallet.balance.toLocaleString()}` : "Deposited − Withdrawn"}</span>
                  <div className="p-1 rounded bg-blue-500/10 text-blue-600">
                    <Wallet className="w-3.5 h-3.5" />
                  </div>
                </div>
              </CardContent>
              <div className="h-[2px] bg-blue-500" />
            </Card>

            {/* This Month */}
            <Card className="rounded-lg bg-card border border-border/80 shadow-sm relative overflow-hidden group hover:shadow-md hover:scale-[1.01] transition-all flex flex-col min-h-[140px]">
              <CardHeader className="pb-1 pt-3 px-3 sm:px-4 sm:pt-4">
                <span className="text-[12px] sm:text-xs font-bold text-muted-foreground">This Month</span>
                <CardTitle className="text-lg sm:text-2xl font-black mt-0.5 text-foreground leading-tight">
                  {fmtShort(kpi.monthIn)} <span className="text-xs font-semibold text-muted-foreground">UGX</span>
                </CardTitle>
              </CardHeader>
              <div className="px-3 sm:px-4 pb-1 mt-auto">
                <Sparkline data={dailySum(30)} color="#f97316" height={36} />
              </div>
              <CardContent className="pb-3 pt-0 px-3 sm:px-4">
                <div className="text-[10px] sm:text-xs text-muted-foreground font-semibold flex items-center justify-between">
                  <span>Out: {fmtShort(kpi.monthOut)} · Fees: {fmtShort(kpi.totalFees)}</span>
                  <div className="p-1 rounded bg-orange-500/10 text-orange-500">
                    <CircleDollarSign className="w-3.5 h-3.5" />
                  </div>
                </div>
              </CardContent>
              <div className="h-[2px] bg-orange-500" />
            </Card>
          </div>

          {/* ── Filters card ── */}
          <Card className="border border-border/40 shadow-none rounded-md bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold tracking-tight text-foreground flex items-center justify-between">
                <p>Filters &amp; Search</p>
                {hasActiveFilters && (
                  <Button variant="destructive" size="sm" onClick={clearFilters} className="text-xs text-white hover:text-white h-8">
                    Clear Filters
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {/* Type */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground">Type</Label>
                  <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as TxType)}>
                    <SelectTrigger className="h-9 text-xs bg-background"><SelectValue placeholder="All Types" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="deposit">Deposits</SelectItem>
                      <SelectItem value="withdrawal">Withdrawals</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Status */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground">Status</Label>
                  <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as TxStatus)}>
                    <SelectTrigger className="h-9 text-xs bg-background"><SelectValue placeholder="All Statuses" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="processing">Processing</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Date range */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground">Date Filter</Label>
                  <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as DateFilter)}>
                    <SelectTrigger className="h-9 text-xs bg-background"><SelectValue placeholder="All Time" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Time</SelectItem>
                      <SelectItem value="today">Today</SelectItem>
                      <SelectItem value="yesterday">Yesterday</SelectItem>
                      <SelectItem value="week">This Week</SelectItem>
                      <SelectItem value="month">This Month</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Rows per page */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground">Show Rows</Label>
                  <Select value={String(rowsPerPage)} onValueChange={(v) => setRowsPerPage(Number(v))}>
                    <SelectTrigger className="h-9 text-xs bg-background"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">5 rows</SelectItem>
                      <SelectItem value="10">10 rows</SelectItem>
                      <SelectItem value="20">20 rows</SelectItem>
                      <SelectItem value="50">50 rows</SelectItem>
                      <SelectItem value="100">100 rows</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Search */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground">Search</Label>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Reference, phone…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-9 h-9 text-xs bg-background border-input"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── Transaction table ── */}
          <Card className="border border-border/0 shadow-sm rounded-none">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold tracking-tight text-foreground">Transaction Records</CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Click any row to expand the full detail log. Deposits are money in · Withdrawals are money out.
                </CardDescription>
              </div>
              <span className="text-xs text-muted-foreground shrink-0">{filtered.length} record{filtered.length !== 1 ? "s" : ""}</span>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto -mx-4 sm:mx-0 border border-border/10 rounded">
                {isLoading ? (
                  <div className="flex items-center justify-center py-24 gap-2 text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-sm">Loading transactions…</span>
                  </div>
                ) : !branchId ? (
                  <div className="py-24 text-center text-sm text-muted-foreground">Select a workspace to view transactions.</div>
                ) : (
                  <Table className="min-w-[800px]">
                    <TableHeader className="bg-muted/30">
                      <TableRow>
                        <TableHead className="w-[40px] font-bold text-xs uppercase text-foreground">#</TableHead>
                        <TableHead className="font-bold text-xs uppercase text-foreground min-w-[120px]">Date / Time</TableHead>
                        <TableHead className="font-bold text-xs uppercase text-foreground w-[110px]">Type</TableHead>
                        <TableHead className="font-bold text-xs uppercase text-foreground">Reference / Recipient</TableHead>
                        <TableHead className="font-bold text-xs uppercase text-foreground text-right">Amount</TableHead>
                        <TableHead className="font-bold text-xs uppercase text-foreground text-right">Fee</TableHead>
                        <TableHead className="font-bold text-xs uppercase text-foreground text-right">Net</TableHead>
                        <TableHead className="font-bold text-xs uppercase text-foreground text-right">Balance After</TableHead>
                        <TableHead className="font-bold text-xs uppercase text-foreground text-center">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginated.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="h-44 text-center">
                            <div className="flex flex-col items-center justify-center text-muted-foreground">
                              <Wallet className="w-10 h-10 mb-2 stroke-[1.5] text-muted-foreground/40" />
                              <span className="text-sm font-semibold">No transactions found</span>
                              <span className="text-xs mt-0.5">Try adjusting your filters.</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        paginated.map((raw, idx) => {
                          const t = overrides[raw.id] ?? raw;
                          const isDeposit = t.transaction_type === "deposit";
                          const isProcessing = t.status.toLowerCase() === "processing";
                          const isChecking = !!checking[raw.id];
                          const isExpanded = expandedId === raw.id;
                          const serial = (currentPage - 1) * rowsPerPage + idx + 1;
                          const { date, time } = fmtDate(t.created_at);

                          return (
                            <React.Fragment key={raw.id}>
                              <TableRow
                                className={cn(
                                  "hover:bg-muted/40 transition-colors cursor-pointer",
                                  t.status.toLowerCase() === "failed" && "opacity-60",
                                  isExpanded && "bg-muted/20"
                                )}
                                onClick={() => setExpandedId(isExpanded ? null : raw.id)}
                              >
                                {/* Serial */}
                                <TableCell className="font-mono text-xs font-semibold text-muted-foreground">{serial}</TableCell>

                                {/* Date */}
                                <TableCell className="text-xs whitespace-nowrap">
                                  <span className="font-medium text-foreground">{date}</span>
                                  <br />
                                  <span className="text-[10px] text-muted-foreground font-mono">{time}</span>
                                </TableCell>

                                {/* Type */}
                                <TableCell>
                                  <div className="flex items-center gap-1.5">
                                    {isDeposit
                                      ? <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                      : <ArrowUpRight className="w-3.5 h-3.5 text-red-500 shrink-0" />
                                    }
                                    <span className={cn("text-[11px] font-semibold uppercase tracking-wide", isDeposit ? "text-emerald-700" : "text-red-600")}>
                                      {t.transaction_type}
                                    </span>
                                  </div>
                                </TableCell>

                                {/* Reference / Recipient */}
                                <TableCell className="text-xs">
                                  {t.recipient_phone ? (
                                    <div>
                                      <p className="font-medium text-foreground">{t.recipient_phone}</p>
                                      {t.reference && <p className="text-[10px] text-muted-foreground font-mono">{t.reference}</p>}
                                    </div>
                                  ) : t.reference ? (
                                    <p className="font-mono text-muted-foreground">{t.reference}</p>
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </TableCell>

                                {/* Amount */}
                                <TableCell className="text-xs text-right font-mono">
                                  <span className={cn("font-bold", isDeposit ? "text-emerald-700" : "text-red-600")}>
                                    {isDeposit ? "+" : "−"}{t.amount.toLocaleString()}
                                  </span>
                                </TableCell>

                                {/* Fee */}
                                <TableCell className="text-xs text-right font-mono text-muted-foreground">
                                  {(t.fee_amount ?? 0) > 0 ? t.fee_amount.toLocaleString() : "—"}
                                </TableCell>

                                {/* Net */}
                                <TableCell className="text-xs text-right font-mono font-semibold">
                                  {(t.net_amount ?? 0) > 0 ? t.net_amount.toLocaleString() : <span className="text-muted-foreground">—</span>}
                                </TableCell>

                                {/* Running balance */}
                                <TableCell className="text-xs text-right font-mono">
                                  <span className={cn("font-bold", raw.runningBalance < 0 ? "text-red-600" : "text-foreground")}>
                                    {raw.runningBalance.toLocaleString()}
                                  </span>
                                </TableCell>

                                {/* Status + expand */}
                                <TableCell className="text-center">
                                  <div className="flex items-center justify-center gap-1">
                                    {isChecking
                                      ? <Loader2 className="w-3 h-3 animate-spin text-amber-500" />
                                      : <StatusBadge status={t.status} />
                                    }
                                    {isProcessing && !isChecking && t.transaction_type === "withdrawal" && (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); recheckOne(raw); }}
                                        className="text-muted-foreground hover:text-foreground transition-colors"
                                        title="Re-check with gateway"
                                      >
                                        <RotateCcw className="w-3 h-3" />
                                      </button>
                                    )}
                                    {isExpanded
                                      ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground ml-1" />
                                      : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground ml-1" />
                                    }
                                  </div>
                                </TableCell>
                              </TableRow>

                              {/* Expanded detail log */}
                              {isExpanded && <TxDetailRow txn={{ ...t, runningBalance: raw.runningBalance }} />}
                            </React.Fragment>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                )}
              </div>

              {/* ── Pagination ── */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4">
                  <span className="text-xs text-muted-foreground">
                    Page {currentPage} of {totalPages} ({filtered.length} records)
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline" size="icon"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="w-8 h-8 rounded"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                      const p = totalPages <= 7 ? i + 1 : currentPage <= 4 ? i + 1 : currentPage + i - 3;
                      if (p < 1 || p > totalPages) return null;
                      return (
                        <Button
                          key={p}
                          variant={currentPage === p ? "default" : "outline"}
                          size="icon"
                          onClick={() => setCurrentPage(p)}
                          className={cn("w-8 h-8 rounded text-xs font-bold", currentPage === p ? "bg-primary" : "")}
                        >
                          {p}
                        </Button>
                      );
                    })}
                    <Button
                      variant="outline" size="icon"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
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
      </main>
    </div>
  );
}

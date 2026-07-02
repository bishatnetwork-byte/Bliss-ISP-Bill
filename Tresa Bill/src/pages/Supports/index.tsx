import AppHeader from "@/components/Header/AppHeader";
import SEO from "@/components/SEO";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePhoneVerifed } from "@/hooks/usePhoneVerifed";
import { useBranchActiveUsers, useBranchRouterStatus, useBranchVouchers, useRouters, useVoucherSupportSummary } from "@/hooks/useRouters";
import { cn } from "@/lib/utils";
import { isVoucherRevenueSale, voucherSalesStatus } from "@/lib/voucherSales";
import { voucherUiStatus } from "@/lib/voucherStatus";
import { ChevronLeft, ChevronRight, Loader2, Search, Ticket, TrendingUp, Wifi } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type SupportVoucherStatus = "Online" | "Offline" | "Expired" | "Unactivated" | "Sync Issue";

function registryStatus(status: string): SupportVoucherStatus {
  if (status === "ONLINE") return "Online";
  if (status === "OFFLINE" || status === "ACTIVE") return "Offline";
  return voucherUiStatus(status) as Exclude<SupportVoucherStatus, "Online" | "Offline">;
}

function formatUGX(amount: number) {
  return `UGX ${Math.round(amount || 0).toLocaleString()}`;
}

function normalizeUgandanPhone(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (/^2567\d{8}$/.test(digits)) return `+${digits}`;
  if (/^07\d{8}$/.test(digits)) return `+256${digits.slice(1)}`;
  if (/^7\d{8}$/.test(digits)) return `+256${digits}`;
  return null;
}

function VerifiedPhoneCell({ phone }: { phone: string }) {
  const normalizedPhone = normalizeUgandanPhone(phone);
  const verification = usePhoneVerifed(normalizedPhone);
  const identityName = verification.data?.success ? verification.data.identityname.trim() : "";

  return (
    <TableCell className="text-xs">
      <div className="font-mono">{phone}</div>
      {verification.isFetching && (
        <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Verifying...
        </div>
      )}
      {identityName && (
        <div className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
          <span className="break-words font-bold">{identityName}</span>
        </div>
      )}
    </TableCell>
  );
}

export default function SupportsIndex() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("sidebar-collapsed") === "true");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState("All");
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [branchId, setBranchId] = useState(() => localStorage.getItem("selected-workspace") || "");
  const { data, isLoading, isFetching } = useBranchVouchers(branchId, {
    limit: pageSize,
    offset: (page - 1) * pageSize,
    search: debouncedSearch || undefined,
    status_filter: status,
  });
  const { data: statsData } = useBranchVouchers(branchId, { limit: 5000 });
  const { data: summary } = useVoucherSupportSummary(branchId);
  const { data: routersData, isLoading: isRoutersLoading } = useRouters(branchId);
  // useRouters returns an array of routers; ensure we have an array to pass to hooks
  const routers = routersData || [];
  const activeUsersQueries = useBranchActiveUsers(routers);
  const routerStatusQueries = useBranchRouterStatus(routers);

  useEffect(() => {
    const handler = (event: Event) => setSidebarCollapsed((event as CustomEvent<{ collapsed: boolean }>).detail.collapsed);
    window.addEventListener("sidebar-collapse-change", handler);
    return () => window.removeEventListener("sidebar-collapse-change", handler);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => setPage(1), [status]);

  useEffect(() => {
    const handler = (event: Event) => setBranchId((event as CustomEvent<{ id: string }>).detail.id);
    window.addEventListener("renult-branch-change", handler);
    return () => window.removeEventListener("renult-branch-change", handler);
  }, []);

  const vouchers = useMemo(() => (data?.vouchers || []).map((voucher) => ({
    code: voucher.voucher_code,
    phone: voucher.phone_number === "BULK" ? "Bulk batch" : voucher.phone_number,
    packageName: `${voucher.speed_type} ${voucher.profile}`,
    amount: voucher.amount,
    createdAt: voucher.created_at,
    status: registryStatus(voucher.status),
    reference: voucher.payment_reference || "N/A",
  })), [data]);

  const total = data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const statsVouchers = statsData?.vouchers || data?.vouchers || [];
  const totalVoucherCount = summary?.total_vouchers ?? statsData?.total ?? total;
  const expiredVoucherCount = statsVouchers.filter((voucher) => voucherSalesStatus(voucher) === "Expired").length;
  const remainingVoucherCount = Math.max(totalVoucherCount - expiredVoucherCount, 0);
  const expectedRevenue = statsVouchers.reduce((sum, voucher) => sum + Number(voucher.amount || 0), 0);
  const accumulatedRevenue = statsVouchers
    .filter(isVoucherRevenueSale)
    .reduce((sum, voucher) => sum + Number(voucher.amount || 0), 0);
  const paidRevenue = summary?.total_amount ?? accumulatedRevenue;
  const activeSessionCount = activeUsersQueries.reduce((sum, query) => sum + (query.data?.count ?? 0), 0);
  const leaseCount = routerStatusQueries.reduce((sum, query) => {
    const leases = query.data?.dhcp_leases || [];
    return sum + leases.filter((lease) => !lease.status || String(lease.status).toLowerCase() === "bound").length;
  }, 0);
  const isSessionsLoading = isRoutersLoading
    || activeUsersQueries.some((query) => query.isLoading)
    || routerStatusQueries.some((query) => query.isLoading);

  const statusClass = (value: SupportVoucherStatus) => {
    if (value === "Online") return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
    if (value === "Offline") return "bg-blue-500/10 text-blue-600 border-blue-500/20";
    if (value === "Expired") return "bg-slate-500/10 text-slate-500 border-slate-500/20";
    if (value === "Sync Issue") return "bg-orange-500/10 text-orange-500 border-orange-500/20";
    return "bg-amber-500/10 text-amber-500 border-amber-500/20";
  };

  return (
    <div className={cn("min-h-screen bg-background transition-all duration-300", sidebarCollapsed ? "md:pl-[72px]" : "md:pl-[280px]")}>
      <SEO title="Voucher Help Desk" />
      <AppHeader />
      <main className="max-w-8xl mx-auto px-4 sm:px-6 py-4 space-y-5">
        <div>
          <h1 className="text-xl font-bold">Voucher Help Desk</h1>
          <p className="text-sm text-muted-foreground mt-1">Find purchased vouchers by code, phone number, or payment reference.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="border border-primary/30 rounded shadow-none">
            <CardContent className="p-4 flex justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-bold text-muted-foreground">Remaining vouchers</p>
                <p className="text-2xl font-black mt-1">{remainingVoucherCount.toLocaleString()}</p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                  <div className="rounded border border-border/70 bg-muted/20 px-2 py-1.5">
                    <p className="text-muted-foreground">Total vouchers</p>
                    <p className="font-black text-foreground">{totalVoucherCount.toLocaleString()}</p>
                  </div>
                  <div className="rounded border border-border/70 bg-muted/20 px-2 py-1.5">
                    <p className="text-muted-foreground">Expired</p>
                    <p className="font-black text-foreground">{expiredVoucherCount.toLocaleString()}</p>
                  </div>
                </div>
              </div>
              <Ticket className="w-8 h-8 shrink-0 text-primary/40" />
            </CardContent>
          </Card>
          <Card className="border border-primary/30 rounded shadow-none">
            <CardContent className="p-4 flex justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-bold text-muted-foreground">Accumulated revenue</p>
                <p className="text-2xl font-black mt-1">{formatUGX(accumulatedRevenue)}</p>
                <div className="mt-3 space-y-1.5 text-[11px]">
                  <div className="flex items-center justify-between gap-3 rounded border border-border/70 bg-muted/20 px-2 py-1.5">
                    <span className="text-muted-foreground">Revenue paid</span>
                    <span className="font-black text-foreground">{formatUGX(paidRevenue)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded border border-border/70 bg-muted/20 px-2 py-1.5">
                    <span className="text-muted-foreground">Expected revenue</span>
                    <span className="font-black text-foreground">{formatUGX(expectedRevenue)}</span>
                  </div>
                </div>
              </div>
              <TrendingUp className="w-8 h-8 shrink-0 text-emerald-500/40" />
            </CardContent>
          </Card>
          <Card className="border border-primary/30 rounded shadow-none">
            <CardContent className="p-4 flex justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-bold text-muted-foreground">Active vouchers</p>
                <p className="text-2xl font-black mt-1">{(summary?.active_vouchers ?? 0).toLocaleString()}</p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                  <div className="rounded border border-border/70 bg-muted/20 px-2 py-1.5">
                    <p className="text-muted-foreground">Sessions available</p>
                    <p className="font-black text-foreground">{isSessionsLoading ? "..." : activeSessionCount.toLocaleString()}</p>
                  </div>
                  <div className="rounded border border-border/70 bg-muted/20 px-2 py-1.5">
                    <p className="text-muted-foreground">Leases</p>
                    <p className="font-black text-foreground">{isSessionsLoading ? "..." : leaseCount.toLocaleString()}</p>
                  </div>
                </div>
              </div>
              <Wifi className="w-8 h-8 shrink-0 text-blue-500/40" />
            </CardContent>
          </Card>
        </div>

        <Card className="border border-primary/5 rounded shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Voucher Registry</CardTitle>
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search code, phone, or reference..." className="pl-9" />
              </div>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All statuses</SelectItem>
                  <SelectItem value="Online">Online</SelectItem>
                  <SelectItem value="Offline">Offline</SelectItem>
                  <SelectItem value="Unactivated">Unactivated</SelectItem>
                  <SelectItem value="Expired">Expired</SelectItem>
                  <SelectItem value="Sync Issue">Sync Issue</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Voucher</TableHead><TableHead>Phone</TableHead><TableHead>Package</TableHead><TableHead>Amount</TableHead><TableHead>Reference</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead></TableRow></TableHeader>
                <TableBody>
                  {vouchers.map((voucher) => (
                    <TableRow key={voucher.code}>
                      <TableCell className="font-mono text-xs font-bold text-primary">{voucher.code}</TableCell>
                      <VerifiedPhoneCell phone={voucher.phone} />
                      <TableCell className="text-xs">{voucher.packageName}</TableCell>
                      <TableCell className="text-xs font-bold">UGX {voucher.amount.toLocaleString()}</TableCell>
                      <TableCell className="font-mono text-[11px]">{voucher.reference}</TableCell>
                      <TableCell><Badge className={cn("border-none text-[10px]", statusClass(voucher.status))}>{voucher.status}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(voucher.createdAt).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                  {!isLoading && vouchers.length === 0 && <TableRow><TableCell colSpan={7} className="h-32 text-center text-sm text-muted-foreground">No vouchers match this search.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center justify-between border-t px-4 py-3">
              <p className="text-xs text-muted-foreground">
                {isFetching ? "Searching database..." : `Page ${page} of ${totalPages} • ${total.toLocaleString()} results`}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1 || isFetching} onClick={() => setPage((value) => value - 1)}>
                  <ChevronLeft className="w-4 h-4 mr-1" /> Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages || isFetching} onClick={() => setPage((value) => value + 1)}>
                  Next <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

import AppHeader from "@/components/Header/AppHeader";
import SEO from "@/components/SEO";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useBranchVouchers, useVoucherSupportSummary } from "@/hooks/useRouters";
import { voucherUiStatus } from "@/lib/voucherStatus";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Search, Ticket, TrendingUp, Wifi } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

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
  const { data: summary } = useVoucherSupportSummary(branchId);

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
    status: voucherUiStatus(voucher.status),
    reference: voucher.payment_reference || "N/A",
  })), [data]);

  const total = data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const statusClass = (value: string) => {
    if (value === "Active") return "bg-emerald-500/10 text-emerald-600";
    if (value === "Expired") return "bg-slate-500/10 text-slate-600";
    if (value === "Sync Issue") return "bg-orange-500/10 text-orange-600";
    return "bg-amber-500/10 text-amber-600";
  };

  return (
    <div className={cn("min-h-screen bg-background transition-all duration-300", sidebarCollapsed ? "md:pl-[72px]" : "md:pl-[280px]")}>
      <SEO title="Voucher Support" />
      <AppHeader />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-4 space-y-5">
        <div>
          {/* <h1 className="text-xl font-bold">Voucher Support</h1> */}
          {/* <p className="text-sm text-muted-foreground mt-1">Find purchased vouchers by code, phone number, or payment reference.</p> */}
        </div> 

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="border border-primary/30 rounded shadow-none"><CardContent className="p-4 flex justify-between"><div><p className="text-[12px]  font-bold text-muted-foreground">Total vouchers</p><p className="text-2xl font-black mt-1">{summary?.total_vouchers ?? vouchers.length}</p></div><Ticket className="w-8 h-8 text-primary/40" /></CardContent></Card>
          <Card className="border border-primary/30 rounded shadow-none"><CardContent className="p-4 flex justify-between"><div><p className="text-[12px]  font-bold text-muted-foreground">Revenue</p><p className="text-2xl font-black mt-1">UGX {(summary?.total_amount ?? 0).toLocaleString()}</p></div><TrendingUp className="w-8 h-8 text-emerald-500/40" /></CardContent></Card>
          <Card className="border border-primary/30 rounded shadow-none"><CardContent className="p-4 flex justify-between"><div><p className="text-[12px]  font-bold text-muted-foreground">Active vouchers</p><p className="text-2xl font-black mt-1">{summary?.active_vouchers ?? 0}</p></div><Wifi className="w-8 h-8 text-blue-500/40" /></CardContent></Card>
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
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Unactivated">Unactivated</SelectItem>
                  <SelectItem value="Expired">Expired</SelectItem>
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
                      <TableCell className="text-xs">{voucher.phone}</TableCell>
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

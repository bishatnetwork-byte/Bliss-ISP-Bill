import { renultApi, RouterResponse, VoucherBatchItemResponse } from "@/api/foreform";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDeleteRouterVoucher, useDeleteRouterVoucherBatch } from "@/hooks/useRouters";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Boxes, CalendarClock, RefreshCw, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import SettingsLayout from "./SettingsLayout";

type TrashMode = "vouchers" | "batches";
type BatchScope = "expired" | "all";

interface VoucherRow {
  voucher: VoucherBatchItemResponse;
  router?: RouterResponse;
}

interface BatchRow {
  id: string;
  routerName: string;
  router?: RouterResponse;
  profile: string;
  vouchers: VoucherBatchItemResponse[];
  expiredVouchers: VoucherBatchItemResponse[];
  activeVouchers: VoucherBatchItemResponse[];
  totalAmount: number;
  createdAt: string;
  expiresAt: string | null;
}

const CACHE_TIME = 10 * 60 * 1000;
const STALE_TIME = 2 * 60 * 1000;

function normalize(value: unknown) {
  return String(value || "").trim().toUpperCase();
}

function isExpiredVoucher(voucher: VoucherBatchItemResponse) {
  if (normalize(voucher.status) === "EXPIRED") return true;
  if (!voucher.expires_at) return false;
  return new Date(voucher.expires_at).getTime() <= Date.now();
}

function formatDate(value?: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMoney(value: number) {
  return `UGX ${Number(value || 0).toLocaleString()}`;
}

function batchId(voucher: VoucherBatchItemResponse) {
  const ref = voucher.payment_reference || "";
  return ref.startsWith("BAT-") ? ref : "";
}

function findRouter(routers: RouterResponse[], routerName: string) {
  return routers.find((router) => normalize(router.name) === normalize(routerName));
}

function TrashSkeleton({ mode }: { mode: TrashMode }) {
  return (
    <div className="space-y-3">
      {[0, 1, 2, 3, 4, 5].map((row) => (
        <div key={row} className="grid grid-cols-12 gap-4 border-b border-border/50 px-4 py-4">
          <Skeleton className="col-span-2 h-4" />
          <Skeleton className="col-span-2 h-4" />
          <Skeleton className="col-span-2 h-4" />
          <Skeleton className="col-span-2 h-4" />
          <Skeleton className="col-span-2 h-4" />
          <Skeleton className={cn("h-8 rounded", mode === "batches" ? "col-span-2" : "col-span-1")} />
        </div>
      ))}
    </div>
  );
}

export default function TrashBucket() {
  const queryClient = useQueryClient();
  const [branchId, setBranchId] = useState(() => localStorage.getItem("selected-workspace") || "");
  const [mode, setMode] = useState<TrashMode>("vouchers");
  const [batchScope, setBatchScope] = useState<BatchScope>("expired");
  const [search, setSearch] = useState("");
  const [routerFilter, setRouterFilter] = useState("all");

  useEffect(() => {
    const handler = (event: Event) => setBranchId((event as CustomEvent<{ id: string }>).detail.id);
    window.addEventListener("renult-branch-change", handler);
    return () => window.removeEventListener("renult-branch-change", handler);
  }, []);

  const routersQuery = useQuery({
    queryKey: ["routers", branchId, { trash: true }],
    queryFn: () => renultApi.routers.list(branchId),
    enabled: !!branchId,
    staleTime: STALE_TIME,
    gcTime: CACHE_TIME,
    retry: 1,
  });

  const vouchersQuery = useQuery({
    queryKey: ["trashVouchers", branchId],
    queryFn: () => renultApi.packages.branchVouchers(branchId, { limit: 3000 }),
    enabled: !!branchId,
    staleTime: STALE_TIME,
    gcTime: CACHE_TIME,
    retry: 1,
  });

  const deleteVoucherMutation = useDeleteRouterVoucher(branchId);
  const deleteBatchMutation = useDeleteRouterVoucherBatch(branchId);
  const syncExpiredMutation = useMutation({
    mutationFn: async () => {
      const routers = routersQuery.data || [];
      const results = await Promise.allSettled(
        routers.map((router) => renultApi.packages.checkExpiredVouchers(router.id)),
      );
      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trashVouchers", branchId] });
      queryClient.invalidateQueries({ queryKey: ["branchVouchers", branchId] });
    },
  });

  const routers = routersQuery.data || [];
  const vouchers = vouchersQuery.data?.vouchers || [];
  const isLoading = routersQuery.isLoading || vouchersQuery.isLoading;
  const isRefreshing = routersQuery.isFetching || vouchersQuery.isFetching || syncExpiredMutation.isPending;

  const expiredRows = useMemo<VoucherRow[]>(() => {
    return vouchers
      .filter(isExpiredVoucher)
      .map((voucher) => ({ voucher, router: findRouter(routers, voucher.router_name) }))
      .sort((a, b) => new Date(b.voucher.expires_at || b.voucher.created_at).getTime() - new Date(a.voucher.expires_at || a.voucher.created_at).getTime());
  }, [routers, vouchers]);

  const batchRows = useMemo<BatchRow[]>(() => {
    const groups = new Map<string, VoucherBatchItemResponse[]>();
    vouchers.forEach((voucher) => {
      const id = batchId(voucher);
      if (!id) return;
      const key = `${normalize(voucher.router_name)}::${id}`;
      groups.set(key, [...(groups.get(key) || []), voucher]);
    });

    return Array.from(groups.values())
      .map((items) => {
        const expired = items.filter(isExpiredVoucher);
        const active = items.filter((item) => !isExpiredVoucher(item));
        const newest = [...items].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
        const latestExpiry = [...expired].sort((a, b) => new Date(b.expires_at || b.created_at).getTime() - new Date(a.expires_at || a.created_at).getTime())[0];
        return {
          id: batchId(newest),
          routerName: newest.router_name,
          router: findRouter(routers, newest.router_name),
          profile: `${newest.speed_type} ${newest.profile}`.trim(),
          vouchers: items,
          expiredVouchers: expired,
          activeVouchers: active,
          totalAmount: items.reduce((sum, item) => sum + Number(item.amount || 0), 0),
          createdAt: newest.created_at,
          expiresAt: latestExpiry?.expires_at || null,
        };
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b!.expiresAt || b!.createdAt).getTime() - new Date(a!.expiresAt || a!.createdAt).getTime()) as BatchRow[];
  }, [routers, vouchers]);

  const filteredExpiredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return expiredRows.filter(({ voucher }) => {
      const matchesRouter = routerFilter === "all" || normalize(voucher.router_name) === normalize(routerFilter);
      const matchesSearch = !q
        || voucher.voucher_code.toLowerCase().includes(q)
        || String(voucher.phone_number || "").toLowerCase().includes(q)
        || String(voucher.payment_reference || "").toLowerCase().includes(q)
        || `${voucher.speed_type} ${voucher.profile}`.toLowerCase().includes(q);
      return matchesRouter && matchesSearch;
    });
  }, [expiredRows, routerFilter, search]);

  const filteredBatchRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return batchRows.filter((batch) => {
      const matchesScope = batchScope === "all" || batch.expiredVouchers.length > 0;
      const matchesRouter = routerFilter === "all" || normalize(batch.routerName) === normalize(routerFilter);
      const matchesSearch = !q
        || batch.id.toLowerCase().includes(q)
        || batch.profile.toLowerCase().includes(q)
        || batch.routerName.toLowerCase().includes(q);
      return matchesScope && matchesRouter && matchesSearch;
    });
  }, [batchRows, batchScope, routerFilter, search]);

  const routerNames = useMemo(() => Array.from(new Set(vouchers.map((voucher) => voucher.router_name).filter(Boolean))).sort(), [vouchers]);
  const expiredTotal = expiredRows.length;
  const expiredBatchTotal = batchRows.filter((batch) => batch.expiredVouchers.length > 0).length;
  const activeBatchTotal = batchRows.filter((batch) => batch.activeVouchers.length > 0).length;

  const refreshTrash = () => {
    toast.promise(syncExpiredMutation.mutateAsync(), {
      loading: "Checking routers for expired vouchers...",
      success: "Trash cache refreshed.",
      error: "Could not refresh expired vouchers.",
    });
  };

  const deleteVoucher = async ({ voucher, router }: VoucherRow) => {
    if (!router) {
      toast.error(`Router ${voucher.router_name} was not found.`);
      return;
    }
    if (!window.confirm(`Delete expired voucher ${voucher.voucher_code}? This cannot be undone.`)) return;
    try {
      await deleteVoucherMutation.mutateAsync({ routerId: router.id, voucherCode: voucher.voucher_code });
      queryClient.invalidateQueries({ queryKey: ["trashVouchers", branchId] });
      toast.success(`Deleted ${voucher.voucher_code}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete voucher.");
    }
  };

  const deleteBatch = async (batch: BatchRow) => {
    if (!batch.router) {
      toast.error(`Router ${batch.routerName} was not found.`);
      return;
    }
    const activeCount = batch.activeVouchers.length;
    const warning = activeCount > 0
      ? `Delete ACTIVE batch ${batch.id}? This removes ${batch.vouchers.length} vouchers from MikroTik and the database, including ${activeCount} active/unexpired voucher(s).`
      : `Delete expired batch ${batch.id} with ${batch.vouchers.length} voucher(s) from MikroTik and the database?`;
    if (!window.confirm(`${warning}\n\nThis cannot be undone.`)) return;
    try {
      await deleteBatchMutation.mutateAsync({ routerId: batch.router.id, batchId: batch.id });
      queryClient.invalidateQueries({ queryKey: ["trashVouchers", branchId] });
      toast.success(`Batch delete command sent for ${batch.id}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete batch.");
    }
  };

  return (
    <SettingsLayout title="Trash Bucket">
      <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-8">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded bg-destructive/10 text-destructive">
                <Trash2 className="h-4 w-4" />
              </span>
              <div>
                <h1 className="text-xl font-bold">Trash Bucket</h1>
                <p className="mt-0.5 text-xs text-muted-foreground">Delete expired vouchers or full voucher batches from MikroTik and the database.</p>
              </div>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-[180px_minmax(220px,320px)_auto] sm:items-center">
            <Select value={routerFilter} onValueChange={setRouterFilter}>
              <SelectTrigger className="h-9 rounded text-xs">
                <SelectValue placeholder="All routers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All routers</SelectItem>
                {routerNames.map((routerName) => (
                  <SelectItem key={routerName} value={routerName}>{routerName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={mode === "batches" ? "Search batch or router..." : "Search voucher, phone, or batch..."}
                className="h-9 rounded pl-9 text-xs"
              />
            </div>
            <Button variant="outline" size="sm" onClick={refreshTrash} disabled={isRefreshing || routers.length === 0} className="h-9 gap-2 rounded text-xs">
              <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <Card className="rounded border-border/60">
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-xs text-muted-foreground">Expired vouchers</p>
                <p className="mt-1 text-2xl font-bold">{expiredTotal.toLocaleString()}</p>
              </div>
              <CalendarClock className="h-5 w-5 text-amber-500" />
            </CardContent>
          </Card>
          <Card className="rounded border-border/60">
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-xs text-muted-foreground">Expired bundles</p>
                <p className="mt-1 text-2xl font-bold">{expiredBatchTotal.toLocaleString()}</p>
              </div>
              <Boxes className="h-5 w-5 text-primary" />
            </CardContent>
          </Card>
          <Card className="rounded border-border/60">
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-xs text-muted-foreground">Active bundles</p>
                <p className="mt-1 text-2xl font-bold">{activeBatchTotal.toLocaleString()}</p>
              </div>
              <Archive className="h-5 w-5 text-emerald-500" />
            </CardContent>
          </Card>
        </div>

        <Card className="overflow-hidden rounded border-border/60">
          <CardHeader className="flex flex-col gap-3 border-b border-border/60 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">
                {mode === "batches" ? (batchScope === "all" ? "All Batch Bundles" : "Expired Batch Bundles") : "Expired Vouchers"}
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {mode === "batches"
                  ? `${filteredBatchRows.length} batch bundle${filteredBatchRows.length === 1 ? "" : "s"} match the current filters. Batch delete is sent as one server-side batch request.`
                  : `${filteredExpiredRows.length} expired voucher${filteredExpiredRows.length === 1 ? "" : "s"} match the current filters.`}
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              {mode === "batches" && (
                <div className="flex items-center gap-3">
                  <Label htmlFor="batch-scope" className="text-xs text-muted-foreground">Include active bundles</Label>
                  <Switch id="batch-scope" checked={batchScope === "all"} onCheckedChange={(checked) => setBatchScope(checked ? "all" : "expired")} />
                </div>
              )}
              <div className="flex items-center gap-3">
                <Label htmlFor="batch-mode" className="text-xs text-muted-foreground">View batch bundles</Label>
                <Switch id="batch-mode" checked={mode === "batches"} onCheckedChange={(checked) => setMode(checked ? "batches" : "vouchers")} />
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {isLoading ? (
              <TrashSkeleton mode={mode} />
            ) : mode === "batches" ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="min-w-[170px] text-xs">Batch ID</TableHead>
                      <TableHead className="min-w-[140px] text-xs">Router</TableHead>
                      <TableHead className="min-w-[120px] text-xs">Profile</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs">Amount</TableHead>
                      <TableHead className="min-w-[150px] text-xs">Latest Expiry</TableHead>
                      <TableHead className="w-[150px] text-right text-xs">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredBatchRows.map((batch) => (
                      <TableRow key={`${batch.routerName}-${batch.id}`}>
                        <TableCell className="font-mono text-xs font-semibold text-primary">{batch.id}</TableCell>
                        <TableCell className="text-xs">{batch.routerName}</TableCell>
                        <TableCell className="text-xs">{batch.profile}</TableCell>
                        <TableCell className="text-xs">
                          <div className="flex flex-wrap gap-1.5">
                            <Badge className="rounded border-none bg-amber-500/10 text-amber-600">
                              {batch.expiredVouchers.length} expired
                            </Badge>
                            <Badge className={cn("rounded border-none", batch.activeVouchers.length > 0 ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground")}>
                              {batch.activeVouchers.length} active
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs font-semibold">{formatMoney(batch.totalAmount)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatDate(batch.expiresAt)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={deleteBatchMutation.isPending}
                            onClick={() => deleteBatch(batch)}
                            className="h-8 gap-2 rounded text-xs"
                            title="Delete this full batch from MikroTik and database"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredBatchRows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="h-36 text-center text-sm text-muted-foreground">
                          {batchScope === "all" ? "No batch bundles found." : "No expired batch bundles found."}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="min-w-[130px] text-xs">Voucher</TableHead>
                      <TableHead className="min-w-[140px] text-xs">Router</TableHead>
                      <TableHead className="min-w-[120px] text-xs">Profile</TableHead>
                      <TableHead className="text-xs">Amount</TableHead>
                      <TableHead className="min-w-[150px] text-xs">Expired At</TableHead>
                      <TableHead className="min-w-[150px] text-xs">Batch</TableHead>
                      <TableHead className="w-[130px] text-right text-xs">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredExpiredRows.map((row) => (
                      <TableRow key={row.voucher.id}>
                        <TableCell className="font-mono text-xs font-semibold text-primary">{row.voucher.voucher_code}</TableCell>
                        <TableCell className="text-xs">{row.voucher.router_name}</TableCell>
                        <TableCell className="text-xs">{`${row.voucher.speed_type} ${row.voucher.profile}`}</TableCell>
                        <TableCell className="text-xs font-semibold">{formatMoney(row.voucher.amount)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatDate(row.voucher.expires_at)}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{row.voucher.payment_reference || "Single"}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={deleteVoucherMutation.isPending}
                            onClick={() => deleteVoucher(row)}
                            className="h-8 gap-2 rounded text-xs"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredExpiredRows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="h-36 text-center text-sm text-muted-foreground">No expired vouchers found.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </SettingsLayout>
  );
}

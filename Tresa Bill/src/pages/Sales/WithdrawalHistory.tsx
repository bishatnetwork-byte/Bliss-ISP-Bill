import AppHeader from "@/components/Header/AppHeader";
import SEO from "@/components/SEO";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { renultApi, WalletTransactionResponse } from "@/api/foreform";
import { useBranchTransactions } from "@/hooks/useWallet";
import { cn } from "@/lib/utils";
import { ArrowLeft, Loader2, RefreshCw, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  if (s === "completed") return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-0 text-[10px] font-bold">Completed</Badge>;
  if (s === "processing") return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-0 text-[10px] font-bold">Processing</Badge>;
  if (s === "failed") return <Badge className="bg-red-100 text-red-700 hover:bg-red-100 border-0 text-[10px] font-bold">Failed</Badge>;
  return <Badge className="bg-muted text-muted-foreground hover:bg-muted border-0 text-[10px] font-bold capitalize">{status}</Badge>;
}

export default function WithdrawalHistory() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("sidebar-collapsed") === "true");
  const [branchId, setBranchId] = useState(() => localStorage.getItem("selected-workspace") || "");
  // Overrides for individual transactions updated via status check
  const [overrides, setOverrides] = useState<Record<string, WalletTransactionResponse>>({});
  const [checking, setChecking] = useState<Record<string, boolean>>({});
  const autoCheckedRef = useRef(false);
  const navigate = useNavigate();

  useEffect(() => {
    const sidebarHandler = (e: Event) => setSidebarCollapsed((e as CustomEvent<{ collapsed: boolean }>).detail.collapsed);
    const branchHandler = (e: Event) => setBranchId((e as CustomEvent<{ id: string }>).detail.id);
    window.addEventListener("sidebar-collapse-change", sidebarHandler);
    window.addEventListener("renult-branch-change", branchHandler);
    return () => {
      window.removeEventListener("sidebar-collapse-change", sidebarHandler);
      window.removeEventListener("renult-branch-change", branchHandler);
    };
  }, []);

  const { data: transactions, isLoading, refetch, isFetching } = useBranchTransactions(branchId, { limit: 100 });
  const withdrawals = (transactions ?? []).filter((t) => t.transaction_type === "withdrawal");

  const recheckOne = async (txn: WalletTransactionResponse) => {
    if (!branchId || checking[txn.id]) return;
    setChecking((prev) => ({ ...prev, [txn.id]: true }));
    try {
      const updated = await renultApi.wallets.checkWithdrawalStatus(branchId, txn.id);
      setOverrides((prev) => ({ ...prev, [txn.id]: updated }));
    } catch {
      // silently ignore — stale data stays visible
    } finally {
      setChecking((prev) => ({ ...prev, [txn.id]: false }));
    }
  };

  // Auto-recheck any PROCESSING transactions once when data first loads
  useEffect(() => {
    if (autoCheckedRef.current || !branchId || withdrawals.length === 0) return;
    const processing = withdrawals.filter((t) => t.status.toLowerCase() === "processing");
    if (processing.length === 0) return;
    autoCheckedRef.current = true;
    processing.forEach((t) => recheckOne(t));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withdrawals.length, branchId]);

  const display = (txn: WalletTransactionResponse) => overrides[txn.id] ?? txn;

  return (
    <div className={cn("min-h-screen bg-background transition-all duration-300", sidebarCollapsed ? "md:pl-[72px]" : "md:pl-[280px]")}>
      <SEO title="Withdrawal History" />
      <AppHeader />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {/* Page header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => navigate(-1)}>
              <ArrowLeft className="w-4 h-4" /> Back
            </Button>
            <div>
              <h1 className="text-base font-bold">Withdrawal History</h1>
              <p className="text-xs text-muted-foreground">{withdrawals.length} withdrawal{withdrawals.length !== 1 ? "s" : ""}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => { autoCheckedRef.current = false; refetch(); }} disabled={isFetching}>
            <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin")} />
            Refresh
          </Button>
        </div>

        {/* Table */}
        <div className="rounded border border-border/40 overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Loading withdrawals…</span>
            </div>
          ) : withdrawals.length === 0 ? (
            <div className="py-20 text-center text-sm text-muted-foreground">No withdrawals yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="text-[11px] font-bold">Date</TableHead>
                  <TableHead className="text-[11px] font-bold">Recipient</TableHead>
                  <TableHead className="text-[11px] font-bold text-right">Amount</TableHead>
                  <TableHead className="text-[11px] font-bold text-right">Fee</TableHead>
                  <TableHead className="text-[11px] font-bold text-right">Net</TableHead>
                  <TableHead className="text-[11px] font-bold text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {withdrawals.map((raw) => {
                  const txn = display(raw);
                  const isChecking = !!checking[txn.id];
                  const isProcessing = txn.status.toLowerCase() === "processing";
                  return (
                    <TableRow key={txn.id} className="hover:bg-muted/30">
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(txn.created_at).toLocaleDateString()}{" "}
                        <span className="text-[10px]">{new Date(txn.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      </TableCell>
                      <TableCell className="text-xs font-medium">
                        {txn.recipient_phone ?? <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-xs text-right font-mono">
                        UGX {txn.amount.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-xs text-right font-mono text-muted-foreground">
                        {txn.fee_amount > 0 ? `UGX ${txn.fee_amount.toLocaleString()}` : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-right font-mono font-semibold text-emerald-700">
                        UGX {txn.net_amount.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {isChecking ? (
                            <Loader2 className="w-3 h-3 animate-spin text-amber-500" />
                          ) : (
                            <StatusBadge status={txn.status} />
                          )}
                          {isProcessing && !isChecking && (
                            <button
                              onClick={() => recheckOne(raw)}
                              className="text-muted-foreground hover:text-foreground transition-colors"
                              title="Re-check status with gateway"
                            >
                              <RotateCcw className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </main>
    </div>
  );
}

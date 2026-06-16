import AppHeader from "@/components/Header/AppHeader";
import SEO from "@/components/SEO";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useBranchTransactions } from "@/hooks/useWallet";
import { cn } from "@/lib/utils";
import { ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
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
          <Button variant="outline" size="sm" className="gap-2" onClick={() => refetch()} disabled={isFetching}>
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
                {withdrawals.map((txn) => (
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
                      <StatusBadge status={txn.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </main>
    </div>
  );
}

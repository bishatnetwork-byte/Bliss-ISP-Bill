import { BranchWalletResponse, SmsWalletResponse, SmsWalletTransactionResponse } from "@/api/foreform";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { ArrowRightLeft, CheckCircle2, Loader2, RefreshCw, Smartphone, Wallet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type WalletTopupProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branchId: string;
  smsWallet?: SmsWalletResponse;
  mainWallet?: BranchWalletResponse;
  transactions: SmsWalletTransactionResponse[];
  isLoadingTransactions: boolean;
  transferToWallet: {
    isPending: boolean;
    mutateAsync: (payload: { amount: number }) => Promise<unknown>;
  };
  mobileMoneyTopup: {
    isPending: boolean;
    mutateAsync: (payload: { amount: number; phone_number: string }) => Promise<{ transaction: SmsWalletTransactionResponse }>;
  };
  verifyMobileMoneyTopup: {
    isPending: boolean;
    mutateAsync: (transactionId: string) => Promise<{ transaction: SmsWalletTransactionResponse }>;
  };
};

const QUICK_AMOUNTS = [5_000, 10_000, 20_000, 50_000];

function formatUgx(amount?: number) {
  return `UGX ${(amount || 0).toLocaleString()}`;
}

function smsLeft(wallet?: SmsWalletResponse) {
  if (!wallet) return 0;
  return wallet.sms_remaining ?? Math.floor(wallet.balance / Math.max(1, wallet.sms_cost_ugx || 1));
}

function transactionLabel(type: string) {
  return type
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function statusClass(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "completed") return "border-emerald-500/20 bg-emerald-500/10 text-emerald-700";
  if (normalized === "pending" || normalized === "processing") return "border-amber-500/20 bg-amber-500/10 text-amber-700";
  if (normalized === "failed") return "border-destructive/20 bg-destructive/10 text-destructive";
  return "border-muted-foreground/20 bg-muted text-muted-foreground";
}

export default function WalletTopup({
  open,
  onOpenChange,
  branchId,
  smsWallet,
  mainWallet,
  transactions,
  isLoadingTransactions,
  transferToWallet,
  mobileMoneyTopup,
  verifyMobileMoneyTopup,
}: WalletTopupProps) {
  const [transferAmount, setTransferAmount] = useState("");
  const [mobileAmount, setMobileAmount] = useState("");
  const [mobilePhone, setMobilePhone] = useState("");
  const [pendingTopupId, setPendingTopupId] = useState<string | null>(null);

  const parseAmount = (value: string) => Number(value.replace(/[^\d]/g, ""));

  const handleTransfer = async () => {
    const amount = parseAmount(transferAmount);
    if (!branchId || amount <= 0) {
      toast.error("Enter an amount to transfer.");
      return;
    }
    if (mainWallet && amount > mainWallet.balance) {
      toast.error("Main wallet balance is too low for this transfer.");
      return;
    }
    try {
      await transferToWallet.mutateAsync({ amount });
      setTransferAmount("");
      toast.success("SMS wallet funded from main wallet.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not transfer to SMS wallet.");
    }
  };

  const handleMobileMoneyTopup = async () => {
    const amount = parseAmount(mobileAmount);
    if (!branchId || amount <= 0 || !mobilePhone.trim()) {
      toast.error("Enter the mobile money phone and amount.");
      return;
    }
    try {
      const response = await mobileMoneyTopup.mutateAsync({
        amount,
        phone_number: mobilePhone.trim(),
      });
      setMobileAmount("");
      if (response.transaction.status.toLowerCase() === "completed") {
        toast.success("Mobile money top-up completed.");
      } else {
        setPendingTopupId(response.transaction.id);
        toast.success("Mobile money request sent. Confirm on the customer's phone.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start mobile money top-up.");
    }
  };

  const checkPendingTopup = async (transactionId = pendingTopupId) => {
    if (!transactionId) return;
    try {
      const response = await verifyMobileMoneyTopup.mutateAsync(transactionId);
      const status = response.transaction.status.toLowerCase();
      if (status === "completed") {
        setPendingTopupId(null);
        toast.success("Top-up confirmed and credited.");
      } else if (status === "failed") {
        setPendingTopupId(null);
        toast.error(response.transaction.failure_reason || "Top-up failed.");
      } else {
        toast.message("Top-up is still pending.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not verify top-up.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[98vh] overflow-hidden p-0 sm:max-w-6xl">
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle>SMS Wallet Top-up</DialogTitle>
          <DialogDescription>Keep SMS funds separate from the main branch wallet.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-0 md:grid-cols-[1fr_580px]">
          <div className="space-y-5 px-6 py-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded border bg-muted/20 p-3">
                <p className="flex items-center gap-2 text-xs text-muted-foreground"><Wallet className="h-3.5 w-3.5" /> SMS left</p>
                <p className="mt-1 text-xl font-semibold">{smsLeft(smsWallet).toLocaleString()}</p>
              </div>
              <div className="rounded border bg-muted/20 p-3">
                <p className="flex items-center gap-2 text-xs text-muted-foreground"><ArrowRightLeft className="h-3.5 w-3.5" /> Main wallet</p>
                <p className="mt-1 text-xl font-semibold">{formatUgx(mainWallet?.balance)}</p>
              </div>
            </div>

            <Tabs defaultValue="mobile-money">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="mobile-money">Mobile money</TabsTrigger>
                <TabsTrigger value="main-wallet">Main wallet</TabsTrigger>
              </TabsList>
              <TabsContent value="mobile-money" className="mt-5 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="sms-topup-phone">Mobile money phone</Label>
                  <div className="relative">
                    <Smartphone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="sms-topup-phone"
                      inputMode="tel"
                      value={mobilePhone}
                      onChange={(event) => setMobilePhone(event.target.value.replace(/[^\d+\s-]/g, ""))}
                      placeholder="0772 123 456"
                      className="pl-9"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sms-topup-amount">Amount</Label>
                  <Input
                    id="sms-topup-amount"
                    inputMode="numeric"
                    value={mobileAmount}
                    onChange={(event) => setMobileAmount(event.target.value.replace(/[^\d]/g, ""))}
                    placeholder="10000"
                  />
                  <div className="flex flex-wrap gap-2">
                    {QUICK_AMOUNTS.map((amount) => (
                      <Button key={amount} type="button" variant="outline" size="sm" onClick={() => setMobileAmount(String(amount))}>
                        {formatUgx(amount)}
                      </Button>
                    ))}
                  </div>
                </div>
                <Button className="w-full gap-2" onClick={handleMobileMoneyTopup} disabled={!branchId || mobileMoneyTopup.isPending}>
                  {mobileMoneyTopup.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}
                  Request mobile money top-up
                </Button>
                {pendingTopupId && (
                  <Button type="button" variant="outline" className="w-full gap-2" onClick={() => checkPendingTopup()} disabled={verifyMobileMoneyTopup.isPending}>
                    {verifyMobileMoneyTopup.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Check top-up status
                  </Button>
                )}
              </TabsContent>

              <TabsContent value="main-wallet" className="mt-5 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="sms-transfer-amount">Amount to move</Label>
                  <Input
                    id="sms-transfer-amount"
                    inputMode="numeric"
                    value={transferAmount}
                    onChange={(event) => setTransferAmount(event.target.value.replace(/[^\d]/g, ""))}
                    placeholder="10000"
                  />
                  <div className="flex flex-wrap gap-2">
                    {QUICK_AMOUNTS.map((amount) => (
                      <Button key={amount} type="button" variant="outline" size="sm" onClick={() => setTransferAmount(String(amount))}>
                        {formatUgx(amount)}
                      </Button>
                    ))}
                  </div>
                </div>
                <Button className="w-full gap-2" onClick={handleTransfer} disabled={!branchId || transferToWallet.isPending}>
                  {transferToWallet.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />}
                  Move from main wallet
                </Button>
              </TabsContent>
            </Tabs>
          </div>

          <div className="border-t bg-muted/20 md:border-l md:border-t-0">
            <div className="border-b px-4 py-4">
              <p className="text-sm font-medium">SMS wallet ledger</p>
              <p className="text-xs text-muted-foreground">Top-ups, transfers, and SMS charges.</p>
            </div>
            <ScrollArea className="h-[480px]">
              {isLoadingTransactions ? (
                <div className="space-y-3 p-4">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <div key={index} className="h-16 rounded bg-background/60" />
                  ))}
                </div>
              ) : transactions.length === 0 ? (
                <div className="flex h-64 flex-col items-center justify-center px-6 text-center">
                  <CheckCircle2 className="h-9 w-9 text-muted-foreground/30" />
                  <p className="mt-3 text-sm font-medium">No SMS wallet transactions yet</p>
                  <p className="mt-1 text-xs text-muted-foreground">Your top-ups and SMS charges will appear here.</p>
                </div>
              ) : (
                <div className="divide-y">
                  {transactions.map((transaction) => (
                    <div key={transaction.id} className="space-y-2 px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{transactionLabel(transaction.transaction_type)}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">{new Date(transaction.created_at).toLocaleString()}</p>
                        </div>
                        <p className={cn("shrink-0 text-sm font-semibold", transaction.transaction_type.includes("charge") ? "text-destructive" : "text-emerald-700")}>
                          {transaction.transaction_type.includes("charge") ? "-" : "+"}{formatUgx(transaction.amount)}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={statusClass(transaction.status)}>{transaction.status.toLowerCase()}</Badge>
                        {transaction.phone_number && <span className="text-xs text-muted-foreground">{transaction.phone_number}</span>}
                      </div>
                      {transaction.failure_reason && transaction.status.toLowerCase() === "failed" && (
                        <p className="text-xs text-destructive">{transaction.failure_reason}</p>
                      )}
                      {transaction.status.toLowerCase() === "pending" && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => checkPendingTopup(transaction.id)}
                          disabled={verifyMobileMoneyTopup.isPending}
                        >
                          Check status
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

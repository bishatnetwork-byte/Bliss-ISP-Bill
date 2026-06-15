import AppHeader from "@/components/Header/AppHeader";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePhoneVerifed } from "@/hooks/usePhoneVerifed";
import { useBranchWallet, useConfirmWithdrawal, useRequestWithdrawal } from "@/hooks/useWallet";
import type { WithdrawalConfirmResponse } from "@/api/foreform";
import { cn } from "@/lib/utils";
import { AlertCircle, CheckCircle2, Copy, Loader2, MailCheck, Printer, ShieldCheck, Verified, Wallet2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const FEE_RATE = 0.02;
const MIN_WITHDRAWAL_AMOUNT = 5000;

function normalizeUgandanPhone(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (/^2567\d{8}$/.test(digits)) return `+${digits}`;
  if (/^07\d{8}$/.test(digits)) return `+256${digits.slice(1)}`;
  if (/^7\d{8}$/.test(digits)) return `+256${digits}`;
  return null;
}

function providerFor(phone: string): string {
  const prefix = phone.replace(/\D/g, "").slice(3, 5);
  if (["70", "76", "77", "78"].includes(prefix)) return "MTN Mobile Money";
  if (["71", "72", "73", "74", "75"].includes(prefix)) return "Airtel Money";
  return "Mobile Money";
}

type FlowStep = "closed" | "review" | "code" | "processing" | "success";

export default function Withdrawal() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("sidebar-collapsed") === "true");
  const [branchId, setBranchId] = useState(() => localStorage.getItem("selected-workspace") || "");
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<FlowStep>("closed");
  const [challengeId, setChallengeId] = useState("");
  const [emailHint, setEmailHint] = useState("");
  const [code, setCode] = useState("");
  const [receipt, setReceipt] = useState<WithdrawalConfirmResponse | null>(null);

  useEffect(() => {
    const sidebarHandler = (event: Event) => setSidebarCollapsed((event as CustomEvent<{ collapsed: boolean }>).detail.collapsed);
    const branchHandler = (event: Event) => setBranchId((event as CustomEvent<{ id: string }>).detail.id);
    window.addEventListener("sidebar-collapse-change", sidebarHandler);
    window.addEventListener("renult-branch-change", branchHandler);
    return () => {
      window.removeEventListener("sidebar-collapse-change", sidebarHandler);
      window.removeEventListener("renult-branch-change", branchHandler);
    };
  }, []);

  const numericAmount = Number(amount) || 0;
  const fee = Math.ceil(numericAmount * FEE_RATE);
  const net = Math.max(0, numericAmount - fee);
  const normalizedPhone = normalizeUgandanPhone(phone);
  const provider = normalizedPhone ? providerFor(normalizedPhone) : "Mobile Money";
  const phoneVerification = usePhoneVerifed(normalizedPhone);
  const recipientName = phoneVerification.data?.success ? phoneVerification.data.identityname.trim() : "";
  const { data: wallet } = useBranchWallet(branchId);
  const requestWithdrawal = useRequestWithdrawal(branchId);
  const confirmWithdrawal = useConfirmWithdrawal(branchId);
  const availableBalance = wallet?.balance || 0;
  const transaction = receipt?.transaction;

  const formValid = Boolean(
    normalizedPhone &&
    recipientName &&
    numericAmount >= MIN_WITHDRAWAL_AMOUNT &&
    numericAmount <= availableBalance
  );
  const receiptText = useMemo(() => {
    if (!transaction) return "";
    return [
      "RENULT WITHDRAWAL RECEIPT",
      `Transaction: ${transaction.id}`,
      `Recipient: ${recipientName}`,
      `Phone: ${normalizedPhone}`,
      `Provider: ${provider}`,
      `Amount: UGX ${transaction.amount.toLocaleString()}`,
      `Fee: UGX ${transaction.fee_amount.toLocaleString()}`,
      `Net: UGX ${transaction.net_amount.toLocaleString()}`,
      `Date: ${new Date(transaction.created_at).toLocaleString()}`,
    ].join("\n");
  }, [normalizedPhone, provider, recipientName, transaction]);

  const openReview = () => {
    if (!formValid) {
      const message = numericAmount > availableBalance
        ? "Insufficient wallet balance."
        : numericAmount < MIN_WITHDRAWAL_AMOUNT
          ? `Minimum withdrawal amount is UGX ${MIN_WITHDRAWAL_AMOUNT.toLocaleString()}.`
          : phoneVerification.isFetching
            ? "Wait for the phone number to be verified."
            : "Enter a valid verified phone number and amount.";
      toast.error(message);
      return;
    }
    setStep("review");
  };

  const sendCode = async () => {
    if (!normalizedPhone) return;
    try {
      const challenge = await requestWithdrawal.mutateAsync({
        amount: numericAmount,
        recipient_phone: normalizedPhone,
        recipient_name: recipientName,
        provider,
      });
      setChallengeId(challenge.challenge_id);
      setEmailHint(challenge.email_hint);
      setCode("");
      setStep("code");
      toast.success(`Verification code sent to ${challenge.email_hint}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send verification code.");
    }
  };

  const verifyAndWithdraw = async () => {
    if (!/^\d{6}$/.test(code)) {
      toast.error("Enter the six-digit verification code.");
      return;
    }
    setStep("processing");
    try {
      const result = await confirmWithdrawal.mutateAsync({ challenge_id: challengeId, code });
      setReceipt(result);
      setStep("success");
      if (result.receipt_email_sent) toast.success("Withdrawal complete. A receipt is on its way to your email.");
      else toast.success("Withdrawal complete.");
    } catch (error) {
      setStep("code");
      toast.error(error instanceof Error ? error.message : "Withdrawal verification failed.");
    }
  };

  const reset = () => {
    setStep("closed");
    setPhone("");
    setAmount("");
    setCode("");
    setChallengeId("");
    setReceipt(null);
  };

  return (
    <div className={cn("min-h-screen bg-background transition-all duration-300", sidebarCollapsed ? "md:pl-[72px]" : "md:pl-[280px]")}>
      <SEO title="Withdraw Funds" />
      <AppHeader />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 print:p-0">
        <div className="grid lg:grid-cols-[1fr_340px] gap-6 items-start">
          <Card className="print:hidden rounded border border-border/10 shadow-none">
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Wallet2 className="w-4 h-4 text-primary" /> Withdrawal Details</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              <div className="rounded border border-primary/30 p-4">
                <p className="text-[12px] font-bold text-gray-500">Available balance</p>
                <p className="text-2xl text-emerald-600 mt-1">UGX {availableBalance.toLocaleString()}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Mobile Money Number</Label>
                <Input id="phone" value={phone} onChange={(event) => setPhone(event.target.value.replace(/[^\d+]/g, ""))} placeholder="0772 123 456" />
                {phoneVerification.isFetching && <p className="text-[12px] text-primary flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Verifying recipient...</p>}
                {recipientName && <p className="text-xs font-semibold text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> {recipientName}</p>}
                {normalizedPhone && phoneVerification.isError && <p className="text-[12px] text-destructive">{phoneVerification.error instanceof Error ? phoneVerification.error.message : "Could not verify this phone number."}</p>}
                {normalizedPhone && phoneVerification.data && !phoneVerification.data.success && <p className="text-[11px] text-destructive">{phoneVerification.data.message || "This phone number could not be verified."}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">Withdrawal amount (UGX)</Label>
                <Input id="amount" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value.replace(/\D/g, ""))} placeholder="50000" />
                {numericAmount > 0 && numericAmount < MIN_WITHDRAWAL_AMOUNT && (
                  <p className="text-[12px] text-destructive">Minimum withdrawal is UGX {MIN_WITHDRAWAL_AMOUNT.toLocaleString()}.</p>
                )}
                <p className="text-[11px] text-muted-foreground">Minimum withdrawal amount is UGX {MIN_WITHDRAWAL_AMOUNT.toLocaleString()}. The 2% platform fee is deducted from this amount.</p>
              </div>
              <div className="rounded border p-4 space-y-2 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><strong>UGX {numericAmount.toLocaleString()}</strong></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Fee (2%)</span><strong>UGX {fee.toLocaleString()}</strong></div>
                <div className="flex justify-between border-t pt-2 text-sm"><span className="font-bold">Recipient receives</span><strong className="text-emerald-600">UGX {net.toLocaleString()}</strong></div>
              </div>
              <Button className="w-full gap-2" disabled={!formValid} onClick={openReview}><ShieldCheck className="w-4 h-4" /> Review secure withdrawal</Button>
            </CardContent>
          </Card>

          <div className="space-y-3">
            <div className="rounded bg-white text-slate-950 p-5 shadow-sm print:shadow-none print:border-slate-300 print:w-[82mm]" id="withdrawal-receipt">
              <div className="flex items-start justify-between border-b pb-3">
                <div><p className="text-[12px] text-slate-600 font-bold">RENULT</p><h2 className="text-base ">Withdrawal Receipt</h2></div>
                {transaction && <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
              </div>
              <div className="py-4 space-y-2 text-xs">
                <div className="flex justify-between gap-4"><span className="text-slate-500">Transaction</span><span className="font-mono text-right break-all">{transaction?.id || "Pending"}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Recipient</span><strong className="text-right">{recipientName || "Not entered"}</strong></div>
                <div className="flex justify-between"><span className="text-slate-500">Phone</span><span>{normalizedPhone || "Not entered"}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Provider</span><span>{provider}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Amount</span><span>UGX {(transaction?.amount ?? numericAmount).toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Fee</span><span>UGX {(transaction?.fee_amount ?? fee).toLocaleString()}</span></div>
              </div>
              <div className="border-y py-3 flex justify-between items-center">
                <span className="text-xs font-bold">Net transferred</span>
                <span className="text-lg  text-emerald-700">UGX {(transaction?.net_amount ?? net).toLocaleString()}</span>
              </div>
              <p className="text-[10px] text-slate-500 mt-3">{transaction ? new Date(transaction.created_at).toLocaleString() : "Receipt is finalized after email verification."}</p>
              <span className="flex text-[10px] text-primary/50 mt-3"><Verified className="w-3.5 h-3.5 mr-2" />Powered by Renult Billings Systems</span>
            </div>
            {transaction && (
              <div className="grid grid-cols-2 gap-2 print:hidden">
                <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="w-3.5 h-3.5 mr-2" /> Print</Button>
                <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(receiptText).then(() => toast.success("Receipt copied."))}><Copy className="w-3.5 h-3.5 mr-2" /> Copy</Button>
              </div>
            )}
          </div>
        </div>
      </main>

      <Dialog open={step !== "closed"} onOpenChange={(open) => !open && step !== "processing" && setStep("closed")}>
        <DialogContent className="sm:max-w-md" onEscapeKeyDown={(event) => step === "processing" && event.preventDefault()} onInteractOutside={(event) => step === "processing" && event.preventDefault()}>
          {step === "review" && <>
            <DialogHeader><DialogTitle>Confirm withdrawal</DialogTitle><DialogDescription>Review the recipient before requesting an email verification code.</DialogDescription></DialogHeader>
            <div className="rounded border p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Recipient</span><strong>{recipientName}</strong></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Phone</span><strong>{normalizedPhone}</strong></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Debit</span><strong>UGX {numericAmount.toLocaleString()}</strong></div>
              <div className="flex items-start gap-2 border-t pt-3 text-xs text-amber-700"><AlertCircle className="w-4 h-4 shrink-0" /> Transfers are irreversible after token verification.</div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setStep("closed")}>Cancel</Button><Button onClick={sendCode} disabled={requestWithdrawal.isPending}>{requestWithdrawal.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Email verification code</Button></DialogFooter>
          </>}
          {step === "code" && <>
            <DialogHeader><DialogTitle className="flex items-center gap-2"><MailCheck className="w-5 h-5 text-primary" /> Verify transaction</DialogTitle><DialogDescription>Enter the six-digit code sent to {emailHint}. It expires in 10 minutes.</DialogDescription></DialogHeader>
            <div className="space-y-2"><Label htmlFor="token">Verification code</Label><Input id="token" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} className="text-center font-mono text-2xl tracking-[0.45em]" /></div>
            <DialogFooter><Button variant="outline" onClick={() => setStep("closed")}>Cancel</Button><Button onClick={verifyAndWithdraw} disabled={code.length !== 6}>Verify and withdraw</Button></DialogFooter>
          </>}
          {step === "processing" && <div className="py-10 text-center space-y-4"><Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" /><div><h3 className="font-bold">Processing secured withdrawal</h3><p className="text-xs text-muted-foreground mt-1">The wallet is locked while the transaction is committed.</p></div></div>}
          {step === "success" && <div className="py-6 text-center space-y-5"><CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" /><div><h3 className="text-lg font-bold">Withdrawal complete</h3><p className="text-xs text-muted-foreground mt-1">{receipt?.receipt_email_sent ? "A receipt is on its way to your account email." : "The transaction succeeded. Email receipts are not configured for this account."}</p></div><Button className="w-full" onClick={reset}>Done</Button></div>}
        </DialogContent>
      </Dialog>
    </div>
  );
}

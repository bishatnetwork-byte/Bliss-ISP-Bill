import {
  SmsGatewayResponse,
  SmsGatewayUpdatePayload,
  renultApi,
} from "@/api/foreform";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, CheckCircle2, Copy, Loader2, RefreshCw, Save, Signal, Star } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import PlatformAdminLayout from "../PlatformAdmin/PlatformAdminLayout";

type GatewayDraft = Record<string, Record<string, string>>;

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function balanceText(value: unknown) {
  if (value == null) return "N/A";
  if (typeof value === "string" || typeof value === "number") return String(value);
  return JSON.stringify(value, null, 2);
}

function credentialsHint(gateway: SmsGatewayResponse) {
  if (gateway.credentials_source === "dashboard") return "Dashboard credentials";
  if (gateway.credentials_source === "env") return "Environment fallback";
  return "Credentials missing";
}

export default function SmsGatewayManagerPage() {
  return (
    <PlatformAdminLayout activeSection="sms_gateways" title="SMS Gateway Manager">
      <SmsGatewayManagerContent />
    </PlatformAdminLayout>
  );
}

export function SmsGatewayManagerContent() {
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<GatewayDraft>({});
  const [balanceProvider, setBalanceProvider] = useState<string | null>(null);
  const [balanceResult, setBalanceResult] = useState<Record<string, unknown>>({});
  const [smsCost, setSmsCost] = useState("");
  const [payoutAmount, setPayoutAmount] = useState("");
  const [payoutPhone, setPayoutPhone] = useState("");
  const [payoutReference, setPayoutReference] = useState("");
  const [payoutNote, setPayoutNote] = useState("");

  const gatewaysQuery = useQuery({
    queryKey: ["platformAdmin", "smsGateways"],
    queryFn: renultApi.platformAdmin.smsGateways,
  });
  const settingsQuery = useQuery({
    queryKey: ["platformAdmin", "settings"],
    queryFn: renultApi.platformAdmin.settings,
  });
  const smsFinanceQuery = useQuery({
    queryKey: ["platformAdmin", "smsFinance"],
    queryFn: renultApi.platformAdmin.smsFinance,
  });

  const gateways = gatewaysQuery.data || [];
  const defaultGateway = useMemo(() => gateways.find((gateway) => gateway.is_default), [gateways]);
  const finance = smsFinanceQuery.data;

  useEffect(() => {
    if (settingsQuery.data?.sms_cost_ugx) setSmsCost(String(settingsQuery.data.sms_cost_ugx));
  }, [settingsQuery.data?.sms_cost_ugx]);

  const saveGateway = useMutation({
    mutationFn: ({ gateway, enabled }: { gateway: SmsGatewayResponse; enabled: boolean }) => {
      const draft = drafts[gateway.id] || {};
      const payload: SmsGatewayUpdatePayload = { enabled };
      Object.entries(draft).forEach(([key, value]) => {
        const trimmed = value.trim();
        if (trimmed) {
          (payload as unknown as Record<string, string | boolean>)[key] = trimmed;
        }
      });
      return renultApi.platformAdmin.updateSmsGateway(gateway.id, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platformAdmin", "smsGateways"] });
      setDrafts({});
      toast.success("SMS gateway saved.");
    },
    onError: (error) => toast.error(errorMessage(error, "Could not save SMS gateway.")),
  });

  const makeDefault = useMutation({
    mutationFn: (provider: string) => renultApi.platformAdmin.setDefaultSmsGateway(provider),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platformAdmin", "smsGateways"] });
      toast.success("Default SMS gateway updated.");
    },
    onError: (error) => toast.error(errorMessage(error, "Could not set default gateway.")),
  });

  const checkBalance = useMutation({
    mutationFn: (provider: string) => renultApi.platformAdmin.smsGatewayBalance(provider),
    onMutate: (provider) => setBalanceProvider(provider),
    onSuccess: (result) => {
      setBalanceResult((current) => ({ ...current, [result.provider]: result.balance }));
      toast.success("Gateway balance loaded.");
    },
    onError: (error) => toast.error(errorMessage(error, "Could not check gateway balance.")),
    onSettled: () => setBalanceProvider(null),
  });
  const saveSmsCost = useMutation({
    mutationFn: () => {
      if (!settingsQuery.data) throw new Error("Settings are still loading.");
      const next = Number(smsCost);
      if (!next || next < 1) throw new Error("Enter a valid SMS value.");
      return renultApi.platformAdmin.updateSettings({ ...settingsQuery.data, sms_cost_ugx: next });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platformAdmin", "settings"] });
      queryClient.invalidateQueries({ queryKey: ["platformAdmin", "smsFinance"] });
      toast.success("SMS value updated.");
    },
    onError: (error) => toast.error(errorMessage(error, "Could not update SMS value.")),
  });
  const createPayout = useMutation({
    mutationFn: () => renultApi.platformAdmin.createSmsProviderPayout({
      amount: Number(payoutAmount.replace(/\D/g, "")),
      recipient_phone: payoutPhone,
      reference: payoutReference || null,
      note: payoutNote || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platformAdmin", "smsFinance"] });
      setPayoutAmount("");
      setPayoutPhone("");
      setPayoutReference("");
      setPayoutNote("");
      toast.success("SMS payout sent for processing.");
    },
    onError: (error) => toast.error(errorMessage(error, "Could not record SMS payout.")),
  });
  const checkPayoutStatus = useMutation({
    mutationFn: renultApi.platformAdmin.smsProviderPayoutStatus,
    onSuccess: (txn) => {
      queryClient.invalidateQueries({ queryKey: ["platformAdmin", "smsFinance"] });
      toast.success(`SMS payout status: ${txn.status}`);
    },
    onError: (error) => toast.error(errorMessage(error, "Could not check SMS payout status.")),
  });

  const updateDraft = (provider: string, field: string, value: string) => {
    setDrafts((current) => ({
      ...current,
      [provider]: {
        ...(current[provider] || {}),
        [field]: value,
      },
    }));
  };

  return (
      <div className="mx-auto flex w-full max-w-full flex-col gap-5 px-4 py-6 sm:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground">SMS Finance & Gateway Manager</h1>
            <p className="text-sm text-muted-foreground">
              Track SMS topups, provider payouts, profit, unit pricing, and active gateway routing.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => gatewaysQuery.refetch()}
            disabled={gatewaysQuery.isFetching}
            className="h-9 w-fit"
          >
            {gatewaysQuery.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <Metric label="Gateways" value={gateways.length || 0} />
          <Metric label="Enabled" value={gateways.filter((gateway) => gateway.enabled).length} />
          <Metric label="Default" value={defaultGateway?.label || "None"} />
          <Metric label="SMS value" value={`UGX ${(finance?.sms_cost_ugx || settingsQuery.data?.sms_cost_ugx || 0).toLocaleString()}`} />
        </div>

        <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
          <Card className="rounded border border-border/30 shadow-none">
            <CardHeader className="border-b pb-4">
              <CardTitle className="flex items-center gap-2 text-base"><Banknote className="h-4 w-4 text-primary" /> SMS cash and profit</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Metric label="Client topups" value={`UGX ${(finance?.total_topups || 0).toLocaleString()}`} />
                <Metric label="SMS charged" value={`UGX ${(finance?.total_sms_revenue || 0).toLocaleString()}`} />
                <Metric label="Provider paid" value={`UGX ${(finance?.provider_payouts || 0).toLocaleString()}`} />
                <Metric label="Available" value={`UGX ${(finance?.available_sms_balance || 0).toLocaleString()}`} />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="SMS value charged to clients">
                  <Input inputMode="numeric" value={smsCost} onChange={(event) => setSmsCost(event.target.value.replace(/\D/g, ""))} placeholder="29" />
                </Field>
                <div className="sm:col-span-2 flex items-end">
                  <Button className="h-10 gap-2" onClick={() => saveSmsCost.mutate()} disabled={saveSmsCost.isPending || !settingsQuery.data}>
                    {saveSmsCost.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save SMS value
                  </Button>
                </div>
              </div>
              <ScrollArea className="h-[260px] rounded border">
                {(finance?.wallet_transactions || []).length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground">No SMS wallet transactions yet.</div>
                ) : (
                  <div className="divide-y">
                    {finance?.wallet_transactions.map((txn) => (
                      <div key={txn.id} className="flex items-start justify-between gap-3 p-3 text-xs">
                        <div className="min-w-0">
                          <p className="font-semibold">{txn.transaction_type.replace(/_/g, " ")} · {txn.branch_name}</p>
                          <p className="text-muted-foreground">{txn.owner_name} · {new Date(txn.created_at).toLocaleString()}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="font-bold">UGX {txn.amount.toLocaleString()}</span>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigator.clipboard.writeText(JSON.stringify(txn)).then(() => toast.success("Transaction copied."))}>
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>

          <Card className="rounded border border-border/30 shadow-none">
            <CardHeader className="border-b pb-4">
              <CardTitle className="text-base">Provider payout / admin withdraw</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-4">
              <Field label="Amount paid to SMS provider">
                <Input inputMode="numeric" value={payoutAmount} onChange={(event) => setPayoutAmount(event.target.value.replace(/\D/g, ""))} placeholder="50000" />
              </Field>
              <Field label="Admin/staff phone number">
                <Input inputMode="tel" value={payoutPhone} onChange={(event) => setPayoutPhone(event.target.value)} placeholder="0700000000 or +256700000000" />
              </Field>
              <Field label="Reference">
                <Input value={payoutReference} onChange={(event) => setPayoutReference(event.target.value)} placeholder="Provider receipt or cash ref" />
              </Field>
              <Field label="Note">
                <Textarea value={payoutNote} onChange={(event) => setPayoutNote(event.target.value)} placeholder="Cash paid, bank transfer, staff name..." />
              </Field>
              <Button className="w-full gap-2" onClick={() => createPayout.mutate()} disabled={createPayout.isPending || !Number(payoutAmount) || !payoutPhone.trim()}>
                {createPayout.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
                Withdraw SMS payout
              </Button>
              <div className="space-y-2">
                {(finance?.admin_transactions || []).map((txn) => (
                  <div key={txn.id} className="rounded border p-3 text-xs">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold">{txn.admin_name || "Admin"} · {txn.transaction_type.replace(/_/g, " ")}</span>
                      <Badge variant="outline">{txn.status}</Badge>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-3">
                      <p className="text-muted-foreground">{txn.recipient_phone || "No phone"} · {new Date(txn.created_at).toLocaleString()}</p>
                      <span className="font-bold">UGX {txn.amount.toLocaleString()}</span>
                    </div>
                    {txn.failure_reason && <p className="mt-1 text-red-600">{txn.failure_reason}</p>}
                    {txn.status !== "COMPLETED" && txn.status !== "FAILED" && (
                      <Button variant="outline" size="sm" className="mt-2 h-7 text-[11px]" onClick={() => checkPayoutStatus.mutate(txn.id)} disabled={checkPayoutStatus.isPending}>
                        {checkPayoutStatus.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />} Check status
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          {gateways.map((gateway) => {
            const draft = drafts[gateway.id] || {};
            const saving = saveGateway.isPending;
            return (
              <Card key={gateway.id} className="rounded border border-border/30 shadow-none">
                <CardHeader className="border-b border-border/40 pb-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Signal className="h-4 w-4 text-primary" />
                      {gateway.label}
                    </CardTitle>
                    <div className="flex flex-wrap items-center gap-2">
                      {gateway.is_default && <Badge className="gap-1"><Star className="h-3 w-3" /> Default</Badge>}
                      <Badge variant={gateway.is_configured ? "secondary" : "outline"}>{credentialsHint(gateway)}</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 p-4">
                  <div className="flex items-center justify-between rounded border border-border/50 bg-muted/20 p-3">
                    <div>
                      <Label className="text-xs font-medium">Gateway enabled</Label>
                      <p className="mt-1 text-[11px] text-muted-foreground">Disabled providers cannot be selected as default.</p>
                    </div>
                    <Switch
                      checked={gateway.enabled}
                      onCheckedChange={(enabled) => saveGateway.mutate({ gateway, enabled })}
                      disabled={saving}
                    />
                  </div>

                  {gateway.id === "africastalking" ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Username">
                        <Input value={draft.username || ""} onChange={(event) => updateDraft(gateway.id, "username", event.target.value)} placeholder="Leave blank to keep existing" />
                      </Field>
                      <Field label="Sender ID">
                        <Input value={draft.sender_id || ""} onChange={(event) => updateDraft(gateway.id, "sender_id", event.target.value)} placeholder={gateway.sender_id || "Optional"} />
                      </Field>
                      <Field label="API key">
                        <Input type="password" value={draft.api_key || ""} onChange={(event) => updateDraft(gateway.id, "api_key", event.target.value)} placeholder="Leave blank to keep existing" />
                      </Field>
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Client ID">
                        <Input value={draft.client_id || ""} onChange={(event) => updateDraft(gateway.id, "client_id", event.target.value)} placeholder="Leave blank to keep existing" />
                      </Field>
                      <Field label="Client secret">
                        <Input type="password" value={draft.client_secret || ""} onChange={(event) => updateDraft(gateway.id, "client_secret", event.target.value)} placeholder="Leave blank to keep existing" />
                      </Field>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      className="h-9 gap-2"
                      onClick={() => saveGateway.mutate({ gateway, enabled: gateway.enabled })}
                      disabled={saving}
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 gap-2"
                      onClick={() => makeDefault.mutate(gateway.id)}
                      disabled={!gateway.enabled || !gateway.is_configured || gateway.is_default || makeDefault.isPending}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Make default
                    </Button>
                    {gateway.supports_balance && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-9 gap-2"
                        onClick={() => checkBalance.mutate(gateway.id)}
                        disabled={!gateway.enabled || !gateway.is_configured || balanceProvider === gateway.id}
                      >
                        {balanceProvider === gateway.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        Check balance
                      </Button>
                    )}
                  </div>

                  {gateway.supports_balance && balanceResult[gateway.id] !== undefined && (
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">JulySMS balance</Label>
                      <Textarea readOnly value={balanceText(balanceResult[gateway.id])} className="min-h-[92px] font-mono text-xs" />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded border border-border/30 bg-card p-4">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="mt-2 text-xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
    </div>
  );
}

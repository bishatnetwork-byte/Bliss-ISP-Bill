import {
  PlatformSettingsResponse,
  PlatformUserResponse,
  getAccountBaseDomain,
  renultApi,
} from "@/api/foreform";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Banknote,
  Cloud,
  Database,
  FileClock,
  Globe2,
  HardDrive,
  Loader2,
  Mail,
  MessageSquareWarning,
  Network,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  Trash2,
  UserCog,
  Users,
  Wifi,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import PlatformAdminLayout, { PlatformAdminSection } from "./PlatformAdminLayout";

const ADMIN_TABS = [
  ["overview", "Overview"],
  ["users", "Users"],
  ["finance", "Fees"],
  ["broadcasts", "Broadcasts"],
  ["voucher_audit", "Voucher Audit"],
  ["message_diagnostics", "Message Diagnostics"],
  ["tunnels", "Tunnels"],
  ["storage", "Cloud Files"],
  ["dns", "DNS"],
  ["subadmins", "Subadmins"],
  ["system", "Health"],
  ["audit", "Admin Audit"],
] as const;

const USER_SECTIONS = [
  "dashboard", "routers", "sales", "vouchers", "support", "network",
  "captive", "messages", "withdrawals", "branches", "settings",
];

const ADMIN_PERMISSIONS = ADMIN_TABS.map(([key]) => key);

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "N/A";
}

function money(value: number) {
  return `UGX ${value.toLocaleString()}`;
}

export default function PlatformAdminPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const permissions = useMemo(
    () => new Set(user?.platform_role === "superadmin" ? ADMIN_PERMISSIONS : user?.platform_permissions || []),
    [user],
  );
  const visibleTabs = ADMIN_TABS.filter(([permission]) => permissions.has(permission));
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedSection = searchParams.get("section") as PlatformAdminSection | null;
  const [activeTab, setActiveTab] = useState<PlatformAdminSection>(
    requestedSection || visibleTabs[0]?.[0] || "overview",
  );

  useEffect(() => {
    const next = requestedSection && permissions.has(requestedSection)
      ? requestedSection
      : visibleTabs[0]?.[0] || "overview";
    if (!permissions.has(activeTab) || (requestedSection && requestedSection !== activeTab)) {
      setActiveTab(next);
    }
  }, [activeTab, permissions, requestedSection, visibleTabs]);

  const changeSection = (section: PlatformAdminSection) => {
    setActiveTab(section);
    setSearchParams({ section });
  };

  const overview = useQuery({
    queryKey: ["platformAdmin", "overview"],
    queryFn: renultApi.platformAdmin.overview,
    enabled: activeTab === "overview" && permissions.has("overview"),
  });
  const [userSearch, setUserSearch] = useState("");
  const usersQuery = useQuery({
    queryKey: ["platformAdmin", "users", userSearch],
    queryFn: () => renultApi.platformAdmin.users(userSearch),
    enabled: (activeTab === "users" || activeTab === "subadmins" || activeTab === "broadcasts")
      && (permissions.has("users") || permissions.has("subadmins") || permissions.has("broadcasts")),
  });
  const settingsQuery = useQuery({
    queryKey: ["platformAdmin", "settings"],
    queryFn: renultApi.platformAdmin.settings,
    enabled: activeTab === "finance" && permissions.has("finance"),
  });
  const walletsQuery = useQuery({
    queryKey: ["platformAdmin", "wallets"],
    queryFn: renultApi.platformAdmin.wallets,
    enabled: activeTab === "finance" && permissions.has("finance"),
  });
  const tunnels = useQuery({
    queryKey: ["platformAdmin", "tunnels"],
    queryFn: renultApi.platformAdmin.tunnels,
    enabled: activeTab === "tunnels" && permissions.has("tunnels"),
    refetchInterval: 30000,
  });
  const [voucherSearch, setVoucherSearch] = useState("");
  const voucherAudit = useQuery({
    queryKey: ["platformAdmin", "voucherAudit", voucherSearch],
    queryFn: () => renultApi.platformAdmin.voucherAudit(voucherSearch),
    enabled: activeTab === "voucher_audit" && permissions.has("voucher_audit"),
  });
  const [messageSearch, setMessageSearch] = useState("");
  const [messageStatus, setMessageStatus] = useState("all");
  const messageDiagnostics = useQuery({
    queryKey: ["platformAdmin", "messageDiagnostics", messageSearch, messageStatus],
    queryFn: () => renultApi.platformAdmin.messageDiagnostics({
      search: messageSearch || undefined,
      status_filter: messageStatus,
      limit: 500,
    }),
    enabled: activeTab === "message_diagnostics" && permissions.has("message_diagnostics"),
  });
  const [storagePrefix, setStoragePrefix] = useState("");
  const storage = useQuery({
    queryKey: ["platformAdmin", "storage", storagePrefix],
    queryFn: () => renultApi.platformAdmin.storage(storagePrefix),
    enabled: activeTab === "storage" && permissions.has("storage"),
    retry: false,
  });
  const dnsZones = useQuery({
    queryKey: ["platformAdmin", "dnsZones"],
    queryFn: renultApi.platformAdmin.dnsZones,
    enabled: activeTab === "dns" && permissions.has("dns"),
    retry: false,
  });
  const [zoneId, setZoneId] = useState("");
  const dnsRecords = useQuery({
    queryKey: ["platformAdmin", "dnsRecords", zoneId],
    queryFn: () => renultApi.platformAdmin.dnsRecords(zoneId),
    enabled: activeTab === "dns" && !!zoneId && permissions.has("dns"),
    retry: false,
  });
  const health = useQuery({
    queryKey: ["platformAdmin", "health"],
    queryFn: renultApi.platformAdmin.health,
    enabled: activeTab === "system" && permissions.has("system"),
    refetchInterval: 30000,
  });
  const adminAudit = useQuery({
    queryKey: ["platformAdmin", "audit"],
    queryFn: renultApi.platformAdmin.audit,
    enabled: activeTab === "audit" && permissions.has("audit"),
  });

  const updateUser = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof renultApi.platformAdmin.updateUser>[1] }) =>
      renultApi.platformAdmin.updateUser(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platformAdmin", "users"] });
      toast.success("User access updated.");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not update user."),
  });
  const syncUserSubdomain = useMutation({
    mutationFn: renultApi.platformAdmin.syncUserSubdomain,
    onSuccess: (result) => toast.success(result.message),
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not provision account DNS."),
  });
  const updateSubadmin = useMutation({
    mutationFn: ({ id, role, permissions: next }: { id: string; role: "subadmin" | "none"; permissions: string[] }) =>
      renultApi.platformAdmin.updateSubadmin(id, { role, permissions: next }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platformAdmin", "users"] });
      toast.success("Platform admin privileges updated.");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not update subadmin."),
  });
  const tunnelMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => renultApi.platformAdmin.setTunnelActive(id, active),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["platformAdmin", "tunnels"] }),
  });
  const deleteStorage = useMutation({
    mutationFn: renultApi.platformAdmin.deleteStorage,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platformAdmin", "storage"] });
      toast.success("Cloudflare R2 file deleted.");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not delete file."),
  });
  const deleteDns = useMutation({
    mutationFn: ({ zone, record }: { zone: string; record: string }) => renultApi.platformAdmin.deleteDnsRecord(zone, record),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platformAdmin", "dnsRecords", zoneId] });
      toast.success("DNS record deleted.");
    },
  });
  const freezeWallet = useMutation({
    mutationFn: ({ id, frozen }: { id: string; frozen: boolean }) => renultApi.platformAdmin.freezeWallet(id, frozen),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platformAdmin", "wallets"] });
      toast.success("Wallet status updated.");
    },
  });

  return (
    <PlatformAdminLayout activeSection={activeTab} onSectionChange={changeSection}>
      <div className="space-y-5 px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-6 w-6 text-primary" />
              <h1 className="text-xl font-black">Platform Administration</h1>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Global operations, finance, infrastructure, communications, and access control.
            </p>
          </div>
          <Badge className="border-none bg-primary/10 text-primary">
            {user?.platform_role === "superadmin" ? "Superadmin" : "Subadmin"}
          </Badge>
        </div>

        {activeTab === "overview" && (
            <Overview data={overview.data} loading={overview.isLoading} />
        )}
        {activeTab === "users" && (
            <UsersPanel
              users={usersQuery.data || []}
              loading={usersQuery.isLoading}
              search={userSearch}
              onSearch={setUserSearch}
              onUpdate={(id, payload) => updateUser.mutate({ id, payload })}
              onSyncSubdomain={(id) => syncUserSubdomain.mutate(id)}
              onView={(id) => navigate(`/platform-admin/users/${id}`)}
            />
        )}
        {activeTab === "finance" && (
            <FinancePanel
              initial={settingsQuery.data}
              wallets={walletsQuery.data || []}
              loading={settingsQuery.isLoading}
              onSaved={() => queryClient.invalidateQueries({ queryKey: ["platformAdmin", "settings"] })}
              onFreeze={(id, frozen) => freezeWallet.mutate({ id, frozen })}
            />
        )}
        {activeTab === "broadcasts" && (
            <BroadcastPanel users={usersQuery.data || []} />
        )}
        {activeTab === "voucher_audit" && (
            <VoucherAuditPanel rows={voucherAudit.data || []} search={voucherSearch} onSearch={setVoucherSearch} loading={voucherAudit.isLoading} />
        )}
        {activeTab === "message_diagnostics" && (
          <MessageDiagnosticsPanel
            rows={messageDiagnostics.data || []}
            loading={messageDiagnostics.isLoading}
            search={messageSearch}
            onSearch={setMessageSearch}
            status={messageStatus}
            onStatus={setMessageStatus}
          />
        )}
        {activeTab === "tunnels" && (
            <TunnelsPanel rows={tunnels.data || []} loading={tunnels.isLoading} onToggle={(id, active) => tunnelMutation.mutate({ id, active })} />
        )}
        {activeTab === "storage" && (
            <StoragePanel rows={storage.data || []} loading={storage.isLoading} error={storage.error} prefix={storagePrefix} onPrefix={setStoragePrefix} onDelete={(key) => deleteStorage.mutate(key)} />
        )}
        {activeTab === "dns" && (
            <DnsPanel zones={dnsZones.data || []} records={dnsRecords.data || []} error={dnsZones.error || dnsRecords.error} zoneId={zoneId} onZone={setZoneId} onDelete={(record) => deleteDns.mutate({ zone: zoneId, record })} />
        )}
        {activeTab === "subadmins" && (
            <SubadminsPanel users={usersQuery.data || []} onSave={(id, role, next) => updateSubadmin.mutate({ id, role, permissions: next })} />
        )}
        {activeTab === "system" && (
            <HealthPanel data={health.data} loading={health.isLoading} onRefresh={() => health.refetch()} />
        )}
        {activeTab === "audit" && (
            <AdminAuditPanel rows={adminAudit.data || []} loading={adminAudit.isLoading} />
        )}
      </div>
    </PlatformAdminLayout>
  );
}

function Overview({ data, loading }: { data: Awaited<ReturnType<typeof renultApi.platformAdmin.overview>> | undefined; loading: boolean }) {
  if (loading || !data) return <Loading />;
  const cards = [
    ["Users", `${data.active_users}/${data.users} active`, Users],
    ["Branches", data.branches, Network],
    ["Routers", `${data.tunnels_online}/${data.routers} online`, Wifi],
    ["Vouchers", data.vouchers, FileClock],
    ["Activated", data.activated_vouchers, Activity],
    ["Expired", data.expired_vouchers, Trash2],
    ["Wallet Balance", money(data.wallet_balance), Banknote],
    ["Platform Fees", money(data.platform_fees), Database],
    ["Telegram Admins", data.telegram_admins, Send],
  ] as const;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map(([label, value, Icon]) => (
        <Card key={label} className="shadow-none"><CardContent className="flex items-center justify-between p-5">
          <div><p className="text-xs font-bold text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-black">{value}</p></div>
          <Icon className="h-8 w-8 text-primary/40" />
        </CardContent></Card>
      ))}
      <Card className="shadow-none sm:col-span-2 xl:col-span-3"><CardContent className="flex flex-wrap gap-2 p-4 text-xs">
        <Status label="Cloudflare R2" ok={data.r2_configured} />
        <Status label={`${providerLabel(data.dns_provider)} DNS`} ok={data.dns_configured} />
      </CardContent></Card>
    </div>
  );
}

function UsersPanel({ users, loading, search, onSearch, onUpdate, onSyncSubdomain, onView }: {
  users: PlatformUserResponse[]; loading: boolean; search: string; onSearch: (value: string) => void;
  onUpdate: (id: string, payload: Partial<Pick<PlatformUserResponse, "is_active" | "is_verified" | "allowed_sections" | "account_subdomain" | "subdomain_enabled">>) => void;
  onSyncSubdomain: (id: string) => void;
  onView: (id: string) => void;
}) {
  return <Panel title="Global Users" icon={Users} action={<Input value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Search name, email, phone" className="h-9 w-72" />}>
    {loading ? <Loading /> : <div className="overflow-x-auto"><table className="w-full text-xs">
      <thead><tr className="border-b text-left">{["User", "Phone", "Assets", "Wallet", "Sections", "Account Subdomain", "Status", "Actions"].map((x) => <th key={x} className="p-3">{x}</th>)}</tr></thead>
      <tbody>{users.map((item) => <tr key={item.id} className="border-b align-top">
        <td className="p-3"><p className="font-bold">{item.full_name}</p><p className="text-muted-foreground">{item.email}</p><p className="mt-1">{formatDate(item.created_at)}</p></td>
        <td className="p-3">{item.phone_number || "N/A"}</td>
        <td className="p-3">{item.branches} branches<br />{item.routers} routers<br />{item.vouchers} vouchers</td>
        <td className="p-3 font-bold">{money(item.wallet_balance)}</td>
        <td className="min-w-[280px] p-3"><CheckboxGrid values={item.allowed_sections} options={USER_SECTIONS} onChange={(next) => onUpdate(item.id, { allowed_sections: next })} emptyLabel="All sections" /></td>
        <td className="min-w-[260px] p-3">
          <UserSubdomainControl
            user={item}
            onUpdate={(payload) => onUpdate(item.id, payload)}
            onSync={() => onSyncSubdomain(item.id)}
          />
        </td>
        <td className="p-3"><Status label={item.is_active ? "Active" : "Suspended"} ok={item.is_active} /><div className="mt-2"><Status label={item.is_verified ? "Verified" : "Unverified"} ok={item.is_verified} /></div></td>
        <td className="p-3 space-y-2">
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => onView(item.id)}>View Profile</Button>
          <Button size="sm" variant={item.is_active ? "destructive" : "outline"} className="h-8 text-xs" onClick={() => onUpdate(item.id, { is_active: !item.is_active })}>{item.is_active ? "Suspend" : "Activate"}</Button>
          {!item.is_verified && <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => onUpdate(item.id, { is_verified: true })}>Verify</Button>}
        </td>
      </tr>)}</tbody>
    </table></div>}
  </Panel>;
}

function UserSubdomainControl({
  user,
  onUpdate,
  onSync,
}: {
  user: PlatformUserResponse;
  onUpdate: (payload: Partial<Pick<PlatformUserResponse, "account_subdomain" | "subdomain_enabled">>) => void;
  onSync: () => void;
}) {
  const [subdomain, setSubdomain] = useState(user.account_subdomain || "");

  useEffect(() => {
    setSubdomain(user.account_subdomain || "");
  }, [user.account_subdomain]);

  const normalized = subdomain.trim().toLowerCase();
  const valid = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/.test(normalized);

  return (
    <div className="space-y-2">
      <div className="flex items-center">
        <Input
          value={subdomain}
          onChange={(event) => setSubdomain(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
          placeholder="customer-name"
          className="h-8 rounded-r-none text-xs"
        />
        <span className="flex h-8 items-center rounded-r border border-l-0 bg-muted/40 px-2 text-[10px] text-muted-foreground">
          .{getAccountBaseDomain()}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[10px]"
            disabled={!valid || normalized === user.account_subdomain}
            onClick={() => onUpdate({ account_subdomain: normalized })}
          >
            Assign
          </Button>
          {user.account_subdomain && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[10px]"
                onClick={onSync}
              >
                Sync DNS
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-[10px] text-destructive"
                onClick={() => onUpdate({ account_subdomain: null, subdomain_enabled: false })}
              >
                Remove
              </Button>
            </>
          )}
        </div>
        <label className="flex items-center gap-1.5 text-[10px] font-semibold">
          <input
            type="checkbox"
            checked={user.subdomain_enabled}
            disabled={!user.account_subdomain}
            onChange={(event) => onUpdate({ subdomain_enabled: event.target.checked })}
          />
          Allow login
        </label>
      </div>
    </div>
  );
}

function FinancePanel({ initial, wallets, loading, onSaved, onFreeze }: {
  initial?: PlatformSettingsResponse;
  wallets: Awaited<ReturnType<typeof renultApi.platformAdmin.wallets>>;
  loading: boolean;
  onSaved: () => void;
  onFreeze: (id: string, frozen: boolean) => void;
}) {
  const [form, setForm] = useState<PlatformSettingsResponse | null>(null);
  useEffect(() => { if (initial) setForm(initial); }, [initial]);
  const save = useMutation({
    mutationFn: renultApi.platformAdmin.updateSettings,
    onSuccess: () => { toast.success("Platform fee and voucher settings saved."); onSaved(); },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save settings."),
  });
  if (loading || !form) return <Loading />;
  return <Panel title="Platform Fees, Voucher Defaults & Wallets" icon={Banknote}>
    <div className="grid max-w-4xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Voucher fee type"><select className="h-10 w-full rounded border bg-background px-3 text-sm" value={form.voucher_fee_type} onChange={(e) => setForm({ ...form, voucher_fee_type: e.target.value as "fixed" | "percentage" })}><option value="percentage">Percentage</option><option value="fixed">Fixed UGX</option></select></Field>
      <Field label="Voucher fee value"><Input type="number" value={form.voucher_fee_value} onChange={(e) => setForm({ ...form, voucher_fee_value: Number(e.target.value) })} /></Field>
      <Field label="Deposit fee (%)"><Input type="number" value={form.deposit_fee_percentage} onChange={(e) => setForm({ ...form, deposit_fee_percentage: Number(e.target.value) })} /></Field>
      <Field label="Withdrawal fee (%)"><Input type="number" value={form.withdrawal_fee_percentage} onChange={(e) => setForm({ ...form, withdrawal_fee_percentage: Number(e.target.value) })} /></Field>
      <Field label="Min withdrawal payout (UGX)"><Input type="number" value={form.withdrawal_min_amount} onChange={(e) => setForm({ ...form, withdrawal_min_amount: Number(e.target.value) })} /></Field>
      <Field label="Max withdrawal payout (UGX)"><Input type="number" value={form.withdrawal_max_amount} onChange={(e) => setForm({ ...form, withdrawal_max_amount: Number(e.target.value) })} /></Field>
      <Field label="Default voucher prefix"><Input value={form.voucher_prefix} onChange={(e) => setForm({ ...form, voucher_prefix: e.target.value.toUpperCase() })} /></Field>
      <Field label="Print prefix order"><select className="h-10 w-full rounded border bg-background px-3 text-sm" value={form.voucher_prefix_order} onChange={(e) => setForm({ ...form, voucher_prefix_order: e.target.value as "prefix-first" | "prefix-last" })}><option value="prefix-first">Prefix first</option><option value="prefix-last">Prefix last</option></select></Field>
      <label className="flex items-center gap-2 rounded border p-3 text-sm"><input type="checkbox" checked={form.telegram_access_alerts} onChange={(e) => setForm({ ...form, telegram_access_alerts: e.target.checked })} />Telegram alert for every platform-admin API access</label>
    </div>
    <Button className="mt-5 gap-2" onClick={() => save.mutate(form)} disabled={save.isPending}>{save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save Settings</Button>
    <div className="mt-7"><h3 className="mb-3 text-sm font-bold">Client Wallet Control</h3><SimpleTable headers={["Owner", "Branch", "Balance", "Deposited", "Withdrawn", "Fees", "Status", "Control"]} rows={wallets.map((wallet) => [
      wallet.owner_name,
      wallet.branch_name,
      money(wallet.balance),
      money(wallet.total_deposited),
      money(wallet.total_withdrawn),
      money(wallet.total_fees_paid),
      wallet.is_frozen ? "Frozen" : "Active",
      <Button key={wallet.id} size="sm" variant={wallet.is_frozen ? "outline" : "destructive"} onClick={() => onFreeze(wallet.id, !wallet.is_frozen)}>{wallet.is_frozen ? "Unfreeze" : "Freeze"}</Button>,
    ])} /></div>
  </Panel>;
}

function BroadcastPanel({ users }: { users: PlatformUserResponse[] }) {
  const [channels, setChannels] = useState(["email"]);
  const [all, setAll] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("Hello {name},");
  const templates = {
    announcement: { subject: "Platform announcement", message: "Hello {name},\n\nWe have an important platform announcement." },
    maintenance: { subject: "Scheduled maintenance", message: "Hello {name},\n\nScheduled maintenance will affect platform services. We will notify you when service is restored." },
    account: { subject: "Account notice", message: "Hello {name},\n\nPlease review your Renult account and contact support if you need assistance." },
  };
  const mutation = useMutation({
    mutationFn: renultApi.platformAdmin.broadcast,
    onSuccess: (result) => toast.success(`Sent: ${result.email_sent} email, ${result.sms_sent} SMS. Failed: ${result.failed}.`),
    onError: (error) => toast.error(error instanceof Error ? error.message : "Broadcast failed."),
  });
  return <Panel title="Batch Email & SMS" icon={Mail}>
    <div className="grid max-w-4xl gap-4">
      <Field label="Template"><select className="h-10 w-full rounded border bg-background px-3 text-sm" defaultValue="" onChange={(e) => { const template = templates[e.target.value as keyof typeof templates]; if (template) { setSubject(template.subject); setMessage(template.message); } }}><option value="">Custom message</option><option value="announcement">Announcement</option><option value="maintenance">Maintenance</option><option value="account">Account notice</option></select></Field>
      <div className="flex gap-4">{["email", "sms"].map((channel) => <label key={channel} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={channels.includes(channel)} onChange={() => setChannels((old) => old.includes(channel) ? old.filter((x) => x !== channel) : [...old, channel])} />{channel.toUpperCase()}</label>)}</div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />Send to all active users</label>
      {!all && <div className="max-h-48 overflow-y-auto rounded border p-3"><CheckboxGrid values={selected} options={users.map((x) => x.id)} labels={Object.fromEntries(users.map((x) => [x.id, `${x.full_name} (${x.email})`]))} onChange={setSelected} /></div>}
      <Field label="Subject"><Input value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
      <Field label="Message template"><textarea className="min-h-36 w-full rounded border bg-background p-3 text-sm" value={message} onChange={(e) => setMessage(e.target.value)} /><p className="text-xs text-muted-foreground">Available placeholders: {"{name}"}, {"{email}"}</p></Field>
      <Button className="w-fit gap-2" disabled={mutation.isPending || !subject || !message || channels.length === 0} onClick={() => mutation.mutate({ channels, user_ids: selected, send_to_all: all, subject, message })}><Send className="h-4 w-4" />Send Broadcast</Button>
    </div>
  </Panel>;
}

function VoucherAuditPanel({ rows, search, onSearch, loading }: { rows: Awaited<ReturnType<typeof renultApi.platformAdmin.voucherAudit>>; search: string; onSearch: (v: string) => void; loading: boolean }) {
  return <Panel title="Voucher Activation Audit" icon={FileClock} action={<Input value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Voucher, router, event" className="h-9 w-64" />}>
    {loading ? <Loading /> : <SimpleTable headers={["Time", "Voucher", "Router", "Event", "Status", "Activated", "Expires"]} rows={rows.map((x) => [formatDate(x.created_at), x.voucher_code, x.router_name, x.event, `${x.previous_status || "NEW"} → ${x.new_status}`, formatDate(x.activated_at), formatDate(x.expires_at)])} />}
  </Panel>;
}

function MessageDiagnosticsPanel({
  rows,
  loading,
  search,
  onSearch,
  status,
  onStatus,
}: {
  rows: Awaited<ReturnType<typeof renultApi.platformAdmin.messageDiagnostics>>;
  loading: boolean;
  search: string;
  onSearch: (value: string) => void;
  status: string;
  onStatus: (value: string) => void;
}) {
  const action = (
    <div className="flex gap-2">
      <Input
        value={search}
        onChange={(event) => onSearch(event.target.value)}
        placeholder="Branch, sender, message, error"
        className="h-9 w-64"
      />
      <select
        value={status}
        onChange={(event) => onStatus(event.target.value)}
        className="h-9 rounded border bg-background px-3 text-xs"
      >
        <option value="all">All statuses</option>
        <option value="completed">Completed</option>
        <option value="partial">Partial</option>
        <option value="failed">Failed</option>
        <option value="sending">Sending</option>
      </select>
    </div>
  );
  return (
    <Panel title="SMS Delivery Diagnostics" icon={MessageSquareWarning} action={action}>
      {loading ? <Loading /> : (
        <SimpleTable
          headers={["Time", "Branch / Sender", "Message", "Recipients", "Delivery", "Charge", "Failure / Provider"]}
          rows={rows.map((row) => [
            formatDate(row.created_at),
            <div key={`${row.id}-owner`}><b>{row.branch_name}</b><p className="text-muted-foreground">{row.user_name}</p></div>,
            <div key={`${row.id}-message`} className="max-w-xs"><Badge variant="outline" className="mb-1 text-[9px]">{row.message_type}</Badge><p>{row.message}</p></div>,
            <div key={`${row.id}-recipients`}><b>{row.recipients.length}</b><p className="max-w-xs break-all text-[10px] text-muted-foreground">{row.recipients.join(", ")}</p></div>,
            <div key={`${row.id}-status`}><Badge variant="outline">{row.status}</Badge><p className="mt-1 text-emerald-600">{row.sent} sent</p><p className="text-destructive">{row.failed} failed</p></div>,
            <div key={`${row.id}-charge`}>{money(row.total_charged)}<p className="text-muted-foreground">Balance {money(row.wallet_balance)}</p></div>,
            <div key={`${row.id}-error`} className="max-w-sm">
              {row.error ? <p className="font-semibold text-destructive">{row.error}</p> : <p className="text-emerald-600">No stored error</p>}
              {row.results.some((result) => !result.success) && (
                <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-[9px]">
                  {JSON.stringify(row.results.filter((result) => !result.success), null, 2)}
                </pre>
              )}
            </div>,
          ])}
        />
      )}
    </Panel>
  );
}

function TunnelsPanel({ rows, loading, onToggle }: { rows: Awaited<ReturnType<typeof renultApi.platformAdmin.tunnels>>; loading: boolean; onToggle: (id: string, active: boolean) => void }) {
  return <Panel title="Tunnel Control" icon={Network}>
    {loading ? <Loading /> : <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b text-left">{["Router", "Owner", "Status", "Tunnel", "Ports", "Last Seen", "Control"].map((x) => <th key={x} className="p-3">{x}</th>)}</tr></thead><tbody>{rows.map((x) => <tr key={x.id} className="border-b">
      <td className="p-3 font-bold">{x.router_name}<p className="font-normal text-muted-foreground">{x.branch_name}</p></td><td className="p-3">{x.owner_name}</td>
      <td className="p-3"><Status label={x.status} ok={["connected", "online"].includes(x.status)} /><p className="mt-1">Heartbeat: {x.heartbeat_status}</p><p>SNMP: {x.snmp_status}</p></td>
      <td className="p-3 font-mono">{x.tunnel_ip || "Not provisioned"}<p>{x.ppp_username || ""}</p></td><td className="p-3">API {x.nat_port || "N/A"}<br />Winbox {x.winbox_nat_port || "N/A"}</td><td className="p-3">{formatDate(x.last_seen)}</td>
      <td className="p-3"><Button size="sm" variant="outline" onClick={() => onToggle(x.id, !x.is_active)}>{x.is_active ? "Disable" : "Enable"}</Button></td>
    </tr>)}</tbody></table></div>}
  </Panel>;
}

function StoragePanel({ rows, loading, error, prefix, onPrefix, onDelete }: { rows: Awaited<ReturnType<typeof renultApi.platformAdmin.storage>>; loading: boolean; error: unknown; prefix: string; onPrefix: (v: string) => void; onDelete: (key: string) => void }) {
  return <Panel title="Cloudflare R2 Files" icon={HardDrive} action={<Input value={prefix} onChange={(e) => onPrefix(e.target.value)} placeholder="Folder prefix" className="h-9 w-64" />}>
    {error ? <ErrorText error={error} /> : loading ? <Loading /> : <div className="space-y-2">{rows.map((x) => <div key={x.key} className="flex items-center justify-between gap-3 rounded border p-3 text-xs"><div className="min-w-0"><a href={x.url} target="_blank" rel="noreferrer" className="font-mono font-bold text-primary break-all">{x.key}</a><p className="text-muted-foreground">{(x.size / 1024).toFixed(1)} KB · {formatDate(x.last_modified)}</p></div><Button size="icon" variant="ghost" className="text-destructive" onClick={() => window.confirm(`Delete ${x.key}?`) && onDelete(x.key)}><Trash2 className="h-4 w-4" /></Button></div>)}</div>}
  </Panel>;
}

function DnsPanel({ zones, records, error, zoneId, onZone, onDelete }: { zones: Awaited<ReturnType<typeof renultApi.platformAdmin.dnsZones>>; records: Awaited<ReturnType<typeof renultApi.platformAdmin.dnsRecords>>; error: unknown; zoneId: string; onZone: (v: string) => void; onDelete: (id: string) => void }) {
  const queryClient = useQueryClient();
  const provider = zones[0]?.provider;
  const [record, setRecord] = useState({ name: "", type: "A", content: "", ttl: 3600, disabled: false, proxied: false });
  const create = useMutation({
    mutationFn: () => renultApi.platformAdmin.createDnsRecord(zoneId, record),
    onSuccess: () => {
      toast.success("DNS record created.");
      setRecord({ name: "", type: "A", content: "", ttl: 3600, disabled: false, proxied: false });
      queryClient.invalidateQueries({ queryKey: ["platformAdmin", "dnsRecords", zoneId] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not create DNS record."),
  });
  return <Panel title={`${providerLabel(provider)} DNS Management`} icon={Globe2}>
    {error ? <ErrorText error={error} /> : <><select className="mb-4 h-10 min-w-72 rounded border bg-background px-3 text-sm" value={zoneId} onChange={(e) => onZone(e.target.value)}><option value="">Select zone</option>{zones.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
      {zoneId && <div className="mb-4 grid gap-2 rounded border p-3 sm:grid-cols-5"><Input placeholder="Name" value={record.name} onChange={(e) => setRecord({ ...record, name: e.target.value })} /><select className="h-10 rounded border bg-background px-2 text-sm" value={record.type} onChange={(e) => setRecord({ ...record, type: e.target.value })}>{["A", "AAAA", "CNAME", "TXT", "MX"].map((type) => <option key={type}>{type}</option>)}</select><Input placeholder="Content" value={record.content} onChange={(e) => setRecord({ ...record, content: e.target.value })} /><Input type="number" value={record.ttl} onChange={(e) => setRecord({ ...record, ttl: Number(e.target.value) })} /><Button disabled={!record.name || !record.content || create.isPending} onClick={() => create.mutate()}>Add Record</Button>{provider === "cloudflare" && <label className="flex items-center gap-2 text-xs sm:col-span-5"><input type="checkbox" checked={record.proxied} onChange={(e) => setRecord({ ...record, proxied: e.target.checked })} />Proxy supported A, AAAA, and CNAME records through Cloudflare</label>}</div>}
      {zoneId && <SimpleTable headers={["Name", "Type", "Content", "TTL", "Proxy", "Action"]} rows={records.map((x) => [x.name, x.type, x.content, x.ttl, x.proxied == null ? "N/A" : x.proxied ? "Proxied" : "DNS only", <Button key={x.id} size="icon" variant="ghost" className="text-destructive" onClick={() => window.confirm(`Delete ${x.name} ${x.type}?`) && onDelete(x.id)}><Trash2 className="h-4 w-4" /></Button>])} />}</>}
  </Panel>;
}

function SubadminsPanel({ users, onSave }: { users: PlatformUserResponse[]; onSave: (id: string, role: "subadmin" | "none", permissions: string[]) => void }) {
  const [drafts, setDrafts] = useState<Record<string, string[]>>({});
  const candidates = users.filter((x) => x.platform_role !== "superadmin");
  return <Panel title="Subadmin Privileges" icon={UserCog}><div className="space-y-3">{candidates.map((item) => {
    const values = drafts[item.id] || item.platform_permissions;
    return <Card key={item.id} className="shadow-none"><CardContent className="p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-bold">{item.full_name}</p><p className="text-xs text-muted-foreground">{item.email}</p></div><Badge variant="outline">{item.platform_role || "User"}</Badge></div>
      <div className="mt-3"><CheckboxGrid values={values} options={ADMIN_PERMISSIONS} onChange={(next) => setDrafts((old) => ({ ...old, [item.id]: next }))} /></div>
      <div className="mt-3 flex gap-2"><Button size="sm" onClick={() => onSave(item.id, "subadmin", values)}>Save Subadmin</Button>{item.platform_role === "subadmin" && <Button size="sm" variant="destructive" onClick={() => onSave(item.id, "none", [])}>Remove</Button>}</div>
    </CardContent></Card>;
  })}</div></Panel>;
}

function HealthPanel({ data, loading, onRefresh }: { data: Awaited<ReturnType<typeof renultApi.platformAdmin.health>> | undefined; loading: boolean; onRefresh: () => void }) {
  if (loading || !data) return <Loading />;
  const services = [["Database", data.database], ["Cloudflare R2", data.r2], [`${providerLabel(data.dns_provider)} DNS`, data.dns], ["Email", data.email], ["SMS", data.sms], ["Payments", data.payment_gateway]];
  return <Panel title="System Health" icon={Activity} action={<Button size="sm" variant="outline" onClick={onRefresh}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>}>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{services.map(([name, value]) => <Card key={name} className="shadow-none"><CardContent className="p-4"><p className="text-xs font-bold text-muted-foreground">{name}</p><p className="mt-2 font-bold">{value}</p></CardContent></Card>)}</div>
    <div className="mt-4 rounded border p-4 text-sm"><p>Concentrator: <b>{data.concentrator_enabled ? "Enabled" : "Disabled"}</b></p><p>SNMP monitoring: <b>{data.snmp_monitor_enabled ? "Enabled" : "Disabled"}</b></p><p>Router errors in 24h: <b>{data.router_errors_24h}</b></p>{data.last_router_error && <p className="mt-2 text-destructive">{data.last_router_error}</p>}</div>
  </Panel>;
}

function AdminAuditPanel({ rows, loading }: { rows: Awaited<ReturnType<typeof renultApi.platformAdmin.audit>>; loading: boolean }) {
  return <Panel title="Platform Admin Audit" icon={ShieldCheck}>{loading ? <Loading /> : <SimpleTable headers={["Time", "Admin", "Action", "Target", "Details"]} rows={rows.map((x) => [formatDate(x.created_at), x.actor_name || "System", x.action, `${x.target_type}${x.target_id ? ` / ${x.target_id}` : ""}`, JSON.stringify(x.details || {})])} />}</Panel>;
}

function Panel({ title, icon: Icon, action, children }: { title: string; icon: typeof Users; action?: React.ReactNode; children: React.ReactNode }) {
  return <Card className="shadow-none"><CardHeader className="flex flex-row items-center justify-between gap-3"><CardTitle className="flex items-center gap-2 text-sm"><Icon className="h-4 w-4 text-primary" />{title}</CardTitle>{action}</CardHeader><CardContent>{children}</CardContent></Card>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}

function providerLabel(provider?: string) {
  if (provider === "cloudflare") return "Cloudflare";
  if (provider === "ionos") return "IONOS";
  return "Provider";
}

function Status({ label, ok }: { label: string; ok: boolean }) {
  return <Badge className={cn("border-none text-[10px]", ok ? "bg-emerald-500/10 text-emerald-700" : "bg-red-500/10 text-red-700")}>{label}</Badge>;
}

function CheckboxGrid({ values, options, labels, onChange, emptyLabel }: { values: string[]; options: readonly string[]; labels?: Record<string, string>; onChange: (next: string[]) => void; emptyLabel?: string }) {
  return <div><div className="flex flex-wrap gap-x-3 gap-y-2">{options.map((option) => <label key={option} className="flex items-center gap-1.5 text-[11px]"><input type="checkbox" checked={values.includes(option)} onChange={() => onChange(values.includes(option) ? values.filter((x) => x !== option) : [...values, option])} />{labels?.[option] || option}</label>)}</div>{values.length === 0 && emptyLabel && <p className="mt-2 text-[10px] text-muted-foreground">{emptyLabel}</p>}</div>;
}

function SimpleTable({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  if (rows.length === 0) {
    return <div className="rounded border border-dashed p-8 text-center text-sm text-muted-foreground">No records found.</div>;
  }
  return <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b text-left">{headers.map((x) => <th key={x} className="p-3">{x}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index} className="border-b">{row.map((cell, cellIndex) => <td key={cellIndex} className="max-w-sm break-words p-3">{cell}</td>)}</tr>)}</tbody></table></div>;
}

function Loading() {
  return <div className="flex h-40 items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading platform data...</div>;
}

function ErrorText({ error }: { error: unknown }) {
  return <div className="rounded border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">{error instanceof Error ? error.message : "Service is unavailable or not configured."}</div>;
}

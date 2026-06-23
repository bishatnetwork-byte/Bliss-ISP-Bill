import {
  PlatformAllTransactionResponse,
  PlatformLedgerEntryFullResponse,
  PlatformLoginAttemptResponse,
  PlatformNotificationResponse,
  PlatformSessionResponse,
  PlatformSettingsResponse,
  PlatformUserResponse,
  getAccountBaseDomain,
  renultApi,
} from "@/api/foreform";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  Bell,
  Calculator,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Database,
  FileClock,
  Globe2,
  HardDrive,
  KeyRound,
  Loader2,
  Mail,
  MessageSquareWarning,
  Network,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  Snowflake,
  Trash2,
  TrendingDown,
  TrendingUp,
  UserCog,
  UserPlus,
  Users,
  Wifi
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import ReportsPanel from "../AdminMode/Reports";
import PlatformAdminLayout, { PlatformAdminSection } from "./PlatformAdminLayout";

const ADMIN_TABS = [
  ["overview", "Overview"],
  ["users", "Users"],
  ["finance", "Fees"],
  ["admin_shares", "Admin Shares"],
  ["broadcasts", "Broadcasts"],
  ["voucher_audit", "Voucher Audit"],
  ["message_diagnostics", "Message Diagnostics"],
  ["tunnels", "Tunnels"],
  ["storage", "Cloud Files"],
  ["dns", "DNS"],
  ["subadmins", "Subadmins"],
  ["sessions", "Sessions & Logins"],
  ["notifications", "Notifications"],
  ["system", "Health"],
  ["audit", "Admin Audit"],
  ["reports", "Reports"],
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
    staleTime: 30 * 1000,
  });
  const [userSearch, setUserSearch] = useState("");
  const usersQuery = useQuery({
    queryKey: ["platformAdmin", "users", userSearch],
    queryFn: () => renultApi.platformAdmin.users(userSearch),
    enabled: (activeTab === "users" || activeTab === "subadmins" || activeTab === "admin_shares" || activeTab === "broadcasts" || activeTab === "reports")
      && (permissions.has("users") || permissions.has("subadmins") || permissions.has("admin_shares") || permissions.has("broadcasts") || permissions.has("reports")),
    staleTime: 30 * 1000,
  });
  const settingsQuery = useQuery({
    queryKey: ["platformAdmin", "settings"],
    queryFn: renultApi.platformAdmin.settings,
    enabled: activeTab === "finance" && permissions.has("finance"),
    staleTime: 60 * 1000,
  });
  const walletsQuery = useQuery({
    queryKey: ["platformAdmin", "wallets"],
    queryFn: renultApi.platformAdmin.wallets,
    enabled: activeTab === "finance" && permissions.has("finance"),
    staleTime: 30 * 1000,
  });
  const ledgerQuery = useQuery({
    queryKey: ["platformAdmin", "ledger"],
    queryFn: () => renultApi.wallets.platformLedger(),
    enabled: activeTab === "finance" && permissions.has("finance"),
    staleTime: 30 * 1000,
  });
  const allTxnsQuery = useQuery({
    queryKey: ["platformAdmin", "allTransactions"],
    queryFn: () => renultApi.wallets.platformAllTransactions(),
    enabled: (activeTab === "finance" && permissions.has("finance")) || (activeTab === "reports" && permissions.has("reports")),
    staleTime: 30 * 1000,
  });
  const tunnels = useQuery({
    queryKey: ["platformAdmin", "tunnels"],
    queryFn: renultApi.platformAdmin.tunnels,
    enabled: activeTab === "tunnels" && permissions.has("tunnels"),
    refetchInterval: 30000,
    staleTime: 15 * 1000,
  });
  const [voucherSearch, setVoucherSearch] = useState("");
  const voucherAudit = useQuery({
    queryKey: ["platformAdmin", "voucherAudit", voucherSearch],
    queryFn: () => renultApi.platformAdmin.voucherAudit(voucherSearch),
    enabled: (activeTab === "voucher_audit" && permissions.has("voucher_audit")) || (activeTab === "reports" && permissions.has("reports")),
    staleTime: 30 * 1000,
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
    staleTime: 30 * 1000,
  });
  const [storagePrefix, setStoragePrefix] = useState("");
  const storage = useQuery({
    queryKey: ["platformAdmin", "storage", storagePrefix],
    queryFn: () => renultApi.platformAdmin.storage(storagePrefix),
    enabled: activeTab === "storage" && permissions.has("storage"),
    retry: false,
    staleTime: 30 * 1000,
  });
  const dnsZones = useQuery({
    queryKey: ["platformAdmin", "dnsZones"],
    queryFn: renultApi.platformAdmin.dnsZones,
    enabled: activeTab === "dns" && permissions.has("dns"),
    retry: false,
    staleTime: 60 * 1000,
  });
  const [zoneId, setZoneId] = useState("");
  const dnsRecords = useQuery({
    queryKey: ["platformAdmin", "dnsRecords", zoneId],
    queryFn: () => renultApi.platformAdmin.dnsRecords(zoneId),
    enabled: activeTab === "dns" && !!zoneId && permissions.has("dns"),
    retry: false,
    staleTime: 30 * 1000,
  });
  const health = useQuery({
    queryKey: ["platformAdmin", "health"],
    queryFn: renultApi.platformAdmin.health,
    enabled: activeTab === "system" && permissions.has("system"),
    refetchInterval: 30000,
    staleTime: 15 * 1000,
  });
  const adminAudit = useQuery({
    queryKey: ["platformAdmin", "audit"],
    queryFn: renultApi.platformAdmin.audit,
    enabled: (activeTab === "audit" && permissions.has("audit")) || (activeTab === "reports" && permissions.has("reports")),
    staleTime: 30 * 1000,
  });
  const sessionsQuery = useQuery({
    queryKey: ["platformAdmin", "sessions"],
    queryFn: () => renultApi.platformAdmin.sessions(),
    enabled: activeTab === "sessions" && permissions.has("sessions"),
    staleTime: 30 * 1000,
  });
  const loginAttemptsQuery = useQuery({
    queryKey: ["platformAdmin", "loginAttempts"],
    queryFn: () => renultApi.platformAdmin.loginAttempts(),
    enabled: activeTab === "sessions" && permissions.has("sessions"),
    staleTime: 30 * 1000,
  });
  const notificationsQuery = useQuery({
    queryKey: ["platformAdmin", "notifications"],
    queryFn: () => renultApi.platformAdmin.notifications(),
    enabled: activeTab === "notifications" && permissions.has("notifications"),
    staleTime: 30 * 1000,
  });

  const updateUser = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof renultApi.platformAdmin.updateUser>[1] }) =>
      renultApi.platformAdmin.updateUser(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platformAdmin", "users"] });
      queryClient.invalidateQueries({ queryKey: ["platformAdmin", "overview"] });
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
    mutationFn: ({ id, role, permissions: next, platform_fee_share_percentage = 0 }: { id: string; role: "subadmin" | "none"; permissions: string[]; platform_fee_share_percentage?: number }) =>
      renultApi.platformAdmin.updateSubadmin(id, { role, permissions: next, platform_fee_share_percentage }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platformAdmin", "users"] });
      queryClient.invalidateQueries({ queryKey: ["platformAdmin", "overview"] });
      toast.success("Platform admin privileges updated.");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not update subadmin."),
  });
  const tunnelMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => renultApi.platformAdmin.setTunnelActive(id, active),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platformAdmin", "tunnels"] });
      queryClient.invalidateQueries({ queryKey: ["platformAdmin", "overview"] });
    },
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
      queryClient.invalidateQueries({ queryKey: ["platformAdmin", "overview"] });
      toast.success("Wallet status updated.");
    },
  });
  const createUser = useMutation({
    mutationFn: renultApi.platformAdmin.createUser,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["platformAdmin", "users"] });
      queryClient.invalidateQueries({ queryKey: ["platformAdmin", "overview"] });
      toast.success(result.temp_password ? `User created. Temp password: ${result.temp_password}` : "User created.");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not create user."),
  });
  const deleteUser = useMutation({
    mutationFn: renultApi.platformAdmin.deleteUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platformAdmin", "users"] });
      queryClient.invalidateQueries({ queryKey: ["platformAdmin", "overview"] });
      toast.success("User removed.");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not remove user."),
  });
  const blockUser = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { permanent: boolean; blocked_until?: string | null } }) =>
      renultApi.platformAdmin.blockUser(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platformAdmin", "users"] });
      queryClient.invalidateQueries({ queryKey: ["platformAdmin", "overview"] });
      toast.success("User blocked.");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not block user."),
  });
  const unblockUser = useMutation({
    mutationFn: renultApi.platformAdmin.unblockUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platformAdmin", "users"] });
      queryClient.invalidateQueries({ queryKey: ["platformAdmin", "overview"] });
      toast.success("User unblocked.");
    },
  });
  const resetUserPassword = useMutation({
    mutationFn: renultApi.platformAdmin.resetUserPassword,
    onSuccess: (result) => toast.success(`Temp password: ${result.temp_password}`),
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not reset password."),
  });
  const revokeSession = useMutation({
    mutationFn: renultApi.platformAdmin.revokeSession,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platformAdmin", "sessions"] });
      queryClient.invalidateQueries({ queryKey: ["platformAdmin", "overview"] });
      toast.success("Session revoked.");
    },
  });
  const deleteNotification = useMutation({
    mutationFn: renultApi.platformAdmin.deleteNotification,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["platformAdmin", "notifications"] }),
  });
  const clearNotifications = useMutation({
    mutationFn: renultApi.platformAdmin.clearNotifications,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["platformAdmin", "notifications"] });
      toast.success(result.message);
    },
  });
  const deleteMessageDiagnostic = useMutation({
    mutationFn: renultApi.platformAdmin.deleteMessageDiagnostic,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["platformAdmin", "messageDiagnostics"] }),
  });
  const clearMessageDiagnostics = useMutation({
    mutationFn: renultApi.platformAdmin.clearMessageDiagnostics,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["platformAdmin", "messageDiagnostics"] });
      toast.success(result.message);
    },
  });

  return (
    <PlatformAdminLayout activeSection={activeTab} onSectionChange={changeSection}>
      <div className="space-y-5 px-4 py-6 sm:px-6">

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
            onCreate={(payload) => createUser.mutate(payload)}
            onDelete={(id) => deleteUser.mutate(id)}
            onBlock={(id, payload) => blockUser.mutate({ id, payload })}
            onUnblock={(id) => unblockUser.mutate(id)}
            onResetPassword={(id) => resetUserPassword.mutate(id)}
          />
        )}
        {activeTab === "finance" && (
          <FinancePanel
            initial={settingsQuery.data}
            wallets={walletsQuery.data || []}
            ledger={ledgerQuery.data || []}
            allTransactions={allTxnsQuery.data || []}
            loading={settingsQuery.isLoading || ledgerQuery.isLoading || allTxnsQuery.isLoading}
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
            onDelete={(id) => deleteMessageDiagnostic.mutate(id)}
            onClearAll={() => window.confirm("Clear all message log entries?") && clearMessageDiagnostics.mutate()}
          />
        )}
        {activeTab === "tunnels" && (
          <TunnelsPanel rows={tunnels.data || []} loading={tunnels.isLoading} onToggle={(id, active) => tunnelMutation.mutate({ id, active })} />
        )}
        {activeTab === "storage" && (
          <StoragePanel rows={storage.data || []} loading={storage.isLoading} error={storage.error} prefix={storagePrefix} onPrefix={setStoragePrefix} onDelete={(key) => deleteStorage.mutate(key)} />
        )}
        {activeTab === "dns" && (
          <DnsPanel zones={dnsZones.data || []} records={dnsRecords.data || []} error={dnsZones.error || dnsRecords.error} zoneId={zoneId} onZone={setZoneId} onDelete={(record) => deleteDns.mutate({ zone: zoneId, record })} loading={dnsZones.isLoading || (!!zoneId && dnsRecords.isLoading)} />
        )}
        {activeTab === "subadmins" && (
          <SubadminsPanel users={usersQuery.data || []} onSave={(id, role, next, share) => updateSubadmin.mutate({ id, role, permissions: next, platform_fee_share_percentage: share })} loading={usersQuery.isLoading} />
        )}
        {activeTab === "admin_shares" && (
          <AdminSharesPanel users={usersQuery.data || []} onSave={(id, role, next, share) => updateSubadmin.mutate({ id, role, permissions: next, platform_fee_share_percentage: share })} loading={usersQuery.isLoading} />
        )}
        {activeTab === "sessions" && (
          <SessionsPanel
            sessions={sessionsQuery.data || []}
            loginAttempts={loginAttemptsQuery.data || []}
            loading={sessionsQuery.isLoading || loginAttemptsQuery.isLoading}
            onRevoke={(id) => revokeSession.mutate(id)}
          />
        )}
        {activeTab === "notifications" && (
          <NotificationsPanel
            rows={notificationsQuery.data || []}
            loading={notificationsQuery.isLoading}
            onDelete={(id) => deleteNotification.mutate(id)}
            onClearAll={() => window.confirm("Clear all notifications?") && clearNotifications.mutate()}
          />
        )}
        {activeTab === "system" && (
          <HealthPanel data={health.data} loading={health.isLoading} onRefresh={() => health.refetch()} />
        )}
        {activeTab === "audit" && (
          <AdminAuditPanel rows={adminAudit.data || []} loading={adminAudit.isLoading} />
        )}
        {activeTab === "reports" && (
          <ReportsPanel
            users={usersQuery.data || []}
            transactions={allTxnsQuery.data || []}
            audit={adminAudit.data || []}
            voucherAudit={voucherAudit.data || []}
            loading={usersQuery.isLoading || allTxnsQuery.isLoading || adminAudit.isLoading || voucherAudit.isLoading}
          />
        )}
      </div>
    </PlatformAdminLayout>
  );
}

function Overview({ data, loading }: { data: Awaited<ReturnType<typeof renultApi.platformAdmin.overview>> | undefined; loading: boolean }) {
  if (loading || !data) return <Loading type="overview" />;
  const unactivatedVouchers = Math.max(0, data.vouchers - data.activated_vouchers - data.expired_vouchers);
  const offlineRouters = Math.max(0, data.routers - data.tunnels_online);
  const statusSegments = [
    { label: "Activated", value: data.activated_vouchers, className: "bg-[#2b292d]" },
    { label: "Expired", value: data.expired_vouchers, className: "bg-[#6f6b6b]" },
    { label: "Unactivated", value: unactivatedVouchers, className: "bg-[#e8df55]" },
  ];
  const activityBars = [
    { label: "Users", value: data.users },
    { label: "Active", value: data.active_users },
    { label: "Branches", value: data.branches },
    { label: "Routers", value: data.routers },
    { label: "Online", value: data.tunnels_online },
    { label: "Vouchers", value: data.vouchers },
    { label: "Activated", value: data.activated_vouchers },
    { label: "Expired", value: data.expired_vouchers },
  ];
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
        <div className="grid gap-4 sm:grid-cols-3">
          <OverviewMetric label="Total Users" value={data.users.toLocaleString()} detail={`${data.active_users.toLocaleString()} active`} icon={Users} />
          <OverviewMetric label="Branches" value={data.branches.toLocaleString()} detail={`${data.routers.toLocaleString()} routers managed`} icon={Network} />
          <OverviewMetric label="Online Routers" value={data.tunnels_online.toLocaleString()} detail={`${offlineRouters.toLocaleString()} offline`} icon={Wifi} />
          <div className="sm:col-span-3 rounded border border-border/30 bg-card p-5">
            <div className="flex items-center justify-between border-b border-foreground/80 pb-3">
              <h2 className="text-sm font-black">Voucher Status</h2>
              <span className="text-[10px] font-bold uppercase text-muted-foreground">{data.vouchers.toLocaleString()} total units</span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              <OverviewStatusValue label="Activated" value={data.activated_vouchers} accent="border-l-[#2b292d]" />
              <OverviewStatusValue label="Expired" value={data.expired_vouchers} accent="border-l-[#6f6b6b]" />
              <OverviewStatusValue label="Unactivated" value={unactivatedVouchers} accent="border-l-[#e8df55]" />
              <OverviewStatusValue label="Active Users" value={data.active_users} accent="border-l-primary" />
            </div>
            <SegmentBar segments={statusSegments} total={Math.max(data.vouchers, 1)} />
          </div>
        </div>

        <div className="rounded border border-border/30 bg-card p-5">
          <div className="border-b border-foreground/20 pb-4">
            <p className="text-[10px] font-black uppercase text-muted-foreground">Wallet Balance</p>
            <p className="mt-2 text-xl font-black">{money(data.wallet_balance)}</p>
          </div>
          <div className="border-b border-foreground/20 py-4">
            <p className="text-[10px] font-black uppercase text-muted-foreground">Platform Fees</p>
            <p className="mt-2 text-xl font-black">{money(data.platform_fees)}</p>
          </div>
          <div className="border-b border-foreground/20 py-4">
            <p className="text-[10px] font-black uppercase text-muted-foreground">My Fee Share</p>
            <p className="mt-2 text-xl font-black">{money(data.my_platform_fee_share_amount)}</p>
            <p className="mt-1 text-[11px] font-semibold text-muted-foreground">{data.my_platform_fee_share_percentage}% of platform fees</p>
          </div>
          <div className="border-b border-foreground/20 py-4">
            <p className="text-[10px] font-black uppercase text-muted-foreground">Admin Channels</p>
            <p className="mt-2 text-xl font-black">{data.telegram_admins.toLocaleString()}</p>
          </div>
          <div className="border-b border-foreground/20 py-4">
            <p className="text-[10px] font-black uppercase text-muted-foreground">Assigned Share</p>
            <p className="mt-2 text-xl font-black">{data.assigned_platform_fee_share_percentage}%</p>
            <p className="mt-1 text-[11px] font-semibold text-muted-foreground">{data.unassigned_platform_fee_share_percentage}% unassigned</p>
          </div>
          <div className="pt-4">
            <p className="text-[10px] font-black uppercase text-muted-foreground">Core Services</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Status label="Cloudflare R2" ok={data.r2_configured} />
              <Status label={`${providerLabel(data.dns_provider)} DNS`} ok={data.dns_configured} />
            </div>
          </div>
        </div>
      </div>

      <div className="rounded border border-border/30 bg-card p-5">
        <div className="flex flex-col gap-2 border-b border-foreground/80 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-black">Platform Activity</h2>
          <div className="flex items-center gap-3 text-[10px] font-bold text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 bg-[#2b292d]" /> Count</span>
            <span>Live snapshot</span>
          </div>
        </div>
        <OverviewBarChart bars={activityBars} />
      </div>
    </div>
  );
}

function OverviewMetric({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof Users }) {
  return (
    <div className="rounded border border-border/30 bg-card p-5">
      <Icon className="h-5 w-5 text-foreground" />
      <p className="mt-6 text-[10px] font-black uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-black tracking-tight">{value}</p>
      <p className="mt-1 text-[11px] font-semibold text-muted-foreground">{detail}</p>
    </div>
  );
}

function OverviewStatusValue({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className={cn("border-l-2 pl-3", accent)}>
      <p className="text-base font-black">{value.toLocaleString()}</p>
      <p className="text-[10px] font-bold uppercase text-muted-foreground">{label}</p>
    </div>
  );
}

function SegmentBar({ segments, total }: { segments: { label: string; value: number; className: string }[]; total: number }) {
  return (
    <div className="mt-5">
      <div className="flex h-5 overflow-hidden rounded-sm bg-muted">
        {segments.map((segment) => (
          <div
            key={segment.label}
            className={segment.className}
            style={{ width: `${Math.max(4, (segment.value / total) * 100)}%` }}
            title={`${segment.label}: ${segment.value.toLocaleString()}`}
          />
        ))}
      </div>
    </div>
  );
}

function OverviewBarChart({ bars }: { bars: { label: string; value: number }[] }) {
  const max = Math.max(...bars.map((bar) => bar.value), 1);
  return (
    <div className="mt-6 flex h-64 items-end gap-3 border-b border-border/60 px-1">
      {bars.map((bar) => (
        <div key={bar.label} className="flex min-w-0 flex-1 flex-col items-center gap-2">
          <div
            className="w-full max-w-12 rounded-t-sm bg-[#2b292d] transition-colors hover:bg-primary"
            style={{ height: `${Math.max(8, (bar.value / max) * 210)}px` }}
            title={`${bar.label}: ${bar.value.toLocaleString()}`}
          />
          <span className="text-[10px] font-bold text-muted-foreground">{bar.label}</span>
        </div>
      ))}
    </div>
  );
}

function UsersPanel({ users, loading, search, onSearch, onUpdate, onSyncSubdomain, onView, onCreate, onDelete, onBlock, onUnblock, onResetPassword }: {
  users: PlatformUserResponse[]; loading: boolean; search: string; onSearch: (value: string) => void;
  onUpdate: (id: string, payload: Partial<Pick<PlatformUserResponse, "is_active" | "is_verified" | "allowed_sections" | "account_subdomain" | "subdomain_enabled">>) => void;
  onSyncSubdomain: (id: string) => void;
  onView: (id: string) => void;
  onCreate: (payload: { email: string; full_name: string; phone_number?: string }) => void;
  onDelete: (id: string) => void;
  onBlock: (id: string, payload: { permanent: boolean; blocked_until?: string | null }) => void;
  onUnblock: (id: string) => void;
  onResetPassword: (id: string) => void;
}) {
  const handleCreate = () => {
    const full_name = window.prompt("Full name for the new user:");
    if (!full_name) return;
    const email = window.prompt("Email address:");
    if (!email) return;
    const phone_number = window.prompt("Phone number (optional):") || undefined;
    onCreate({ full_name, email, phone_number });
  };
  const handleBlock = (id: string) => {
    const permanent = window.confirm("Block permanently? Cancel to set a temporary block instead.");
    if (permanent) {
      onBlock(id, { permanent: true });
      return;
    }
    const days = window.prompt("Block for how many days?", "7");
    if (!days || isNaN(Number(days))) return;
    const blocked_until = new Date(Date.now() + Number(days) * 86400000).toISOString();
    onBlock(id, { permanent: false, blocked_until });
  };
  return <Panel
    title="Global Users"
    icon={Users}
    action={<div className="flex gap-2">
      <Input value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Search name, email, phone" className="h-9 w-72" />
      <Button size="sm" className="h-9 gap-1.5 text-xs" onClick={handleCreate}><UserPlus className="h-3.5 w-3.5" />Add User</Button>
    </div>}
  >
    {loading ? <Loading type="table" cols={8} rows={5} /> : <div className="overflow-x-auto"><table className="w-full text-xs">
      <thead><tr className="border-b text-left">{["User", "Phone", "Assets", "Wallet", "Sections", "Account Subdomain", "Status", "Actions"].map((x) => <th key={x} className="p-3">{x}</th>)}</tr></thead>
      <tbody>{users.map((item) => {
        const blocked = item.blocked_until && new Date(item.blocked_until) > new Date();
        return <tr key={item.id} className="border-b align-top">
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
          <td className="p-3">
            <Status label={item.is_active ? "Active" : "Suspended"} ok={item.is_active} />
            <div className="mt-2"><Status label={item.is_verified ? "Verified" : "Unverified"} ok={item.is_verified} /></div>
            {blocked && <div className="mt-2"><Status label={`Blocked until ${formatDate(item.blocked_until)}`} ok={false} /></div>}
            {item.force_password_change && <div className="mt-2"><Status label="Must reset password" ok={false} /></div>}
          </td>
          <td className="p-3 space-y-2">
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => onView(item.id)}>View Profile</Button>
            <Button size="sm" variant={item.is_active ? "destructive" : "outline"} className="h-8 text-xs" onClick={() => onUpdate(item.id, { is_active: !item.is_active })}>{item.is_active ? "Suspend" : "Activate"}</Button>
            {!item.is_verified && <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => onUpdate(item.id, { is_verified: true })}>Verify</Button>}
            {blocked
              ? <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => onUnblock(item.id)}>Unblock</Button>
              : <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => handleBlock(item.id)}>Block</Button>}
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => window.confirm(`Reset password for ${item.email}?`) && onResetPassword(item.id)}>Reset Password</Button>
            <Button size="sm" variant="destructive" className="h-8 text-xs" onClick={() => window.confirm(`Remove ${item.email}? This only works if they own no branches/routers.`) && onDelete(item.id)}>Remove</Button>
          </td>
        </tr>;
      })}</tbody>
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

// ── Sparkline SVG ────────────────────────────────────────────────────
function Sparkline({ data, color, height = 32 }: { data: number[]; color: string; height?: number }) {
  if (!data || data.length < 2) return <div style={{ height }} className="w-full" />;
  const width = 100;
  const max = Math.max(...data, 1);
  const step = width / (data.length - 1);
  const pts = data.map((v, i) => `${(i * step).toFixed(1)},${(height - (v / max) * (height - 4) - 2).toFixed(1)}`).join(" ");
  const gid = `sg${color.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.2" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <polygon points={`0,${height} ${pts} ${width},${height}`} fill={`url(#${gid})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function dayStr(daysAgo: number) {
  const d = new Date(); d.setDate(d.getDate() - daysAgo); return d.toISOString().slice(0, 10);
}

const FEE_PAGE = 5;

function FinancePanel({ initial, wallets, ledger, allTransactions, loading, onSaved, onFreeze }: {
  initial?: PlatformSettingsResponse;
  wallets: Awaited<ReturnType<typeof renultApi.platformAdmin.wallets>>;
  ledger: PlatformLedgerEntryFullResponse[];
  allTransactions: PlatformAllTransactionResponse[];
  loading: boolean;
  onSaved: () => void;
  onFreeze: (id: string, frozen: boolean) => void;
}) {
  type Tab = "overview" | "ledger" | "transactions" | "calculator" | "wallets" | "settings";
  const [tab, setTab] = useState<Tab>("overview");
  const [form, setForm] = useState<PlatformSettingsResponse | null>(null);
  const [calcAmount, setCalcAmount] = useState(100000);
  const [calcType, setCalcType] = useState<"deposit" | "withdrawal">("withdrawal");
  const [ledgerPage, setLedgerPage] = useState(1);
  const [txnPage, setTxnPage] = useState(1);
  const [txnTypeFilter, setTxnTypeFilter] = useState("all");
  const [txnStatusFilter, setTxnStatusFilter] = useState("all");

  useEffect(() => { if (initial) setForm(initial); }, [initial]);

  const save = useMutation({
    mutationFn: renultApi.platformAdmin.updateSettings,
    onSuccess: () => { toast.success("Platform fee settings saved."); onSaved(); },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save settings."),
  });

  // ── KPI computations ────────────────────────────────────────────
  const kpi = useMemo(() => {
    const totalFees = ledger.reduce((s, e) => s + e.amount, 0);
    const depositFees = ledger.filter(e => e.fee_type === "DEPOSIT_FEE").reduce((s, e) => s + e.amount, 0);
    const withdrawalFees = ledger.filter(e => e.fee_type === "WITHDRAWAL_FEE").reduce((s, e) => s + e.amount, 0);
    const totalDeposited = allTransactions.filter(t => t.transaction_type === "deposit" && t.status.toLowerCase() === "completed").reduce((s, t) => s + t.amount, 0);
    const totalWithdrawn = allTransactions.filter(t => t.transaction_type === "withdrawal" && t.status.toLowerCase() === "completed").reduce((s, t) => s + t.amount, 0);
    const activeWallets = wallets.filter(w => !w.is_frozen).length;
    const frozenWallets = wallets.filter(w => w.is_frozen).length;
    const totalClientBalance = wallets.reduce((s, w) => s + w.balance, 0);
    return { totalFees, depositFees, withdrawalFees, totalDeposited, totalWithdrawn, activeWallets, frozenWallets, totalClientBalance };
  }, [ledger, allTransactions, wallets]);

  // Sparklines daily fee totals last 7 days
  const feeSparkline = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => {
      const d = dayStr(6 - i);
      return ledger.filter(e => e.created_at.slice(0, 10) === d).reduce((s, e) => s + e.amount, 0);
    }), [ledger]);

  const depositSparkline = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => {
      const d = dayStr(6 - i);
      return allTransactions.filter(t => t.transaction_type === "deposit" && t.created_at.slice(0, 10) === d).reduce((s, t) => s + t.amount, 0);
    }), [allTransactions]);

  const withdrawalSparkline = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => {
      const d = dayStr(6 - i);
      return allTransactions.filter(t => t.transaction_type === "withdrawal" && t.created_at.slice(0, 10) === d).reduce((s, t) => s + t.amount, 0);
    }), [allTransactions]);

  // ── Fee calculator ───────────────────────────────────────────────
  const calcResult = useMemo(() => {
    if (!form) return null;
    const rate = calcType === "deposit" ? form.deposit_fee_percentage / 100 : form.withdrawal_fee_percentage / 100;
    const fee = Math.round(calcAmount * rate);
    const net = calcAmount - fee;
    return { rate, fee, net };
  }, [form, calcAmount, calcType]);

  // ── Filtered transactions ────────────────────────────────────────
  const filteredTxns = useMemo(() => allTransactions.filter(t => {
    if (txnTypeFilter !== "all" && t.transaction_type !== txnTypeFilter) return false;
    if (txnStatusFilter !== "all" && t.status.toLowerCase() !== txnStatusFilter) return false;
    return true;
  }), [allTransactions, txnTypeFilter, txnStatusFilter]);

  const ledgerPages = Math.max(1, Math.ceil(ledger.length / FEE_PAGE));
  const txnPages = Math.max(1, Math.ceil(filteredTxns.length / FEE_PAGE));
  const pagedLedger = ledger.slice((ledgerPage - 1) * FEE_PAGE, ledgerPage * FEE_PAGE);
  const pagedTxns = filteredTxns.slice((txnPage - 1) * FEE_PAGE, txnPage * FEE_PAGE);

  if (loading) return <Loading type="finance" />;

  const TABS: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "ledger", label: "Fee Ledger" },
    { key: "transactions", label: "All Transactions" },
    { key: "calculator", label: "Fee Calculator" },
    { key: "wallets", label: "Wallet Control" },
    { key: "settings", label: "Settings" },
  ];

  return (
    <div className="space-y-5">
      {/* ── Sub-tab bar ─────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1 border-b border-border/40 pb-0">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "px-4 py-2 text-xs font-semibold rounded-t transition-colors",
              tab === key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Overview ────────────────────────────────────────────── */}
      {tab === "overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Total Fees */}
            <Card className="rounded border border-border/20 shadow-sm overflow-hidden group hover:shadow-md hover:scale-[1.01] transition-all flex flex-col min-h-[130px]">
              <CardHeader className="pb-1 pt-3 px-4">
                <span className="text-[11px] font-bold text-muted-foreground ">Total Fees Earned</span>
                <CardTitle className="text-xl font-black mt-0.5 leading-tight">{money(kpi.totalFees)}</CardTitle>
              </CardHeader>
              <div className="px-4 mt-auto"><Sparkline data={feeSparkline} color="#8b5cf6" /></div>
              <CardContent className="pb-3 pt-0 px-4">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground font-semibold">
                  <span>Deposit: {money(kpi.depositFees)} · Withdrawal: {money(kpi.withdrawalFees)}</span>
                  <div className="p-1 rounded bg-violet-500/10 text-violet-600"><Database className="w-3.5 h-3.5" /></div>
                </div>
              </CardContent>
            </Card>

            {/* Total Deposited */}
            <Card className="rounded border border-border/20 shadow-sm overflow-hidden group hover:shadow-md hover:scale-[1.01] transition-all flex flex-col min-h-[130px]">
              <CardHeader className="pb-1 pt-3 px-4">
                <span className="text-[11px] font-bold text-muted-foreground ">Platform Deposits</span>
                <CardTitle className="text-xl font-black mt-0.5 leading-tight">{money(kpi.totalDeposited)}</CardTitle>
              </CardHeader>
              <div className="px-4 mt-auto"><Sparkline data={depositSparkline} color="#10b981" /></div>
              <CardContent className="pb-3 pt-0 px-4">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground font-semibold">
                  <span>All client inflows · completed</span>
                  <div className="p-1 rounded bg-emerald-500/10 text-emerald-600"><TrendingUp className="w-3.5 h-3.5" /></div>
                </div>
              </CardContent>
            </Card>

            {/* Total Withdrawn */}
            <Card className="rounded border border-border/20 shadow-sm overflow-hidden group hover:shadow-md hover:scale-[1.01] transition-all flex flex-col min-h-[130px]">
              <CardHeader className="pb-1 pt-3 px-4">
                <span className="text-[11px] font-bold text-muted-foreground ">Platform Withdrawals</span>
                <CardTitle className="text-xl font-black mt-0.5 leading-tight">{money(kpi.totalWithdrawn)}</CardTitle>
              </CardHeader>
              <div className="px-4 mt-auto"><Sparkline data={withdrawalSparkline} color="#ef4444" /></div>
              <CardContent className="pb-3 pt-0 px-4">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground font-semibold">
                  <span>All client outflows · completed</span>
                  <div className="p-1 rounded bg-red-500/10 text-red-600"><TrendingDown className="w-3.5 h-3.5" /></div>
                </div>
              </CardContent>
            </Card>

            {/* Wallets */}
            <Card className="rounded border border-border/20 shadow-sm overflow-hidden group hover:shadow-md hover:scale-[1.01] transition-all flex flex-col min-h-[130px]">
              <CardHeader className="pb-1 pt-3 px-4">
                <span className="text-[11px] font-bold text-muted-foreground ">Client Balances</span>
                <CardTitle className="text-xl font-black mt-0.5 leading-tight">{money(kpi.totalClientBalance)}</CardTitle>
              </CardHeader>
              <div className="px-4 mt-auto"><Sparkline data={Array.from({ length: 7 }, (_, i) => kpi.totalClientBalance / (i + 1))} color="#f97316" /></div>
              <CardContent className="pb-3 pt-0 px-4">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground font-semibold">
                  <span>{kpi.activeWallets} active · {kpi.frozenWallets} frozen</span>
                  <div className="p-1 rounded bg-orange-500/10 text-orange-500"><CircleDollarSign className="w-3.5 h-3.5" /></div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Fee type breakdown */}
          <div className="grid sm:grid-cols-2 gap-3">
            <Card className="shadow-none border border-border/20 rounded">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-bold flex items-center gap-2">Fee Breakdown</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {[
                  { label: "Deposit Fees", amount: kpi.depositFees, pct: kpi.totalFees ? (kpi.depositFees / kpi.totalFees) * 100 : 0, color: "bg-emerald-500" },
                  { label: "Withdrawal Fees", amount: kpi.withdrawalFees, pct: kpi.totalFees ? (kpi.withdrawalFees / kpi.totalFees) * 100 : 0, color: "bg-red-500" },
                ].map(({ label, amount, pct, color }) => (
                  <div key={label}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-semibold text-foreground/80">{label}</span>
                      <span className="font-bold font-mono">{money(amount)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{pct.toFixed(1)}% of total fees</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="shadow-none border border-border/20 rounded">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-bold flex items-center gap-2">Current Fee Rates</CardTitle></CardHeader>
              <CardContent>
                {!form ? <Loading type="list" rows={4} /> : (
                  <div className="space-y-2 text-sm">
                    {[
                      ["Deposit fee", `${form.deposit_fee_percentage}%`],
                      ["Withdrawal fee", `${form.withdrawal_fee_percentage}%`],
                      ["Min withdrawal payout", money(form.withdrawal_min_amount)],
                      ["Max withdrawal payout", money(form.withdrawal_max_amount)],
                      ["Voucher fee type", form.voucher_fee_type],
                      ["Voucher fee value", form.voucher_fee_type === "percentage" ? `${form.voucher_fee_value}%` : money(form.voucher_fee_value)],
                    ].map(([label, val]) => (
                      <div key={label} className="flex justify-between border-b border-border/30 pb-1">
                        <span className="text-muted-foreground text-xs">{label}</span>
                        <span className="text-xs font-bold font-mono">{val}</span>
                      </div>
                    ))}
                    <Button size="sm" variant="outline" className="w-full mt-2 text-xs gap-1.5 h-8" onClick={() => setTab("calculator")}>
                      <Calculator className="w-3.5 h-3.5" /> Open Fee Calculator
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ── Fee Ledger ──────────────────────────────────────────── */}
      {tab === "ledger" && (
        <Card className="shadow-none border border-border/20 rounded">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-bold flex items-center gap-2">Platform Fee Audit Ledger</CardTitle>
              <CardDescription className="text-xs mt-0.5">Every fee collected deposit &amp; withdrawal charges across all clients.</CardDescription>
            </div>
            <Badge variant="outline" className="bg-violet-500/10 text-violet-700 border-violet-500/20 text-xs font-bold">{ledger.length} entries</Badge>
          </CardHeader>
          <CardContent>
            {ledger.length === 0 ? (
              <div className="py-16 text-center text-sm text-muted-foreground">No fee entries recorded yet.</div>
            ) : (
              <>
                <div className="overflow-x-auto rounded border border-border/10">
                  <Table>
                    <TableHeader className="bg-muted/30">
                      <TableRow>
                        {["#", "Date / Time", "Owner", "Branch", "Fee Type", "Source Amount", "Fee Rate", "Fee Earned", "Reference"].map(h => (
                          <TableHead key={h} className="text-[11px] font-bold uppercase text-foreground">{h}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pagedLedger.map((entry, i) => {
                        const d = new Date(entry.created_at);
                        const isDeposit = entry.fee_type === "DEPOSIT_FEE";
                        return (
                          <TableRow key={entry.id} className="hover:bg-muted/30 transition-colors">
                            <TableCell className="font-mono text-xs text-muted-foreground">{(ledgerPage - 1) * FEE_PAGE + i + 1}</TableCell>
                            <TableCell className="text-xs whitespace-nowrap">
                              <span className="font-medium">{d.toLocaleDateString("en-UG", { day: "2-digit", month: "short", year: "numeric" })}</span>
                              <br /><span className="text-[10px] text-muted-foreground font-mono">{d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                            </TableCell>
                            <TableCell className="text-xs font-semibold">{entry.owner_name}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{entry.branch_name}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={cn("text-[9px] font-bold", isDeposit ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20" : "bg-red-500/10 text-red-700 border-red-500/20")}>
                                {isDeposit ? "Deposit Fee" : "Withdrawal Fee"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs font-mono text-right">{money(entry.source_amount)}</TableCell>
                            <TableCell className="text-xs font-mono text-right text-muted-foreground">{(entry.fee_rate * 100).toFixed(1)}%</TableCell>
                            <TableCell className="text-xs font-mono text-right font-bold text-violet-700">{money(entry.amount)}</TableCell>
                            <TableCell className="text-xs font-mono text-muted-foreground">{entry.reference ?? "—"}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                {ledgerPages > 1 && (
                  <div className="flex items-center justify-between pt-4">
                    <span className="text-xs text-muted-foreground">Page {ledgerPage} of {ledgerPages} · {ledger.length} entries</span>
                    <div className="flex items-center gap-1.5">
                      <Button variant="outline" size="icon" className="w-8 h-8" disabled={ledgerPage === 1} onClick={() => setLedgerPage(p => p - 1)}><ChevronLeft className="w-4 h-4" /></Button>
                      {Array.from({ length: Math.min(ledgerPages, 5) }, (_, i) => i + 1).map(p => (
                        <Button key={p} variant={ledgerPage === p ? "default" : "outline"} size="icon" className="w-8 h-8 text-xs font-bold" onClick={() => setLedgerPage(p)}>{p}</Button>
                      ))}
                      <Button variant="outline" size="icon" className="w-8 h-8" disabled={ledgerPage === ledgerPages} onClick={() => setLedgerPage(p => p + 1)}><ChevronRight className="w-4 h-4" /></Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── All Transactions ────────────────────────────────────── */}
      {tab === "transactions" && (
        <Card className="shadow-none border border-border/20 rounded">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-sm font-bold flex items-center gap-2">All Client Wallet Transactions</CardTitle>
                <CardDescription className="text-xs mt-0.5">Every deposit &amp; withdrawal across every client branch.</CardDescription>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Select value={txnTypeFilter} onValueChange={v => { setTxnTypeFilter(v); setTxnPage(1); }}>
                  <SelectTrigger className="h-8 text-xs w-[130px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="deposit">Deposits</SelectItem>
                    <SelectItem value="withdrawal">Withdrawals</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={txnStatusFilter} onValueChange={v => { setTxnStatusFilter(v); setTxnPage(1); }}>
                  <SelectTrigger className="h-8 text-xs w-[130px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="processing">Processing</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
                <Badge variant="outline" className="bg-blue-500/10 text-blue-700 border-blue-500/20 text-xs font-bold self-center">{filteredTxns.length} txns</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {filteredTxns.length === 0 ? (
              <div className="py-16 text-center text-sm text-muted-foreground">No transactions found.</div>
            ) : (
              <>
                <div className="overflow-x-auto rounded border border-border/10">
                  <Table>
                    <TableHeader className="bg-muted/30">
                      <TableRow>
                        {["#", "Date / Time", "Owner", "Branch", "Type", "Amount", "Fee", "Net", "Status"].map(h => (
                          <TableHead key={h} className="text-[11px] font-bold uppercase text-foreground">{h}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pagedTxns.map((txn, i) => {
                        const d = new Date(txn.created_at);
                        const isDeposit = txn.transaction_type === "deposit";
                        const s = txn.status.toLowerCase();
                        return (
                          <TableRow key={txn.id} className={cn("hover:bg-muted/30 transition-colors", s === "failed" && "opacity-60")}>
                            <TableCell className="font-mono text-xs text-muted-foreground">{(txnPage - 1) * FEE_PAGE + i + 1}</TableCell>
                            <TableCell className="text-xs whitespace-nowrap">
                              <span className="font-medium">{d.toLocaleDateString("en-UG", { day: "2-digit", month: "short", year: "numeric" })}</span>
                              <br /><span className="text-[10px] text-muted-foreground font-mono">{d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                            </TableCell>
                            <TableCell className="text-xs font-semibold">{txn.owner_name}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{txn.branch_name}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                {isDeposit ? <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600" /> : <ArrowUpRight className="w-3.5 h-3.5 text-red-500" />}
                                <span className={cn("text-[11px] font-bold uppercase", isDeposit ? "text-emerald-700" : "text-red-600")}>{txn.transaction_type}</span>
                              </div>
                            </TableCell>
                            <TableCell className={cn("text-xs font-mono font-bold text-right", isDeposit ? "text-emerald-700" : "text-red-600")}>
                              {isDeposit ? "+" : "−"}{txn.amount.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-xs font-mono text-right text-muted-foreground">{txn.fee_amount > 0 ? txn.fee_amount.toLocaleString() : "—"}</TableCell>
                            <TableCell className="text-xs font-mono text-right font-semibold">{txn.net_amount > 0 ? txn.net_amount.toLocaleString() : "—"}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={cn("text-[10px] font-bold", s === "completed" ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20" : s === "processing" ? "bg-amber-500/10 text-amber-700 border-amber-500/20" : "bg-red-500/10 text-red-700 border-red-500/20")}>
                                {txn.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                {txnPages > 1 && (
                  <div className="flex items-center justify-between pt-4">
                    <span className="text-xs text-muted-foreground">Page {txnPage} of {txnPages}</span>
                    <div className="flex items-center gap-1.5">
                      <Button variant="outline" size="icon" className="w-8 h-8" disabled={txnPage === 1} onClick={() => setTxnPage(p => p - 1)}><ChevronLeft className="w-4 h-4" /></Button>
                      {Array.from({ length: Math.min(txnPages, 5) }, (_, i) => i + 1).map(p => (
                        <Button key={p} variant={txnPage === p ? "default" : "outline"} size="icon" className="w-8 h-8 text-xs font-bold" onClick={() => setTxnPage(p)}>{p}</Button>
                      ))}
                      <Button variant="outline" size="icon" className="w-8 h-8" disabled={txnPage === txnPages} onClick={() => setTxnPage(p => p + 1)}><ChevronRight className="w-4 h-4" /></Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Fee Calculator ──────────────────────────────────────── */}
      {tab === "calculator" && (
        <div className="grid sm:grid-cols-2 gap-4 max-w-3xl">
          <Card className="shadow-none border border-border/20 rounded">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2"><Calculator className="w-4 h-4 text-primary" />Platform Fee Calculator</CardTitle>
              <CardDescription className="text-xs">Simulate what the platform earns for any transaction amount.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground">Transaction Type</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(["deposit", "withdrawal"] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setCalcType(t)}
                      className={cn(
                        "py-2.5 rounded border text-xs font-bold capitalize transition-all",
                        calcType === t ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted/50"
                      )}
                    >
                      {t === "deposit" ? "💰 Deposit" : "📤 Withdrawal"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground">Transaction Amount (UGX)</Label>
                <Input
                  type="number"
                  value={calcAmount}
                  onChange={e => setCalcAmount(Number(e.target.value))}
                  className="h-10 text-sm font-mono"
                  min={0}
                />
                {form && (
                  <p className="text-[10px] text-muted-foreground">
                    Current {calcType} fee rate: <strong>{calcType === "deposit" ? form.deposit_fee_percentage : form.withdrawal_fee_percentage}%</strong>
                  </p>
                )}
              </div>
              <div className="flex gap-2 flex-wrap">
                {[10000, 50000, 100000, 500000, 1000000].map(v => (
                  <button key={v} onClick={() => setCalcAmount(v)} className={cn("px-3 py-1.5 rounded border text-xs font-semibold transition-all", calcAmount === v ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted/50")}>
                    {(v / 1000).toFixed(0)}K
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className={cn("shadow-none border-2 flex flex-col rounded", calcResult && calcResult.fee > 0 ? "border-violet-500/40 bg-violet-500/5" : "border-border/40")}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold text-muted-foreground ">Calculation Result</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col justify-center space-y-4 rounded">
              {!calcResult ? (
                <p className="text-xs text-muted-foreground text-center">Load settings first.</p>
              ) : (
                <>
                  <div className="space-y-3">
                    {[
                      { label: "Transaction Amount", value: money(calcAmount), color: "text-foreground" },
                      { label: `Fee Rate (${(calcResult.rate * 100).toFixed(2)}%)`, value: money(calcResult.fee), color: "text-violet-700 font-black" },
                      { label: "Net to Client", value: money(calcResult.net), color: "text-emerald-700" },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="flex items-center justify-between border-b border-border/30 pb-2">
                        <span className="text-xs text-muted-foreground">{label}</span>
                        <span className={cn("text-sm font-bold font-mono", color)}>{value}</span>
                      </div>
                    ))}
                  </div>
                  <div className="rounded bg-violet-500/10 border border-violet-500/20 p-4 text-center">
                    <p className="text-[11px] text-muted-foreground font-semibold ">Platform Earns</p>
                    <p className="text-3xl font-black text-violet-700 mt-1">{money(calcResult.fee)}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">{(calcResult.rate * 100).toFixed(2)}% of {money(calcAmount)}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Wallet Control ──────────────────────────────────────── */}
      {tab === "wallets" && (
        <Card className="shadow-none border border-border/20 rounded">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-bold flex items-center gap-2"><Snowflake className="w-4 h-4 text-blue-500" />Client Wallet Control</CardTitle>
              <CardDescription className="text-xs mt-0.5">Freeze or unfreeze client wallets. Frozen wallets cannot process withdrawals.</CardDescription>
            </div>
            <div className="flex gap-2 text-xs text-muted-foreground">
              <span className="bg-emerald-500/10 text-emerald-700 px-2 py-1 rounded font-bold">{kpi.activeWallets} active</span>
              <span className="bg-blue-500/10 text-blue-700 px-2 py-1 rounded font-bold">{kpi.frozenWallets} frozen</span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded border border-border/10">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    {["Owner", "Branch", "Balance", "Deposited", "Withdrawn", "Fees Paid", "Status", "Control"].map(h => (
                      <TableHead key={h} className="text-[11px] font-bold uppercase text-foreground">{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {wallets.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="h-32 text-center text-sm text-muted-foreground">No wallets found.</TableCell></TableRow>
                  ) : wallets.map(w => (
                    <TableRow key={w.id} className={cn("hover:bg-muted/30 transition-colors", w.is_frozen && "opacity-70")}>
                      <TableCell className="text-xs font-semibold">{w.owner_name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{w.branch_name}</TableCell>
                      <TableCell className="text-xs font-mono font-bold">{money(w.balance)}</TableCell>
                      <TableCell className="text-xs font-mono text-emerald-700">{money(w.total_deposited)}</TableCell>
                      <TableCell className="text-xs font-mono text-red-600">{money(w.total_withdrawn)}</TableCell>
                      <TableCell className="text-xs font-mono text-violet-700">{money(w.total_fees_paid)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("text-[10px] font-bold", w.is_frozen ? "bg-blue-500/10 text-blue-700 border-blue-500/20" : "bg-emerald-500/10 text-emerald-700 border-emerald-500/20")}>
                          {w.is_frozen ? "Frozen" : "Active"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant={w.is_frozen ? "outline" : "destructive"} className="h-7 text-xs gap-1" onClick={() => onFreeze(w.id, !w.is_frozen)}>
                          {w.is_frozen ? <><TrendingUp className="w-3 h-3" /> Unfreeze</> : <><Snowflake className="w-3 h-3" /> Freeze</>}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Settings ────────────────────────────────────────────── */}
      {tab === "settings" && (
        <Card className="shadow-none border border-border/20 rounded">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2"><Save className="w-4 h-4 text-primary" />Platform Fee &amp; Voucher Settings</CardTitle>
            <CardDescription className="text-xs">Changes take effect immediately for new transactions.</CardDescription>
          </CardHeader>
          <CardContent>
            {!form ? <Loading type="list" rows={4} /> : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="Voucher fee type">
                    <select className="h-10 w-full rounded border bg-background px-3 text-sm" value={form.voucher_fee_type} onChange={e => setForm({ ...form, voucher_fee_type: e.target.value as "fixed" | "percentage" })}>
                      <option value="percentage">Percentage</option><option value="fixed">Fixed UGX</option>
                    </select>
                  </Field>
                  <Field label="Voucher fee value"><Input type="number" value={form.voucher_fee_value} onChange={e => setForm({ ...form, voucher_fee_value: Number(e.target.value) })} /></Field>
                  <Field label="Deposit fee type">
                    <select className="h-10 w-full rounded border bg-background px-3 text-sm" value={form.deposit_fee_type} onChange={e => setForm({ ...form, deposit_fee_type: e.target.value as "fixed" | "percentage" })}>
                      <option value="percentage">Percentage</option><option value="fixed">Fixed UGX</option>
                    </select>
                  </Field>
                  {form.deposit_fee_type === "fixed"
                    ? <Field label="Deposit fee (fixed UGX)"><Input type="number" value={form.deposit_fee_fixed_amount} onChange={e => setForm({ ...form, deposit_fee_fixed_amount: Number(e.target.value) })} /></Field>
                    : <Field label="Deposit fee (%)"><Input type="number" value={form.deposit_fee_percentage} onChange={e => setForm({ ...form, deposit_fee_percentage: Number(e.target.value) })} /></Field>}
                  <Field label="Withdrawal fee type">
                    <select className="h-10 w-full rounded border bg-background px-3 text-sm" value={form.withdrawal_fee_type} onChange={e => setForm({ ...form, withdrawal_fee_type: e.target.value as "fixed" | "percentage" })}>
                      <option value="percentage">Percentage</option><option value="fixed">Fixed UGX</option>
                    </select>
                  </Field>
                  {form.withdrawal_fee_type === "fixed"
                    ? <Field label="Withdrawal fee (fixed UGX)"><Input type="number" value={form.withdrawal_fee_fixed_amount} onChange={e => setForm({ ...form, withdrawal_fee_fixed_amount: Number(e.target.value) })} /></Field>
                    : <Field label="Withdrawal fee (%)"><Input type="number" value={form.withdrawal_fee_percentage} onChange={e => setForm({ ...form, withdrawal_fee_percentage: Number(e.target.value) })} /></Field>}
                  <Field label="Min withdrawal payout (UGX)"><Input type="number" value={form.withdrawal_min_amount} onChange={e => setForm({ ...form, withdrawal_min_amount: Number(e.target.value) })} /></Field>
                  <Field label="Max withdrawal payout (UGX)"><Input type="number" value={form.withdrawal_max_amount} onChange={e => setForm({ ...form, withdrawal_max_amount: Number(e.target.value) })} /></Field>
                  <Field label="Default voucher prefix"><Input value={form.voucher_prefix} onChange={e => setForm({ ...form, voucher_prefix: e.target.value.toUpperCase() })} /></Field>
                  <Field label="Print prefix order">
                    <select className="h-10 w-full rounded border bg-background px-3 text-sm" value={form.voucher_prefix_order} onChange={e => setForm({ ...form, voucher_prefix_order: e.target.value as "prefix-first" | "prefix-last" })}>
                      <option value="prefix-first">Prefix first</option><option value="prefix-last">Prefix last</option>
                    </select>
                  </Field>
                  <label className="flex items-center gap-2 rounded border p-3 text-sm self-end"><input type="checkbox" checked={form.telegram_access_alerts} onChange={e => setForm({ ...form, telegram_access_alerts: e.target.checked })} />Telegram alerts for admin API access</label>
                </div>
                <Button className="mt-5 gap-2" onClick={() => save.mutate(form)} disabled={save.isPending}>
                  {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Settings
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
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
    {loading ? <Loading type="table" cols={7} rows={5} /> : <SimpleTable headers={["Time", "Voucher", "Router", "Event", "Status", "Activated", "Expires"]} rows={rows.map((x) => [formatDate(x.created_at), x.voucher_code, x.router_name, x.event, `${x.previous_status || "NEW"} → ${x.new_status}`, formatDate(x.activated_at), formatDate(x.expires_at)])} />}
  </Panel>;
}

function MessageDiagnosticsPanel({
  rows,
  loading,
  search,
  onSearch,
  status,
  onStatus,
  onDelete,
  onClearAll,
}: {
  rows: Awaited<ReturnType<typeof renultApi.platformAdmin.messageDiagnostics>>;
  loading: boolean;
  search: string;
  onSearch: (value: string) => void;
  status: string;
  onStatus: (value: string) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
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
      <Button size="sm" variant="destructive" className="h-9 text-xs" onClick={onClearAll}>Clear All</Button>
    </div>
  );
  return (
    <Panel title="SMS Delivery Diagnostics" icon={MessageSquareWarning} action={action}>
      {loading ? <Loading type="table" cols={8} rows={5} /> : (
        <SimpleTable
          headers={["Time", "Branch / Sender", "Message", "Recipients", "Delivery", "Charge", "Failure / Provider", ""]}
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
            <Button key={`${row.id}-delete`} size="icon" variant="ghost" className="text-destructive" onClick={() => onDelete(row.id)}><Trash2 className="h-4 w-4" /></Button>,
          ])}
        />
      )}
    </Panel>
  );
}

function TunnelsPanel({ rows, loading, onToggle }: { rows: Awaited<ReturnType<typeof renultApi.platformAdmin.tunnels>>; loading: boolean; onToggle: (id: string, active: boolean) => void }) {
  return <Panel title="Tunnel Control" icon={Network}>
    {loading ? <Loading type="table" cols={7} rows={5} /> : <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b text-left">{["Router", "Owner", "Status", "Tunnel", "Ports", "Last Seen", "Control"].map((x) => <th key={x} className="p-3">{x}</th>)}</tr></thead><tbody>{rows.map((x) => <tr key={x.id} className="border-b">
      <td className="p-3 font-bold">{x.router_name}<p className="font-normal text-muted-foreground">{x.branch_name}</p></td><td className="p-3">{x.owner_name}</td>
      <td className="p-3"><Status label={x.status} ok={["connected", "online"].includes(x.status)} /><p className="mt-1">Heartbeat: {x.heartbeat_status}</p><p>SNMP: {x.snmp_status}</p></td>
      <td className="p-3 font-mono">{x.tunnel_ip || "Not provisioned"}<p>{x.ppp_username || ""}</p></td><td className="p-3">API {x.nat_port || "N/A"}<br />Winbox {x.winbox_nat_port || "N/A"}<br />{x.tunnel_ip && <a href={`http://${x.tunnel_ip}`} target="_blank" rel="noreferrer" className="text-primary underline">WebFig ↗</a>}</td><td className="p-3">{formatDate(x.last_seen)}</td>
      <td className="p-3"><Button size="sm" variant="outline" onClick={() => onToggle(x.id, !x.is_active)}>{x.is_active ? "Disable" : "Enable"}</Button></td>
    </tr>)}</tbody></table></div>}
  </Panel>;
}

function StoragePanel({ rows, loading, error, prefix, onPrefix, onDelete }: { rows: Awaited<ReturnType<typeof renultApi.platformAdmin.storage>>; loading: boolean; error: unknown; prefix: string; onPrefix: (v: string) => void; onDelete: (key: string) => void }) {
  return <Panel title="Cloudflare R2 Files" icon={HardDrive} action={<Input value={prefix} onChange={(e) => onPrefix(e.target.value)} placeholder="Folder prefix" className="h-9 w-64" />}>
    {error ? <ErrorText error={error} /> : loading ? <Loading type="list" rows={5} /> : <div className="space-y-2">{rows.map((x) => <div key={x.key} className="flex items-center justify-between gap-3 rounded border p-3 text-xs"><div className="min-w-0"><a href={x.url} target="_blank" rel="noreferrer" className="font-mono font-bold text-primary break-all">{x.key}</a><p className="text-muted-foreground">{(x.size / 1024).toFixed(1)} KB · {formatDate(x.last_modified)}</p></div><Button size="icon" variant="ghost" className="text-destructive" onClick={() => window.confirm(`Delete ${x.key}?`) && onDelete(x.key)}><Trash2 className="h-4 w-4" /></Button></div>)}</div>}
  </Panel>;
}

function DnsPanel({ zones, records, error, zoneId, onZone, onDelete, loading }: { zones: Awaited<ReturnType<typeof renultApi.platformAdmin.dnsZones>>; records: Awaited<ReturnType<typeof renultApi.platformAdmin.dnsRecords>>; error: unknown; zoneId: string; onZone: (v: string) => void; onDelete: (id: string) => void; loading?: boolean }) {
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
    {error ? <ErrorText error={error} /> : loading ? <Loading type="table" cols={6} rows={5} /> : <><select className="mb-4 h-10 min-w-72 rounded border bg-background px-3 text-sm" value={zoneId} onChange={(e) => onZone(e.target.value)}><option value="">Select zone</option>{zones.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
      {zoneId && <div className="mb-4 grid gap-2 rounded border p-3 sm:grid-cols-5"><Input placeholder="Name" value={record.name} onChange={(e) => setRecord({ ...record, name: e.target.value })} /><select className="h-10 rounded border bg-background px-2 text-sm" value={record.type} onChange={(e) => setRecord({ ...record, type: e.target.value })}>{["A", "AAAA", "CNAME", "TXT", "MX"].map((type) => <option key={type}>{type}</option>)}</select><Input placeholder="Content" value={record.content} onChange={(e) => setRecord({ ...record, content: e.target.value })} /><Input type="number" value={record.ttl} onChange={(e) => setRecord({ ...record, ttl: Number(e.target.value) })} /><Button disabled={!record.name || !record.content || create.isPending} onClick={() => create.mutate()}>Add Record</Button>{provider === "cloudflare" && <label className="flex items-center gap-2 text-xs sm:col-span-5"><input type="checkbox" checked={record.proxied} onChange={(e) => setRecord({ ...record, proxied: e.target.checked })} />Proxy supported A, AAAA, and CNAME records through Cloudflare</label>}</div>}
      {zoneId && <SimpleTable headers={["Name", "Type", "Content", "TTL", "Proxy", "Action"]} rows={records.map((x) => [x.name, x.type, x.content, x.ttl, x.proxied == null ? "N/A" : x.proxied ? "Proxied" : "DNS only", <Button key={x.id} size="icon" variant="ghost" className="text-destructive" onClick={() => window.confirm(`Delete ${x.name} ${x.type}?`) && onDelete(x.id)}><Trash2 className="h-4 w-4" /></Button>])} />}</>}
  </Panel>;
}

function SubadminsPanel({ users, onSave, loading }: { users: PlatformUserResponse[]; onSave: (id: string, role: "subadmin" | "none", permissions: string[], share: number) => void; loading?: boolean }) {
  const [drafts, setDrafts] = useState<Record<string, string[]>>({});
  const candidates = users.filter((x) => x.platform_role !== "superadmin");
  return (
    <div className="space-y-5">
      <Panel title="Subadmin Privileges" icon={UserCog}>
        {loading ? <Loading type="list" rows={4} /> : <div className="space-y-3">{candidates.map((item) => {
          const values = drafts[item.id] || item.platform_permissions;
          return <Card key={item.id} className="shadow-none rounded border-gray-100"><CardContent className="p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-bold">{item.full_name}</p><p className="text-xs text-muted-foreground">{item.email}</p></div><Badge variant="outline">{item.platform_role || "User"}</Badge></div>
            <div className="mt-3"><CheckboxGrid values={values} options={ADMIN_PERMISSIONS} onChange={(next) => setDrafts((old) => ({ ...old, [item.id]: next }))} /></div>
            <div className="mt-3 flex gap-2"><Button size="sm" onClick={() => onSave(item.id, "subadmin", values, item.platform_fee_share_percentage)}>Save Subadmin</Button>{item.platform_role === "subadmin" && <Button size="sm" variant="destructive" onClick={() => onSave(item.id, "none", [], 0)}>Remove</Button>}</div>
          </CardContent></Card>;
        })}</div>}
      </Panel>
      <AdminSharesPanel users={users} onSave={onSave} loading={loading} />
    </div>
  );
}

function AdminSharesPanel({ users, onSave, loading }: { users: PlatformUserResponse[]; onSave: (id: string, role: "subadmin" | "none", permissions: string[], share: number) => void; loading?: boolean }) {
  const [draftShares, setDraftShares] = useState<Record<string, number>>({});
  const admins = users.filter((item) => item.platform_role === "subadmin" || item.platform_role === "superadmin");
  const assigned = admins.reduce((sum, item) => sum + Number(draftShares[item.id] ?? item.platform_fee_share_percentage ?? 0), 0);
  const totalShareAmount = admins.reduce((sum, item) => sum + item.platform_fee_share_amount, 0);
  const shareOptions = [0, 5, 10, 15, 20, 25, 50];

  return (
    <Panel title="Platform Fee Shares" icon={CircleDollarSign}>
      {loading ? <Loading type="list" rows={4} /> : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded border border-border/30 p-4"><p className="text-[10px] font-black uppercase text-muted-foreground">Assigned Share</p><p className="mt-1 text-2xl font-black">{assigned.toFixed(2)}%</p></div>
            <div className="rounded border border-border/30 p-4"><p className="text-[10px] font-black uppercase text-muted-foreground">Remaining Share</p><p className="mt-1 text-2xl font-black">{Math.max(0, 100 - assigned).toFixed(2)}%</p></div>
            <div className="rounded border border-border/30 p-4"><p className="text-[10px] font-black uppercase text-muted-foreground">Allocated Amount</p><p className="mt-1 text-2xl font-black">{money(totalShareAmount)}</p></div>
          </div>

          {admins.length === 0 ? (
            <div className="rounded border border-dashed p-8 text-center text-sm text-muted-foreground">Create a subadmin first, then assign a platform fee share.</div>
          ) : (
            <div className="space-y-3">
              {admins.map((admin) => {
                const draftShare = Number(draftShares[admin.id] ?? admin.platform_fee_share_percentage ?? 0);
                const isSuperadmin = admin.platform_role === "superadmin";
                return (
                  <div key={admin.id} className="rounded border border-border/30 p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-bold">{admin.full_name}</p>
                          <Badge variant="outline">{admin.platform_role}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{admin.email}</p>
                        <p className="mt-2 text-sm font-black">{money(admin.platform_fee_share_amount)} <span className="text-[11px] font-semibold text-muted-foreground">current share amount</span></p>
                      </div>
                      <div className="w-full max-w-xl space-y-3">
                        <div className="flex flex-wrap gap-2">
                          {shareOptions.map((option) => (
                            <Button
                              key={option}
                              type="button"
                              size="sm"
                              variant={draftShare === option ? "default" : "outline"}
                              className="h-8 text-xs"
                              disabled={isSuperadmin}
                              onClick={() => setDraftShares((old) => ({ ...old, [admin.id]: option }))}
                            >
                              {option}%
                            </Button>
                          ))}
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            step="0.01"
                            value={draftShare}
                            disabled={isSuperadmin}
                            onChange={(event) => setDraftShares((old) => ({ ...old, [admin.id]: Number(event.target.value) }))}
                            className="h-9"
                          />
                          <Button
                            size="sm"
                            className="h-9"
                            disabled={isSuperadmin}
                            onClick={() => onSave(admin.id, "subadmin", admin.platform_permissions, draftShare)}
                          >
                            Save Share
                          </Button>
                        </div>
                        {isSuperadmin && <p className="text-[11px] text-muted-foreground">Superadmin shares are shown here for visibility. Assign operational shares to subadmins.</p>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

function HealthPanel({ data, loading, onRefresh }: { data: Awaited<ReturnType<typeof renultApi.platformAdmin.health>> | undefined; loading: boolean; onRefresh: () => void }) {
  if (loading || !data) return <Loading type="health" />;
  const services = [["Database", data.database], ["Cloudflare R2", data.r2], [`${providerLabel(data.dns_provider)} DNS`, data.dns], ["Email", data.email], ["SMS", data.sms], ["Payments", data.payment_gateway]];
  const routerErrorLogs = data.router_error_logs || [];
  return <Panel title="System Health" icon={Activity} action={<Button size="sm" variant="outline" onClick={onRefresh}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>}>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{services.map(([name, value]) => <Card key={name} className="shadow-none"><CardContent className="p-4"><p className="text-xs font-bold text-muted-foreground">{name}</p><p className="mt-2 font-bold">{value}</p></CardContent></Card>)}</div>
    <div className="mt-4 rounded border p-4 text-sm">
      <div className="grid gap-3 sm:grid-cols-3">
        <div><p className="text-xs font-bold text-muted-foreground">Concentrator</p><p className="mt-1 font-bold">{data.concentrator_enabled ? "Enabled" : "Disabled"}</p></div>
        <div><p className="text-xs font-bold text-muted-foreground">SNMP monitoring</p><p className="mt-1 font-bold">{data.snmp_monitor_enabled ? "Enabled" : "Disabled"}</p></div>
        <div><p className="text-xs font-bold text-muted-foreground">Router errors in 24h</p><p className={cn("mt-1 font-bold", data.router_errors_24h > 0 && "text-destructive")}>{data.router_errors_24h}</p></div>
      </div>
      {routerErrorLogs.length > 0 && (
        <div className="mt-4 overflow-hidden rounded border border-destructive/20">
          <div className="flex items-center gap-2 border-b border-destructive/20 bg-destructive/5 px-3 py-2 text-xs font-bold text-destructive">
            <MessageSquareWarning className="h-4 w-4" />
            Recent Router Error Logs
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[190px]">Time</TableHead>
                <TableHead className="w-[180px]">Operation</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {routerErrorLogs.map((error) => (
                <TableRow key={error.id}>
                  <TableCell className="text-xs text-muted-foreground">{formatDate(error.created_at)}</TableCell>
                  <TableCell className="text-xs font-medium">{error.operation}</TableCell>
                  <TableCell className="break-words text-xs text-destructive">{error.message}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  </Panel>;
}

function AdminAuditPanel({ rows, loading }: { rows: Awaited<ReturnType<typeof renultApi.platformAdmin.audit>>; loading: boolean }) {
  return <Panel title="Platform Admin Audit" icon={ShieldCheck}>{loading ? <Loading type="table" cols={5} rows={5} /> : <SimpleTable headers={["Time", "Admin", "Action", "Target", "Details"]} rows={rows.map((x) => [formatDate(x.created_at), x.actor_name || "System", x.action, `${x.target_type}${x.target_id ? ` / ${x.target_id}` : ""}`, JSON.stringify(x.details || {})])} />}</Panel>;
}

function SessionsPanel({ sessions, loginAttempts, loading, onRevoke }: {
  sessions: PlatformSessionResponse[];
  loginAttempts: PlatformLoginAttemptResponse[];
  loading: boolean;
  onRevoke: (id: string) => void;
}) {
  return (
    <div className="space-y-5">
      <Panel title="Active Sessions" icon={KeyRound}>
        {loading ? <Loading type="table" cols={6} rows={3} /> : <SimpleTable
          headers={["User", "IP Address", "Device", "Started", "Last Seen", "Action"]}
          rows={sessions.map((s) => [
            s.user_name,
            s.ip_address || "N/A",
            <span key={`${s.id}-ua`} className="max-w-xs break-all text-[10px]">{s.user_agent || "N/A"}</span>,
            formatDate(s.created_at),
            formatDate(s.last_seen_at),
            <Button key={`${s.id}-revoke`} size="sm" variant="destructive" className="h-8 text-xs" onClick={() => window.confirm(`Revoke ${s.user_name}'s session? They will be logged out.`) && onRevoke(s.id)}>Revoke</Button>,
          ])}
        />}
      </Panel>
      <Panel title="Login Attempts" icon={ShieldCheck}>
        {loading ? <Loading type="table" cols={5} rows={3} /> : <SimpleTable
          headers={["Time", "Email", "Result", "IP Address", "Failure Reason"]}
          rows={loginAttempts.map((a) => [
            formatDate(a.created_at),
            a.email,
            <Status key={`${a.id}-status`} label={a.success ? "Success" : "Failed"} ok={a.success} />,
            a.ip_address || "N/A",
            a.failure_reason || "—",
          ])}
        />}
      </Panel>
    </div>
  );
}

function NotificationsPanel({ rows, loading, onDelete, onClearAll }: {
  rows: PlatformNotificationResponse[];
  loading: boolean;
  onDelete: (id: string) => void;
  onClearAll: () => void;
}) {
  return (
    <Panel
      title="Platform Notifications"
      icon={Bell}
      action={<Button size="sm" variant="destructive" className="h-9 text-xs" onClick={onClearAll}>Clear All</Button>}
    >
      {loading ? <Loading type="table" cols={6} rows={5} /> : <SimpleTable
        headers={["Time", "User", "Category", "Title", "Body", ""]}
        rows={rows.map((n) => [
          formatDate(n.created_at),
          n.user_name,
          <Badge key={`${n.id}-cat`} variant="outline" className="text-[10px]">{n.category}</Badge>,
          n.title,
          <span key={`${n.id}-body`} className="max-w-sm break-words">{n.body}</span>,
          <Button key={`${n.id}-delete`} size="icon" variant="ghost" className="text-destructive" onClick={() => onDelete(n.id)}><Trash2 className="h-4 w-4" /></Button>,
        ])}
      />}
    </Panel>
  );
}

function Panel({ title, icon: Icon, action, children }: { title: string; icon: typeof Users; action?: React.ReactNode; children: React.ReactNode }) {
  return <Card className="shadow-none rounded border border-border/20"><CardHeader className="flex flex-row items-center justify-between gap-3"><CardTitle className="flex items-center gap-2 text-sm"><Icon className="h-4 w-4 text-primary" />{title}</CardTitle>{action}</CardHeader><CardContent>{children}</CardContent></Card>;
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

function Loading({
  type = "default",
  rows = 5,
  cols = 5,
}: {
  type?: "default" | "overview" | "table" | "finance" | "list" | "health";
  rows?: number;
  cols?: number;
}) {
  if (type === "overview") {
    return (
      <div className="space-y-4 w-full">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <Card key={i} className="shadow-none rounded border border-gray-100 p-5">
              <div className="flex items-center justify-between">
                <div className="space-y-2 w-full pr-4">
                  <Skeleton className="h-3 w-16 bg-muted/65 animate-pulse" />
                  <Skeleton className="h-7 w-28 bg-muted/80 animate-pulse" />
                </div>
                <Skeleton className="h-8 w-8 rounded-full bg-muted/70 flex-shrink-0 animate-pulse" />
              </div>
            </Card>
          ))}
          <Card className="shadow-none rounded sm:col-span-2 xl:col-span-3 p-4">
            <div className="flex gap-4">
              <Skeleton className="h-4 w-28 bg-muted/70 animate-pulse" />
              <Skeleton className="h-4 w-28 bg-muted/70 animate-pulse" />
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (type === "table") {
    return (
      <div className="w-full space-y-3">
        {/* Table Header Placeholder */}
        <div className="flex items-center space-x-4 border-b pb-3">
          {Array.from({ length: cols }).map((_, i) => (
            <Skeleton key={i} className="h-4 flex-1 bg-muted/80 animate-pulse" />
          ))}
        </div>
        {/* Table Rows Placeholders */}
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center space-x-4 border-b py-3.5">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton
                key={c}
                className={cn(
                  "h-3 flex-1 bg-muted/60 animate-pulse",
                  c === 0 && "w-1/3 flex-none",
                  c === cols - 1 && "w-1/4 flex-none"
                )}
              />
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (type === "list") {
    return (
      <div className="space-y-2 w-full">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center justify-between rounded border p-3">
            <div className="space-y-2 w-1/2">
              <Skeleton className="h-4 w-3/4 bg-muted/80 animate-pulse" />
              <Skeleton className="h-3 w-1/2 bg-muted/60 animate-pulse" />
            </div>
            <Skeleton className="h-8 w-8 rounded bg-muted/70 animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  if (type === "health") {
    return (
      <div className="space-y-4 w-full">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="shadow-none p-4 space-y-2">
              <Skeleton className="h-3 w-1/3 bg-muted/70 animate-pulse" />
              <Skeleton className="h-5 w-2/3 bg-muted/80 animate-pulse" />
            </Card>
          ))}
        </div>
        <Card className="p-4 space-y-3">
          <Skeleton className="h-4 w-1/4 bg-muted/80 animate-pulse" />
          <Skeleton className="h-4 w-1/3 bg-muted/70 animate-pulse" />
          <Skeleton className="h-4 w-1/2 bg-muted/70 animate-pulse" />
        </Card>
      </div>
    );
  }

  if (type === "finance") {
    return (
      <div className="space-y-6 w-full">
        {/* KPI card grid skeleton */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="p-4 space-y-4 min-h-[130px] flex flex-col justify-between">
              <div className="space-y-2">
                <Skeleton className="h-3 w-20 bg-muted/70 animate-pulse" />
                <Skeleton className="h-6 w-32 bg-muted/80 animate-pulse" />
              </div>
              <div className="h-8 w-full bg-muted/30 rounded animate-pulse" />
              <div className="flex justify-between items-center mt-2">
                <Skeleton className="h-3 w-3/4 bg-muted/60 animate-pulse" />
                <Skeleton className="h-5 w-5 rounded bg-muted/70 animate-pulse" />
              </div>
            </Card>
          ))}
        </div>
        {/* Table skeleton below */}
        <Card className="p-4">
          <div className="space-y-3">
            <div className="flex gap-4 border-b pb-2">
              <Skeleton className="h-4 w-1/4 bg-muted/80 animate-pulse" />
              <Skeleton className="h-4 w-1/4 bg-muted/80 animate-pulse" />
            </div>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex justify-between py-2 border-b">
                <Skeleton className="h-3 w-1/3 bg-muted/60 animate-pulse" />
                <Skeleton className="h-3 w-20 bg-muted/60 animate-pulse" />
                <Skeleton className="h-3 w-28 bg-muted/60 animate-pulse" />
              </div>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  // default compact skeleton
  return (
    <div className="flex flex-col space-y-3 w-full p-4 border border-dashed rounded-md bg-muted/5">
      <div className="flex items-center space-x-3">
        <Skeleton className="h-8 w-8 rounded-full bg-muted/85 animate-pulse" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-4 w-1/3 bg-muted/85 animate-pulse" />
          <Skeleton className="h-3 w-1/2 bg-muted/70 animate-pulse" />
        </div>
      </div>
      <div className="space-y-2 pt-2">
        <Skeleton className="h-3 w-full bg-muted/60 animate-pulse" />
        <Skeleton className="h-3 w-5/6 bg-muted/60 animate-pulse" />
      </div>
    </div>
  );
}

function ErrorText({ error }: { error: unknown }) {
  return <div className="rounded border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">{error instanceof Error ? error.message : "Service is unavailable or not configured."}</div>;
}

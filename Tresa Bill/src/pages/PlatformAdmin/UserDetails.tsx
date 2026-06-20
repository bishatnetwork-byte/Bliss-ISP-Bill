import { PortalAdUpsert, getAccountBaseDomain, renultApi } from "@/api/foreform";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Building2, KeyRound, Loader2, Megaphone, Router, Ticket, Wallet } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import PlatformAdminLayout from "./PlatformAdminLayout";

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleString() : "N/A";
const money = (value: number) => `UGX ${value.toLocaleString()}`;

export default function PlatformUserDetailsPage() {
  const { userId = "" } = useParams();
  const navigate = useNavigate();
  const detail = useQuery({
    queryKey: ["platformAdmin", "user", userId],
    queryFn: () => renultApi.platformAdmin.user(userId),
    enabled: Boolean(userId),
  });

  return (
    <PlatformAdminLayout activeSection="users" title="User Profile">
      <div className="space-y-5 p-4 sm:p-6">
        <Button variant="ghost" size="sm" onClick={() => navigate("/platform-admin?section=users")}>
          <ArrowLeft className="mr-2 h-4 w-4" />Back to users
        </Button>

        {detail.isLoading ? (
          <div className="flex h-64 items-center justify-center text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading user profile...
          </div>
        ) : detail.error || !detail.data ? (
          <div className="rounded border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
            {detail.error instanceof Error ? detail.error.message : "User profile could not be loaded."}
          </div>
        ) : (
          <UserProfile data={detail.data} />
        )}
      </div>
    </PlatformAdminLayout>
  );
}

function UserProfile({ data }: { data: Awaited<ReturnType<typeof renultApi.platformAdmin.user>> }) {
  const user = data.user;
  const [managingRouter, setManagingRouter] = useState<{ id: string; name: string } | null>(null);
  return (
    <>
      <Card className="shadow-none">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-4">
            <Avatar className="h-14 w-14">
              <AvatarFallback className="font-bold">
                {user.full_name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-xl font-black">{user.full_name}</h1>
              <p className="text-sm text-muted-foreground">{user.email}</p>
              <p className="text-xs text-muted-foreground">{user.phone_number || "No phone number"}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Status label={user.is_active ? "Active" : "Suspended"} ok={user.is_active} />
            <Status label={user.is_verified ? "Verified" : "Unverified"} ok={user.is_verified} />
            {user.account_subdomain && (
              <Badge variant="outline">
                {user.account_subdomain}.{getAccountBaseDomain()} · {user.subdomain_enabled ? "Enabled" : "Disabled"}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric title="Branches" value={user.branches} icon={Building2} />
        <Metric title="Routers" value={user.routers} icon={Router} />
        <Metric title="Vouchers" value={user.vouchers} icon={Ticket} />
        <Metric title="Wallet balance" value={money(user.wallet_balance)} icon={Wallet} />
      </div>

      <Card className="shadow-none">
        <CardHeader><CardTitle className="text-sm">Account details</CardTitle></CardHeader>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <Detail label="Created" value={formatDate(user.created_at)} />
          <Detail label="Platform role" value={user.platform_role || "Standard user"} />
          <Detail label="Allowed sections" value={user.allowed_sections.length ? user.allowed_sections.join(", ") : "All sections"} />
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader><CardTitle className="text-sm">Branches</CardTitle></CardHeader>
        <CardContent>
          <Table
            headers={["Branch", "Routers", "Vouchers", "Wallet", "Status", "Created"]}
            rows={data.branches.map((branch) => [
              branch.name,
              branch.routers,
              branch.vouchers,
              money(branch.wallet_balance),
              branch.wallet_frozen ? "Frozen" : "Active",
              formatDate(branch.created_at),
            ])}
          />
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader><CardTitle className="text-sm">Routers</CardTitle></CardHeader>
        <CardContent>
          <Table
            headers={["Router", "Branch", "Location", "Status", "Last seen", ""]}
            rows={data.routers.map((router) => [
              router.name,
              router.branch_name,
              router.location || "N/A",
              router.is_active ? router.status : "Disabled",
              formatDate(router.last_seen),
              <Button
                key={`${router.id}-manage`}
                size="sm"
                variant={managingRouter?.id === router.id ? "default" : "outline"}
                className="h-8 text-xs"
                onClick={() => setManagingRouter(managingRouter?.id === router.id ? null : { id: router.id, name: router.name })}
              >
                {managingRouter?.id === router.id ? "Close" : "Manage"}
              </Button>,
            ])}
          />
        </CardContent>
      </Card>

      {managingRouter && <RouterManagement router={managingRouter} />}

      <Card className="shadow-none">
        <CardHeader><CardTitle className="text-sm">Recent vouchers</CardTitle></CardHeader>
        <CardContent>
          <Table
            headers={["Voucher", "Router", "Customer", "Profile", "Amount", "Status", "Created"]}
            rows={data.recent_vouchers.map((voucher) => [
              voucher.voucher_code,
              voucher.router_name,
              voucher.phone_number,
              voucher.profile,
              money(voucher.amount),
              voucher.status,
              formatDate(voucher.created_at),
            ])}
          />
        </CardContent>
      </Card>
    </>
  );
}

function RouterManagement({ router }: { router: { id: string; name: string } }) {
  const queryClient = useQueryClient();
  const adsQuery = useQuery({
    queryKey: ["platformAdmin", "routerAds", router.id],
    queryFn: () => renultApi.platformAdmin.routerAds(router.id),
  });
  const createAd = useMutation({
    mutationFn: (payload: PortalAdUpsert) => renultApi.platformAdmin.createRouterAd(router.id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platformAdmin", "routerAds", router.id] });
      toast.success("Ad pushed to captive portal.");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not push ad."),
  });
  const deleteAd = useMutation({
    mutationFn: (adId: string) => renultApi.platformAdmin.deleteRouterAd(router.id, adId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["platformAdmin", "routerAds", router.id] }),
  });
  const pushCaptive = useMutation({
    mutationFn: () => renultApi.platformAdmin.pushRouterCaptive(router.id),
    onSuccess: (result) => result.success
      ? toast.success(`Captive portal pushed to ${router.name}.`)
      : toast.error(result.error || "Push failed."),
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not push captive portal."),
  });
  const setCredentials = useMutation({
    mutationFn: (payload: { username: string; password: string }) => renultApi.platformAdmin.setRouterCredentials(router.id, payload),
    onSuccess: (result) => toast.success(result.message),
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not update Mikrotik login."),
  });

  const handleAddAd = () => {
    const advertiser_name = window.prompt("Advertiser name:");
    if (!advertiser_name) return;
    const media_url = window.prompt("Image/video URL to display:");
    if (!media_url) return;
    const target_url = window.prompt("Click-through URL (optional):") || null;
    createAd.mutate({
      enabled: true,
      advertiser_name,
      business_type: "other",
      placement: "banner",
      media_type: "image",
      title: "Sponsored",
      description: "",
      media_url,
      target_url,
      duration_seconds: 5,
      sort_order: 0,
    });
  };

  const handleSetCredentials = () => {
    const username = window.prompt("New Mikrotik login username:", "admin");
    if (!username) return;
    const password = window.prompt("New Mikrotik login password:");
    if (!password) return;
    if (!window.confirm(`This overwrites the stored RouterOS login for ${router.name}. Make sure it matches the password actually set on the device.`)) return;
    setCredentials.mutate({ username, password });
  };

  return (
    <Card className="shadow-none border-primary/30">
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <CardTitle className="text-sm">Manage {router.name}</CardTitle>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => pushCaptive.mutate()} disabled={pushCaptive.isPending}>
            Push Captive Portal
          </Button>
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={handleSetCredentials}>
            <KeyRound className="h-3.5 w-3.5" />Set Mikrotik Login
          </Button>
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={handleAddAd}>
            <Megaphone className="h-3.5 w-3.5" />Push Ad
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {adsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading ads...</p>
        ) : (
          <Table
            headers={["Ad", "Type", "Target", "Impressions", "Clicks", ""]}
            rows={(adsQuery.data || []).map((ad) => [
              <div key={`${ad.id}-name`}><b>{ad.advertiser_name}</b><p className="text-muted-foreground">{ad.title}</p></div>,
              ad.media_type,
              ad.target_url || "N/A",
              ad.impressions,
              ad.clicks,
              <Button key={`${ad.id}-del`} size="sm" variant="ghost" className="text-destructive" onClick={() => window.confirm(`Remove ad "${ad.advertiser_name}"?`) && deleteAd.mutate(ad.id)}>Remove</Button>,
            ])}
          />
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ title, value, icon: Icon }: { title: string; value: React.ReactNode; icon: typeof Wallet }) {
  return (
    <Card className="shadow-none">
      <CardContent className="flex items-center justify-between p-4">
        <div><p className="text-xs font-bold text-muted-foreground">{title}</p><p className="mt-1 text-xl font-black">{value}</p></div>
        <Icon className="h-7 w-7 text-primary/40" />
      </CardContent>
    </Card>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs font-bold text-muted-foreground">{label}</p><p className="mt-1 font-medium">{value}</p></div>;
}

function Status({ label, ok }: { label: string; ok: boolean }) {
  return <Badge className={cn("border-none text-[10px]", ok ? "bg-emerald-500/10 text-emerald-700" : "bg-red-500/10 text-red-700")}>{label}</Badge>;
}

function Table({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">No records found.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead><tr className="border-b text-left">{headers.map((header) => <th key={header} className="p-3">{header}</th>)}</tr></thead>
        <tbody>{rows.map((row, index) => <tr key={index} className="border-b">{row.map((cell, cellIndex) => <td key={cellIndex} className="p-3">{cell}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

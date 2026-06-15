import { renultApi } from "@/api/foreform";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Building2, Loader2, Router, Ticket, Wallet } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
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
                {user.account_subdomain}.renult.app · {user.subdomain_enabled ? "Enabled" : "Disabled"}
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
            headers={["Router", "Branch", "Location", "Status", "Last seen"]}
            rows={data.routers.map((router) => [
              router.name,
              router.branch_name,
              router.location || "N/A",
              router.is_active ? router.status : "Disabled",
              formatDate(router.last_seen),
            ])}
          />
        </CardContent>
      </Card>

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

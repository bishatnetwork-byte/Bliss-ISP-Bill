import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePortalAdAnalytics } from "@/hooks/usePortalAds";
import { useRouters } from "@/hooks/useRouters";
import { renultApi } from "@/api/foreform";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  BarChart3,
  Eye,
  Loader2,
  MapPin,
  MousePointerClick,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import SettingsLayout from "./SettingsLayout";

function MetricCard({ label, value, detail, icon: Icon }: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Eye;
}) {
  return (
    <Card className="border-none shadow-sm rounded">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-black">{value}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{detail}</p>
          </div>
          <div className="rounded bg-primary/10 p-2 text-primary"><Icon className="h-4 w-4" /></div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdsAnalyticsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isPlatformAdmin = Boolean(user?.platform_role);
  const [searchParams, setSearchParams] = useSearchParams();
  const [branchId, setBranchId] = useState(() => localStorage.getItem("selected-workspace") || "");
  const { data: ownerRouters = [] } = useRouters(branchId);
  const { data: adminRouters = [] } = useQuery({
    queryKey: ["platformAdmin", "adsmobAnalyticsRouters"],
    queryFn: () => renultApi.platformAdmin.routers(""),
    enabled: isPlatformAdmin,
  });
  const routers = (isPlatformAdmin ? adminRouters : ownerRouters).filter((router) => {
    if (!router.is_active) return false;
    if (!isPlatformAdmin) return true;
    const status = `${router.status} ${(router as any).heartbeat_status || ""} ${(router as any).snmp_status || ""}`.toLowerCase();
    return ["online", "connected", "provisioned"].some((word) => status.includes(word));
  });
  const [routerId, setRouterId] = useState(() => searchParams.get("router") || "");
  const [days, setDays] = useState(30);
  const { data, isLoading } = usePortalAdAnalytics(routerId, days, isPlatformAdmin);

  useEffect(() => {
    const handler = (event: Event) => setBranchId((event as CustomEvent<{ id: string }>).detail.id);
    window.addEventListener("renult-branch-change", handler);
    return () => window.removeEventListener("renult-branch-change", handler);
  }, []);

  useEffect(() => {
    if (!routerId && routers.length) setRouterId(routers[0].id);
    if (routerId && !routers.some((router) => router.id === routerId)) setRouterId(routers[0]?.id || "");
  }, [routerId, routers]);

  useEffect(() => {
    if (routerId) setSearchParams({ router: routerId }, { replace: true });
  }, [routerId, setSearchParams]);

  const summary = data?.summary;
  const growthPositive = (summary?.growth_percent || 0) >= 0;

  return (
    <SettingsLayout title="Ads Analytics">
      <div className="mx-auto max-w-7xl space-y-6 px-6 py-8 sm:px-10">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <button onClick={() => navigate("/settings/adsmob")} className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-3.5 w-3.5" /> Campaign Studio
            </button>
            <div className="flex items-center gap-2"><h1 className="text-2xl font-bold">Ads Analytics</h1></div>
            <p className="mt-1 text-sm text-muted-foreground">
              {isPlatformAdmin
                ? "Measured captive ad performance across online platform MikroTiks."
                : "Measured captive impressions, qualified views, unique visitors, clicks, growth, and areas."}
            </p>
          </div>
          <div className="flex gap-2">
            <Select value={routerId} onValueChange={setRouterId}>
              <SelectTrigger className="w-[220px]"><SelectValue placeholder="Select router" /></SelectTrigger>
              <SelectContent>{routers.map((router) => (
                <SelectItem key={router.id} value={router.id}>
                  {isPlatformAdmin && "owner_name" in router ? `${router.name} · ${router.owner_name}` : router.name}
                </SelectItem>
              ))}</SelectContent>
            </Select>
            <Select value={String(days)} onValueChange={(value) => setDays(Number(value))}>
              <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
                <SelectItem value="365">Last year</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {!routerId ? (
          <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">Select a router to view advertising data.</CardContent></Card>
        ) : isLoading ? (
          <div className="flex justify-center py-24"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
        ) : data && summary ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <MetricCard label="Impressions" value={summary.impressions.toLocaleString()} detail="Ads rendered on captive pages" icon={Eye} />
              <MetricCard label="Qualified views" value={summary.views.toLocaleString()} detail={`${summary.view_rate.toFixed(1)}% impression view rate`} icon={Users} />
              <MetricCard label="Unique viewers" value={summary.unique_views.toLocaleString()} detail="Distinct privacy-safe IP hashes" icon={Users} />
              <MetricCard label="Clicks" value={summary.clicks.toLocaleString()} detail={`${summary.ctr.toFixed(2)}% click-through rate`} icon={MousePointerClick} />
              <MetricCard label="View growth" value={`${summary.growth_percent >= 0 ? "+" : ""}${summary.growth_percent.toFixed(1)}%`} detail="Compared with prior period" icon={growthPositive ? TrendingUp : TrendingDown} />
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
              <Card className="border-none shadow-sm rounded">
                <CardHeader>
                  <CardTitle className="text-base">Campaign growth</CardTitle>
                  <CardDescription>Daily impressions, qualified views, and clicks.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[340px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={data.timeline} margin={{ left: -20, right: 10 }}>
                        <defs>
                          <linearGradient id="viewsFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f97316" stopOpacity={0.35} /><stop offset="95%" stopColor="#f97316" stopOpacity={0} /></linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={28} />
                        <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                        <Tooltip />
                        <Legend />
                        <Area type="monotone" dataKey="impressions" stroke="#64748b" fill="transparent" strokeWidth={2} />
                        <Area type="monotone" dataKey="views" stroke="#f97316" fill="url(#viewsFill)" strokeWidth={2} />
                        <Area type="monotone" dataKey="clicks" stroke="#16a34a" fill="transparent" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-none shadow-sm rounded">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">Audience areas</CardTitle>
                  <CardDescription>Location headers supplied by the hosting edge.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[340px]">
                    {data.areas.length ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.areas} layout="vertical" margin={{ left: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
                          <YAxis dataKey="area" type="category" width={100} tick={{ fontSize: 10 }} />
                          <Tooltip />
                          <Bar dataKey="views" fill="#f97316" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Area data appears after ads receive traffic.</div>}
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="border-none shadow-sm rounded">
              <CardHeader>
                <CardTitle className="text-base">Performance by ad</CardTitle>
                <CardDescription>Each campaign keeps its own metrics for the selected period.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-y bg-muted/40 text-muted-foreground"><tr><th className="p-3">Campaign</th><th className="p-3">Status</th><th className="p-3">Impressions</th><th className="p-3">Views</th><th className="p-3">Unique</th><th className="p-3">Clicks</th><th className="p-3">CTR</th></tr></thead>
                    <tbody>
                      {data.ads.map((ad) => (
                        <tr key={ad.id} className="border-b last:border-0">
                          <td className="p-3"><p className="font-bold">{ad.title}</p><p className="text-muted-foreground">{ad.advertiser_name || ad.business_type}</p></td>
                          <td className="p-3"><span className={ad.enabled ? "font-semibold text-emerald-600" : "text-muted-foreground"}>{ad.enabled ? "Active" : "Paused"}</span></td>
                          <td className="p-3">{ad.impressions.toLocaleString()}</td>
                          <td className="p-3">{ad.views.toLocaleString()}</td>
                          <td className="p-3">{ad.unique_views.toLocaleString()}</td>
                          <td className="p-3">{ad.clicks.toLocaleString()}</td>
                          <td className="p-3 font-semibold">{ad.ctr.toFixed(2)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </SettingsLayout>
  );
}

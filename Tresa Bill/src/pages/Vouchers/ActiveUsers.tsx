import AppHeader from "@/components/Header/AppHeader";
import SEO from "@/components/SEO";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useBranchActiveUsers, useKickActiveUser, useRouters } from "@/hooks/useRouters";
import { cn } from "@/lib/utils";
import { Loader2, RefreshCw, UserX, WifiOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

interface ActiveSession {
  id: string;
  activeId: string;
  routerId: string;
  routerName: string;
  device: string;
  ip: string;
  mac: string;
  user: string;
  uptime: string;
  uploaded: string;
  downloaded: string;
}

function parseRouterBytes(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = String(value ?? "0").trim();
  const numeric = Number(raw.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(numeric)) return 0;

  const unit = raw.replace(/[0-9.,\s]/g, "").toLowerCase();
  if (unit.startsWith("g")) return numeric * 1024 * 1024 * 1024;
  if (unit.startsWith("m")) return numeric * 1024 * 1024;
  if (unit.startsWith("k")) return numeric * 1024;
  return numeric;
}

function formatDataUsage(value: unknown): string {
  const bytes = parseRouterBytes(value);
  const gb = bytes / (1024 * 1024 * 1024);
  const mb = bytes / (1024 * 1024);

  if (gb >= 1) return `${gb.toFixed(gb >= 10 ? 1 : 2)} GB`;
  if (mb >= 1) return `${mb.toFixed(mb >= 10 ? 1 : 2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${Math.round(bytes)} B`;
}

function getDeviceName(item: Record<string, any>): string {
  const name =
    item["device-name"] ||
    item["host-name"] ||
    item["dhcp-host-name"] ||
    item.hostname ||
    item["dhcp-comment"] ||
    item.comment;

  if (name) return String(name);
  return "Unknown phone";
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function ActiveUsers() {
  const navigate = useNavigate();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("sidebar-collapsed") === "true",
  );

  const [branchId, setBranchId] = useState(
    () => localStorage.getItem("selected-workspace") || "",
  );

  useEffect(() => {
    const handler = (event: Event) =>
      setSidebarCollapsed((event as CustomEvent<{ collapsed: boolean }>).detail.collapsed);
    window.addEventListener("sidebar-collapse-change", handler);
    return () => window.removeEventListener("sidebar-collapse-change", handler);
  }, []);

  useEffect(() => {
    const handler = (event: Event) =>
      setBranchId((event as CustomEvent<{ id: string }>).detail.id);
    window.addEventListener("renult-branch-change", handler);
    return () => window.removeEventListener("renult-branch-change", handler);
  }, []);

  const { data: routers = [] } = useRouters(branchId);

  const activeUsersQueries = useBranchActiveUsers(routers);
  const kickActiveUser = useKickActiveUser();
  const activeUsersLoading =
    routers.length > 0 && activeUsersQueries.some((q) => q.isLoading);
  const activeUsersRefreshing = activeUsersQueries.some((q) => q.isFetching);

  const activeUsers: ActiveSession[] = useMemo(() => {
    return activeUsersQueries.flatMap((query, index) => {
      const router = routers[index];
      const items = query.data?.active_users || [];
      return items.map((item, itemIndex) => {
        const activeId = String(item[".id"] || item.id || itemIndex);
        return {
          id: `${router.id}-${activeId}`,
          activeId,
          routerId: router.id,
          routerName: router.name,
          device: getDeviceName(item),
          ip: String(item.address || "N/A"),
          mac: String(item["mac-address"] || "N/A"),
          user: String(item.user || item.name || "N/A"),
          uptime: String(item.uptime || "N/A"),
          uploaded: formatDataUsage(item["bytes-in"]),
          downloaded: formatDataUsage(item["bytes-out"]),
        };
      });
    });
  }, [activeUsersQueries, routers]);

  const handleRefresh = () => {
    activeUsersQueries.forEach((query) => query.refetch());
  };

  const handleKickOut = async (session: ActiveSession) => {
    const confirmed = window.confirm(
      `Kick out ${session.user} from ${session.routerName}?\n\nThis will immediately remove the active hotspot session for ${session.mac}.`,
    );
    if (!confirmed) return;

    try {
      await kickActiveUser.mutateAsync({
        routerId: session.routerId,
        activeId: session.activeId,
      });
      toast.success(`${session.user} kicked out successfully.`);
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to kick out session."));
    }
  };

  return (
    <div
      className={cn(
        "min-h-screen bg-background transition-all duration-300",
        sidebarCollapsed ? "md:pl-[72px]" : "md:pl-[280px]",
      )}
    >
      <SEO title="Active Users" />
      <AppHeader onCreateForm={() => { }} />

      <main className="max-w-screen mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* Page header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">

            <div>
              <h1 className="text-lg font-bold flex items-center gap-2">
                Active Hotspot Sessions
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Devices currently connected via vouchers, across every router in this branch.
              </p>
            </div>
          </div>

          <Badge
            variant="outline"
            className="bg-primary/5 text-primary border-primary/20 font-bold text-sm px-3 py-1"
          >
            {activeUsersLoading ? "..." : `${activeUsers.length} Online`}
          </Badge>
        </div>

        {/* Sessions table */}
        <Card className="border border-border/30 shadow-sm bg-card rounded-none">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-sm font-bold tracking-tight text-foreground">
              Live Sessions
              <Button
                variant="default"
                size="sm"
                className="h-9"
                onClick={handleRefresh}
                disabled={activeUsersRefreshing}
              >
                <RefreshCw className={cn("h-4 w-4", activeUsersRefreshing && "animate-spin")} />
                Refresh
              </Button>
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Real-time view, refreshes automatically when data changes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto border border-border/20 rounded-md">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead className="font-bold text-xs  text-foreground">Router</TableHead>
                    <TableHead className="font-bold text-xs  text-foreground">Device / IP</TableHead>
                    <TableHead className="font-bold text-xs  text-foreground">MAC Address</TableHead>
                    <TableHead className="font-bold text-xs  text-foreground">Voucher Code</TableHead>
                    <TableHead className="font-bold text-xs  text-foreground">TX / RX</TableHead>
                    <TableHead className="font-bold text-xs  text-foreground text-right">Uptime</TableHead>
                    <TableHead className="font-bold text-xs  text-foreground text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeUsersLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-52 text-center">
                        <div className="flex flex-col items-center justify-center text-muted-foreground">
                          <Loader2 className="w-6 h-6 mb-2 animate-spin" />
                          <span className="text-sm font-semibold">Loading active sessions…</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : activeUsers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-52 text-center">
                        <div className="flex flex-col items-center justify-center text-muted-foreground">
                          <WifiOff className="w-10 h-10 mb-2 stroke-[1.5] text-muted-foreground/60" />
                          <span className="text-sm font-semibold">No active sessions</span>
                          <span className="text-xs mt-0.5">
                            Connected hotspot clients will appear here in real time.
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    activeUsers.map((session) => (
                      <TableRow key={session.id} className="hover:bg-muted/40 transition-colors">
                        <TableCell className="text-xs font-semibold text-foreground">
                          {session.routerName}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-foreground">{session.device}</span>
                            <span className="text-[10px] font-mono text-muted-foreground">{session.ip}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs font-medium text-muted-foreground">
                          {session.mac}
                        </TableCell>
                        <TableCell className="font-mono text-xs font-semibold text-primary">
                          {session.user}
                        </TableCell>
                        <TableCell className="text-xs text-foreground/80">
                          <span className="font-bold text-emerald-500">↑ {session.uploaded}</span>
                          <span className="text-muted-foreground mx-1">/</span>
                          <span className="font-bold text-blue-500">↓ {session.downloaded}</span>
                        </TableCell>
                        <TableCell className="text-right text-xs font-mono text-muted-foreground">
                          {session.uptime}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1.5 text-xs text-destructive hover:text-destructive"
                            onClick={() => handleKickOut(session)}
                            disabled={kickActiveUser.isPending}
                          >
                            {kickActiveUser.isPending ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <UserX className="h-3.5 w-3.5" />
                            )}
                            Kick out
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

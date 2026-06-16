/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/lib/auth";
import { renultApi, RouterMonitorSummary } from "@/api/foreform";
import { Loader2, Menu, PanelLeft, RadioTower, RefreshCw, User } from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import NotificationsDialog from "./NotificationsDialog";
import SideBar from "./SideBar";

interface AppHeaderProps {
  onCreateForm?: () => void;
}

interface PingStatus {
  router_id: string;
  reachable: boolean;
  latency_ms: number | null;
  checking: boolean;
}

export default function AppHeader({ onCreateForm }: AppHeaderProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("sidebar-collapsed") === "true");
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const [monitoring, setMonitoring] = useState<RouterMonitorSummary | null>(null);
  const [enablingRouterId, setEnablingRouterId] = useState<string | null>(null);
  const [pingStatuses, setPingStatuses] = useState<Record<string, PingStatus>>({});
  const [isManualChecking, setIsManualChecking] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);
  const isCheckingRef = useRef(false);

  useEffect(() => {
    const handler = (e: any) => {
      setSidebarCollapsed(e.detail.collapsed);
    };
    window.addEventListener("sidebar-collapse-change", handler);
    return () => window.removeEventListener("sidebar-collapse-change", handler);
  }, []);

  /**
   * Ping fallback: called after SNMP summary loads.
   * Fires a direct ping to any router that has no SNMP data (unconfigured or unknown).
   * Vercel is serverless — the SNMP poller never runs, so these routers are always
   * "waiting / offline" via SNMP alone. The ping gives us real reachability.
   *
   * We ping ANY router not confirmed "online" by SNMP — because on Vercel
   * the poller never runs, so even configured routers stay "offline" forever.
   */
  const runPingFallback = useCallback(async (summary: RouterMonitorSummary) => {
    const needsPing = summary.routers.filter(
      (r) => r.status !== "online"
    );
    if (needsPing.length === 0) return;

    // Mark as "checking" immediately so the UI shows a spinner/pulse
    setPingStatuses((prev) => {
      const next = { ...prev };
      needsPing.forEach((r) => {
        next[r.router_id] = {
          router_id: r.router_id,
          reachable: false,
          latency_ms: null,
          checking: true,
        };
      });
      return next;
    });

    // Fire all pings concurrently
    const results = await Promise.allSettled(
      needsPing.map(async (r) => {
        const res = await renultApi.routers.ping(r.router_id, { timeout_seconds: 5 });
        return { router_id: r.router_id, reachable: res.reachable, latency_ms: res.latency_ms };
      })
    );

    // Persist results
    setPingStatuses((prev) => {
      const next = { ...prev };
      results.forEach((result, idx) => {
        const routerId = needsPing[idx].router_id;
        if (result.status === "fulfilled") {
          next[routerId] = {
            router_id: routerId,
            reachable: result.value.reachable,
            latency_ms: result.value.latency_ms,
            checking: false,
          };
        } else {
          next[routerId] = {
            router_id: routerId,
            reachable: false,
            latency_ms: null,
            checking: false,
          };
        }
      });
      return next;
    });
  }, []);

  const loadMonitoring = useCallback(async () => {
    if (isCheckingRef.current) return;
    isCheckingRef.current = true;
    const branchId = localStorage.getItem("selected-workspace");
    try {
      const summary = await renultApi.monitoring.summary(branchId);
      setMonitoring(summary);
      setLastCheckedAt(new Date());
      runPingFallback(summary);
    } catch {
      setMonitoring(null);
    } finally {
      isCheckingRef.current = false;
    }
  }, [runPingFallback]);

  const handleManualCheck = useCallback(async () => {
    if (isCheckingRef.current) return;
    setIsManualChecking(true);
    await loadMonitoring();
    setIsManualChecking(false);
  }, [loadMonitoring]);

  useEffect(() => {
    loadMonitoring();
    const interval = window.setInterval(loadMonitoring, 30 * 60 * 1000);
    window.addEventListener("renult-branch-change", loadMonitoring);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("renult-branch-change", loadMonitoring);
    };
  }, [loadMonitoring]);

  const handleEnableSnmp = async (routerId: string) => {
    setEnablingRouterId(routerId);
    try {
      const result = await renultApi.monitoring.enableSnmp(routerId);
      toast[result.verified ? "success" : "warning"](result.message);
      await loadMonitoring();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not enable SNMP");
    } finally {
      setEnablingRouterId(null);
    }
  };

  const toggleSidebarCollapse = () => {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    localStorage.setItem("sidebar-collapsed", String(next));
    window.dispatchEvent(new CustomEvent("sidebar-collapse-change", { detail: { collapsed: next } }));
  };

  const getBreadcrumbs = () => {
    const path = location.pathname;
    if (path === "/") {
      return [{ label: "Home", path: "/", isLast: true }];
    }

    const parts = path.split("/").filter(Boolean);
    const breadcrumbs = [{ label: "Home", path: "/", isLast: false }];

    let currentPath = "";
    parts.forEach((part, index) => {
      currentPath += `/${part}`;
      const isLast = index === parts.length - 1;

      let label = part.charAt(0).toUpperCase() + part.slice(1);
      if (part === "settings") label = "Profile";
      if (part === "bookmark-documents") label = "Documents";

      breadcrumbs.push({ label, path: currentPath, isLast });
    });

    return breadcrumbs;
  };

  /**
   * Compute the effective status for a single router:
   * - If SNMP confirms "online", trust it.
   * - For anything else (offline / unknown), use ping fallback if available.
   *   On Vercel the poller never runs, so SNMP "offline" is unreliable.
   */
  const getEffectiveRouterStatus = (
    routerId: string,
    snmpStatus: "online" | "offline" | "unknown",
    configured: boolean
  ): { status: "online" | "offline" | "unknown" | "checking"; method: "snmp" | "ping" } => {
    // Only trust SNMP when it says "online" — that's a real confirmed reading
    if (snmpStatus === "online") {
      return { status: "online", method: "snmp" };
    }
    // For everything else, prefer ping data if we have it
    const ping = pingStatuses[routerId];
    if (!ping) return { status: snmpStatus, method: configured ? "snmp" : "ping" };
    if (ping.checking) return { status: "checking", method: "ping" };
    return { status: ping.reachable ? "online" : "offline", method: "ping" };
  };

  /**
   * Re-compute aggregate online/offline/unknown counts using
   * the merged SNMP + ping status for each router.
   */
  const computedCounts = (() => {
    if (!monitoring) return { online: 0, offline: 0, unknown: 0, total: 0 };
    let online = 0, offline = 0, unknown = 0;
    monitoring.routers.forEach((r) => {
      const eff = getEffectiveRouterStatus(r.router_id, r.status, r.configured);
      if (eff.status === "online") online++;
      else if (eff.status === "offline") offline++;
      else unknown++; // "unknown" or "checking"
    });
    return { online, offline, unknown, total: monitoring.total };
  })();

  // Overall badge status: prefer any "online" signal over "offline"
  const overallStatus =
    computedCounts.online > 0
      ? "online"
      : computedCounts.offline > 0
        ? "offline"
        : "unknown";

  const breadcrumbs = getBreadcrumbs();
  const monitorColor =
    overallStatus === "online"
      ? "bg-emerald-500"
      : overallStatus === "offline"
        ? "bg-red-500"
        : "bg-muted-foreground/25";
  const monitorLabel =
    overallStatus === "online"
      ? "Online"
      : overallStatus === "offline"
        ? "Offline"
        : "Waiting";

  const anyPingChecking = Object.values(pingStatuses).some((p) => p.checking);
  const isBusy = isManualChecking || anyPingChecking;

  return (
    <>
      <header className="sticky top-0 z-30 bg-card/95 backdrop-blur-md border-b border-border/40">
        <div className="flex items-center justify-between h-14 px-3 sm:px-4">
          {/* Left section: hamburger/resize + logo/breadcrumb */}
          <div className="flex items-center gap-3">
            {/* Mobile Hamburger */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-muted/60 transition-colors md:hidden"
              aria-label="Open sidebar menu"
            >
              <Menu className="w-5 h-5 text-foreground/70" />
            </button>

            {/* Desktop Resize Toggle */}
            <button
              onClick={toggleSidebarCollapse}
              className="hidden md:flex w-9 h-9 items-center justify-center transition-colors text-foreground/70"
              aria-label="Toggle sidebar collapse"
            >
              <PanelLeft className="w-[18px] h-[18px]" />
            </button>

            {/* Mobile Logo (hidden on desktop) */}
            <button
              onClick={() => navigate("/")}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity md:hidden"
            >
              <img src="/icons/mini.png" alt="Logo" className="w-8 h-8 object-contain" />
            </button>

            {/* Desktop Dynamic Breadcrumbs */}
            <div className="hidden md:block ml-1">
              <Breadcrumb>
                <BreadcrumbList>
                  {breadcrumbs.map((crumb) => (
                    <React.Fragment key={crumb.path}>
                      <BreadcrumbItem>
                        {crumb.isLast ? (
                          <BreadcrumbPage className="font-semibold text-foreground/80">{crumb.label}</BreadcrumbPage>
                        ) : (
                          <BreadcrumbLink asChild>
                            <Link to={crumb.path} className="text-muted-foreground hover:text-foreground">
                              {crumb.label}
                            </Link>
                          </BreadcrumbLink>
                        )}
                      </BreadcrumbItem>
                      {!crumb.isLast && <BreadcrumbSeparator />}
                    </React.Fragment>
                  ))}
                </BreadcrumbList>
              </Breadcrumb>
            </div>
          </div>

          {/* Right section: actions */}
          <div className="flex items-center gap-4 sm:gap-4">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 h-9 px-3 rounded font-semibold text-xs sm:text-sm"
                  onClick={handleManualCheck}
                >
                  {isBusy ? (
                    <Loader2 className="h-2.5 w-2.5 animate-spin text-amber-500" />
                  ) : (
                    <span className={`h-2.5 w-2.5 rounded-full ${monitorColor}`} />
                  )}
                  <span className="hidden sm:inline">{isBusy ? "Checking…" : monitorLabel}</span>
                </Button>
              </PopoverTrigger>

              <PopoverContent align="end" className="w-80 p-4 rounded">
                {/* Header row */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold">Router Status</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">SNMP · Ping fallback</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleManualCheck}
                      disabled={isBusy}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
                      aria-label="Refresh status"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${isBusy ? "animate-spin" : ""}`} />
                    </button>
                    <span
                      className={`rounded px-2 py-1 text-[10px] font-bold ${overallStatus === "online"
                          ? "bg-emerald-100 text-emerald-600"
                          : overallStatus === "offline"
                            ? "bg-red-100 text-red-600"
                            : "bg-muted text-muted-foreground"
                        }`}
                    >
                      {isBusy ? "Checking" : monitorLabel}
                    </span>
                  </div>
                </div>

                {/* Visual bar */}
                <div
                  className="mt-4 flex h-7 items-stretch justify-between gap-1"
                  role="img"
                  aria-label="Router status bar"
                >
                  {Array.from({ length: Math.max(1, monitoring?.total || 1) }, (_, index) => {
                    const router = monitoring?.routers[index];
                    const eff = router
                      ? getEffectiveRouterStatus(router.router_id, router.status, router.configured)
                      : null;
                    const barColor =
                      eff?.status === "online"
                        ? "bg-emerald-500"
                        : eff?.status === "offline"
                          ? "bg-red-500"
                          : eff?.status === "checking"
                            ? "bg-amber-400 animate-pulse"
                            : "bg-muted-foreground/20";
                    return <span key={index} className={`min-w-1 flex-1 rounded-full ${barColor}`} />;
                  })}
                </div>

                {/* Aggregate count */}
                <p className="mt-3 text-xs text-muted-foreground">
                  {monitoring?.total
                    ? `${computedCounts.online} online, ${computedCounts.offline} offline, ${computedCounts.unknown} ${isBusy ? "checking" : "unknown"}`
                    : "No active routers are being monitored."}
                </p>

                {/* Per-router detail list */}
                {monitoring && monitoring.routers.length > 0 && (
                  <div className="mt-4 space-y-2 border-t pt-3">
                    {monitoring.routers.map((router) => {
                      const eff = getEffectiveRouterStatus(router.router_id, router.status, router.configured);
                      const ping = pingStatuses[router.router_id];
                      return (
                        <div
                          key={router.router_id}
                          className="flex items-center justify-between gap-3 rounded border border-border/50 p-2"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium">{router.router_name}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {eff.method === "ping"
                                ? ping?.checking
                                  ? "Pinging…"
                                  : ping?.latency_ms != null
                                    ? `Ping · ${ping.latency_ms}ms`
                                    : "Ping · no response"
                                : "SNMP v2c"}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {/* Status badge */}
                            <span
                              className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${eff.status === "online"
                                  ? "bg-emerald-100 text-emerald-600"
                                  : eff.status === "offline"
                                    ? "bg-red-100 text-red-600"
                                    : "bg-amber-100 text-amber-600"
                                }`}
                            >
                              {eff.status === "checking" ? "…" : eff.status}
                            </span>

                            {/* Enable SNMP button for unconfigured routers */}
                            {!router.configured && (
                              <Button
                                size="sm"
                                className="h-7 shrink-0 gap-1.5 px-2 text-[10px]"
                                disabled={enablingRouterId !== null}
                                onClick={() => handleEnableSnmp(router.router_id)}
                              >
                                {enablingRouterId === router.router_id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <RadioTower className="h-3 w-3" />
                                )}
                                SNMP
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Footer */}
                <p className="mt-4 border-t pt-3 text-[11px] text-muted-foreground">
                  {isBusy
                    ? "Checking routers…"
                    : lastCheckedAt
                      ? `Last checked ${lastCheckedAt.toLocaleTimeString()} · auto-refreshes every 30 min`
                      : "Tap the status button to check"}
                </p>
              </PopoverContent>
            </Popover>

            <NotificationsDialog />

            {/* User avatar */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  className="w-9 h-9 rounded-full bg-primary/90 text-primary-foreground flex items-center justify-center
                    text-sm font-bold tracking-tight hover:ring-2 hover:ring-primary/30 transition-all
                    focus:outline-none focus:ring-2 focus:ring-primary/40 shrink-0"
                  aria-label="Account menu"
                >
                  {user?.full_name?.[0]?.toUpperCase() || "U"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-56 rounded p-2 border-border/60 shadow-xl backdrop-blur-md bg-card/95"
              >
                <DropdownMenuLabel className="px-3 py-2">
                  <div className="flex flex-col space-y-0.5">
                    <p className="text-sm font-bold truncate">{user?.full_name || "My Account"}</p>
                    {user?.email && (
                      <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                    )}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-border/40 my-1" />
                {user?.account_type !== "staff" ? (
                  <DropdownMenuItem
                    onClick={() => navigate("/settings")}
                    className="rounded px-3 py-2 cursor-pointer focus:bg-primary/10 focus:text-primary transition-all gap-3"
                  >
                    <User className="w-4 h-4" />
                    <span className="font-semibold text-sm">View Profile</span>
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onClick={() => navigate("/profile")}
                    className="rounded px-3 py-2 cursor-pointer focus:bg-primary/10 focus:text-primary transition-all gap-3"
                  >
                    <User className="w-4 h-4" />
                    <span className="font-semibold text-sm">My Profile</span>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={() => {
                    logout();
                    navigate("/login", { replace: true });
                  }}
                  className="rounded px-3 py-2 cursor-pointer focus:bg-primary/10 focus:text-primary transition-all gap-3"
                >
                  <span className="font-semibold text-sm">Logout</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Sidebar */}
      <SideBar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
    </>
  );
}

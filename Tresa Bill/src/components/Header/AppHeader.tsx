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
import { Loader2, Menu, PanelLeft, RadioTower, User } from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import NotificationsDialog from "./NotificationsDialog";
import SideBar from "./SideBar";

interface AppHeaderProps {
  onCreateForm?: () => void;
}

export default function AppHeader({ onCreateForm }: AppHeaderProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("sidebar-collapsed") === "true");
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const [monitoring, setMonitoring] = useState<RouterMonitorSummary | null>(null);
  const [enablingRouterId, setEnablingRouterId] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: any) => {
      setSidebarCollapsed(e.detail.collapsed);
    };
    window.addEventListener("sidebar-collapse-change", handler);
    return () => window.removeEventListener("sidebar-collapse-change", handler);
  }, []);

  const loadMonitoring = useCallback(async () => {
    const branchId = localStorage.getItem("selected-workspace");
    try {
      const summary = await renultApi.monitoring.summary(branchId);
      setMonitoring(summary);
    } catch {
      setMonitoring(null);
    }
  }, []);

  useEffect(() => {
    loadMonitoring();
    const interval = window.setInterval(loadMonitoring, 60000);
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
      return [
        { label: "Home", path: "/", isLast: true }
      ];
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

      breadcrumbs.push({
        label,
        path: currentPath,
        isLast
      });
    });

    return breadcrumbs;
  };

  const breadcrumbs = getBreadcrumbs();
  const monitorColor = monitoring?.status === "online"
    ? "bg-emerald-500"
    : monitoring?.status === "offline"
      ? "bg-red-500"
      : "bg-muted-foreground/25";
  const monitorLabel = monitoring?.status === "online"
    ? "Online"
    : monitoring?.status === "offline"
      ? "Offline"
      : "Waiting";

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
              <img
                src="/icons/mini.png"
                alt="Logo"
                className="w-8 h-8 object-contain"
              />
            </button>

            {/* Desktop Dynamic Breadcrumbs */}
            <div className="hidden md:block ml-1">
              <Breadcrumb>
                <BreadcrumbList>
                  {breadcrumbs.map((crumb, idx) => (
                    <React.Fragment key={crumb.path}>
                      <BreadcrumbItem>
                        {crumb.isLast ? (
                          <BreadcrumbPage className="font-semibold text-foreground/80">{crumb.label}</BreadcrumbPage>
                        ) : (
                          <BreadcrumbLink asChild>
                            <Link to={crumb.path} className="text-muted-foreground hover:text-foreground">{crumb.label}</Link>
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
                <Button variant="outline" size="sm" className="gap-2 h-9 px-3 rounded font-semibold text-xs sm:text-sm">
                  <span className={`h-2.5 w-2.5 rounded-full ${monitorColor}`} />
                  <span className="hidden sm:inline">{monitorLabel}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-4 rounded">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold">Router SNMP Status</p>
                  </div>
                  <span className={`rounded px-2 py-1 text-[10px] font-bold ${
                    monitoring?.status === "online"
                      ? "bg-emerald-100 text-emerald-600"
                      : monitoring?.status === "offline"
                        ? "bg-red-100 text-red-600"
                        : "bg-muted text-muted-foreground"
                  }`}>{monitorLabel}</span>
                </div>
                <div
                  className="mt-4 flex h-7 items-stretch justify-between gap-1"
                  role="img"
                  aria-label="Router SNMP status indicator"
                >
                  {Array.from({ length: Math.max(1, monitoring?.total || 1) }, (_, index) => (
                    <span
                      key={index}
                      className={`min-w-1 flex-1 rounded-full ${
                        index < (monitoring?.online || 0)
                          ? "bg-emerald-500"
                          : index < (monitoring?.online || 0) + (monitoring?.offline || 0)
                            ? "bg-red-500"
                            : "bg-muted-foreground/20"
                      }`}
                    />
                  ))}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  {monitoring?.total
                    ? `${monitoring.online} online, ${monitoring.offline} offline, ${monitoring.unknown} waiting`
                    : "No active routers are being monitored."}
                </p>
                {monitoring?.routers.some((router) => !router.configured) && (
                  <div className="mt-4 space-y-2 border-t pt-3">
                    <p className="text-[11px] font-semibold text-foreground">
                      SNMP setup required
                    </p>
                    {monitoring.routers
                      .filter((router) => !router.configured)
                      .map((router) => (
                        <div key={router.router_id} className="flex items-center justify-between gap-3 rounded border border-border/50 p-2">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium">{router.router_name}</p>
                            <p className="text-[10px] text-muted-foreground">
                              Physical MikroTik + CHR
                            </p>
                          </div>
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
                            Enable SNMP
                          </Button>
                        </div>
                      ))}
                  </div>
                )}
                <p className="mt-4 border-t pt-3 text-[11px] text-muted-foreground">
                  Polling every 60s via SNMP v2c
                  {monitoring?.last_checked_at
                    ? ` · last checked ${new Date(monitoring.last_checked_at).toLocaleTimeString()}`
                    : ""}
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
                    <p className="text-sm font-bold truncate">
                      {user?.full_name || "My Account"}
                    </p>
                    {user?.email && <p className="text-xs text-muted-foreground truncate">{user.email}</p>}
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

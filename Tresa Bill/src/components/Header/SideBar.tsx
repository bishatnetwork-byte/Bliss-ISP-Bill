import { renultApi, RouterMonitorSummary } from "@/api/foreform";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { HelpDeskIcon, MikrotikIcon, MoneyIcon, SettingsIcon, VoucherIcon, WithdrawIcon } from "@/constants/Icons";
import { useAuth } from "@/lib/auth";
import {
  Check,
  ChevronDown,
  ChevronsUpDown,
  CircleUser,
  Globe,
  History,
  Home,
  LucidePercentSquare,
  Megaphone,
  MessageCircleMoreIcon,
  MessagesSquare,
  MoreHorizontal,
  Network,
  Package,
  PackagePlusIcon,
  PackageSearchIcon,
  PanelLeft,
  Plus,
  Settings,
  ShieldCheck,
  Ticket,
  Users
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

interface SideBarProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SubNavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}

interface NavItem {
  label: string;
  icon: React.ReactNode;
  path: string;
  iconColor?: string;
  hasSubmenu?: boolean;
  submenu?: SubNavItem[];
}

const primaryNavItems: NavItem[] = [
  {
    label: "Home",
    icon: <Home className="w-5 h-5" />,
    path: "/",
  },
  {
    label: "My Active Users",
    icon: <LucidePercentSquare className="w-5 h-5" />, //Mikrotiks Router
    path: "/active-users",
  },
  {
    label: "Wifi Prices",
    icon: <PackagePlusIcon className="w-5 h-5" />, //Mikrotiks Router
    path: "/packages",
  },
  {
    label: "Vouchers & Users",
    icon: <VoucherIcon className="w-5 h-5" />,
    path: "/vouchers",
    submenu: [
      { label: "Create Vouchers", path: "/vouchers/create", icon: <Ticket className="w-4 h-4" /> },
      { label: "Vouchers", path: "/vouchers", icon: <Ticket className="w-4 h-4" /> },
    ],
  },
  {
    label: "Revenue Sales",
    icon: <MoneyIcon className="w-5 h-5" />,
    path: "/sales",
  },
];

const supportNavItems: NavItem[] = [
  {
label: "Bulk Sms",
    icon: <MessageCircleMoreIcon className="w-5 h-5" />,
    path: "/bulk-sms",
  },
  {
    label: "Withdrawals",
    icon: <WithdrawIcon className="w-5 h-5" />,
    path: "/withdrawals",
  },
  {
    label: "Help Desk",
    icon: <HelpDeskIcon className="w-5 h-5 " />,
    path: "/voucher-support",
  },
  {
    label: "Transactions",
    icon: <History className="w-5 h-5" />,
    path: "/transactions"
  }
];

const secondaryNavItems: NavItem[] = [
  {
    label: "Mikrotiks",
    icon: <MikrotikIcon className="w-5 h-5" />, //Mikrotiks Router
    path: "/router",
  },
  {
    label: "Captive Portal",
    icon: <PackageSearchIcon className="w-5 h-5" />,
    path: "/captive-portals",
  },
  {
    label: "Remote Access",
    icon: <Globe className="w-5 h-5" />,
    path: "/remote-access",
  },
  {
    label: "Network Tree",
    icon: <Network className="w-5 h-5" />,
    path: "/network",
  },
  {
    label: "Branches & Staff",
    icon: <Megaphone className="w-5 h-5" />,
    path: "/branches",
  },
  {
    label: "Messages",
    icon: <MessagesSquare className="w-5 h-5" />,
    path: "/messages",
  },
  {
    label: "My Settings",
    icon: <SettingsIcon className="w-5 h-5" />,
    path: "/settings",
    hasSubmenu: true,
  },
];

const PERMISSION_BY_PATH: Record<string, string> = {
  "/": "dashboard",
  "/router": "routers",
  "/router/packages": "routers",
  "/sales": "sales",
  "/vouchers": "vouchers",
  "/vouchers/create": "vouchers",
  "/vouchers/active-users": "vouchers",
  "/active-users": "vouchers",
  "/voucher-support": "support",
  "/messages": "messages",
  "/network": "network",
  "/remote-access": "network",
  "/captive-portals": "captive",
  "/campaigns": "support",
  "/withdrawals": "withdrawals",
  "/branches": "branches",
  "/settings": "settings",
};

interface Workspace {
  id: string;
  name: string;
  avatar_url?: string;
}

interface PingStatus {
  reachable: boolean;
  checking: boolean;
}

interface RouterStatusCache {
  cachedAt: number;
  monitoring: RouterMonitorSummary;
  pingStatuses: Record<string, PingStatus>;
}

// Routers are polled in the background every 30 minutes - frequent enough to
// notice an outage without re-triggering the "checking..." pulse animation
// (and the resulting sidebar flicker) on every navigation.
const ROUTER_STATUS_REFRESH_INTERVAL = 30 * 60 * 1000;
const ROUTER_STATUS_CACHE_TTL = ROUTER_STATUS_REFRESH_INTERVAL;
const routerStatusCacheKey = (branchId: string) =>
  `renult-router-status:${branchId}`;

const readRouterStatusCache = (branchId: string): RouterStatusCache | null => {
  try {
    const cached = sessionStorage.getItem(routerStatusCacheKey(branchId));
    return cached ? JSON.parse(cached) as RouterStatusCache : null;
  } catch {
    return null;
  }
};

const writeRouterStatusCache = (
  branchId: string,
  monitoring: RouterMonitorSummary,
  pingStatuses: Record<string, PingStatus>,
) => {
  try {
    sessionStorage.setItem(
      routerStatusCacheKey(branchId),
      JSON.stringify({ cachedAt: Date.now(), monitoring, pingStatuses }),
    );
  } catch {
    // Status caching is optional when browser storage is unavailable.
  }
};

// Cache the workspace list + selection so the workspace switcher (and the
// router status grid beneath it) doesn't flash back to "Select branch" every
// time the sidebar remounts on navigation - it renders the last-known state
// immediately while the branch list re-validates in the background.
const WORKSPACES_CACHE_KEY = "renult-workspaces-cache";

interface WorkspacesCache {
  workspaces: Workspace[];
  selectedWorkspaceId: string;
}

const readWorkspacesCache = (): WorkspacesCache | null => {
  try {
    const cached = sessionStorage.getItem(WORKSPACES_CACHE_KEY);
    return cached ? JSON.parse(cached) as WorkspacesCache : null;
  } catch {
    return null;
  }
};

const writeWorkspacesCache = (workspaces: Workspace[], selectedWorkspaceId: string) => {
  try {
    sessionStorage.setItem(WORKSPACES_CACHE_KEY, JSON.stringify({ workspaces, selectedWorkspaceId }));
  } catch {
    // Workspace caching is optional when browser storage is unavailable.
  }
};

export default function SideBar({ isOpen, onClose }: SideBarProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(
    () => localStorage.getItem("sidebar-collapsed") === "true",
  );
  const cachedWorkspaces = readWorkspacesCache();
  const cachedSelected = cachedWorkspaces?.workspaces.find(
    (workspace) => workspace.id === cachedWorkspaces.selectedWorkspaceId,
  ) ?? cachedWorkspaces?.workspaces[0];
  const [workspaces, setWorkspaces] = useState<Workspace[]>(() => cachedWorkspaces?.workspaces ?? []);
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | undefined>(() => cachedSelected);
  const [monitoring, setMonitoring] = useState<RouterMonitorSummary | null>(() =>
    cachedSelected ? readRouterStatusCache(cachedSelected.id)?.monitoring ?? null : null,
  );
  const [pingStatuses, setPingStatuses] = useState<Record<string, PingStatus>>(() =>
    cachedSelected ? readRouterStatusCache(cachedSelected.id)?.pingStatuses ?? {} : {},
  );
  const [expandedMenu, setExpandedMenu] = useState<string | null>(null);

  const handleSelectWorkspace = (workspace: Workspace) => {
    setSelectedWorkspace(workspace);
    localStorage.setItem("selected-workspace", workspace.id);
    writeWorkspacesCache(workspaces, workspace.id);
    window.dispatchEvent(
      new CustomEvent("renult-branch-change", {
        detail: { id: workspace.id, name: workspace.name },
      }),
    );
  };

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ collapsed: boolean }>).detail;
      setIsCollapsed(detail.collapsed);
    };
    window.addEventListener("sidebar-collapse-change", handler);
    return () => window.removeEventListener("sidebar-collapse-change", handler);
  }, []);

  useEffect(() => {
    let mounted = true;
    renultApi.branches
      .list()
      .then((branches) => {
        if (!mounted || branches.length === 0) return;
        const nextWorkspaces = branches.map((branch) => ({
          id: branch.id,
          name: branch.name,
          avatar_url: branch.avatar_url,
        }));
        setWorkspaces(nextWorkspaces);
        const saved = localStorage.getItem("selected-workspace");
        const selected =
          nextWorkspaces.find((workspace) => workspace.id === saved) ||
          nextWorkspaces[0];
        setSelectedWorkspace(selected);
        localStorage.setItem("selected-workspace", selected.id);
        writeWorkspacesCache(nextWorkspaces, selected.id);
        window.dispatchEvent(
          new CustomEvent("renult-branch-change", {
            detail: {
              id: selected.id,
              name: selected.name,
              avatar_url: selected.avatar_url,
            },
          }),
        );
      })
      .catch(() => undefined);
    const branchHandler = (event: Event) => {
      const branch = (
        event as CustomEvent<{
          id?: string;
          name?: string;
          avatar_url?: string;
        }>
      ).detail;
      if (!branch?.id) return;
      const workspace = {
        id: branch.id,
        name: branch.name || "Branch",
        avatar_url: branch.avatar_url,
      };
      setWorkspaces((prev) => {
        const exists = prev.some((item) => item.id === workspace.id);
        const next = exists
          ? prev.map((item) =>
            item.id === workspace.id ? { ...item, ...workspace } : item,
          )
          : [workspace, ...prev];
        writeWorkspacesCache(next, workspace.id);
        return next;
      });
      setSelectedWorkspace(workspace);
    };
    window.addEventListener("renult-branch-change", branchHandler);
    return () => {
      mounted = false;
      window.removeEventListener("renult-branch-change", branchHandler);
    };
  }, []);

  useEffect(() => {
    if (!selectedWorkspace?.id) return;
    const branchId = selectedWorkspace.id;
    let mounted = true;
    let refreshTimer: number | undefined;
    const cached = readRouterStatusCache(branchId);
    const cacheAge = cached ? Date.now() - cached.cachedAt : Infinity;

    setMonitoring(cached?.monitoring ?? null);
    setPingStatuses(cached?.pingStatuses ?? {});

    const loadMonitoring = async () => {
      try {
        const summary = await renultApi.monitoring.summary(branchId);
        if (!mounted) return;
        setMonitoring(summary);

        const needsPing = summary.routers.filter((router) => router.status !== "online");
        if (needsPing.length === 0) {
          setPingStatuses({});
          writeRouterStatusCache(branchId, summary, {});
          return;
        }

        setPingStatuses((previous) => {
          const next = { ...previous };
          needsPing.forEach((router) => {
            next[router.router_id] = { reachable: false, checking: true };
          });
          return next;
        });

        const results = await Promise.allSettled(
          needsPing.map((router) =>
            renultApi.routers.ping(router.router_id, { timeout_seconds: 5 }),
          ),
        );
        if (!mounted) return;

        const resolvedPingStatuses = results.reduce<Record<string, PingStatus>>((next, result, index) => {
          next[needsPing[index].router_id] = {
            reachable: result.status === "fulfilled" && result.value.reachable,
            checking: false,
          };
          return next;
        }, {});
        setPingStatuses(resolvedPingStatuses);
        writeRouterStatusCache(branchId, summary, resolvedPingStatuses);
      } catch {
        if (!mounted || cached) return;
        setMonitoring(null);
      }
    };

    const scheduleRefresh = (delay: number) => {
      refreshTimer = window.setTimeout(async () => {
        await loadMonitoring();
        if (mounted) scheduleRefresh(ROUTER_STATUS_REFRESH_INTERVAL);
      }, delay);
    };

    scheduleRefresh(
      cacheAge < ROUTER_STATUS_CACHE_TTL
        ? ROUTER_STATUS_CACHE_TTL - cacheAge
        : 0,
    );

    return () => {
      mounted = false;
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
    };
  }, [selectedWorkspace?.id]);

  const toggleCollapse = () => {
    const next = !isCollapsed;
    setIsCollapsed(next);
    localStorage.setItem("sidebar-collapsed", String(next));
    window.dispatchEvent(
      new CustomEvent("sidebar-collapse-change", {
        detail: { collapsed: next },
      }),
    );
  };

  const handleNavigate = (path: string) => {
    if (path === "/#templates") {
      navigate("/");
      // Trigger templates open via a custom event
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent("open-templates"));
      }, 100);
    } else {
      navigate(path);
    }
    onClose();
  };

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  const isSubActive = (path: string) => {
    const [pathname, search = ""] = path.split("?");
    const currentSearch = location.search.replace(/^\?/, "");
    return location.pathname === pathname && currentSearch === search;
  };

  // Auto-expand a submenu when one of its links is the active route.
  useEffect(() => {
    const allItems = [...primaryNavItems, ...supportNavItems, ...secondaryNavItems];
    const currentSearch = location.search.replace(/^\?/, "");
    const activeParent = allItems.find((item) =>
      item.submenu?.some((sub) => {
        const [pathname, search = ""] = sub.path.split("?");
        return location.pathname === pathname && currentSearch === search;
      }),
    );
    if (activeParent) setExpandedMenu(activeParent.label);
  }, [location.pathname, location.search]);

  const selectedWorkspaceName = selectedWorkspace?.name || "Select branch";
  const selectedWorkspaceInitials = selectedWorkspace?.name
    ? selectedWorkspace.name.slice(0, 2).toUpperCase()
    : "BR";
  const monitoredRouters = monitoring?.routers ?? [];
  const routerStatusGridClass =
    monitoredRouters.length >= 4 ? "grid-cols-2" : "grid-cols-1";
  const getEffectiveRouterStatus = (
    routerId: string,
    monitoringStatus: "online" | "offline" | "unknown",
  ): "online" | "offline" | "unknown" | "checking" => {
    if (monitoringStatus === "online") return "online";
    const pingStatus = pingStatuses[routerId];
    if (!pingStatus) return monitoringStatus;
    if (pingStatus.checking) return "checking";
    return pingStatus.reachable ? "online" : "offline";
  };
  const effectiveRouterCounts = monitoredRouters.reduce(
    (counts, router) => {
      const status = getEffectiveRouterStatus(router.router_id, router.status);
      if (status === "online") counts.online += 1;
      else if (status === "offline") counts.offline += 1;
      else counts.unknown += 1;
      return counts;
    },
    { online: 0, offline: 0, unknown: 0 },
  );

  const renderNavItem = (item: NavItem) => {
    const permissions = user?.account_type === "staff"
      ? new Set([...(user.staff_permissions || []), ...(user.staff_permissions?.includes("support") ? ["messages"] : [])])
      : user?.allowed_sections?.length
        ? new Set(user.allowed_sections)
        : null;
    if (permissions) {
      if (user?.account_type === "staff" && ["/withdrawals", "/settings", "/branches"].includes(item.path)) return null;
      const required = PERMISSION_BY_PATH[item.path];
      if (required && !permissions.has(required)) return null;
    }

    const submenu = item.submenu?.filter((sub) => {
      if (!permissions) return true;
      const required = PERMISSION_BY_PATH[sub.path.split("?")[0]];
      return !required || permissions.has(required);
    });
    const hasSubmenuItems = !!submenu && submenu.length > 0;
    const subActive = submenu?.some((sub) => isSubActive(sub.path)) ?? false;
    const active = isActive(item.path) || subActive;
    const isExpanded = expandedMenu === item.label;
    const iconClassName = `shrink-0 ${active ? "text-primary" : item.iconColor || "text-muted-foreground"}`;
    const routerAvailability =
      effectiveRouterCounts.online > 0
        ? "online"
        : effectiveRouterCounts.offline > 0
          ? "offline"
          : "unknown";
    const routerBadgeColor =
      routerAvailability === "online"
        ? "bg-emerald-100 text-emerald-700"
        : routerAvailability === "offline"
          ? "bg-red-100 text-red-700"
          : "bg-muted text-muted-foreground";

    const handleItemClick = () => {
      if (hasSubmenuItems) {
        setExpandedMenu((prev) => (prev === item.label ? null : item.label));
      }
      handleNavigate(item.path);
    };

    const routerCountBadge = item.label === "Mikrotiks" && monitoring && monitoring.total > 0 ? (
      <span
        className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold ${routerBadgeColor}`}
        title={`${effectiveRouterCounts.online} online, ${effectiveRouterCounts.offline} offline`}
      >
        {monitoring.total}
      </span>
    ) : null;

    const buttonContent = (
      <button
        key={item.label}
        onClick={handleItemClick}
        className={`
          flex items-center rounded text-sm font-medium
          transition-all duration-150 ease-in-out group
          ${isCollapsed ? "justify-center w-10 h-10 mx-auto relative" : "w-full justify-between px-4 py-2.5"}
          ${active
            ? "bg-primary/10 text-primary font-semibold"
            : "text-foreground/80 hover:bg-muted/60"
          }
        `}
      >
        {isCollapsed ? (
          <span className={iconClassName}>
            {item.icon}
            {item.label === "Mikrotiks" && monitoring && monitoring.total > 0 && (
              <span
                className={`absolute right-0 top-0 inline-flex min-w-4 items-center justify-center rounded-full border border-white px-1 text-[9px] font-bold leading-4 ${routerBadgeColor}`}
                title={`${effectiveRouterCounts.online} online, ${effectiveRouterCounts.offline} offline`}
              >
                {monitoring.total}
              </span>
            )}
          </span>
        ) : (
          <>
            <div className="flex items-center gap-4 overflow-hidden">
              <span className={iconClassName}>
                {item.icon}
              </span>
              <span className="truncate">{item.label}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {routerCountBadge}
              {item.hasSubmenu && (
                <MoreHorizontal className="w-4 h-4 text-muted-foreground group-hover:text-foreground shrink-0 transition-colors" />
              )}
              {hasSubmenuItems && (
                <ChevronDown
                  className={`w-4 h-4 text-muted-foreground group-hover:text-foreground shrink-0 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                />
              )}
            </div>
          </>
        )}
      </button>
    );

    if (isCollapsed) {
      return (
        <Tooltip key={item.label}>
          <TooltipTrigger asChild>{buttonContent}</TooltipTrigger>
          <TooltipContent
            side="right"
            className="font-semibold text-xs bg-slate-900 text-white border-slate-900 rounded py-1 px-2.5"
          >
            {item.label}
          </TooltipContent>
        </Tooltip>
      );
    }

    if (hasSubmenuItems && isExpanded) {
      return (
        <div key={item.label}>
          {buttonContent}
          <div className="mt-0.5 ml-[34px] pl-3 space-y-0.5">
            {submenu!.map((sub) => {
              const subItemActive = isSubActive(sub.path);
              return (
                <button
                  key={sub.label}
                  onClick={() => handleNavigate(sub.path)}
                  className={`flex w-full items-center gap-2.5 rounded px-3 py-2 text-sm font-medium transition-colors ${subItemActive
                    ? "text-primary font-semibold border-l-[3px] border-l-primary rounded-none"
                    : "text-foreground/70 hover:bg-muted/60"
                    }`}
                >
                  <span className={subItemActive ? "text-primary" : "text-muted-foreground"}>
                    {sub.icon}
                  </span>
                  <span className="truncate">{sub.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    return buttonContent;
  };

  const platformAdminItem: NavItem = {
    label: "Platform Admin",
    icon: <ShieldCheck className="w-5 h-5" />,
    path: "/platform-admin",
  };

  return (
    <TooltipProvider>
      {/* Backdrop overlay */}
      <div
        className={`
          fixed inset-0 z-40 bg-black/30 backdrop-blur-[5px]
          transition-opacity duration-300 shadow-md md:hidden
          ${isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}
        `}
        onClick={onClose}
      />

      {/* Sidebar panel */}
      <aside
        className={`
          fixed top-0 left-0 z-50 h-full bg-white
          border-r border-border/80 shadow-2xl md:shadow-none md:z-20
          flex flex-col custom-scrollbar
          transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]
          md:translate-x-0
          ${isCollapsed ? "w-[72px]" : "w-[280px]"}
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        <div className="flex items-center justify-center p-3">
          {isCollapsed === false ? (
            <img src="/icons/logo_2.png" alt="Logo" className="h-12" />
          ) : (
            <img src="/icons/mini.png" alt="Logo" className="" />
          )}
        </div>

        {/* Sidebar header (Workspace Selector) */}
        <div className={`p-3 ${isCollapsed ? "flex justify-center" : ""}`}>
          <Popover>
            <PopoverTrigger asChild>
              <button
                className={`flex items-center border border-border/60 rounded bg-card/50 transition-all duration-150 hover:bg-muted/40 ${isCollapsed ? "justify-center w-10 h-10 mx-auto" : "w-full justify-between px-3 py-2"}`}
                aria-label="Select workspace"
              >
                {isCollapsed ? (
                  <Avatar className="w-6 h-6 shrink-0">
                    <AvatarImage src={selectedWorkspace?.avatar_url} />
                    <AvatarFallback className="text-[10px] font-bold">
                      {selectedWorkspaceInitials}
                    </AvatarFallback>
                  </Avatar>
                ) : (
                  <>
                    <div className="flex items-center gap-2.5 overflow-hidden">
                      <Avatar className="w-6 h-6 shrink-0">
                        <AvatarImage src={selectedWorkspace?.avatar_url} />
                        <AvatarFallback className="text-[10px] font-bold">
                          {selectedWorkspaceInitials}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-semibold text-foreground/80 tracking-tight whitespace-nowrap">
                        {selectedWorkspaceName}
                      </span>
                    </div>
                    <ChevronsUpDown className="w-4 h-4 text-muted-foreground shrink-0" />
                  </>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent
              side={isCollapsed ? "right" : "bottom"}
              align="start"
              className="w-64 p-2 bg-popover border border-border/60 shadow rounded"
            >
              <div className="space-y-0.5 my-1">
                {workspaces.map((workspace) => {
                  const isActive = workspace.id === selectedWorkspace?.id;
                  return (
                    <button
                      key={workspace.id}
                      onClick={() => handleSelectWorkspace(workspace)}
                      className={`w-full flex items-center justify-between px-2.5 py-2 rounded text-sm transition-colors text-left ${isActive
                        ? "bg-primary/10 text-primary font-semibold"
                        : "hover:bg-muted/60 text-foreground/80"
                        }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar className="w-5 h-5 shrink-0">
                          <AvatarImage src={workspace.avatar_url} />
                          <AvatarFallback className="text-[9px] font-bold">
                            {workspace.name.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="truncate">{workspace.name}</span>
                      </div>
                      {isActive && (
                        <Check className="w-4 h-4 text-primary shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="border-t border-border/40 mt-1.5 pt-1.5">
                <button
                  onClick={() => handleNavigate("/branches")}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded text-sm text-foreground/80 hover:bg-muted/60 transition-colors text-left"
                >
                  <Settings className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium">Manage Hotspot Branches</span>
                </button>
                <button
                  onClick={() => handleNavigate("/branches?new=branch")}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded text-sm text-foreground/80 hover:bg-muted/60 transition-colors text-left"
                >
                  <Plus className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium">Create New Branch</span>
                </button>
                <button
                  onClick={() => handleNavigate("/branches?new=staff")}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded text-sm text-foreground/80 hover:bg-muted/60 transition-colors text-left"
                >
                  <CircleUser className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium">Create New Staff/Agent</span>
                </button>
              </div>
            </PopoverContent>
          </Popover>
          {!isCollapsed && monitoredRouters.length > 0 && (
            <div
              className={`mt-2 grid gap-1.5 ${routerStatusGridClass}`}
              aria-label="Router connection statuses"
            >
              {monitoredRouters.map((router) => {
                const effectiveStatus = getEffectiveRouterStatus(
                  router.router_id,
                  router.status,
                );
                const isOnline = effectiveStatus === "online";
                const statusLabel =
                  effectiveStatus === "checking"
                    ? "Checking"
                    : effectiveStatus === "unknown"
                      ? "Unknown"
                      : isOnline
                        ? "Online"
                        : "Offline";
                const statusColor = isOnline
                  ? "text-emerald-600"
                  : effectiveStatus === "offline"
                    ? "text-rose-600"
                    : "text-amber-600";
                const dotColor = isOnline
                  ? "bg-emerald-500"
                  : effectiveStatus === "offline"
                    ? "bg-rose-500"
                    : "bg-amber-500";
                const borderColor = isOnline
                  ? "border-emerald-400"
                  : effectiveStatus === "offline"
                    ? "border-rose-400"
                    : "border-amber-400";

                return (
                  <div
                    key={router.router_id}
                    className={`flex min-w-0 items-center justify-between gap-2 rounded border bg-muted/20 px-2.5 py-1.5 ${borderColor}`}
                    title={`${router.router_name}: ${statusLabel}`}
                  >
                    <span className="truncate text-[11px] font-semibold text-foreground/75">
                      {router.router_name}
                    </span>
                    <span className={`flex shrink-0 items-center gap-1 text-[9px] font-bold uppercase ${statusColor}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${dotColor} ${effectiveStatus === "checking" ? "animate-pulse" : ""}`} />
                      {statusLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Navigation Groups Container */}
        <div className="flex-1 overflow-y-auto min-h-0 no-scrollbar">
          {/* Primary nav */}
          <nav className="py-3 px-2">
            <div className="space-y-0.5">
              {primaryNavItems.map(renderNavItem)}
            </div>
          </nav>

          <nav className="border-t border-border/40 py-3 px-2">
            <div className="space-y-0.5">
              {supportNavItems.map(renderNavItem)}
            </div>
          </nav>

          <nav className="py-3 px-2 border-t border-border/40">
            <div className="space-y-0.5">
              {secondaryNavItems.map(renderNavItem)}
            </div>
          </nav>
          {user?.platform_role && (
            <nav className="py-3 px-2 border-t border-border/40">
              <div className="space-y-0.5">{renderNavItem(platformAdminItem)}</div>
            </nav>
          )}
        </div>

        {/* Collapse / Expand Toggle at the bottom */}
        <div className="hidden md:flex border-t border-border/30 p-3 justify-center">
          <button
            onClick={toggleCollapse}
            className={`flex items-center rounded text-sm font-medium text-foreground/80 hover:bg-muted/60 transition-all duration-150 ${isCollapsed ? "justify-center w-10 h-10 mx-auto" : "w-full gap-3 px-3 py-2"}`}
            aria-label="Toggle sidebar collapse"
          >
            <PanelLeft className="w-5 h-5 text-foreground/70 shrink-0" />
            {!isCollapsed && <span className="truncate">Collapse Menu</span>}
          </button>
        </div>
      </aside>
    </TooltipProvider>
  );
}

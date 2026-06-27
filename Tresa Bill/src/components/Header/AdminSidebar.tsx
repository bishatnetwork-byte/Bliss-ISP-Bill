import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  Activity,
  Banknote,
  BadgeDollarSign,
  Bell,
  ChartNoAxesCombined,
  ChartPie,
  Cloud,
  FileClock,
  FileSpreadsheet,
  Globe2,
  KeyRound,
  LayoutDashboard,
  Mail,
  MessageSquare,
  MessageSquareWarning,
  Network,
  PanelLeft,
  ServerCog,
  ShieldCheck,
  UserCog,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export const PLATFORM_ADMIN_SECTIONS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "users", label: "Users Control", icon: Users },
  { id: "finance", label: "Fees & Wallets", icon: Banknote },
  { id: "admin_shares", label: "Admin Shares", icon: ChartPie },
  { id: "broadcasts", label: "Broadcasts", icon: Mail },
  { id: "voucher_audit", label: "Voucher Audit", icon: FileClock },
  { id: "message_diagnostics", label: "Message Control", icon: MessageSquareWarning },
  { id: "sms_gateways", label: "SMS Gateways", icon: MessageSquare, path: "/platform-admin/sms-gateways" },
  { id: "tunnels", label: "Tunnels Control", icon: Network },
  { id: "mikrotik_manager", label: "MikroTik Manager", icon: ServerCog, path: "/platform-admin/mikrotik-manager" },
  { id: "adsmob", label: "AdsMob", icon: BadgeDollarSign, path: "/settings/adsmob" },
  { id: "ads-analytics", label: "Ads Analytics", icon: ChartNoAxesCombined, path: "/settings/adsmob/analytics" },
  { id: "storage", label: "Cloud Files", icon: Cloud },
  { id: "dns", label: "DNS Records", icon: Globe2 },
  { id: "subadmins", label: "Subadmins", icon: UserCog },
  { id: "sessions", label: "Sessions & Logins", icon: KeyRound },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "system", label: "Health Check", icon: Activity },
  { id: "audit", label: "Admin Audit", icon: ShieldCheck },
  { id: "reports", label: "Reports", icon: FileSpreadsheet },
] as const;

export type PlatformAdminSection = typeof PLATFORM_ADMIN_SECTIONS[number]["id"];

const SECTIONS_GROUPS = [
  {
    title: "Core Operations",
    items: ["overview", "users", "finance", "admin_shares", "subadmins", "broadcasts"],
  },
  {
    title: "Infrastructure",
    items: ["voucher_audit", "message_diagnostics", "sms_gateways", "tunnels", "mikrotik_manager", "adsmob", "ads-analytics", "storage", "dns"],
  },
  {
    title: "System & Security",
    items: ["sessions", "notifications", "system", "audit", "reports"],
  },
] as const;

interface AdminSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AdminSidebar({ isOpen, onClose }: AdminSidebarProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(
    () => localStorage.getItem("sidebar-collapsed") === "true",
  );

  useEffect(() => {
    const handler = (event: Event) =>
      setIsCollapsed((event as CustomEvent<{ collapsed: boolean }>).detail.collapsed);
    window.addEventListener("sidebar-collapse-change", handler);
    return () => window.removeEventListener("sidebar-collapse-change", handler);
  }, []);

  const visibleSections = user?.platform_role === "superadmin"
    ? PLATFORM_ADMIN_SECTIONS
    : PLATFORM_ADMIN_SECTIONS.filter((item) => (user?.platform_permissions || []).includes(item.id));

  const activeSection = new URLSearchParams(location.search).get("section") || visibleSections[0]?.id;

  const toggleCollapse = () => {
    const next = !isCollapsed;
    setIsCollapsed(next);
    localStorage.setItem("sidebar-collapsed", String(next));
    window.dispatchEvent(new CustomEvent("sidebar-collapse-change", { detail: { collapsed: next } }));
  };

  const selectSection = (sectionId: string) => {
    const section = PLATFORM_ADMIN_SECTIONS.find((item) => item.id === sectionId);
    navigate(section && "path" in section ? section.path : `/platform-admin?section=${sectionId}`);
    onClose();
  };

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/30 backdrop-blur-[5px] transition-opacity duration-300 shadow-md md:hidden",
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        )}
        onClick={onClose}
      />

      <aside
        className={cn(
          "fixed top-0 left-0 z-50 h-full overflow-y-auto custom-scrollbar bg-sidebar text-sidebar-foreground border-r border-sidebar-border shadow-2xl md:shadow-none md:z-20",
          "flex flex-col transition-all duration-300 md:translate-x-0",
          isCollapsed ? "w-[72px]" : "w-[280px]",
          isOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-center p-3">
          {isCollapsed ? (
            <img src="/icons/mini.png" alt="Logo" />
          ) : (
            <img src="/icons/logo_2.png" alt="Logo" className="h-12" />
          )}
        </div>
        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 pb-4">
          <div className="space-y-4">
            {SECTIONS_GROUPS.map((group, groupIndex) => {
              const groupVisibleItems = visibleSections.filter((item) =>
                (group.items as readonly string[]).includes(item.id)
              );

              if (groupVisibleItems.length === 0) return null;

              return (
                <div key={group.title} className="space-y-0.5">
                  {groupIndex > 0 && (
                    <div className="mx-[-8px] border-t border-sidebar-border/80 my-3" />
                  )}
                  {groupVisibleItems.map((item) => {
                    const Icon = item.icon;
                    const active = "path" in item ? location.pathname === item.path : item.id === activeSection;
                    return (
                      <button
                        key={item.id}
                        onClick={() => selectSection(item.id)}
                        className={cn(
                          "flex w-full min-w-0 items-center gap-2.5 rounded px-3 py-2 text-left text-sm font-medium transition-colors",
                          isCollapsed && "justify-center px-0",
                          active
                            ? "bg-sidebar-primary text-sidebar-primary-foreground"
                            : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                        )}
                        title={isCollapsed ? item.label : undefined}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        {!isCollapsed && <span className="truncate">{item.label}</span>}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </nav>

        <div className="hidden md:flex border-t border-sidebar-border/80 p-3 justify-center">
          <button
            onClick={toggleCollapse}
            className={cn(
              "flex items-center rounded text-sm font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-all duration-150",
              isCollapsed ? "justify-center w-10 h-10 mx-auto" : "w-full gap-3 px-3 py-2",
            )}
            aria-label="Toggle sidebar collapse"
          >
            <PanelLeft className="w-5 h-5 shrink-0" />
            {!isCollapsed && <span className="truncate">Collapse Menu</span>}
          </button>
        </div>
      </aside>
    </>
  );
}

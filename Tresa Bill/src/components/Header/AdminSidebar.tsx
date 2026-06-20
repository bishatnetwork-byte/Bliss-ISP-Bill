import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  Activity,
  Banknote,
  Bell,
  Cloud,
  FileClock,
  FileSpreadsheet,
  Globe2,
  KeyRound,
  LayoutDashboard,
  Mail,
  MessageSquareWarning,
  Network,
  PanelLeft,
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
  { id: "broadcasts", label: "Broadcasts", icon: Mail },
  { id: "voucher_audit", label: "Voucher Audit", icon: FileClock },
  { id: "message_diagnostics", label: "Message Control", icon: MessageSquareWarning },
  { id: "tunnels", label: "Tunnels Control", icon: Network },
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
    navigate(`/platform-admin?section=${sectionId}`);
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
          "fixed top-0 left-0 z-50 h-full bg-white border-r border-border/80 shadow-2xl md:shadow-none md:z-20",
          "flex flex-col custom-scrollbar transition-all duration-300 md:translate-x-0",
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
          <div className="space-y-0.5">
            {visibleSections.map((item) => {
              const Icon = item.icon;
              const active = item.id === activeSection;
              return (
                <button
                  key={item.id}
                  onClick={() => selectSection(item.id)}
                  className={cn(
                    "flex w-full min-w-0 items-center gap-2.5 rounded px-3 py-2 text-left text-sm font-medium transition-colors",
                    isCollapsed && "justify-center px-0",
                    active
                      ? "bg-primary text-white"
                      : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                  )}
                  title={isCollapsed ? item.label : undefined}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!isCollapsed && <span className="truncate">{item.label}</span>}
                </button>
              );
            })}
          </div>
        </nav>

        <div className="hidden md:flex border-t border-border/30 p-3 justify-center">
          <button
            onClick={toggleCollapse}
            className={cn(
              "flex items-center rounded text-sm font-medium text-foreground/80 hover:bg-muted/60 transition-all duration-150",
              isCollapsed ? "justify-center w-10 h-10 mx-auto" : "w-full gap-3 px-3 py-2",
            )}
            aria-label="Toggle sidebar collapse"
          >
            <PanelLeft className="w-5 h-5 text-foreground/70 shrink-0" />
            {!isCollapsed && <span className="truncate">Collapse Menu</span>}
          </button>
        </div>
      </aside>
    </>
  );
}

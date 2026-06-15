import AppHeader from "@/components/Header/AppHeader";
import SEO from "@/components/SEO";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  Activity,
  Banknote,
  Cloud,
  FileClock,
  Globe2,
  LayoutDashboard,
  Mail,
  Network,
  ShieldCheck,
  UserCog,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

export const PLATFORM_ADMIN_SECTIONS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "users", label: "Users", icon: Users },
  { id: "finance", label: "Fees & Wallets", icon: Banknote },
  { id: "broadcasts", label: "Broadcasts", icon: Mail },
  { id: "voucher_audit", label: "Voucher Audit", icon: FileClock },
  { id: "tunnels", label: "Tunnels", icon: Network },
  { id: "storage", label: "Cloud Files", icon: Cloud },
  { id: "dns", label: "DNS", icon: Globe2 },
  { id: "subadmins", label: "Subadmins", icon: UserCog },
  { id: "system", label: "Health", icon: Activity },
  { id: "audit", label: "Admin Audit", icon: ShieldCheck },
] as const;

export type PlatformAdminSection = typeof PLATFORM_ADMIN_SECTIONS[number]["id"];

interface PlatformAdminLayoutProps {
  activeSection: PlatformAdminSection;
  children: React.ReactNode;
  title?: string;
  onSectionChange?: (section: PlatformAdminSection) => void;
}

export default function PlatformAdminLayout({
  activeSection,
  children,
  title = "Platform Admin",
  onSectionChange,
}: PlatformAdminLayoutProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("sidebar-collapsed") === "true",
  );
  const visibleSections = useMemo(() => {
    const permissions = new Set(
      user?.platform_role === "superadmin"
        ? PLATFORM_ADMIN_SECTIONS.map((item) => item.id)
        : user?.platform_permissions || [],
    );
    return PLATFORM_ADMIN_SECTIONS.filter((item) => permissions.has(item.id));
  }, [user]);

  useEffect(() => {
    const handler = (event: Event) =>
      setSidebarCollapsed((event as CustomEvent<{ collapsed: boolean }>).detail.collapsed);
    window.addEventListener("sidebar-collapse-change", handler);
    return () => window.removeEventListener("sidebar-collapse-change", handler);
  }, []);

  const selectSection = (section: PlatformAdminSection) => {
    if (onSectionChange) {
      onSectionChange(section);
      return;
    }
    navigate(`/platform-admin?section=${section}`);
  };

  return (
    <div className={cn(
      "min-h-screen bg-background transition-all duration-300",
      sidebarCollapsed ? "md:pl-[72px]" : "md:pl-[280px]",
    )}>
      <SEO title={title} noIndex />
      <AppHeader />

      <div className="border-b border-border/50 bg-white px-4 py-3 lg:hidden">
        <label className="text-xs font-bold text-muted-foreground" htmlFor="platform-admin-section">
          Platform section
        </label>
        <select
          id="platform-admin-section"
          value={activeSection}
          onChange={(event) => selectSection(event.target.value as PlatformAdminSection)}
          className="mt-1 h-10 w-full rounded border bg-background px-3 text-sm font-semibold"
        >
          {visibleSections.map((item) => (
            <option key={item.id} value={item.id}>{item.label}</option>
          ))}
        </select>
      </div>

      <div className="flex min-h-[calc(100vh-57px)]">
        <aside className="hidden w-[250px] shrink-0 flex-col border-r border-border/50 bg-white lg:flex">
          <div className="px-5 pb-3 pt-6">
            <p className="text-lg font-semibold">Platform Admin</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {user?.platform_role === "superadmin" ? "Superadmin access" : "Scoped administration"}
            </p>
          </div>
          <nav className="flex-1 px-2 pb-4">
            {visibleSections.map((item) => {
              const Icon = item.icon;
              const active = item.id === activeSection;
              return (
                <button
                  key={item.id}
                  onClick={() => selectSection(item.id)}
                  className={cn(
                    "m-0.5 flex w-full items-center gap-2.5 rounded px-3 py-2 text-left text-sm font-medium transition-colors",
                    active
                      ? "bg-primary text-white"
                      : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

import AppHeader from "@/components/Header/AppHeader";
import { PLATFORM_ADMIN_SECTIONS, PlatformAdminSection } from "@/components/Header/AdminSidebar";
import SEO from "@/components/SEO";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

export { PLATFORM_ADMIN_SECTIONS };
export type { PlatformAdminSection };

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
    const sectionConfig = PLATFORM_ADMIN_SECTIONS.find((item) => item.id === section);
    navigate(sectionConfig && "path" in sectionConfig ? sectionConfig.path : `/platform-admin?section=${section}`);
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
        <main className="min-w-0 flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

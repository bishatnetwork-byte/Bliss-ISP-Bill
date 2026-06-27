import AppHeader from "@/components/Header/AppHeader";
import SEO from "@/components/SEO";
import {
  Bell,
  BadgeDollarSign,
  ChartNoAxesCombined,
  CreditCard,
  Key,
  Megaphone,
  CalendarClock,
  ScrollText,
  Send,
  User,
  Network,
  Trash
} from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/* ─── sidebar nav config ─── */
interface SettingsNavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  path: string;
  badge?: string;
}

const navItems: SettingsNavItem[] = [
  {
    id: "router-logs",
    label: "Router Logs",
    icon: <ScrollText className="w-4 h-4" />,
    path: "/settings/router-logs",
  },
  {
    id: "my-details",
    label: "Profile & Details",
    icon: <User className="w-4 h-4" />,
    path: "/settings",
  },
  {
    id: "password",
    label: "Change Password",
    icon: <Key className="w-4 h-4" />,
    path: "/settings/password",
  },
  {
    id: "billing",
    label: "Recent Transactions",
    icon: <CreditCard className="w-4 h-4" />,
    path: "/settings/billing",
  },
  {
    id: "subscriptions",
    label: "Subscriptions",
    icon: <CalendarClock className="w-4 h-4" />,
    path: "/settings/subscriptions",
  },
  {
    id: "telegram",
    label: "Telegram",
    icon: <Send className="w-4 h-4" />,
    path: "/settings/telegram",
  },
  {
    id: "notifications",
    label: "View Notifications",
    icon: <Bell className="w-4 h-4" />,
    path: "/settings/notifications",
  },

  {
    id: "campaigns",
    label: "Tickets & Campaigns",
    icon: <Megaphone className="w-4 h-4" />,
    path: "/campaigns",
  },
    {
      id: "network-tree",
      label: "Network Tree",
      icon: <Network className="w-5 h-5" />,
      path: "/network",
    },
    {
      id: "trash",
      label: "Trash Bucket",
      icon: <Trash className="w-5 h-5" />,
      path: "/trash",
    }
];

interface SettingsLayoutProps {
  children: React.ReactNode;
  title?: string;
}

export default function SettingsLayout({
  children,
  title = "Settings",
}: SettingsLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() =>
    localStorage.getItem("sidebar-collapsed") === "true"
  );

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ collapsed: boolean }>).detail;
      setSidebarCollapsed(detail.collapsed);
    };
    window.addEventListener("sidebar-collapse-change", handler);
    return () =>
      window.removeEventListener("sidebar-collapse-change", handler);
  }, []);

  const isActive = (path: string) => location.pathname === path;

  return (
    <div
      className={`min-h-screen bg-background transition-all duration-300 ${sidebarCollapsed ? "md:pl-[72px]" : "md:pl-[280px]"
        }`}
    >
      <SEO title={title} />
      <AppHeader />

      {/* ── Mobile / Tablet: horizontal scrollable tab strip (hidden on lg+) ── */}
      <div className="lg:hidden sticky top-[57px] z-20 bg-card border-b border-border/50 shadow-sm">
        <div
          className="flex overflow-x-auto gap-1 px-2 py-1.5"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {navItems.map((item) => {
            const active = isActive(item.path);
            return (
              <button
                key={item.id}
                onClick={() => navigate(item.path)}
                className={`
                  flex-shrink-0 flex flex-col items-center gap-1 px-3 py-2 rounded
                  text-[11px] font-medium transition-all duration-150 cursor-pointer whitespace-nowrap
                  ${active
                    ? "bg-primary text-white"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  }
                `}
              >
                <span
                  className={`transition-colors duration-150 ${active ? "text-white" : "text-muted-foreground/70"
                    }`}
                >
                  {item.icon}
                </span>
                <span>{item.label}</span>
                {item.badge && (
                  <span
                    className={`
                      text-[10px] font-semibold px-1.5 py-0.5 rounded-full leading-none
                      ${active ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"}
                    `}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex min-h-[calc(100vh-57px)]">
        {/* ── Desktop settings sidebar (lg+) ── */}
        <aside className="hidden lg:flex flex-col w-[250px] shrink-0 border-r border-border/50 bg-card">
          <div className="px-4 pt-6 pb-2">
            <span className="text-lg font-semibold text-foreground">Settings</span>
          </div>

          <nav className="flex-1 px-2 pb-4 pt-1">
            <div className="flex flex-col gap-px">
              {navItems.map((item) => {
                const active = isActive(item.path);
                return (
                  <button
                    key={item.id}
                    onClick={() => navigate(item.path)}
                    className={`
                      group flex items-center gap-2.5 px-3 py-2 m-0.5 rounded text-sm font-medium
                      transition-all duration-150 cursor-pointer w-full text-left
                      ${active
                        ? "bg-primary text-white border border-border/10"
                        : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                      }
                    `}
                  >
                    <span
                      className={`transition-colors duration-150 ${active
                        ? "text-white"
                        : "text-muted-foreground/70 group-hover:text-foreground/60"
                        }`}
                    >
                      {item.icon}
                    </span>
                    <span className="flex-1">{item.label}</span>
                    {item.badge && (
                      <span
                        className={`
                          text-xs font-semibold px-1.5 py-0.5 rounded-full leading-none
                          ${active
                            ? "bg-primary/15 text-primary"
                            : "bg-muted text-muted-foreground"
                          }
                        `}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </nav>
        </aside>

        {/* ── Main content ── */}
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

import AppHeader from "@/components/Header/AppHeader";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  useBranchVouchers,
  useCheckExpiredRouterVouchers,
  useDeleteExpiredRouterVouchers,
  useDeleteRouterVoucher,
  useDeleteRouterVoucherBatch,
  useFetchRouterVouchers,
  useRouters,
  useSyncRouterVouchers,
  useQueueRouterVouchers,
  useVoucherJob,
  useRouterPackages,
} from "@/hooks/useRouters";
import { cn } from "@/lib/utils";
import { voucherUiStatus } from "@/lib/voucherStatus";
import { useQueryClient } from "@tanstack/react-query";
import {
  CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  Download,
  FileSpreadsheet,
  Info,
  Loader2,
  Printer,
  RefreshCw,
  Search,
  Sparkles,
  Ticket,
  Trash2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { VoucherProgressDialog } from "./templates/VoucherProgressDialog";
import { downloadVoucherPdf } from "./templates/voucherPdf";
import { DownloadByCommentDialog } from "./components/DownloadByCommentDialog";
import { format } from "date-fns";
import { DateRange } from "react-day-picker";

// Types mapping
interface Voucher {
  id: string; // Voucher Code
  phone?: string;
  routerName: string;
  packageName: string;
  duration: string;
  pricePaid: number;
  purchaseTime: string;
  status: "Online" | "Offline" | "Expired" | "Unactivated" | "Sync Issue";
  activatedAt?: string;
  expiresAt?: string;
  type: "Single" | "Bulk";
  batchId?: string;
  useCase: "System Generated" | "Admin Generated";
  note: string;
}

function registryStatus(status: string): Voucher["status"] {
  if (status === "ONLINE") return "Online";
  if (status === "OFFLINE" || status === "ACTIVE") return "Offline";
  return voucherUiStatus(status) as Exclude<Voucher["status"], "Online" | "Offline">;
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 768px)");
    setIsMobile(media.matches);
    const listener = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);
  return isMobile;
}

export default function Vouchers() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();

  // Sidebar state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("sidebar-collapsed") === "true");
  useEffect(() => {
    const handler = (event: Event) => {
      setSidebarCollapsed((event as CustomEvent<{ collapsed: boolean }>).detail.collapsed);
    };
    window.addEventListener("sidebar-collapse-change", handler);
    return () => window.removeEventListener("sidebar-collapse-change", handler);
  }, []);

  // Selected Branch ID
  const [branchId, setBranchId] = useState(() => localStorage.getItem("selected-workspace") || "");
  useEffect(() => {
    const handler = (event: Event) => setBranchId((event as CustomEvent<{ id: string }>).detail.id);
    window.addEventListener("renult-branch-change", handler);
    return () => window.removeEventListener("renult-branch-change", handler);
  }, []);

  // API Hooks
  const { data: routers = [], isLoading: routersLoading } = useRouters(branchId);
  const { data: branchVouchersResponse, isLoading: vouchersLoading } = useBranchVouchers(branchId, { limit: 1000 });
  const [selectedRouterId, setSelectedRouterId] = useState<string>("");
  const selectedRouter = routers.find((router) => router.id === selectedRouterId);

  // Router Packages Selection
  const { data: routerPackagesResponse, isLoading: packagesLoading } = useRouterPackages(selectedRouterId);

  const routerPackages = useMemo(() => {
    const items = routerPackagesResponse?.data.voucher || [];
    return items
      .filter((item) => {
        const name = `${item.speed_type} ${item.limit}`.toUpperCase();
        return !name.includes("AB-") && !name.includes("STAFF");
      })
      .map((item) => ({
        id: String(item.package_id),
        packageId: item.package_id,
        name: `${item.speed_type} ${item.limit}`,
        duration: item.limit,
        price: Number(item.total || 0),
        description: item.data,
      }));
  }, [routerPackagesResponse]);

  // Mutations
  const deleteVoucherMutation = useDeleteRouterVoucher(branchId);
  const deleteBatchMutation = useDeleteRouterVoucherBatch(branchId);
  const syncRouterVouchers = useSyncRouterVouchers(selectedRouterId, branchId);
  const checkExpiredVouchers = useCheckExpiredRouterVouchers(selectedRouterId, branchId);
  const deleteExpiredVouchers = useDeleteExpiredRouterVouchers(selectedRouterId, branchId);
  const queueVouchersMutation = useQueueRouterVouchers(selectedRouterId);

  // Tabs state
  const [activeTab, setActiveTab] = useState<"all" | "admin" | "system" | "trash">("all");

  // Filters State
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [filterPackage, setFilterPackage] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  // Selection states
  const [selectedVouchers, setSelectedVouchers] = useState<string[]>([]);

  // Generator states
  const [isGenerateOpen, setIsGenerateOpen] = useState(false);
  const [isDownloadByCommentOpen, setIsDownloadByCommentOpen] = useState(false);
  const [genFormat, setGenFormat] = useState<"alphanumeric-lower" | "alphanumeric-upper" | "numeric" | "alphanumeric-mixed">("alphanumeric-lower");
  const [genQuantity, setGenQuantity] = useState<number>(10);
  const [genPackageId, setGenPackageId] = useState<string>("");
  const [genLength, setGenLength] = useState<number>(5);
  const [genNote, setGenNote] = useState<string>("");
  const [genPrefix, setGenPrefix] = useState<string>("");
  const [genPostfix, setGenPostfix] = useState<string>("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Active Job Tracker
  const [voucherJobId, setVoucherJobId] = useState("");
  const [voucherJobContext, setVoucherJobContext] = useState<any>(null);
  const { data: voucherJob } = useVoucherJob(voucherJobId);

  // Pagination states
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [rowsPerPage, setRowsPerPage] = useState<number>(10);

  // Pre-select router and package on load
  useEffect(() => {
    if (!selectedRouterId && routers.length > 0) {
      setSelectedRouterId(routers[0].id);
    }
  }, [routers, selectedRouterId]);

  useEffect(() => {
    if (routerPackages.length > 0) {
      if (!genPackageId || !routerPackages.some((pkg) => pkg.id === genPackageId)) {
        setGenPackageId(routerPackages[0].id);
      }
    }
  }, [routerPackages, genPackageId]);

  // Sync Router Vouchers job status
  useEffect(() => {
    if (!voucherJobId || !voucherJob || !["COMPLETED", "COMPLETED_WITH_ERRORS", "FAILED"].includes(voucherJob.status)) return;

    if (voucherJob.status === "FAILED" || !voucherJob.result) {
      toast.error(voucherJob.error || "Voucher creation failed.");
    } else {
      queryClient.invalidateQueries({ queryKey: ["branchVouchers", branchId] });
      if (selectedRouterId) {
        queryClient.invalidateQueries({ queryKey: ["routerVouchers", selectedRouterId] });
      }
      toast.success(`Generated and synchronized ${voucherJob.result.count} vouchers successfully!`);
    }

    setVoucherJobId("");
    setVoucherJobContext(null);
  }, [voucherJob, voucherJobId, queryClient, branchId, selectedRouterId]);

  // Convert raw API response to Vouchers list
  const vouchers: Voucher[] = useMemo(() => {
    return (branchVouchersResponse?.vouchers || [])
      .filter((v) => {
        const code = (v.voucher_code || "").toUpperCase();
        const profile = (v.profile || "").toUpperCase();
        const speedType = (v.speed_type || "").toUpperCase();
        const phone = (v.phone_number || "").toUpperCase();
        const ref = (v.payment_reference || "").toUpperCase();
        const isAbOrStaff = code.includes("AB-") || code.includes("STAFF") ||
          profile.includes("AB-") || profile.includes("STAFF") ||
          speedType.includes("AB-") || speedType.includes("STAFF") ||
          phone.includes("AB-") || phone.includes("STAFF") ||
          ref.includes("AB-") || ref.includes("STAFF");
        return !isAbOrStaff;
      })
      .map((voucher) => {
        const isBulk = voucher.payment_reference?.startsWith("BAT-");
        const isSystemGenerated = !isBulk;
        return {
          id: voucher.voucher_code,
          phone: (voucher.phone_number === "BULK" || !voucher.phone_number) ? undefined : voucher.phone_number,
          routerName: voucher.router_name,
          packageName: `${voucher.speed_type} ${voucher.profile}`,
          duration: voucher.profile,
          pricePaid: voucher.amount,
          purchaseTime: voucher.created_at.replace("T", " ").substring(0, 19),
          status: registryStatus(voucher.status),
          activatedAt: voucher.activated_at?.replace("T", " ").substring(0, 19),
          expiresAt: voucher.expires_at?.replace("T", " ").substring(0, 19),
          type: isBulk ? "Bulk" : "Single",
          batchId: isBulk ? voucher.payment_reference : undefined,
          useCase: isSystemGenerated ? "System Generated" : "Admin Generated",
          note: voucher.payment_reference || "N/A",
        };
      });
  }, [branchVouchersResponse]);

  // Unique notes/comments for DownloadByComment
  const uniqueNotes = useMemo(() => {
    const set = new Set<string>();
    vouchers.forEach((v) => {
      if (v.note && v.note !== "N/A" && v.note.trim()) {
        set.add(v.note.trim());
      }
    });
    return Array.from(set).sort();
  }, [vouchers]);

  // Filter package options list
  const packageOptions = useMemo(() => {
    const set = new Set<string>();
    vouchers.forEach((v) => set.add(v.packageName));
    return Array.from(set);
  }, [vouchers]);

  // Main Filtering Logic
  const filteredVouchers = useMemo(() => {
    return vouchers.filter((voucher) => {
      // 1. Search Query Filter
      const normalizedSearch = searchQuery.toLowerCase().trim();
      const matchesSearch = !normalizedSearch ||
        voucher.id.toLowerCase().includes(normalizedSearch) ||
        voucher.note.toLowerCase().includes(normalizedSearch) ||
        (voucher.phone && voucher.phone.toLowerCase().includes(normalizedSearch)) ||
        voucher.packageName.toLowerCase().includes(normalizedSearch);

      // 2. Package Filter
      const matchesPackage = filterPackage === "all" || voucher.packageName === filterPackage;

      // 3. Date Range Filter
      let matchesDate = true;
      if (dateRange?.from || dateRange?.to) {
        const purchaseDate = new Date(voucher.purchaseTime);
        if (dateRange.from) {
          const from = new Date(dateRange.from);
          from.setHours(0, 0, 0, 0);
          if (purchaseDate < from) matchesDate = false;
        }
        if (dateRange.to) {
          const to = new Date(dateRange.to);
          to.setHours(23, 59, 59, 999);
          if (purchaseDate > to) matchesDate = false;
        }
      }

      // 4. Tab Type Filter
      let matchesTab = true;
      if (activeTab === "all") {
        matchesTab = voucher.status !== "Expired";
      } else if (activeTab === "admin") {
        matchesTab = voucher.status !== "Expired" && voucher.useCase === "Admin Generated";
      } else if (activeTab === "system") {
        matchesTab = voucher.status !== "Expired" && voucher.useCase === "System Generated";
      } else if (activeTab === "trash") {
        matchesTab = voucher.status === "Expired";
      }

      return matchesSearch && matchesPackage && matchesDate && matchesTab;
    });
  }, [vouchers, searchQuery, filterPackage, dateRange, activeTab]);

  // Pagination Logic
  const paginatedVouchers = useMemo(() => {
    const startIndex = (currentPage - 1) * rowsPerPage;
    return filteredVouchers.slice(startIndex, startIndex + rowsPerPage);
  }, [filteredVouchers, currentPage, rowsPerPage]);

  const totalPages = Math.ceil(filteredVouchers.length / rowsPerPage) || 1;

  // Handle pagination navigation
  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  // Bulk selector helpers
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedVouchers(paginatedVouchers.map((v) => v.id));
    } else {
      setSelectedVouchers([]);
    }
  };

  const handleSelectRow = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedVouchers((prev) => [...prev, id]);
    } else {
      setSelectedVouchers((prev) => prev.filter((item) => item !== id));
    }
  };

  // Actions
  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success(`Voucher code "${code}" copied to clipboard!`);
  };

  const handleDeleteSingle = async (voucher: Voucher) => {
    const router = routers.find((r) => r.name.trim().toUpperCase() === voucher.routerName.trim().toUpperCase());
    if (!router) {
      toast.error(`Target router ${voucher.routerName} not found.`);
      return;
    }

    if (!window.confirm(`Delete voucher ${voucher.id} from MikroTik and local database?`)) return;

    try {
      await deleteVoucherMutation.mutateAsync({ routerId: router.id, voucherCode: voucher.id });
      setSelectedVouchers((prev) => prev.filter((id) => id !== voucher.id));
      toast.success(`Voucher ${voucher.id} deleted successfully!`);
    } catch (err: any) {
      toast.error(err.message || "Failed to delete voucher.");
    }
  };

  // Delete multiple selected vouchers
  const handleDeleteSelected = async () => {
    if (selectedVouchers.length === 0) {
      toast.error("No vouchers selected.");
      return;
    }
    if (!window.confirm(`Delete ${selectedVouchers.length} selected voucher(s) from MikroTik and the database? This cannot be undone.`)) return;

    const toDelete = vouchers.filter((v) => selectedVouchers.includes(v.id));
    let successCount = 0;
    let failCount = 0;

    const deleteToast = toast.loading(`Deleting 0 / ${toDelete.length} vouchers...`);

    for (const voucher of toDelete) {
      const router = routers.find((r) => r.name.trim().toUpperCase() === voucher.routerName.trim().toUpperCase());
      if (!router) {
        failCount++;
        continue;
      }
      try {
        await deleteVoucherMutation.mutateAsync({ routerId: router.id, voucherCode: voucher.id });
        successCount++;
        toast.loading(`Deleting ${successCount + failCount} / ${toDelete.length} vouchers...`, { id: deleteToast });
      } catch {
        failCount++;
      }
    }

    toast.dismiss(deleteToast);
    if (successCount > 0) toast.success(`${successCount} voucher(s) deleted successfully.`);
    if (failCount > 0) toast.error(`${failCount} voucher(s) could not be deleted.`);
    setSelectedVouchers([]);
  };

  // Sync Vouchers command
  const handleSyncVouchers = async () => {
    if (!selectedRouterId) {
      toast.error("Please select a target router first.");
      return;
    }
    toast.promise(syncRouterVouchers.mutateAsync(), {
      loading: "Synchronizing vouchers with MikroTik...",
      success: "Vouchers successfully synchronized!",
      error: "Failed to sync vouchers.",
    });
  };

  // Check Expired command
  const handleCheckExpired = async () => {
    if (!selectedRouterId) {
      toast.error("Please select a target router first.");
      return;
    }
    toast.promise(checkExpiredVouchers.mutateAsync(), {
      loading: "Checking expired vouchers on MikroTik...",
      success: "Expired vouchers updated successfully!",
      error: "Failed to check expired vouchers.",
    });
  };

  // Delete Expired command
  const handleDeleteExpired = async () => {
    if (!selectedRouterId) {
      toast.error("Please select a target router first.");
      return;
    }
    if (!window.confirm("Clean up and delete all expired vouchers from MikroTik and database?")) return;
    toast.promise(deleteExpiredVouchers.mutateAsync(), {
      loading: "Removing expired vouchers...",
      success: "All expired vouchers removed successfully!",
      error: "Failed to clean up expired vouchers.",
    });
  };

  // Bulk actions on selected
  const handlePrintSelected = () => {
    if (selectedVouchers.length === 0) {
      toast.error("No vouchers selected. Please check at least one checkbox.");
      return;
    }
    navigate(`/vouchers/create?printCodes=${selectedVouchers.join(",")}`);
  };

  // Download PDF selection
  const handleDownloadSelectedPdf = () => {
    if (selectedVouchers.length === 0) {
      toast.error("Please select vouchers to download.");
      return;
    }
    const targetVouchers = vouchers.filter((v) => selectedVouchers.includes(v.id));
    downloadVoucherPdf(
      targetVouchers.map((v) => ({
        code: v.id,
        packageName: v.packageName,
        duration: v.duration,
        price: v.pricePaid,
        status: v.status,
        batchId: v.batchId,
        wifiName: selectedRouter?.name || "WIFI HOTSPOT",
      })),
      "vouchers-export.pdf",
      {
        themeId: "violet",
        layoutDesign: "classic",
        showQrCode: true,
        qrCodeFormat: "gateway",
        qrGatewayIp: selectedRouter?.host || "10.0.0.1",
        showWifiName: true,
        showPrice: true,
        showPackage: true,
      }
    );
    toast.success("PDF generated and download started!");
  };

  // Export CSV
  const handleExportCSV = () => {
    if (filteredVouchers.length === 0) {
      toast.error("No vouchers available to export.");
      return;
    }
    const headers = ["Username", "Package", "Status", "First Login", "Expires On", "Use Case", "Note", "Created On"];
    const rows = filteredVouchers.map((v) => [
      v.id,
      v.packageName,
      v.status,
      v.activatedAt || "Never",
      v.expiresAt || "Never",
      v.useCase,
      v.note,
      v.purchaseTime,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.map(val => `"${val}"`).join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `vouchers-export-${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("CSV file exported successfully!");
  };

  // Generate submit handler
  const handleGenerateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRouterId) {
      toast.error("Select a target router first.");
      return;
    }
    const pkg = routerPackages.find((p) => p.id === genPackageId);
    if (!pkg) {
      toast.error("Select a package first.");
      return;
    }

    setIsGenerateOpen(false);

    const batchId = `BAT-ADM-${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}`;

    try {
      const queued = await queueVouchersMutation.mutateAsync({
        package_id: pkg.packageId || Number(pkg.id),
        quantity: genQuantity,
        amount: pkg.price,
        prefix: genPrefix || undefined,
        code_length: genLength,
        code_format: genFormat,
        payment_reference: batchId,
      });

      setVoucherJobId(queued.job_id);
      setVoucherJobContext({
        type: "bulk",
        packageName: pkg.name,
        duration: pkg.duration,
        price: pkg.price,
        batchId,
        wifiName: selectedRouter?.name,
      });
      toast.success("Voucher generation job queued successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to generate vouchers.");
    }
  };

  // Quick helper to format date strings
  const formatDateRangeString = () => {
    if (!dateRange?.from) return "Select date range";
    if (!dateRange?.to) return format(dateRange.from, "MMM dd, yyyy");
    return `${format(dateRange.from, "MMM dd, yyyy")} - ${format(dateRange.to, "MMM dd, yyyy")}`;
  };

  return (
    <div
      className={cn(
        "min-h-screen bg-background text-foreground transition-all duration-300",
        sidebarCollapsed ? "md:pl-[72px]" : "md:pl-[280px]"
      )}
    >
      <SEO title="Vouchers Registry" />
      <AppHeader onCreateForm={() => { }} />

      <main className="p-4 sm:p-6 max-w-full mx-auto space-y-6">
        {/* Header: Tabs left, Router controls right */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={(val) => {
            setActiveTab(val as any);
            setCurrentPage(1);
          }}>
            <TabsList className="bg-card border border-border p-1 rounded h-auto flex-wrap">
              <TabsTrigger
                value="all"
                className="text-xs px-3 py-1.5 rounded data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                All
              </TabsTrigger>
              <TabsTrigger
                value="admin"
                className="text-xs px-3 py-1.5 rounded data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                Created by Admin
              </TabsTrigger>
              <TabsTrigger
                value="system"
                className="text-xs px-3 py-1.5 rounded data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                System Generated
              </TabsTrigger>
              <TabsTrigger
                value="trash"
                className="text-xs px-3 py-1.5 rounded data-[state=active]:bg-destructive data-[state=active]:text-destructive-foreground flex items-center gap-1"
              >
                Trash
                {vouchers.filter((v) => v.status === "Expired").length > 0 && (
                  <span className="bg-white/20 text-current rounded-full text-[10px] px-1.5 leading-none py-0.5">
                    {vouchers.filter((v) => v.status === "Expired").length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Router selector + quick actions */}
          <div className="flex flex-wrap items-center gap-2">
            <Select value={selectedRouterId} onValueChange={setSelectedRouterId}>
              <SelectTrigger className="w-[180px] h-9 text-xs font-medium">
                <SelectValue placeholder="Select Router" />
              </SelectTrigger>
              <SelectContent>
                {routersLoading ? (
                  <SelectItem value="loading" disabled>Loading routers...</SelectItem>
                ) : routers.length === 0 ? (
                  <SelectItem value="none" disabled>No routers available</SelectItem>
                ) : (
                  routers.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="sm"
              onClick={handleSyncVouchers}
              disabled={syncRouterVouchers.isPending || !selectedRouterId}
              className="h-9 gap-1.5 text-xs"
            >
              {syncRouterVouchers.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              Sync Router
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleCheckExpired}
              disabled={checkExpiredVouchers.isPending || !selectedRouterId}
              className="h-9 gap-1.5 text-xs"
            >
              Check Expired
            </Button>
          </div>
        </div>

        {/* Unified filter + action toolbar */}
        <div className="bg-card border border-border rounded-lg divide-y divide-border">

          {/* Filter Row: Search + Package + Date */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-3">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by code, note, customer phone..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                className="pl-9 h-9 text-xs focus-visible:ring-primary"
              />
            </div>

            <Select value={filterPackage} onValueChange={(val) => { setFilterPackage(val); setCurrentPage(1); }}>
              <SelectTrigger className="w-full sm:w-[160px] h-9 text-xs shrink-0">
                <SelectValue placeholder="All Packages" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Packages</SelectItem>
                {packageOptions.map((pkg) => (
                  <SelectItem key={pkg} value={pkg}>{pkg}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 gap-2 text-xs text-muted-foreground hover:text-foreground shrink-0"
                >
                  <CalendarIcon className="w-3.5 h-3.5 text-primary" />
                  {formatDateRangeString()}
                  <ChevronDown className="w-3 h-3" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  initialFocus
                  mode="range"
                  defaultMonth={dateRange?.from}
                  selected={dateRange}
                  onSelect={(range) => { setDateRange(range); setCurrentPage(1); }}
                  numberOfMonths={2}
                />
                <div className="flex gap-2 justify-end p-3 border-t border-border bg-muted/20">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setDateRange(undefined); setCurrentPage(1); }}
                    className="h-7 text-[10px] text-destructive hover:text-foreground"
                  >
                    Clear Filter
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* Action Buttons Row */}
          <div className="flex flex-wrap items-center gap-2 p-3">
            {activeTab === "trash" ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDeleteExpired}
                disabled={deleteExpiredVouchers.isPending || !selectedRouterId}
                className="h-9 gap-1.5 text-xs font-bold"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Empty Trash (Delete All Expired)
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportCSV}
                  className="h-9 gap-1.5 text-xs"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
                  Export CSV
                </Button>
                {selectedVouchers.length > 0 && (
                  <>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleDeleteSelected}
                      disabled={deleteVoucherMutation.isPending}
                      className="h-9 gap-1.5 text-xs font-bold"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete ({selectedVouchers.length})
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handlePrintSelected}
                      className="h-9 gap-1.5 text-xs"
                    >
                      <Printer className="w-3.5 h-3.5 text-primary" />
                      Print Selected ({selectedVouchers.length})
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDownloadSelectedPdf}
                      className="h-9 gap-1.5 text-xs"
                    >
                      <Download className="w-3.5 h-3.5 text-blue-500" />
                      Download PDF
                    </Button>
                  </>
                )}
                {/* Push primary actions to the right */}
                <div className="flex-1" />
                <Button
                  onClick={() => setIsDownloadByCommentOpen(true)}
                  size="sm"
                  variant="outline"
                  className="h-9 gap-1.5 text-xs font-semibold border-primary/40 text-primary hover:bg-primary/5"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download By Batch
                </Button>
                <Button
                  onClick={() => setIsGenerateOpen(true)}
                  size="sm"
                  className="h-9 gap-1.5 text-xs font-bold"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Generate Vouchers
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Table View Card */}
        <Card className="bg-card border border-border/10 shadow-sm rounded overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-gray-100">
                <TableRow className="border-b border-border text-[12px] font-bold text-black ">
                  <TableHead className="w-[50px] text-center py-3">
                    <input
                      type="checkbox"
                      checked={
                        paginatedVouchers.length > 0 &&
                        paginatedVouchers.every((v) => selectedVouchers.includes(v.id))
                      }
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="rounded border-border text-primary focus:ring-primary bg-background w-4 h-4 cursor-pointer"
                    />
                  </TableHead>
                  <TableHead className="py-3">Username (Code)</TableHead>
                  <TableHead className="py-3">Package</TableHead>
                  <TableHead className="py-3">Status</TableHead>
                  <TableHead className="py-3">First Login</TableHead>
                  <TableHead className="py-3">Expires On</TableHead>
                  <TableHead className="py-3">Use Case</TableHead>
                  <TableHead className="py-3">Note / Ref</TableHead>
                  <TableHead className="py-3">Created On</TableHead>
                  <TableHead className="py-3 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-border text-xs text-foreground/95">
                {vouchersLoading ? (
                  <TableRow>
                    <TableCell colSpan={10} className="py-12 text-center text-muted-foreground font-semibold">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
                      Loading vouchers registry...
                    </TableCell>
                  </TableRow>
                ) : filteredVouchers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="py-12 text-center text-muted-foreground font-medium">
                      <Info className="w-6 h-6 mx-auto mb-2 opacity-50 text-primary" />
                      No access vouchers match the current filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedVouchers.map((voucher) => {
                    const isRowSelected = selectedVouchers.includes(voucher.id);
                    return (
                      <TableRow
                        key={voucher.id}
                        className={cn(
                          "transition-colors hover:bg-muted/30",
                          isRowSelected && "bg-primary/5 hover:bg-primary/10"
                        )}
                      >
                        <TableCell className="text-center py-3.5">
                          <input
                            type="checkbox"
                            checked={isRowSelected}
                            onChange={(e) => handleSelectRow(voucher.id, e.target.checked)}
                            className="rounded border-border text-primary focus:ring-primary bg-background w-4 h-4 cursor-pointer"
                          />
                        </TableCell>
                        <TableCell className="font-mono font-bold text-foreground tracking-wider">
                          {voucher.id}
                        </TableCell>
                        <TableCell className="font-medium">
                          {voucher.packageName}
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={cn(
                              "text-[10px] font-bold px-2 py-0.5 border-none tracking-wide rounded-full uppercase",
                              voucher.status === "Online" && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                              voucher.status === "Offline" && "bg-muted text-muted-foreground",
                              voucher.status === "Unactivated" && "bg-primary/10 text-primary",
                              voucher.status === "Sync Issue" && "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                              voucher.status === "Expired" && "bg-destructive/10 text-destructive"
                            )}
                          >
                            {voucher.status === "Unactivated" ? "PROVISIONED" : voucher.status === "Expired" ? "DEACTIVATED" : voucher.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {voucher.activatedAt || "Never"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {voucher.expiresAt || "Never"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {voucher.useCase}
                        </TableCell>
                        <TableCell className="font-mono text-[10px] text-muted-foreground max-w-[150px] truncate" title={voucher.note}>
                          {voucher.note}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {voucher.purchaseTime}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleCopyCode(voucher.id)}
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                              title="Copy code"
                            >
                              <Clipboard className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => navigate(`/vouchers/create?printCodes=${voucher.id}`)}
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                              title="Preview & print"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteSingle(voucher)}
                              disabled={deleteVoucherMutation.isPending}
                              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                              title="Delete voucher"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Table Footer / Pagination */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border-t border-border bg-muted/10 text-muted-foreground text-xs">
            <div>
              {selectedVouchers.length} of {filteredVouchers.length} row(s) selected
            </div>

            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <span>Rows per page</span>
                <select
                  value={rowsPerPage}
                  onChange={(e) => {
                    setRowsPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="bg-background border border-border rounded px-1.5 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value={8}>8</option>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
              </div>

              <span>
                Page {currentPage} of {totalPages}
              </span>

              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  disabled={currentPage === 1}
                  onClick={() => handlePageChange(currentPage - 1)}
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  disabled={currentPage === totalPages}
                  onClick={() => handlePageChange(currentPage + 1)}
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </main>

      {/* GENERATE VOUCHERS DIALOG: SWITCHES SHEET (MOBILE) / DIALOG (DESKTOP) */}
      {isMobile ? (
        <Sheet open={isGenerateOpen} onOpenChange={setIsGenerateOpen}>
          <SheetContent side="right" className="bg-popover text-popover-foreground flex flex-col justify-between p-6 sm:max-w-md">
            <div className="space-y-6 overflow-y-auto pr-1">
              <SheetHeader>
                <SheetTitle className="text-foreground text-lg font-bold flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary animate-pulse" />
                  Generate Vouchers
                </SheetTitle>
                <SheetDescription className="text-muted-foreground text-xs">
                  Generate multiple hotspot codes to the selected MikroTik router.
                </SheetDescription>
              </SheetHeader>

              {/* Form Content */}
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-foreground">Voucher Format</Label>
                  <Select value={genFormat} onValueChange={(val: any) => setGenFormat(val)}>
                    <SelectTrigger className="text-xs h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="alphanumeric-lower">Alphanumeric lowercase (0-9a-z)</SelectItem>
                      <SelectItem value="alphanumeric-upper">Alphanumeric uppercase (0-9A-Z)</SelectItem>
                      <SelectItem value="numeric">Numbers only (0-9)</SelectItem>
                      <SelectItem value="alphanumeric-mixed">Mixed Alphanumeric</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-foreground">Number to Generate</Label>
                  <Input
                    type="number"
                    min={1}
                    max={1000}
                    value={genQuantity}
                    onChange={(e) => setGenQuantity(Math.min(1000, Math.max(1, Number(e.target.value))))}
                    className="text-xs h-9"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-foreground">Profile / Package</Label>
                  <Select value={genPackageId} onValueChange={setGenPackageId}>
                    <SelectTrigger className="text-xs h-9">
                      <SelectValue placeholder="Select a Package" />
                    </SelectTrigger>
                    <SelectContent>
                      {packagesLoading ? (
                        <SelectItem value="loading" disabled>Loading packages...</SelectItem>
                      ) : routerPackages.length === 0 ? (
                        <SelectItem value="none" disabled>No packages synced</SelectItem>
                      ) : (
                        routerPackages.map((pkg) => (
                          <SelectItem key={pkg.id} value={pkg.id}>
                            {pkg.name} (UGX {pkg.price.toLocaleString()})
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-foreground">Voucher Code Length</Label>
                  <Select value={String(genLength)} onValueChange={(val) => setGenLength(Number(val))}>
                    <SelectTrigger className="text-xs h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="4">4 Characters</SelectItem>
                      <SelectItem value="5">5 Characters</SelectItem>
                      <SelectItem value="6">6 Characters</SelectItem>
                      <SelectItem value="7">7 Characters</SelectItem>
                      <SelectItem value="8">8 Characters</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-foreground">Note (Optional)</Label>
                  <textarea
                    rows={2}
                    placeholder="Common notes for the batch..."
                    value={genNote}
                    onChange={(e) => setGenNote(e.target.value)}
                    className="w-full rounded-md bg-background border border-input p-2 text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                {/* Advanced Options Accordion */}
                <div className="border border-border rounded-md p-1.5">
                  <button
                    type="button"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="flex justify-between items-center w-full px-2 py-1 text-xs font-bold text-foreground hover:text-foreground/90"
                  >
                    <span>Advanced Options</span>
                    {showAdvanced ? (
                      <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                    )}
                  </button>
                  {showAdvanced && (
                    <div className="p-2 space-y-3 border-t border-border mt-1.5">
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Username Prefix</Label>
                        <Input
                          placeholder="e.g. TR-"
                          value={genPrefix}
                          onChange={(e) => setGenPrefix(e.target.value.toUpperCase())}
                          className="h-8 text-xs font-mono"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Username Postfix</Label>
                        <Input
                          placeholder="e.g. -WK"
                          value={genPostfix}
                          onChange={(e) => setGenPostfix(e.target.value.toUpperCase())}
                          className="h-8 text-xs font-mono"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <SheetFooter className="border-t border-border pt-4 mt-4 flex flex-row gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setIsGenerateOpen(false)} className="text-muted-foreground hover:bg-muted">
                Cancel
              </Button>
              <Button
                onClick={handleGenerateSubmit}
                disabled={packagesLoading || routerPackages.length === 0}
                className="text-xs font-bold"
              >
                Generate Vouchers
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={isGenerateOpen} onOpenChange={setIsGenerateOpen}>
          <DialogContent className="bg-popover text-popover-foreground p-6 sm:max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-foreground text-lg font-bold flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary animate-pulse" />
                Generate Vouchers
              </DialogTitle>
              <DialogDescription className="text-muted-foreground text-xs">
                Configure voucher options to create hotspot codes synced directly to MikroTik.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleGenerateSubmit} className="space-y-4 my-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-foreground">Voucher Format</Label>
                <Select value={genFormat} onValueChange={(val: any) => setGenFormat(val)}>
                  <SelectTrigger className="text-xs h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alphanumeric-lower">Alphanumeric lowercase (0-9a-z)</SelectItem>
                    <SelectItem value="alphanumeric-upper">Alphanumeric uppercase (0-9A-Z)</SelectItem>
                    <SelectItem value="numeric">Numbers only (0-9)</SelectItem>
                    <SelectItem value="alphanumeric-mixed">Mixed Alphanumeric</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-foreground">Number to Generate</Label>
                  <Input
                    type="number"
                    min={1}
                    max={1000}
                    value={genQuantity}
                    onChange={(e) => setGenQuantity(Math.min(1000, Math.max(1, Number(e.target.value))))}
                    className="text-xs h-9"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-foreground">Voucher Code Length</Label>
                  <Select value={String(genLength)} onValueChange={(val) => setGenLength(Number(val))}>
                    <SelectTrigger className="text-xs h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="4">4 Characters</SelectItem>
                      <SelectItem value="5">5 Characters</SelectItem>
                      <SelectItem value="6">6 Characters</SelectItem>
                      <SelectItem value="7">7 Characters</SelectItem>
                      <SelectItem value="8">8 Characters</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-foreground">Profile / Package</Label>
                <Select value={genPackageId} onValueChange={setGenPackageId}>
                  <SelectTrigger className="text-xs h-9">
                    <SelectValue placeholder="Select a Package" />
                  </SelectTrigger>
                  <SelectContent>
                    {packagesLoading ? (
                      <SelectItem value="loading" disabled>Loading packages...</SelectItem>
                    ) : routerPackages.length === 0 ? (
                      <SelectItem value="none" disabled>No packages synced</SelectItem>
                    ) : (
                      routerPackages.map((pkg) => (
                        <SelectItem key={pkg.id} value={pkg.id}>
                          {pkg.name} (UGX {pkg.price.toLocaleString()})
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-foreground">Note (Optional)</Label>
                <textarea
                  rows={2}
                  placeholder="Common notes for the batch..."
                  value={genNote}
                  onChange={(e) => setGenNote(e.target.value)}
                  className="w-full rounded-md bg-background border border-input p-2 text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Advanced Options Accordion */}
              <div className="border border-border rounded-md p-1.5">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex justify-between items-center w-full px-2 py-1 text-xs font-bold text-foreground hover:text-foreground/90"
                >
                  <span>Advanced Options</span>
                  {showAdvanced ? (
                    <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                </button>
                {showAdvanced && (
                  <div className="p-2 space-y-3 border-t border-border mt-1.5">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Username Prefix</Label>
                        <Input
                          placeholder="e.g. TR-"
                          value={genPrefix}
                          onChange={(e) => setGenPrefix(e.target.value.toUpperCase())}
                          className="h-8 text-xs font-mono"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Username Postfix</Label>
                        <Input
                          placeholder="e.g. -WK"
                          value={genPostfix}
                          onChange={(e) => setGenPostfix(e.target.value.toUpperCase())}
                          className="h-8 text-xs font-mono"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter className="border-t border-border pt-4 mt-4 flex gap-2 justify-end">
                <Button type="button" variant="ghost" size="sm" onClick={() => setIsGenerateOpen(false)} className="text-muted-foreground hover:bg-muted">
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={packagesLoading || routerPackages.length === 0}
                  className="text-xs font-bold h-9 px-4"
                >
                  Generate Vouchers
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* VOUCHER PROGRESS DIALOG */}
      {voucherJobId && (
        <VoucherProgressDialog
          open={!!voucherJobId}
          stage={voucherJob?.stage || "Processing"}
          message={voucherJob?.message || "Running job..."}
          progress={voucherJob?.progress || 0}
          events={voucherJob?.events || []}
          failed={voucherJob?.status === "FAILED"}
        />
      )}

      {/* DOWNLOAD BY COMMENT DIALOG */}
      <DownloadByCommentDialog
        open={isDownloadByCommentOpen}
        onOpenChange={setIsDownloadByCommentOpen}
        uniqueNotes={uniqueNotes}
        vouchers={vouchers}
        selectedRouterName={selectedRouter?.name}
        selectedRouterHost={selectedRouter?.host}
      />
    </div>
  );
}

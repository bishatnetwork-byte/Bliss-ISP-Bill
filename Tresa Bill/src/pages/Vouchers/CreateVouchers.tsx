import AppHeader from "@/components/Header/AppHeader";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  useBranchVouchers,
  useQueueRouterVouchers,
  useRouterPackages,
  useRouters,
  useVoucherJob,
} from "@/hooks/useRouters";
import { cn } from "@/lib/utils";
import { voucherUiStatus } from "@/lib/voucherStatus";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Coins,
  Download,
  Eye,
  Hash,
  Info,
  Loader2,
  Palette,
  Phone,
  Printer,
  QrCode,
  Settings,
  Sparkles,
  Ticket,
  Wifi,
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  DEFAULT_VOUCHER_THEME_ID,
  downloadVoucherPdf,
  getVoucherTheme,
  VOUCHER_PRINT_STYLES,
  VOUCHER_THEMES,
  VoucherCard,
  VoucherProgressDialog,
} from "./templates";

interface InternetPackage {
  id: string;
  packageId?: number;
  name: string;
  duration: string;
  price: number;
  description: string;
}

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
}

function registryStatus(status: string): Voucher["status"] {
  if (status === "ONLINE") return "Online";
  if (status === "OFFLINE" || status === "ACTIVE") return "Offline";
  return voucherUiStatus(status) as Exclude<Voucher["status"], "Online" | "Offline">;
}

type VoucherCodeFormat = "alphanumeric-lower" | "alphanumeric-upper" | "numeric" | "alphanumeric-mixed";
interface VoucherJobContext {
  type: "single" | "bulk";
  packageName: string;
  duration: string;
  price: number;
  batchId?: string;
  wifiName?: string;
}

export default function CreateVouchers() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const printBatchId = searchParams.get("printBatchId");
  const printRouterName = searchParams.get("routerName");
  const printCodesParam = searchParams.get("printCodes");
  const isPrintMode = !!(printBatchId || printCodesParam);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("sidebar-collapsed") === "true");
  useEffect(() => {
    const handler = (event: Event) => {
      setSidebarCollapsed((event as CustomEvent<{ collapsed: boolean }>).detail.collapsed);
    };
    window.addEventListener("sidebar-collapse-change", handler);
    return () => window.removeEventListener("sidebar-collapse-change", handler);
  }, []);

  const [branchId, setBranchId] = useState(() => localStorage.getItem("selected-workspace") || "");
  useEffect(() => {
    const handler = (event: Event) => setBranchId((event as CustomEvent<{ id: string }>).detail.id);
    window.addEventListener("renult-branch-change", handler);
    return () => window.removeEventListener("renult-branch-change", handler);
  }, []);

  // API Queries & Mutations
  const { data: routers = [], isLoading: routersLoading } = useRouters(branchId);
  const { data: branchVouchersResponse, isLoading: vouchersLoading } = useBranchVouchers(branchId, { limit: 1000 });
  const [selectedRouterId, setSelectedRouterId] = useState<string>("");
  const selectedRouter = routers.find((router) => router.id === selectedRouterId);
  const { data: routerPackagesResponse, isLoading: packagesLoading } = useRouterPackages(selectedRouterId);
  const queueVouchersMutation = useQueueRouterVouchers(selectedRouterId);

  // Router Packages Selection
  const routerPackages: InternetPackage[] = useMemo(() => {
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

  useEffect(() => {
    if (!selectedRouterId && routers.length > 0) {
      setSelectedRouterId(routers[0].id);
    }
  }, [routers, selectedRouterId]);

  // Voucher Generator State
  const [bulkQuantity, setBulkQuantity] = useState<number>(100);
  const [bulkPhone, setBulkPhone] = useState<string>("");
  const [bulkPhoneError, setBulkPhoneError] = useState<string>("");
  const [bulkPrefix, setBulkPrefix] = useState<string>("");
  const [bulkFormat, setBulkFormat] = useState<VoucherCodeFormat>("alphanumeric-lower");
  const [bulkLength, setBulkLength] = useState<number>(6);
  const [bulkPackageId, setBulkPackageId] = useState<string>("");
  const [bulkPrice, setBulkPrice] = useState<number>(0);

  // Active Job Tracker
  const [voucherJobId, setVoucherJobId] = useState(() => localStorage.getItem("active-voucher-job") || "");
  const [voucherJobContext, setVoucherJobContext] = useState<VoucherJobContext | null>(() => {
    const saved = localStorage.getItem("active-voucher-job-context");
    return saved ? JSON.parse(saved) as VoucherJobContext : null;
  });
  const { data: voucherJob } = useVoucherJob(voucherJobId);

  // Print Style & Template Picker State
  const [layoutDesign, setLayoutDesign] = useState<"classic" | "minimal" | "qrcode-left" | "qrcode-right" | "modern-gradient">("classic");
  const [printTheme, setPrintTheme] = useState<string>(DEFAULT_VOUCHER_THEME_ID);
  const [showQrCode, setShowQrCode] = useState<boolean>(true);
  const [qrCodeFormat, setQrCodeFormat] = useState<"code" | "gateway" | "custom">("gateway");
  const [qrGatewayIp, setQrGatewayIp] = useState<string>("10.0.0.1");
  const [qrCustomUrl, setQrCustomUrl] = useState<string>("http://mywifi.com/login?username=CODE");
  const [showWifiName, setShowWifiName] = useState<boolean>(true);
  const [customWifiName, setCustomWifiName] = useState<string>("");
  const [showPrice, setShowPrice] = useState<boolean>(true);
  const [showPackage, setShowPackage] = useState<boolean>(true);

  // Scoped Print Preview Vouchers
  const [freshVouchers, setFreshVouchers] = useState<{ vouchers: Voucher[]; wifiName?: string } | null>(null);

  // Pre-fill fields when router packages load
  useEffect(() => {
    if (routerPackages.length > 0) {
      if (!bulkPackageId || !routerPackages.some((pkg) => pkg.id === bulkPackageId)) {
        setBulkPackageId(routerPackages[0].id);
        setBulkPrice(routerPackages[0].price);
      }
    }
  }, [routerPackages, bulkPackageId]);

  useEffect(() => {
    const pkg = routerPackages.find((p) => p.id === bulkPackageId);
    if (pkg) setBulkPrice(pkg.price);
  }, [routerPackages, bulkPackageId]);

  // Sync Router Gateway Host to QR Code IP
  useEffect(() => {
    if (selectedRouter?.host) {
      const host = selectedRouter.host.trim();
      const isIp = /^[0-9.]+$/.test(host);
      setQrGatewayIp(isIp ? host : "10.0.0.1");
    }
  }, [selectedRouter]);

  // Pre-fill Custom WiFi Name from selected router
  useEffect(() => {
    if (selectedRouter?.name) {
      setCustomWifiName(selectedRouter.name);
    }
  }, [selectedRouter]);

  // Voucher Syncing from background job
  useEffect(() => {
    if (!voucherJobId) return;
    const preventReload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", preventReload);
    return () => window.removeEventListener("beforeunload", preventReload);
  }, [voucherJobId]);

  useEffect(() => {
    if (!voucherJobId || !voucherJob || !["COMPLETED", "COMPLETED_WITH_ERRORS", "FAILED"].includes(voucherJob.status)) return;

    if (voucherJob.status === "FAILED" || !voucherJob.result) {
      toast.error(voucherJob.error || "Voucher creation failed.");
    } else {
      const result = voucherJob.result;
      queryClient.invalidateQueries({ queryKey: ["branchVouchers", branchId] });
      queryClient.invalidateQueries({ queryKey: ["routerVouchers", selectedRouterId] });

      const mapped: Voucher[] = result.vouchers.map((v) => ({
        id: v.voucher_code,
        phone: v.phone_number === "BULK" ? undefined : v.phone_number,
        routerName: v.router_name,
        packageName: voucherJobContext?.packageName || "",
        duration: voucherJobContext?.duration || "",
        pricePaid: voucherJobContext?.price || 0,
        purchaseTime: v.created_at.replace("T", " ").substring(0, 19),
        status: registryStatus(v.status),
        type: voucherJobContext?.type === "bulk" ? "Bulk" : "Single",
        batchId: voucherJobContext?.batchId,
      }));

      setFreshVouchers({ vouchers: mapped, wifiName: voucherJobContext?.wifiName });
      toast.success(`Created and verified ${result.count} vouchers on MikroTik.`);
      if (result.router_sync_error) toast.warning(result.router_sync_error);
    }

    localStorage.removeItem("active-voucher-job");
    localStorage.removeItem("active-voucher-job-context");
    setVoucherJobId("");
    setVoucherJobContext(null);
  }, [branchId, queryClient, selectedRouterId, voucherJob, voucherJobContext, voucherJobId]);

  // Load Existing Registry Vouchers for printing based on search query params
  const registryVouchersToPrint = useMemo(() => {
    if (!branchVouchersResponse?.vouchers) return [];
    
    const allVouchers: Voucher[] = branchVouchersResponse.vouchers
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
      .map((v) => ({
        id: v.voucher_code,
        phone: (v.phone_number === "BULK" || !v.phone_number) ? undefined : v.phone_number,
        routerName: v.router_name,
        packageName: `${v.speed_type} ${v.profile}`,
        duration: v.profile,
        pricePaid: v.amount,
        purchaseTime: v.created_at.replace("T", " ").substring(0, 19),
        status: registryStatus(v.status),
        type: v.payment_reference?.startsWith("BAT-") ? "Bulk" : "Single",
        batchId: v.payment_reference?.startsWith("BAT-") ? v.payment_reference : undefined,
      }));

    if (printBatchId) {
      return allVouchers.filter(
        (v) => v.batchId === printBatchId &&
          (!printRouterName || v.routerName.trim().toUpperCase() === printRouterName.trim().toUpperCase())
      );
    }

    if (printCodesParam) {
      const targetCodes = printCodesParam.split(",").map((c) => c.trim().toUpperCase());
      return allVouchers.filter((v) => targetCodes.includes(v.id.toUpperCase()));
    }

    return [];
  }, [branchVouchersResponse, printBatchId, printRouterName, printCodesParam]);

  // Determine current printing vouchers: freshly generated > loaded from registry
  const vouchersToPrint = useMemo(() => {
    if (freshVouchers) return freshVouchers.vouchers;
    return registryVouchersToPrint;
  }, [freshVouchers, registryVouchersToPrint]);

  // Mock Single Voucher for Live Real-time Sidebar styling preview
  const singleMockVoucher = useMemo(() => {
    const selectedPkg = routerPackages.find((p) => p.id === bulkPackageId);
    const mockPkgName = selectedPkg ? selectedPkg.name : "1.5 Mbps 24 Hours";
    const mockDuration = selectedPkg ? selectedPkg.duration : "24h";
    const mockPrice = selectedPkg ? selectedPkg.price : 1000;
    const mockWifi = customWifiName.trim() || selectedRouter?.name || "TRESA WIFI";

    const mockCodes: Record<VoucherCodeFormat, string> = {
      "alphanumeric-lower": "wifi8b",
      "alphanumeric-upper": "WIFI8B",
      "alphanumeric-mixed": "wIfI8b",
      numeric: "748392",
    };
    const mockCode = `${bulkPrefix || ""}${mockCodes[bulkFormat]}`;

    return {
      id: mockCode,
      routerName: selectedRouter?.name || "TEST ROUTER",
      packageName: mockPkgName,
      duration: mockDuration,
      pricePaid: mockPrice,
      purchaseTime: new Date().toISOString(),
      status: "Unactivated" as const,
      type: "Bulk" as const,
      wifiName: mockWifi,
    };
  }, [selectedRouter, bulkPackageId, routerPackages, bulkPrefix, bulkFormat, customWifiName]);

  // Actions
  const validateBulkPhone = (phone: string) => {
    if (!phone) {
      setBulkPhoneError("Phone number is required");
      return false;
    }
    const cleaned = phone.replace(/[^0-9+]/g, "");
    if (cleaned.length < 9) {
      setBulkPhoneError("Phone number is too short");
      return false;
    }
    setBulkPhoneError("");
    return true;
  };

  const handleCreateVouchersSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRouterId) {
      toast.error("Select a router first.");
      return;
    }
    if (bulkQuantity <= 0 || bulkQuantity > 1000) {
      toast.error("Please specify a batch size between 1 and 1,000.");
      return;
    }
    if (bulkQuantity === 1 && !validateBulkPhone(bulkPhone)) {
      toast.error("Please provide a valid phone number.");
      return;
    }

    const selectedPkg = routerPackages.find((p) => p.id === bulkPackageId);
    if (!selectedPkg) {
      toast.error("Create or sync packages for this router first.");
      return;
    }

    setFreshVouchers(null);

    const queueVoucherJob = async (
      payload: Parameters<typeof queueVouchersMutation.mutateAsync>[0],
      context: VoucherJobContext
    ) => {
      const queued = await queueVouchersMutation.mutateAsync(payload);
      localStorage.setItem("active-voucher-job", queued.job_id);
      localStorage.setItem("active-voucher-job-context", JSON.stringify(context));
      setVoucherJobContext(context);
      setVoucherJobId(queued.job_id);
    };

    if (bulkQuantity === 1) {
      try {
        await queueVoucherJob(
          {
            package_id: selectedPkg.packageId || Number(selectedPkg.id),
            quantity: 1,
            amount: bulkPrice,
            phone_number: bulkPhone.trim(),
            prefix: bulkPrefix || "",
            code_length: bulkLength,
            code_format: bulkFormat,
          },
          {
            type: "single",
            packageName: selectedPkg.name,
            duration: selectedPkg.duration,
            price: bulkPrice,
            wifiName: selectedRouter?.name,
          }
        );
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to queue voucher.");
      }
    } else {
      const prefixLabel = (bulkPrefix || "BATCH").replace(/^BAT-?/i, "").replace(/[^A-Z0-9]/gi, "").toUpperCase() || "BATCH";
      const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
      const batchId = `BAT-${prefixLabel}-${timestamp}`;
      try {
        await queueVoucherJob(
          {
            package_id: selectedPkg.packageId || Number(selectedPkg.id),
            quantity: bulkQuantity,
            amount: bulkPrice,
            prefix: bulkPrefix,
            code_length: bulkLength,
            code_format: bulkFormat,
            payment_reference: batchId,
          },
          {
            type: "bulk",
            packageName: selectedPkg.name,
            duration: selectedPkg.duration,
            price: bulkPrice,
            batchId,
            wifiName: selectedRouter?.name,
          }
        );
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to queue voucher batch.");
      }
    }
  };

  const handleDownloadPdf = () => {
    const targetVouchers = vouchersToPrint.length > 0 ? vouchersToPrint : [singleMockVoucher];
    const baseName = printBatchId || (freshVouchers ? "fresh" : "custom");
    
    downloadVoucherPdf(
      targetVouchers.map((v) => ({
        code: v.id,
        packageName: v.packageName,
        duration: v.duration,
        price: v.pricePaid,
        status: v.status,
        batchId: v.batchId,
        wifiName: showWifiName ? wifiDisplayName : undefined,
      })),
      `${baseName}-vouchers.pdf`,
      {
        themeId: printTheme,
        layoutDesign,
        showQrCode,
        qrCodeFormat,
        qrGatewayIp,
        qrCustomUrl,
        showWifiName,
        customWifiName: showWifiName ? wifiDisplayName : "",
        showPrice,
        showPackage,
      }
    );
    toast.success("Voucher PDF generated successfully!");
  };

  const handlePrintTrigger = () => {
    if (vouchersToPrint.length === 0) {
      toast.error("No generated vouchers to print. Please generate vouchers first.");
      return;
    }
    window.print();
  };

  const wifiDisplayName = customWifiName.trim() || selectedRouter?.name || "TRESA WIFI";

  return (
    <div
      className={cn(
        "min-h-screen bg-background transition-all duration-300 print:pl-0 print:p-0",
        sidebarCollapsed ? "md:pl-[72px]" : "md:pl-[280px]"
      )}
    >
      <SEO title="Create Vouchers & Styling" />
      <AppHeader onCreateForm={() => {}} />

      {/* Main Page Layout Wrapper */}
      <div className="flex flex-col lg:flex-row items-stretch min-h-[calc(100vh-64px)] print:block">
        
        {/* LEFT COLUMN: Main Form Area (Vouchers Only) */}
        <div className="flex-1 p-6 space-y-6 print:hidden">
          {/* Header */}
          <div className="flex items-center gap-3 border-b border-border/10 pb-4">
            {isPrintMode && (
              <Button
                variant="outline"
                size="icon"
                onClick={() => navigate("/vouchers")}
                className="h-8 w-8 rounded-full"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
            )}
            <div>
              <h1 className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
                <Ticket className="w-5 h-5 text-primary" />
                {isPrintMode ? "Print Vouchers Selection" : "Hotspot Voucher Creator"}
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isPrintMode
                  ? `Format and print details for batch or custom selection.`
                  : "Generate and configure hotspot access codes to sync with your MikroTik router."}
              </p>
            </div>
          </div>

          {/* Core Content */}
          {vouchersToPrint.length > 0 ? (
            <Card className="border border-border/50 rounded shadow-sm bg-card">
              <CardHeader className="pb-3 border-b border-border/10 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
                    <Printer className="w-4 h-4 text-primary" />
                    Vouchers Ready for Printing
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {freshVouchers
                      ? `Generated ${vouchersToPrint.length} vouchers successfully!`
                      : `Loaded ${vouchersToPrint.length} vouchers from your registry.`}
                  </CardDescription>
                </div>
                {!freshVouchers && (
                  <Button variant="outline" size="sm" onClick={() => navigate("/vouchers")} className="h-8 text-xs">
                    Back to Registry
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                <div className="p-3 bg-primary/5 border border-primary/10 rounded flex items-center justify-between text-primary">
                  <div className="flex items-center gap-2">
                    <Info className="w-4 h-4 shrink-0" />
                    <span className="text-xs font-semibold">
                      Styles are configured in the sidebar. Click "Print" to launch browser print dialog.
                    </span>
                  </div>
                </div>

                {/* Grid List of Voucher codes to print */}
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Voucher Codes List</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 max-h-[250px] overflow-y-auto border border-border/40 p-3 rounded bg-muted/10 font-mono text-xs">
                    {vouchersToPrint.map((v) => (
                      <div key={v.id} className="p-1.5 bg-white border border-border/60 rounded text-center font-bold">
                        {v.id}
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
              <CardFooter className="py-4 border-t border-border/10 flex items-center gap-3">
                <Button
                  onClick={handlePrintTrigger}
                  className="flex-1 h-10 gap-1.5 text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <Printer className="w-4 h-4" />
                  Print Vouchers Now
                </Button>
                <Button
                  variant="outline"
                  onClick={handleDownloadPdf}
                  className="h-10 text-sm gap-1.5 font-bold"
                >
                  <Download className="w-4 h-4" />
                  Download PDF File
                </Button>
              </CardFooter>
            </Card>
          ) : (
            /* Creation Form */
            <div className="max-w-2xl mx-auto">
              <Card className="border border-border/50 rounded shadow-sm bg-card">
                <CardHeader className="pb-3 border-b border-border/10">
                  <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
                    <Settings className="w-4 h-4 text-primary" />
                    1. Generator Setup
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Fill in target destination router and package attributes.
                  </CardDescription>
                </CardHeader>
                <form onSubmit={handleCreateVouchersSubmit}>
                  <CardContent className="space-y-4 pt-4">
                    {/* Router Select */}
                    <div className="space-y-1.5">
                      <Label htmlFor="router-select" className="text-xs font-bold">
                        Target Router
                      </Label>
                      <Select value={selectedRouterId} onValueChange={setSelectedRouterId}>
                        <SelectTrigger id="router-select" className="h-10 text-xs">
                          <SelectValue placeholder="Select Router" />
                        </SelectTrigger>
                        <SelectContent>
                          {routersLoading ? (
                            <SelectItem value="loading" disabled>Loading routers...</SelectItem>
                          ) : (
                            routers.map((r) => (
                              <SelectItem key={r.id} value={r.id}>
                                {r.name} ({r.location || "No Location"})
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      {/* Quantity */}
                      <div className="space-y-1.5">
                        <Label htmlFor="bulk-qty" className="text-xs font-bold">
                          Quantity
                        </Label>
                        <div className="relative">
                          <Input
                            id="bulk-qty"
                            type="number"
                            min="1"
                            max="1000"
                            value={bulkQuantity}
                            onChange={(e) => setBulkQuantity(Math.min(1000, Math.max(1, Number(e.target.value))))}
                            className="pl-9 h-10 text-xs font-semibold"
                          />
                          <Hash className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                        </div>
                      </div>

                      {/* Prefix */}
                      <div className="space-y-1.5">
                        <Label htmlFor="bulk-prefix" className="text-xs font-bold">
                          Prefix (Optional)
                        </Label>
                        <Input
                          id="bulk-prefix"
                          placeholder="e.g. TR-"
                          value={bulkPrefix}
                          onChange={(e) => setBulkPrefix(e.target.value.toUpperCase())}
                          className="h-10 text-xs font-mono"
                        />
                      </div>
                    </div>

                    {/* Single Phone Field */}
                    {bulkQuantity === 1 && (
                      <div className="space-y-1.5">
                        <Label htmlFor="bulk-phone" className="text-xs font-bold text-foreground">
                          Customer Phone Number <span className="text-destructive">*</span>
                        </Label>
                        <div className="relative">
                          <Input
                            id="bulk-phone"
                            placeholder="e.g. +256 701 234567"
                            value={bulkPhone}
                            onChange={(e) => {
                              setBulkPhone(e.target.value);
                              if (bulkPhoneError) validateBulkPhone(e.target.value);
                            }}
                            onBlur={() => validateBulkPhone(bulkPhone)}
                            className={cn(
                              "pl-9 h-10 text-xs",
                              bulkPhoneError ? "border-destructive focus-visible:ring-destructive" : ""
                            )}
                            required
                          />
                          <Phone className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                        </div>
                        {bulkPhoneError && (
                          <p className="text-[11px] text-destructive font-medium">{bulkPhoneError}</p>
                        )}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      {/* Code Style */}
                      <div className="space-y-1.5">
                        <Label htmlFor="bulk-format" className="text-xs font-bold">
                          Code Format
                        </Label>
                        <Select value={bulkFormat} onValueChange={(val) => setBulkFormat(val as VoucherCodeFormat)}>
                          <SelectTrigger id="bulk-format" className="h-10 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="alphanumeric-lower">lowercase alphanumeric ★</SelectItem>
                            <SelectItem value="alphanumeric-upper">UPPERCASE ALPHANUMERIC</SelectItem>
                            <SelectItem value="alphanumeric-mixed">Mixed Alphanumeric</SelectItem>
                            <SelectItem value="numeric">Digits Only (0-9)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Code Length */}
                      <div className="space-y-1.5">
                        <Label htmlFor="bulk-length" className="text-xs font-bold">
                          Code Length
                        </Label>
                        <Select value={String(bulkLength)} onValueChange={(val) => setBulkLength(Number(val))}>
                          <SelectTrigger id="bulk-length" className="h-10 text-xs">
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

                    <div className="grid grid-cols-2 gap-4">
                      {/* Internet Package */}
                      <div className="space-y-1.5">
                        <Label htmlFor="bulk-package" className="text-xs font-bold">
                          Internet Package
                        </Label>
                        <Select value={bulkPackageId} onValueChange={setBulkPackageId}>
                          <SelectTrigger id="bulk-package" className="h-10 text-xs">
                            <SelectValue placeholder="Select Package" />
                          </SelectTrigger>
                          <SelectContent>
                            {packagesLoading ? (
                              <SelectItem value="loading" disabled>Loading packages...</SelectItem>
                            ) : routerPackages.length === 0 ? (
                              <SelectItem value="none" disabled>No synced packages</SelectItem>
                            ) : (
                              routerPackages.map((pkg) => (
                                <SelectItem key={pkg.id} value={pkg.id}>
                                  {pkg.name}
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Price Override */}
                      <div className="space-y-1.5">
                        <Label htmlFor="bulk-price" className="text-xs font-bold">
                          Unit Price (UGX)
                        </Label>
                        <div className="relative">
                          <Input
                            id="bulk-price"
                            type="number"
                            value={bulkPrice}
                            onChange={(e) => setBulkPrice(Number(e.target.value))}
                            className="pl-9 h-10 text-xs font-semibold"
                          />
                          <Coins className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                        </div>
                      </div>
                    </div>
                  </CardContent>

                  <CardFooter className="py-4 bg-muted/20 border-t border-border/10 flex items-center justify-between rounded-b-lg">
                    <span className="text-xs text-muted-foreground font-semibold">
                      {bulkQuantity === 1
                        ? "Single voucher"
                        : `Total Value: UGX ${(bulkPrice * bulkQuantity).toLocaleString()}`}
                    </span>
                    <Button
                      type="submit"
                      size="sm"
                      className="h-10 gap-1.5 text-xs font-bold"
                      disabled={
                        queueVouchersMutation.isPending ||
                        !!voucherJobId ||
                        packagesLoading ||
                        routerPackages.length === 0
                      }
                    >
                      {queueVouchersMutation.isPending || voucherJobId ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5 text-primary-foreground" />
                      )}
                      {bulkQuantity === 1 ? "Generate" : `Generate ${bulkQuantity} Codes`}
                    </Button>
                  </CardFooter>
                </form>
              </Card>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Design & Customizer Sidebar */}
        <div className="w-full lg:w-96 shrink-0 border-t lg:border-t-0 lg:border-l border-border bg-card p-6 lg:sticky lg:top-16 lg:h-[calc(100vh-64px)] overflow-y-auto print:hidden space-y-6">
          <div>
            <h2 className="text-sm font-bold flex items-center gap-2 text-foreground uppercase tracking-wider">
              <Palette className="w-4 h-4 text-primary" />
              Design & Branding
            </h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Tweak card templates, themes, and QR formats live.
            </p>
          </div>

          {/* Micro Live preview card container */}
          <div className="flex flex-col items-center justify-center p-4 border border-dashed border-border/60 rounded bg-muted/20 space-y-2">
            <span className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1">
              <Eye className="w-3 h-3" /> Live Mock Card
            </span>
            <div className="transform scale-105 py-1">
              <VoucherCard
                voucher={{
                  code: singleMockVoucher.id,
                  packageName: singleMockVoucher.packageName,
                  duration: singleMockVoucher.duration,
                  price: singleMockVoucher.pricePaid,
                  batchId: singleMockVoucher.batchId,
                  wifiName: showWifiName ? wifiDisplayName : undefined,
                }}
                theme={getVoucherTheme(printTheme)}
                layoutDesign={layoutDesign}
                showQrCode={showQrCode}
                qrCodeFormat={qrCodeFormat}
                qrGatewayIp={qrGatewayIp}
                qrCustomUrl={qrCustomUrl}
                showWifiName={showWifiName}
                customWifiName={showWifiName ? wifiDisplayName : ""}
                showPrice={showPrice}
                showPackage={showPackage}
              />
            </div>
          </div>

          <div className="space-y-4">
            {/* Color Swatch selector */}
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold">Theme Style Color</Label>
              <div className="grid grid-cols-4 gap-2">
                {VOUCHER_THEMES.map((theme) => (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => setPrintTheme(theme.id)}
                    className={cn(
                      "group flex flex-col items-center justify-center p-1.5 rounded border text-center transition-all",
                      printTheme === theme.id
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-border bg-muted/5 hover:bg-muted/20"
                    )}
                  >
                    <div className={cn("h-3.5 w-3.5 rounded-full", theme.swatch)} />
                    <span className="text-[8px] font-bold text-foreground/80 mt-1 truncate max-w-full">
                      {theme.name.split(" ")[0]}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Layout selection */}
            <div className="space-y-1.5">
              <Label htmlFor="layout-select" className="text-[11px] font-bold">
                Card Design Layout
              </Label>
              <Select value={layoutDesign} onValueChange={(val: any) => setLayoutDesign(val)}>
                <SelectTrigger id="layout-select" className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="classic">Classic Solid Band</SelectItem>
                  <SelectItem value="minimal">Clean borders</SelectItem>
                  <SelectItem value="qrcode-left">QR Column Left</SelectItem>
                  <SelectItem value="qrcode-right">QR Column Right</SelectItem>
                  <SelectItem value="modern-gradient">Gradient Premium</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* QR Configurations */}
            <div className="border border-border/50 rounded p-3 space-y-3 bg-muted/10">
              <div className="flex items-center justify-between">
                <Label htmlFor="toggle-qrcode" className="text-xs font-bold flex items-center gap-1.5 cursor-pointer">
                  <QrCode className="w-3.5 h-3.5 text-primary" />
                  QR Code Support
                </Label>
                <Switch id="toggle-qrcode" checked={showQrCode} onCheckedChange={setShowQrCode} />
              </div>

              {showQrCode && (
                <div className="space-y-3 pt-2 border-t border-border/20">
                  <div className="space-y-1.5">
                    <Label htmlFor="qrcode-format" className="text-[10px] font-bold text-muted-foreground">
                      QR Content Link
                    </Label>
                    <Select value={qrCodeFormat} onValueChange={(val: any) => setQrCodeFormat(val)}>
                      <SelectTrigger id="qrcode-format" className="h-8 text-xs bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="code">Raw voucher code</SelectItem>
                        <SelectItem value="gateway">MikroTik IP Gateway Link</SelectItem>
                        <SelectItem value="custom">Custom URL Pattern</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {qrCodeFormat === "gateway" && (
                    <div className="space-y-1.5">
                      <Label htmlFor="gateway-ip" className="text-[10px] font-bold text-muted-foreground">
                        Gateway IP Address / Host
                      </Label>
                      <Input
                        id="gateway-ip"
                        placeholder="10.0.0.1"
                        value={qrGatewayIp}
                        onChange={(e) => setQrGatewayIp(e.target.value)}
                        className="h-8 text-xs bg-white"
                      />
                    </div>
                  )}

                  {qrCodeFormat === "custom" && (
                    <div className="space-y-1.5">
                      <Label htmlFor="custom-url" className="text-[10px] font-bold text-muted-foreground">
                        Custom URL Destination
                      </Label>
                      <Input
                        id="custom-url"
                        placeholder="http://mywifi.com/login?username=CODE"
                        value={qrCustomUrl}
                        onChange={(e) => setQrCustomUrl(e.target.value)}
                        className="h-8 text-xs bg-white"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Elements Visibility */}
            <div className="space-y-3">
              <Label className="text-[11px] font-bold">Element Visibilities</Label>
              <div className="grid grid-cols-3 gap-2">
                <label className="flex items-center gap-1.5 cursor-pointer text-[10px] font-bold text-muted-foreground hover:text-foreground">
                  <input
                    type="checkbox"
                    checked={showWifiName}
                    onChange={(e) => setShowWifiName(e.target.checked)}
                    className="rounded border-border text-primary focus:ring-primary w-3.5 h-3.5"
                  />
                  Show Wi-Fi
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer text-[10px] font-bold text-muted-foreground hover:text-foreground">
                  <input
                    type="checkbox"
                    checked={showPrice}
                    onChange={(e) => setShowPrice(e.target.checked)}
                    className="rounded border-border text-primary focus:ring-primary w-3.5 h-3.5"
                  />
                  Show Price
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer text-[10px] font-bold text-muted-foreground hover:text-foreground">
                  <input
                    type="checkbox"
                    checked={showPackage}
                    onChange={(e) => setShowPackage(e.target.checked)}
                    className="rounded border-border text-primary focus:ring-primary w-3.5 h-3.5"
                  />
                  Show Pkg
                </label>
              </div>

              {showWifiName && (
                <div className="space-y-1.5 pt-1">
                  <Label htmlFor="custom-wifi" className="text-[10px] font-bold text-muted-foreground">
                    Custom SSID Wi-Fi Label
                  </Label>
                  <Input
                    id="custom-wifi"
                    placeholder="SSID label"
                    value={customWifiName}
                    onChange={(e) => setCustomWifiName(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
              )}
            </div>

            {/* Quick Actions (only visible when vouchers exist) */}
            {vouchersToPrint.length > 0 && (
              <div className="space-y-2 pt-4 border-t border-border/20">
                <Button
                  onClick={handlePrintTrigger}
                  className="w-full h-9 gap-1.5 text-xs font-bold bg-primary text-primary-foreground border-none hover:bg-primary/95"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print Vouchers
                </Button>
                <Button
                  variant="outline"
                  onClick={handleDownloadPdf}
                  className="w-full h-9 gap-1.5 text-xs font-bold"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download PDF File
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* HIDDEN INLINE GRID CONTAINER EXCLUSIVELY FOR NATIVE PRINT MEDIA */}
      <div className="hidden print:block print-container">
        {/* Inject aligning CSS overrides specifically when browser is compiling print media */}
        <style dangerouslySetInnerHTML={{ __html: VOUCHER_PRINT_STYLES }} />

        <div className="print-card-grid">
          {(vouchersToPrint.length > 0 ? vouchersToPrint : [singleMockVoucher]).map((voucher) => (
            <VoucherCard
              key={voucher.id}
              voucher={{
                code: voucher.id,
                packageName: voucher.packageName,
                duration: voucher.duration,
                price: voucher.pricePaid,
                batchId: voucher.batchId,
                wifiName: showWifiName ? wifiDisplayName : undefined,
              }}
              theme={getVoucherTheme(printTheme)}
              layoutDesign={layoutDesign}
              showQrCode={showQrCode}
              qrCodeFormat={qrCodeFormat}
              qrGatewayIp={qrGatewayIp}
              qrCustomUrl={qrCustomUrl}
              showWifiName={showWifiName}
              customWifiName={showWifiName ? wifiDisplayName : ""}
              showPrice={showPrice}
              showPackage={showPackage}
            />
          ))}
        </div>
      </div>

      <VoucherProgressDialog
        open={queueVouchersMutation.isPending || !!voucherJobId}
        stage={voucherJob?.stage}
        message={voucherJob?.message}
        progress={voucherJob?.progress}
        events={voucherJob?.events}
        failed={voucherJob?.status === "FAILED"}
      />
    </div>
  );
}

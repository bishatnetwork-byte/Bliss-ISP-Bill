import AppHeader from "@/components/Header/AppHeader";
import SEO from "@/components/SEO";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
    useBranchActiveUsers,
    useBranchVouchers,
    useDeleteRouterVoucher,
    useDeleteRouterVoucherBatch,
    useFetchRouterVouchers,
    useRouterPackages,
    useRouters,
    useSyncRouterVouchers,
    useQueueRouterVouchers,
    useVoucherJob,
} from "@/hooks/useRouters";
import VoucherRegistryTables, { RegistryBatch, RegistryVoucher } from "./VoucherRegistryTables";
import { downloadVoucherPdf } from "@/lib/voucherPdf";
import { voucherUiStatus } from "@/lib/voucherStatus";
import { useQueryClient } from "@tanstack/react-query";
import {
    Activity,
    Barcode,
    CheckCircle2,
    Coins,
    Download,
    CloudUpload,
    Hash,
    Loader2,
    Phone,
    Plus,
    Printer,
    RefreshCw,
    Router,
    Search,
    Sliders,
    Sparkles,
    Ticket,
    Trash2,
    Users,
    Wifi,
    WifiOff,
    X
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

// Internet Package Interfaces
interface InternetPackage {
    id: string;
    packageId?: number;
    name: string;
    duration: string;
    price: number;
    description: string;
}

// Voucher Interface
interface Voucher {
    id: string; // Voucher Code
    phone?: string;
    routerName: string;
    packageName: string;
    duration: string;
    pricePaid: number;
    purchaseTime: string;
    status: 'Active' | 'Expired' | 'Unactivated';
    type: 'Single' | 'Bulk';
    batchId?: string;
}

type VoucherCodeFormat = 'alphanumeric-upper' | 'numeric' | 'alphanumeric-mixed';
interface VoucherJobContext {
    type: "single" | "bulk";
    packageName: string;
    duration: string;
    price: number;
    batchId?: string;
    wifiName?: string;
}

export default function VouchersIndex() {
    const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("sidebar-collapsed") === "true");
    const queryClient = useQueryClient();

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
    const { data: routers = [], isLoading: routersLoading } = useRouters(branchId);
    const { data: branchVouchersResponse, isLoading: vouchersLoading } = useBranchVouchers(branchId, { limit: 1000 });
    const [selectedRouterId, setSelectedRouterId] = useState<string>("");
    const selectedRouter = routers.find((router) => router.id === selectedRouterId);
    const { data: routerPackagesResponse, isLoading: packagesLoading } = useRouterPackages(selectedRouterId);
    const queueVouchersMutation = useQueueRouterVouchers(selectedRouterId);
    const [voucherJobId, setVoucherJobId] = useState(() => localStorage.getItem("active-voucher-job") || "");
    const [voucherJobContext, setVoucherJobContext] = useState<VoucherJobContext | null>(() => {
        const saved = localStorage.getItem("active-voucher-job-context");
        return saved ? JSON.parse(saved) as VoucherJobContext : null;
    });
    const { data: voucherJob } = useVoucherJob(voucherJobId);
    const deleteVoucherMutation = useDeleteRouterVoucher(branchId);
    const deleteBatchMutation = useDeleteRouterVoucherBatch(branchId);
    const fetchRouterVouchers = useFetchRouterVouchers(selectedRouterId, branchId);
    const syncRouterVouchers = useSyncRouterVouchers(selectedRouterId, branchId);
    const routerPackages: InternetPackage[] = useMemo(() => {
        const items = routerPackagesResponse?.data.voucher || [];
        return items.map((item) => ({
            id: String(item.package_id),
            packageId: item.package_id,
            name: `${item.speed_type} ${item.limit}`,
            duration: item.limit,
            price: Number(item.total || 0),
            description: item.data,
        }));
    }, [routerPackagesResponse]);
    const availablePackages = routerPackages;

    useEffect(() => {
        if (!selectedRouterId && routers.length > 0) {
            setSelectedRouterId(routers[0].id);
        }
    }, [routers, selectedRouterId]);

    // Only a live RouterOS session is active; provisioned codes remain ready to use.
    const vouchers: Voucher[] = useMemo(() => {
        return (branchVouchersResponse?.vouchers || []).map((voucher) => ({
            id: voucher.voucher_code,
            phone: (voucher.phone_number === "BULK" || !voucher.phone_number) ? undefined : voucher.phone_number,
            routerName: voucher.router_name,
            packageName: `${voucher.speed_type} ${voucher.profile}`,
            duration: voucher.profile,
            pricePaid: voucher.amount,
            purchaseTime: voucher.created_at.replace('T', ' ').substring(0, 19),
            status: voucherUiStatus(voucher.status),
            type: voucher.payment_reference?.startsWith("BAT-") ? "Bulk" : "Single",
            batchId: voucher.payment_reference?.startsWith("BAT-") ? voucher.payment_reference : undefined,
        }));
    }, [branchVouchersResponse]);

    // Active Tab
    const [searchParams] = useSearchParams();
    const [activeTab, setActiveTab] = useState<string>(
        () => (searchParams.get("tab") === "active-users" ? "active-users" : "generator"),
    );

    // Active Users (aggregated across all routers in this branch)
    const activeUsersQueries = useBranchActiveUsers(routers);
    const activeUsersLoading = routers.length > 0 && activeUsersQueries.some((query) => query.isLoading);
    const activeUsers = useMemo(() => {
        return activeUsersQueries.flatMap((query, index) => {
            const router = routers[index];
            const items = query.data?.active_users || [];
            return items.map((item, itemIndex) => ({
                id: `${router.id}-${item[".id"] || item.id || itemIndex}`,
                routerName: router.name,
                device: String(item["login-by"] || item["server"] || "Hotspot client"),
                ip: String(item.address || "N/A"),
                mac: String(item["mac-address"] || "N/A"),
                user: String(item.user || item.name || "N/A"),
                uptime: String(item.uptime || "N/A"),
                uploaded: String(item["bytes-in"] || "0 B"),
                downloaded: String(item["bytes-out"] || "0 B"),
            }));
        });
    }, [activeUsersQueries, routers]);

    // Single Voucher Form State
    const [singlePhone, setSinglePhone] = useState<string>("");
    const [singlePackageId, setSinglePackageId] = useState<string>(availablePackages[0]?.id || "");
    const [singlePrice, setSinglePrice] = useState<number>(availablePackages[0]?.price || 0);
    const [singlePhoneError, setSinglePhoneError] = useState<string>("");

    // Bulk Voucher Form State
    const [bulkQuantity, setBulkQuantity] = useState<number>(300);
    const [bulkPrefix, setBulkPrefix] = useState<string>("");
    const [bulkFormat, setBulkFormat] = useState<VoucherCodeFormat>("alphanumeric-upper");
    const [bulkLength, setBulkLength] = useState<number>(6);
    const [bulkPackageId, setBulkPackageId] = useState<string>(availablePackages[0]?.id || "");
    const [bulkPrice, setBulkPrice] = useState<number>(availablePackages[0]?.price || 0);

    // Registry Filters State
    const [searchQuery, setSearchQuery] = useState<string>("");
    const [filterPackage, setFilterPackage] = useState<string>("all");
    const [filterStatus, setFilterStatus] = useState<string>("all");

    // Selection for print/actions
    const [selectedVouchers, setSelectedVouchers] = useState<string[]>([]);

    // Printing Preview Mode State
    const [isPrintPreviewOpen, setIsPrintPreviewOpen] = useState<boolean>(false);
    const [showWifiName, setShowWifiName] = useState<boolean>(true);

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

            if (voucherJobContext?.type === "bulk") {
                const newVouchers: Voucher[] = result.vouchers.map((voucher) => ({
                    id: voucher.voucher_code,
                    routerName: voucher.router_name,
                    packageName: voucherJobContext.packageName,
                    duration: voucherJobContext.duration,
                    pricePaid: voucherJobContext.price,
                    purchaseTime: voucher.created_at.replace('T', ' ').substring(0, 19),
                    status: voucherUiStatus(voucher.status),
                    type: "Bulk",
                    batchId: voucherJobContext.batchId,
                }));
                downloadVoucherPdf(
                    newVouchers.map((voucher) => ({
                        code: voucher.id,
                        packageName: voucher.packageName,
                        duration: voucher.duration,
                        price: voucher.pricePaid,
                        status: voucher.status,
                        batchId: voucher.batchId,
                        wifiName: showWifiName ? voucherJobContext.wifiName : undefined,
                    })),
                    `${voucherJobContext.batchId || "voucher-batch"}-vouchers.pdf`,
                );
                setSelectedVouchers([]);
                toast.success(`Created and verified ${result.count} vouchers on MikroTik.`);
            } else {
                setSinglePhone("");
                toast.success(`Created and verified voucher ${result.vouchers[0]?.voucher_code || ""}.`);
            }
            if (result.router_sync_error) toast.warning(result.router_sync_error);
            setActiveTab("registry");
        }

        localStorage.removeItem("active-voucher-job");
        localStorage.removeItem("active-voucher-job-context");
        setVoucherJobId("");
        setVoucherJobContext(null);
    }, [branchId, queryClient, selectedRouterId, showWifiName, voucherJob, voucherJobContext, voucherJobId]);

    const queueVoucherJob = async (payload: Parameters<typeof queueVouchersMutation.mutateAsync>[0], context: VoucherJobContext) => {
        const queued = await queueVouchersMutation.mutateAsync(payload);
        localStorage.setItem("active-voucher-job", queued.job_id);
        localStorage.setItem("active-voucher-job-context", JSON.stringify(context));
        setVoucherJobContext(context);
        setVoucherJobId(queued.job_id);
    };

    useEffect(() => {
        if (availablePackages.length === 0) return;
        if (!availablePackages.some((pkg) => pkg.id === singlePackageId)) {
            setSinglePackageId(availablePackages[0].id);
        }
        if (!availablePackages.some((pkg) => pkg.id === bulkPackageId)) {
            setBulkPackageId(availablePackages[0].id);
        }
    }, [availablePackages, bulkPackageId, singlePackageId]);

    // Sync package prices when changed
    useEffect(() => {
        const pkg = availablePackages.find(p => p.id === singlePackageId);
        if (pkg) setSinglePrice(pkg.price);
    }, [availablePackages, singlePackageId]);

    useEffect(() => {
        const pkg = availablePackages.find(p => p.id === bulkPackageId);
        if (pkg) setBulkPrice(pkg.price);
    }, [availablePackages, bulkPackageId]);

    // Phone Validation
    const validatePhone = (phone: string) => {
        if (!phone) {
            setSinglePhoneError("Phone number is required");
            return false;
        }
        // simple regex to check positive digit count
        const cleaned = phone.replace(/[^0-9+]/g, "");
        if (cleaned.length < 9) {
            setSinglePhoneError("Phone number is too short");
            return false;
        }
        setSinglePhoneError("");
        return true;
    };

    // Generate Single Voucher Action
    const handleCreateSingle = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedRouterId) {
            toast.error("Select a router first.");
            return;
        }
        if (!validatePhone(singlePhone)) {
            toast.error("Please provide a valid phone number.");
            return;
        }

        const selectedPkg = availablePackages.find(p => p.id === singlePackageId);
        if (!selectedPkg) {
            toast.error("Create or sync packages for this router first.");
            return;
        }

        try {
            await queueVoucherJob({
                package_id: selectedPkg.packageId || Number(selectedPkg.id),
                quantity: 1,
                amount: singlePrice,
                phone_number: singlePhone.trim(),
                prefix: "VCH-",
                code_length: 8,
                code_format: "alphanumeric-upper",
            }, {
                type: "single",
                packageName: selectedPkg.name,
                duration: selectedPkg.duration,
                price: singlePrice,
                wifiName: selectedRouter?.name,
            });
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to queue voucher.");
        }
    };

    // Generate Bulk Vouchers Action
    const handleCreateBulk = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedRouterId) {
            toast.error("Select a router first.");
            return;
        }
        if (bulkQuantity <= 0 || bulkQuantity > 1000) {
            toast.error("Please specify a batch size between 1 and 1,000.");
            return;
        }

        const selectedPkg = availablePackages.find(p => p.id === bulkPackageId);
        if (!selectedPkg) {
            toast.error("Create or sync packages for this router first.");
            return;
        }

        const prefixLabel = (bulkPrefix || "BATCH").replace(/^BAT-?/i, "").replace(/[^A-Z0-9]/gi, "").toUpperCase() || "BATCH";
        const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
        const batchId = `BAT-${prefixLabel}-${timestamp}`;
        try {
            await queueVoucherJob({
                package_id: selectedPkg.packageId || Number(selectedPkg.id),
                quantity: bulkQuantity,
                amount: bulkPrice,
                prefix: bulkPrefix,
                code_length: bulkLength,
                code_format: bulkFormat,
                payment_reference: batchId,
            }, {
                type: "bulk",
                packageName: selectedPkg.name,
                duration: selectedPkg.duration,
                price: bulkPrice,
                batchId,
                wifiName: selectedRouter?.name,
            });
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to queue voucher batch.");
        }
    };

    // Filtering Logic
    const filteredVouchers = useMemo(() => {
        return vouchers.filter(voucher => {
            const matchesSearch =
                voucher.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (voucher.phone && voucher.phone.toLowerCase().includes(searchQuery.toLowerCase())) ||
                (voucher.batchId && voucher.batchId.toLowerCase().includes(searchQuery.toLowerCase()));

            const matchesPackage = filterPackage === "all" || voucher.packageName === filterPackage;
            const matchesStatus = filterStatus === "all" || voucher.status === filterStatus;

            return matchesSearch && matchesPackage && matchesStatus;
        });
    }, [vouchers, searchQuery, filterPackage, filterStatus]);

    const filteredSingleVouchers = useMemo(
        () => filteredVouchers.filter((voucher) => voucher.type === "Single"),
        [filteredVouchers],
    );

    const voucherBatches: RegistryBatch[] = useMemo(() => {
        const grouped = new Map<string, Voucher[]>();
        vouchers.filter((voucher) => voucher.type === "Bulk" && voucher.batchId).forEach((voucher) => {
            const groupKey = `${voucher.routerName.trim().toUpperCase()}::${voucher.batchId}`;
            const current = grouped.get(groupKey) || [];
            current.push(voucher);
            grouped.set(groupKey, current);
        });
        const query = searchQuery.toLowerCase();
        return Array.from(grouped.entries())
            .map(([, items]) => ({
                id: items[0].batchId!,
                routerName: items[0].routerName,
                packageName: items[0].packageName,
                createdAt: items[0].purchaseTime,
                quantity: items.length,
                totalValue: items.reduce((sum, item) => sum + item.pricePaid, 0),
                active: items.filter((item) => item.status === "Active").length,
                unactivated: items.filter((item) => item.status === "Unactivated").length,
                expired: items.filter((item) => item.status === "Expired").length,
            }))
            .filter((batch) => {
                const matchesSearch = !query
                    || batch.id.toLowerCase().includes(query)
                    || batch.routerName.toLowerCase().includes(query)
                    || batch.packageName.toLowerCase().includes(query);
                const matchesPackage = filterPackage === "all" || batch.packageName === filterPackage;
                const matchesStatus = filterStatus === "all"
                    || (filterStatus === "Active" && batch.active > 0)
                    || (filterStatus === "Unactivated" && batch.unactivated > 0)
                    || (filterStatus === "Expired" && batch.expired > 0);
                return matchesSearch && matchesPackage && matchesStatus;
            })
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }, [filterPackage, filterStatus, searchQuery, vouchers]);

    // Bulk selections helper
    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedVouchers(filteredSingleVouchers.map(v => v.id));
        } else {
            setSelectedVouchers([]);
        }
    };

    const handleSelectVoucher = (id: string, checked: boolean) => {
        if (checked) {
            setSelectedVouchers([...selectedVouchers, id]);
        } else {
            setSelectedVouchers(selectedVouchers.filter(v => v !== id));
        }
    };

    const getVouchersToPrint = () => {
        if (selectedVouchers.length > 0) {
            return vouchers.filter(v => selectedVouchers.includes(v.id));
        }
        return filteredVouchers;
    };

    const copyCode = (code: string) => {
        navigator.clipboard.writeText(code);
        toast.success(`Copied code ${code} to clipboard`);
    };

    const findRouterId = (routerName: string) =>
        routers.find((router) => router.name.trim().toUpperCase() === routerName.trim().toUpperCase())?.id;

    const deleteSelected = async () => {
        const selected = filteredSingleVouchers.filter((voucher) => selectedVouchers.includes(voucher.id));
        if (selected.length === 0) return;
        if (!window.confirm(`Delete ${selected.length} selected voucher${selected.length === 1 ? "" : "s"} from MikroTik and the database? This cannot be undone.`)) return;

        let deleted = 0;
        for (const voucher of selected) {
            const routerId = findRouterId(voucher.routerName);
            if (!routerId) continue;
            try {
                await deleteVoucherMutation.mutateAsync({ routerId, voucherCode: voucher.id });
                deleted += 1;
            } catch {
                // Continue so other selected vouchers can still be removed.
            }
        }
        setSelectedVouchers([]);
        if (deleted === selected.length) {
            toast.success(`Deleted ${deleted} selected voucher${deleted === 1 ? "" : "s"}.`);
        } else {
            toast.warning(`Deleted ${deleted} of ${selected.length} selected vouchers.`);
        }
    };

    const handleDeleteVoucher = async (voucher: RegistryVoucher) => {
        const routerId = findRouterId(voucher.routerName);
        if (!routerId) {
            toast.error(`Router ${voucher.routerName} is not available.`);
            return;
        }
        if (!window.confirm(`Delete voucher ${voucher.id} from MikroTik and the database? This cannot be undone.`)) return;
        try {
            await deleteVoucherMutation.mutateAsync({ routerId, voucherCode: voucher.id });
            setSelectedVouchers((current) => current.filter((id) => id !== voucher.id));
            toast.success(`Voucher ${voucher.id} deleted from router and database.`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to delete voucher.");
        }
    };

    const handleDeleteBatch = async (batch: RegistryBatch) => {
        const routerId = findRouterId(batch.routerName);
        if (!routerId) {
            toast.error(`Router ${batch.routerName} is not available.`);
            return;
        }
        if (!window.confirm(`Delete batch ${batch.id} and all ${batch.quantity} vouchers from MikroTik and the database? This cannot be undone.`)) return;
        try {
            const result = await deleteBatchMutation.mutateAsync({ routerId, batchId: batch.id });
            setSelectedVouchers((current) => current.filter((id) => !vouchers.some((voucher) => voucher.batchId === batch.id && voucher.id === id)));
            toast.success(`Deleted ${result.deleted} PostgreSQL records and ${result.router_deleted} MikroTik users from batch ${batch.id}.`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to delete voucher batch.");
        }
    };

    const downloadPdf = () => {
        const rows = getVouchersToPrint();
        if (rows.length === 0) {
            toast.error("No vouchers selected for download.");
            return;
        }
        downloadVoucherPdf(
            rows.map((voucher) => ({
                code: voucher.id,
                packageName: voucher.packageName,
                duration: voucher.duration,
                price: voucher.pricePaid,
                status: voucher.status,
                batchId: voucher.batchId,
                wifiName: showWifiName ? selectedRouter?.name : undefined,
            })),
            `vouchers-${new Date().toISOString().slice(0, 10)}.pdf`,
        );
        toast.success(`Downloaded ${rows.length} voucher${rows.length === 1 ? "" : "s"} as PDF.`);
    };

    const downloadBatchPdf = (batchRecord: RegistryBatch) => {
        const batch = vouchers.filter(
            (voucher) => voucher.batchId === batchRecord.id
                && voucher.routerName.trim().toUpperCase() === batchRecord.routerName.trim().toUpperCase(),
        );
        if (batch.length === 0) {
            toast.error("This batch has no vouchers to download.");
            return;
        }
        downloadVoucherPdf(
            batch.map((voucher) => ({
                code: voucher.id,
                packageName: voucher.packageName,
                duration: voucher.duration,
                price: voucher.pricePaid,
                status: voucher.status,
                batchId: voucher.batchId,
                wifiName: showWifiName ? selectedRouter?.name : undefined,
            })),
            `${batchRecord.id}-vouchers.pdf`,
        );
        toast.success(`Downloaded batch ${batchRecord.id} as PDF.`);
    };

    const handleVerifyAllVouchers = async () => {
        if (!selectedRouterId) return toast.error("Select a router first.");
        try {
            const result = await fetchRouterVouchers.mutateAsync();
            toast.success(`Verified all vouchers on ${result.router_name}: ${result.updated} checked, ${result.imported} imported.`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to verify vouchers on MikroTik.");
        }
    };

    const handleSyncToRouter = async () => {
        if (!selectedRouterId) return toast.error("Select a router first.");
        try {
            const result = await syncRouterVouchers.mutateAsync();
            if (result.failed > 0) {
                toast.warning(`Synced ${result.synced} vouchers; ${result.failed} failed.`);
            } else {
                toast.success(`Synced ${result.synced} database vouchers to ${result.router_name}.`);
            }
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to sync vouchers to router.");
        }
    };

    const getStatusBadge = (status: Voucher['status']) => {
        switch (status) {
            case "Active":
                return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
            case "Expired":
                return "bg-slate-500/10 text-slate-500 border-slate-500/20";
            case "Unactivated":
                return "bg-amber-500/10 text-amber-500 border-amber-500/20";
        }
    };

    const handleNativePrint = () => {
        window.print();
    };

    return (
        <div className={cn(
            "min-h-screen bg-background transition-all duration-300",
            sidebarCollapsed ? "md:pl-[72px]" : "md:pl-[280px]",
            isPrintPreviewOpen ? "overflow-hidden" : ""
        )}>
            <SEO title="Voucher Hub" />
            <AppHeader onCreateForm={() => { }} />

            <main className="max-w-screen mx-auto px-4 sm:px-6 py-6 print:hidden">
                {/* Title Area */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                    <div>

                        <p className="text-sm text-muted-foreground mt-1">
                            Generate, print, and track hotspot access vouchers in bulk or single format.
                        </p>
                        <div className="mt-3 flex max-w-sm items-center gap-2">
                            <Router className="h-4 w-4 text-muted-foreground" />
                            <Select value={selectedRouterId} onValueChange={setSelectedRouterId} disabled={routersLoading}>
                                <SelectTrigger className="h-9 text-xs">
                                    <SelectValue placeholder={routersLoading ? "Loading routers..." : "Select router"} />
                                </SelectTrigger>
                                <SelectContent>
                                    {routers.map((router) => (
                                        <SelectItem key={router.id} value={router.id}>{router.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                            {selectedRouter ? `${availablePackages.length} saved packages available for ${selectedRouter.name}` : "Select a router to load packages."}
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleVerifyAllVouchers}
                            disabled={!selectedRouterId || fetchRouterVouchers.isPending}
                            className="gap-2 text-xs font-semibold h-9"
                            title="Verify all database vouchers against the selected MikroTik router"
                        >
                            {fetchRouterVouchers.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4 text-primary" />}
                            Verify All
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleSyncToRouter}
                            disabled={!selectedRouterId || syncRouterVouchers.isPending}
                            className="gap-2 text-xs font-semibold h-9"
                            title="Push database vouchers to the selected router"
                        >
                            {syncRouterVouchers.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudUpload className="w-4 h-4 text-primary" />}
                            Sync Router
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={downloadPdf}
                            className="gap-2 text-xs font-semibold h-9"
                        >
                            <Download className="w-4 h-4 text-primary" />
                            Download PDF
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                const toPrint = getVouchersToPrint();
                                if (toPrint.length === 0) {
                                    toast.error("No vouchers to print. Generate some first or select vouchers from the table.");
                                    return;
                                }
                                setIsPrintPreviewOpen(true);
                            }}
                            className="gap-2 text-xs font-semibold h-9"
                        >
                            <Printer className="w-4 h-4 text-primary" />
                            Print Preview ({selectedVouchers.length > 0 ? selectedVouchers.length : filteredVouchers.length})
                        </Button>
                    </div>
                </div>

                {/* Navigation Tabs */}
                <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                    <TabsList className="bg-muted p-1 border border-border/30 rounded">
                        <TabsTrigger value="generator" className="gap-2 text-xs font-medium px-4 py-2 rounded active:bg-primary">
                            <Sparkles className="w-3.5 h-3.5" />
                            Voucher Generator
                        </TabsTrigger>
                        <TabsTrigger value="registry" className="gap-2 text-xs font-medium px-4 py-2 rounded active:bg-primary">
                            <Barcode className="w-3.5 h-3.5" />
                            Active Registry ({vouchersLoading ? "..." : `${vouchers.filter((voucher) => voucher.type === "Single").length} singles / ${new Set(vouchers.filter((voucher) => voucher.batchId).map((voucher) => voucher.batchId)).size} batches`})
                        </TabsTrigger>
                        <TabsTrigger value="active-users" className="gap-2 text-xs font-medium px-4 py-2 rounded active:bg-primary">
                            <Users className="w-3.5 h-3.5" />
                            Active Users ({activeUsersLoading ? "..." : activeUsers.length})
                        </TabsTrigger>
                    </TabsList>

                    {/* TAB 1: GENERATORS */}
                    <TabsContent value="generator" className="space-y-6 outline-none">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                            {/* Form 1: Single Voucher */}
                            <Card className="bg-card border border-border/20 rounded shadow-[0_4px_20px_hsl(var(--primary)/0.02)] flex flex-col justify-between">
                                <CardHeader>
                                    <CardTitle className="text-base font-bold flex items-center gap-2">
                                        Single Voucher Generation
                                    </CardTitle>
                                    <CardDescription className="text-xs">
                                        Create a single access voucher linked to a customer's phone number.
                                    </CardDescription>
                                </CardHeader>
                                <form onSubmit={handleCreateSingle}>
                                    <CardContent className="space-y-4">
                                        {/* Phone Number Field */}
                                        <div className="space-y-2">
                                            <Label htmlFor="single-phone" className="text-xs font-semibold">
                                                Customer Phone Number <span className="text-destructive">*</span>
                                            </Label>
                                            <div className="relative">
                                                <Input
                                                    id="single-phone"
                                                    placeholder="e.g. +256 701 234567"
                                                    value={singlePhone}
                                                    onChange={(e) => {
                                                        setSinglePhone(e.target.value);
                                                        if (singlePhoneError) validatePhone(e.target.value);
                                                    }}
                                                    onBlur={() => validatePhone(singlePhone)}
                                                    className={cn("pl-9 h-10 text-sm", singlePhoneError ? "border-destructive focus-visible:ring-destructive" : "")}
                                                />
                                                <Phone className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                                            </div>
                                            {singlePhoneError ? (
                                                <p className="text-[11px] text-destructive font-medium">{singlePhoneError}</p>
                                            ) : (
                                                <p className="text-[11px] text-muted-foreground font-medium">Used for logging and SMS delivery.</p>
                                            )}
                                        </div>

                                        {/* Internet Package Selector */}
                                        <div className="space-y-2">
                                            <Label htmlFor="single-package" className="text-xs font-semibold">
                                                Internet Package
                                            </Label>
                                            <Select value={singlePackageId} onValueChange={setSinglePackageId}>
                                                <SelectTrigger className="h-10 text-sm">
                                                    <SelectValue placeholder="Select Package" />
                                                </SelectTrigger>
                                                <SelectContent>
                                            {availablePackages.map(pkg => (
                                                <SelectItem key={pkg.id} value={pkg.id}>
                                                    {pkg.name} ({pkg.duration})
                                                </SelectItem>
                                            ))}
                                                </SelectContent>
                                            </Select>
                                            <p className="text-[11px] text-muted-foreground mt-0.5">
                                                {availablePackages.find(p => p.id === singlePackageId)?.description}
                                            </p>
                                        </div>

                                        {/* Price Override Field */}
                                        <div className="space-y-2">
                                            <Label htmlFor="single-price" className="text-xs font-semibold">
                                                Price (UGX)
                                            </Label>
                                            <div className="relative">
                                                <Input
                                                    id="single-price"
                                                    type="number"
                                                    value={singlePrice}
                                                    onChange={(e) => setSinglePrice(Number(e.target.value))}
                                                    className="pl-9 h-10 text-sm"
                                                />
                                                <Coins className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                                            </div>
                                        </div>
                                    </CardContent>

                                    <CardFooter className="pt-2 border-t border-border/20 mt-4 flex items-center justify-between">
                                        <div className="text-xs text-muted-foreground">
                                            Will create <span className="font-bold text-foreground">1 voucher</span>
                                        </div>
                                        <Button type="submit" size="sm" className="gap-1.5 text-xs font-semibold" disabled={queueVouchersMutation.isPending || !!voucherJobId || packagesLoading}>
                                            {queueVouchersMutation.isPending || voucherJobId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                                            Generate Voucher
                                        </Button>
                                    </CardFooter>
                                </form>
                            </Card>

                            {/* Form 2: Bulk Voucher Generation */}
                            <Card className="bg-card border border-border/20 rounded shadow-[0_4px_20px_hsl(var(--primary)/0.02)] flex flex-col justify-between">
                                <CardHeader>
                                    <CardTitle className="text-base font-bold flex items-center gap-2">
                                        <Sliders className="w-4 h-4 text-primary" />
                                        Bulk Batch Generation
                                    </CardTitle>
                                    <CardDescription className="text-xs">
                                        Generate high volumes of vouchers with custom prefix, digit styles and constraints.
                                    </CardDescription>
                                </CardHeader>
                                <form onSubmit={handleCreateBulk}>
                                    <CardContent className="space-y-4">
                                        <div className="grid grid-cols-2 gap-4">
                                            {/* Quantity */}
                                            <div className="space-y-2">
                                                <Label htmlFor="bulk-qty" className="text-xs font-semibold">
                                                    Batch Size (Quantity)
                                                </Label>
                                                <div className="relative">
                                                    <Input
                                                        id="bulk-qty"
                                                        type="number"
                                                        min="1"
                                                        max="1000"
                                                        value={bulkQuantity}
                                                        onChange={(e) => setBulkQuantity(Math.min(1000, Math.max(1, Number(e.target.value))))}
                                                        className="pl-9 h-10 text-sm font-semibold"
                                                    />
                                                    <Hash className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                                                </div>
                                                <p className="text-[10px] text-muted-foreground mt-0.5">Maximum: 1,000</p>
                                            </div>

                                            {/* Prefix */}
                                            <div className="space-y-2">
                                                <Label htmlFor="bulk-prefix" className="text-xs font-semibold">
                                                    Voucher Code Prefix
                                                </Label>
                                                <Input
                                                    id="bulk-prefix"
                                                    placeholder="e.g. CAMP-"
                                                    value={bulkPrefix}
                                                    onChange={(e) => setBulkPrefix(e.target.value.toUpperCase())}
                                                    className="h-10 text-sm font-mono tracking-wider"
                                                />
                                                <p className="text-[10px] text-muted-foreground mt-0.5">Optional. Leave blank for codes like AA9FCS.</p>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            {/* Character Set Choice */}
                                            <div className="space-y-2">
                                                <Label htmlFor="bulk-format" className="text-xs font-semibold">
                                                    Code Style (Format)
                                                </Label>
                                                <Select value={bulkFormat} onValueChange={(value) => setBulkFormat(value as VoucherCodeFormat)}>
                                                    <SelectTrigger className="h-10 text-sm">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="alphanumeric-upper">UPPER ALPHANUMERIC</SelectItem>
                                                        <SelectItem value="alphanumeric-mixed">Mixed Alphanumeric</SelectItem>
                                                        <SelectItem value="numeric">Numbers Only (0-9)</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            {/* Code Length */}
                                            <div className="space-y-2">
                                                <Label htmlFor="bulk-length" className="text-xs font-semibold">
                                                    Code Character Length
                                                </Label>
                                                <Select value={String(bulkLength)} onValueChange={(val) => setBulkLength(Number(val))}>
                                                    <SelectTrigger className="h-10 text-sm">
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
                                            {/* Internet Package Selector */}
                                            <div className="space-y-2 col-span-2 sm:col-span-1">
                                                <Label htmlFor="bulk-package" className="text-xs font-semibold">
                                                    Internet Package
                                                </Label>
                                                <Select value={bulkPackageId} onValueChange={setBulkPackageId}>
                                                    <SelectTrigger className="h-10 text-sm">
                                                        <SelectValue placeholder="Select Package" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {availablePackages.map(pkg => (
                                                            <SelectItem key={pkg.id} value={pkg.id}>
                                                                {pkg.name}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            {/* Price Override */}
                                            <div className="space-y-2 col-span-2 sm:col-span-1">
                                                <Label htmlFor="bulk-price" className="text-xs font-semibold">
                                                    Unit Price (UGX)
                                                </Label>
                                                <div className="relative">
                                                    <Input
                                                        id="bulk-price"
                                                        type="number"
                                                        value={bulkPrice}
                                                        onChange={(e) => setBulkPrice(Number(e.target.value))}
                                                        className="pl-9 h-10 text-sm"
                                                    />
                                                    <Coins className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                                                </div>
                                            </div>
                                        </div>
                                    </CardContent>

                                    <CardFooter className="pt-2 border-t border-border/20 mt-4 flex items-center justify-between">
                                        <div className="text-xs text-muted-foreground">
                                            Total Batch Value: <span className="font-bold text-foreground">UGX {(bulkPrice * bulkQuantity).toLocaleString()}</span>
                                        </div>
                                        <Button type="submit" size="sm" className="gap-1.5 text-xs font-semibold" disabled={queueVouchersMutation.isPending || !!voucherJobId || packagesLoading}>
                                            {queueVouchersMutation.isPending || voucherJobId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-primary-foreground" />}
                                            Generate {bulkQuantity} Vouchers
                                        </Button>
                                    </CardFooter>
                                </form>
                            </Card>

                        </div>
                    </TabsContent>

                    {/* TAB 2: ACTIVE REGISTRY */}
                    <TabsContent value="registry" className="space-y-4 outline-none">

                        {/* Filter controls */}
                        <div className="p-1 rounded flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="flex-1 flex flex-col sm:flex-row sm:items-center gap-3">

                                {/* Search Bar */}
                                <div className="relative flex-1">
                                    <Input
                                        placeholder="Search by Code, Phone or Batch ID..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="pl-9 h-9 text-xs"
                                    />
                                    <Search className="absolute left-3 top-3 w-3.5 h-3.5 text-muted-foreground" />
                                    {searchQuery && (
                                        <button
                                            onClick={() => setSearchQuery("")}
                                            className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                                        >
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>

                                {/* Package Filter */}
                                <div className="w-full sm:w-[160px]">
                                    <Select value={filterPackage} onValueChange={setFilterPackage}>
                                        <SelectTrigger className="h-9 text-xs">
                                            <SelectValue placeholder="All Packages" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Packages</SelectItem>
                                            {availablePackages.map(p => (
                                                <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Status Filter */}
                                <div className="w-full sm:w-[130px]">
                                    <Select value={filterStatus} onValueChange={setFilterStatus}>
                                        <SelectTrigger className="h-9 text-xs">
                                            <SelectValue placeholder="All Statuses" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Statuses</SelectItem>
                                            <SelectItem value="Active">Active</SelectItem>
                                            <SelectItem value="Unactivated">Unactivated</SelectItem>
                                            <SelectItem value="Expired">Expired</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {/* Bulk Actions */}
                            {selectedVouchers.length > 0 && (
                                <div className="flex items-center gap-2 pt-2 md:pt-0 border-t md:border-t-0 border-border/30">
                                    <span className="text-xs text-muted-foreground mr-1">
                                        <span className="font-bold text-foreground">{selectedVouchers.length}</span> selected
                                    </span>

                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setIsPrintPreviewOpen(true)}
                                        className="h-8 gap-1 px-2.5 text-xs text-primary font-semibold border-primary/20 hover:bg-primary/5"
                                    >
                                        <Printer className="w-3.5 h-3.5" />
                                        Print Selected
                                    </Button>

                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        onClick={deleteSelected}
                                        disabled={deleteVoucherMutation.isPending}
                                        className="h-8 gap-1 px-2.5 text-xs font-semibold"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        Delete Selected
                                    </Button>
                                </div>
                            )}
                        </div>

                        <VoucherRegistryTables
                            singles={filteredSingleVouchers}
                            batches={voucherBatches}
                            selected={selectedVouchers}
                            deletingVoucher={deleteVoucherMutation.isPending}
                            deletingBatch={deleteBatchMutation.isPending}
                            onSelectAll={handleSelectAll}
                            onSelect={handleSelectVoucher}
                            onCopy={copyCode}
                            onDownloadBatch={downloadBatchPdf}
                            onDeleteVoucher={handleDeleteVoucher}
                            onDeleteBatch={handleDeleteBatch}
                            getStatusClass={getStatusBadge}
                        />

                    </TabsContent>

                    {/* TAB 3: ACTIVE USERS */}
                    <TabsContent value="active-users" className="space-y-4 outline-none">
                        <Card className="border border-border/40 shadow-sm bg-card">
                            <CardHeader className="pb-3 flex flex-row items-center justify-between">
                                <div>
                                    <CardTitle className="text-sm font-bold tracking-tight text-foreground flex items-center gap-1.5">
                                        <Activity className="w-4 h-4 text-primary animate-pulse" />
                                        Active Hotspot Sessions
                                    </CardTitle>
                                    <CardDescription className="text-xs text-muted-foreground">
                                        Devices currently connected via vouchers, across every router in this branch.
                                    </CardDescription>
                                </div>
                                <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 font-bold">
                                    {activeUsersLoading ? "..." : `${activeUsers.length} Online`}
                                </Badge>
                            </CardHeader>
                            <CardContent>
                                <div className="overflow-x-auto border border-border/20 rounded-md">
                                    <Table>
                                        <TableHeader className="bg-muted/30">
                                            <TableRow>
                                                <TableHead className="font-bold text-xs uppercase text-foreground">Router</TableHead>
                                                <TableHead className="font-bold text-xs uppercase text-foreground">Device/IP</TableHead>
                                                <TableHead className="font-bold text-xs uppercase text-foreground">MAC Address</TableHead>
                                                <TableHead className="font-bold text-xs uppercase text-foreground">Voucher Code</TableHead>
                                                <TableHead className="font-bold text-xs uppercase text-foreground">TX / RX</TableHead>
                                                <TableHead className="font-bold text-xs uppercase text-foreground text-right">Uptime</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {activeUsersLoading ? (
                                                <TableRow>
                                                    <TableCell colSpan={6} className="h-44 text-center">
                                                        <div className="flex flex-col items-center justify-center text-muted-foreground">
                                                            <Loader2 className="w-6 h-6 mb-2 animate-spin" />
                                                            <span className="text-sm font-semibold">Loading active sessions...</span>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ) : activeUsers.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={6} className="h-44 text-center">
                                                        <div className="flex flex-col items-center justify-center text-muted-foreground">
                                                            <WifiOff className="w-10 h-10 mb-2 stroke-[1.5] text-muted-foreground/60" />
                                                            <span className="text-sm font-semibold">No active sessions</span>
                                                            <span className="text-xs mt-0.5">Connected hotspot clients will appear here in real time.</span>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ) : (
                                                activeUsers.map((session) => (
                                                    <TableRow key={session.id} className="hover:bg-muted/40 transition-colors">
                                                        <TableCell className="text-xs font-semibold text-foreground">{session.routerName}</TableCell>
                                                        <TableCell>
                                                            <div className="flex flex-col">
                                                                <span className="text-xs font-bold text-foreground">{session.device}</span>
                                                                <span className="text-[10px] font-mono text-muted-foreground">{session.ip}</span>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="font-mono text-xs font-medium text-muted-foreground">{session.mac}</TableCell>
                                                        <TableCell className="font-mono text-xs font-semibold text-primary">{session.user}</TableCell>
                                                        <TableCell className="text-xs text-foreground/80">
                                                            <span className="font-bold text-emerald-500">↑ {session.uploaded}</span>
                                                            <span className="text-muted-foreground mx-1">/</span>
                                                            <span className="font-bold text-blue-500">↓ {session.downloaded}</span>
                                                        </TableCell>
                                                        <TableCell className="text-right text-xs font-mono text-muted-foreground">{session.uptime}</TableCell>
                                                    </TableRow>
                                                ))
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </main>

            {/* FULL-SCREEN OVERLAY FOR PRINT PREVIEW / PDF GENERATION */}
            {isPrintPreviewOpen && (
                <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm overflow-y-auto flex flex-col print:relative print:inset-auto print:bg-white print:overflow-visible">
                    {/* Controls Bar (Hidden during printing) */}
                    <div className="sticky top-0 bg-card border-b border-border/40 px-6 py-4 flex items-center justify-between z-10 print:hidden shadow-sm">
                        <div>
                            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                                <Printer className="w-4 h-4 text-primary" />
                                Voucher Print & PDF Preview
                            </h2>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Displaying {getVouchersToPrint().length} vouchers. Ready to be printed or downloaded to PDF.
                            </p>
                        </div>

                        <div className="flex items-center gap-2">
                            <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors select-none bg-muted/40 px-3 py-1.5 rounded border border-border/20">
                                <input
                                    type="checkbox"
                                    checked={showWifiName}
                                    onChange={(e) => setShowWifiName(e.target.checked)}
                                    className="rounded border-border text-primary focus:ring-primary w-3.5 h-3.5 cursor-pointer"
                                />
                                Show Wi-Fi Name
                            </label>
                        </div>

                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleNativePrint}
                                className="gap-1.5 text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/95 hover:text-primary-foreground h-9 px-4 border-none"
                            >
                                <Download className="w-4 h-4" />
                                Print / Save PDF
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setIsPrintPreviewOpen(false)}
                                className="h-9 w-9 p-0 rounded-full border border-border/40 hover:bg-muted/50"
                            >
                                <X className="w-4 h-4 text-foreground" />
                            </Button>
                        </div>
                    </div>

                    {/* Printable Container */}
                    <div className="flex-1 max-w-5xl mx-auto w-full p-6 sm:p-8 print:p-0 print:max-w-none">
                        {/* Embedded styles specifically for printing page alignment */}
                        <style dangerouslySetInnerHTML={{
                            __html: `
              @media print {
                body {
                  background: white !important;
                  color: black !important;
                }
                .print-container {
                  padding: 0 !important;
                  margin: 0 !important;
                  background: white !important;
                  width: 190mm !important;
                }
                /* Hide sidebar, header and preview toolbar */
                .print\\:hidden, aside, header, .sticky {
                  display: none !important;
                }
                /* Configure page size to fit 12 rows of 5 columns (60 cards per page) */
                @page {
                  size: A4 portrait;
                  margin: 8mm 10mm !important;
                }
                .print-card-grid {
                  grid-template-columns: repeat(5, 1fr) !important;
                  gap: 1.5mm !important;
                  display: grid !important;
                  background: white !important;
                  width: 190mm !important;
                }
                .print-card {
                  width: 36.5mm !important;
                  height: 21.5mm !important;
                  min-height: 21.5mm !important;
                  max-height: 21.5mm !important;
                  padding: 1.2mm !important;
                  margin: 0 !important;
                  border: 0.5pt dashed #444444 !important;
                  border-radius: 0.5mm !important;
                  background: white !important;
                  color: black !important;
                  box-shadow: none !important;
                  break-inside: avoid !important;
                  page-break-inside: avoid !important;
                  -webkit-print-color-adjust: exact;
                  print-color-adjust: exact;
                  display: flex !important;
                  flex-direction: column !important;
                  justify-content: space-between !important;
                  overflow: hidden !important;
                }
                .print-card .print-wifi-watermark {
                  display: none !important;
                }
                .print-card .print-header {
                  border-bottom: 0.15mm solid #dddddd !important;
                  padding-bottom: 0.4mm !important;
                  margin-bottom: 0.4mm !important;
                  display: flex !important;
                  justify-content: space-between !important;
                  align-items: center !important;
                }
                .print-card .print-logo-container {
                  display: flex !important;
                  align-items: center !important;
                  gap: 0.8mm !important;
                }
                .print-card .print-logo-icon {
                  padding: 0.2mm !important;
                  background: #f3f4f6 !important;
                  border-radius: 0.1mm !important;
                  display: flex !important;
                  align-items: center !important;
                  justify-content: center !important;
                }
                .print-card .print-logo-icon svg {
                  width: 2.5mm !important;
                  height: 2.5mm !important;
                  color: black !important;
                }
                .print-card h4 {
                  font-size: 5pt !important;
                  font-weight: 800 !important;
                  line-height: 1 !important;
                  margin: 0 !important;
                  color: black !important;
                }
                .print-card .print-duration-badge {
                  font-size: 4.5pt !important;
                  padding: 0 0.6mm !important;
                  height: auto !important;
                  line-height: 1.1 !important;
                  background: #f3f4f6 !important;
                  color: black !important;
                  border: none !important;
                  border-radius: 0.3mm !important;
                }
                .print-card .print-code-container {
                  margin: 0.3mm 0 !important;
                  padding: 0.5mm !important;
                  background: #f9fafb !important;
                  border: 0.15mm solid #f3f4f6 !important;
                  border-radius: 0.4mm !important;
                  text-align: center !important;
                }
                .print-card .print-code-text {
                  font-size: 7.5pt !important;
                  font-weight: 800 !important;
                  letter-spacing: 0.3px !important;
                  line-height: 1 !important;
                  margin: 0 !important;
                  color: black !important;
                }
                .print-card .print-details {
                  font-size: 4.8pt !important;
                  margin-top: 0.3mm !important;
                  padding-top: 0.3mm !important;
                  border-top: 0.15mm solid #e5e7eb !important;
                  line-height: 1.1 !important;
                  color: #374151 !important;
                }
                .print-card .print-details .flex {
                  display: flex !important;
                  justify-content: space-between !important;
                }
                .print-card .print-details span {
                  line-height: 1 !important;
                }
              }
            `}} />

                        <div className="print-container">
                            {/* Hotspot Voucher Card Grid */}
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 print-card-grid">
                                {getVouchersToPrint().map((voucher) => (
                                    <div
                                        key={voucher.id}
                                        className="print-card relative border border-border/80 rounded-none p-2.5 flex flex-col justify-between overflow-hidden shadow-none group hover:border-primary/50 transition-colors h-[125px] w-full break-inside-avoid page-break-inside-avoid"
                                    >
                                        {/* Background Wifi Watermark */}
                                        <Wifi className="print-wifi-watermark absolute right-[-10px] bottom-[-10px] w-16 h-16 text-muted/5 dark:text-muted/5 pointer-events-none group-hover:scale-110 transition-transform" />

                                        {/* Logo & Header */}
                                        <div className="print-header flex justify-between items-center border-b border-border/30 pb-1 mb-1">
                                            <div className="print-logo-container flex items-center gap-1">
                                                <div className="print-logo-icon p-0.5 rounded bg-primary/10 text-primary shrink-0">
                                                    <Wifi className="w-3 h-3" />
                                                </div>
                                                {showWifiName && (
                                                    <div>
                                                        <h4 className="text-[10px] font-black uppercase tracking-wider text-foreground leading-none">TRESA WIFI</h4>
                                                    </div>
                                                )}
                                            </div>
                                            <Badge className="print-duration-badge bg-primary/10 text-primary hover:bg-primary/10 border-none text-[8.5px] font-bold py-0 px-1 uppercase rounded-sm">
                                                {voucher.duration}
                                            </Badge>
                                        </div>

                                        {/* Code Section */}
                                        <div className="print-code-container my-1 text-center p-1 rounded">
                                            <h3 className="print-code-text font-mono text-sm font-black tracking-widest text-primary leading-none select-all uppercase">
                                                {voucher.id}
                                            </h3>
                                        </div>

                                        {/* Details: Price, Pack, Info */}
                                        <div className="print-details text-[9px] space-y-0.5 my-0.5 border-t border-border/10 pt-1 text-foreground/80">
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground font-medium">Price:</span>
                                                <span className="font-bold text-foreground text-right">UGX {voucher.pricePaid.toLocaleString()}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <Dialog open={queueVouchersMutation.isPending || !!voucherJobId}>
                <DialogContent
                    className="sm:max-w-lg"
                    onEscapeKeyDown={(event) => event.preventDefault()}
                    onInteractOutside={(event) => event.preventDefault()}
                >
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            {voucherJob?.progress === 100 ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <Loader2 className="w-5 h-5 animate-spin text-primary" />}
                            Adding vouchers to MikroTik
                        </DialogTitle>
                        <DialogDescription>
                            This job is locked while PostgreSQL and RouterOS finish processing. Do not close or reload this page.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <div className="flex justify-between text-xs font-semibold">
                                <span>{voucherJob?.stage || "Queueing"}</span>
                                <span>{voucherJob?.progress || 0}%</span>
                            </div>
                            <Progress value={voucherJob?.progress || 0} />
                            <p className="text-xs text-muted-foreground">{voucherJob?.message || "Saving the voucher job to PostgreSQL..."}</p>
                        </div>
                        <div className="max-h-52 overflow-y-auto rounded border bg-muted/20">
                            {(voucherJob?.events || []).map((event, index) => (
                                <div key={`${event.time}-${index}`} className="grid grid-cols-[78px_1fr] gap-2 border-b px-3 py-2 text-[11px] last:border-b-0">
                                    <span className="font-semibold text-primary">{event.stage}</span>
                                    <span className="text-muted-foreground">{event.message}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

import AppHeader from "@/components/Header/AppHeader";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    useBranchVouchers,
    useCheckExpiredRouterVouchers,
    useDeleteExpiredRouterVouchers,
    useDeleteRouterVoucher,
    useDeleteRouterVoucherBatch,
    useFetchRouterVouchers,
    useRouters,
    useSyncRouterVouchers,
} from "@/hooks/useRouters";
import { cn } from "@/lib/utils";
import { voucherUiStatus } from "@/lib/voucherStatus";
import { useQueryClient } from "@tanstack/react-query";
import {
    CloudUpload,
    Coins,
    Download,
    Hash,
    Loader2,
    Palette,
    Phone,
    Printer,
    RefreshCw,
    Search,
    Sliders,
    Sparkles,
    Ticket,
    Trash2,
    Users,
    X
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BulkBatchesTable, IndividualVouchersTable, RegistryBatch, RegistryVoucher } from "./VoucherRegistryTables";
import { downloadVoucherPdf } from "./templates";
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
    status: 'Online' | 'Offline' | 'Expired' | 'Unactivated' | 'Sync Issue';
    activatedAt?: string;
    expiresAt?: string;
    type: 'Single' | 'Bulk';
    batchId?: string;
}

function registryStatus(status: string): Voucher["status"] {
    if (status === "ONLINE") return "Online";
    if (status === "OFFLINE" || status === "ACTIVE") return "Offline";
    return voucherUiStatus(status) as Exclude<Voucher["status"], "Online" | "Offline">;
}

export default function VouchersIndex() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
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

    const { data: routers = [], isLoading: routersLoading } = useRouters(branchId);
    const { data: branchVouchersResponse, isLoading: vouchersLoading } = useBranchVouchers(branchId, { limit: 1000 });
    const [selectedRouterId, setSelectedRouterId] = useState<string>("");
    const selectedRouter = routers.find((router) => router.id === selectedRouterId);
    
    const deleteVoucherMutation = useDeleteRouterVoucher(branchId);
    const deleteBatchMutation = useDeleteRouterVoucherBatch(branchId);
    const fetchRouterVouchers = useFetchRouterVouchers(selectedRouterId, branchId);
    const syncRouterVouchers = useSyncRouterVouchers(selectedRouterId, branchId);
    const checkExpiredVouchers = useCheckExpiredRouterVouchers(selectedRouterId, branchId);
    const deleteExpiredVouchers = useDeleteExpiredRouterVouchers(selectedRouterId, branchId);

    useEffect(() => {
        if (!selectedRouterId && routers.length > 0) {
            setSelectedRouterId(routers[0].id);
        }
    }, [routers, selectedRouterId]);

    // Format all vouchers to internal format
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
            .map((voucher) => ({
                id: voucher.voucher_code,
                phone: (voucher.phone_number === "BULK" || !voucher.phone_number) ? undefined : voucher.phone_number,
                routerName: voucher.router_name,
                packageName: `${voucher.speed_type} ${voucher.profile}`,
                duration: voucher.profile,
                pricePaid: voucher.amount,
                purchaseTime: voucher.created_at.replace('T', ' ').substring(0, 19),
                status: registryStatus(voucher.status),
                activatedAt: voucher.activated_at?.replace('T', ' ').substring(0, 19),
                expiresAt: voucher.expires_at?.replace('T', ' ').substring(0, 19),
                type: voucher.payment_reference?.startsWith("BAT-") ? "Bulk" : "Single",
                batchId: voucher.payment_reference?.startsWith("BAT-") ? voucher.payment_reference : undefined,
            }));
    }, [branchVouchersResponse]);

    // Active Tab (Defaulting to Batches now)
    const [activeTab, setActiveTab] = useState<string>("batches");

    // Registry Filters State
    const [searchQuery, setSearchQuery] = useState<string>("");
    const [filterPackage, setFilterPackage] = useState<string>("all");
    const [filterStatus, setFilterStatus] = useState<string>("all");

    // Selection for print/actions
    const [selectedVouchers, setSelectedVouchers] = useState<string[]>([]);

    // Phone Validation placeholder
    const copyCode = (code: string) => {
        navigator.clipboard.writeText(code);
        toast.success(`Copied code ${code} to clipboard`);
    };

    const findRouterId = (routerName: string) =>
        routers.find((router) => router.name.trim().toUpperCase() === routerName.trim().toUpperCase())?.id;

    const findRouterByName = (routerName: string) =>
        routers.find((router) => router.name.trim().toUpperCase() === routerName.trim().toUpperCase());

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
            toast.success(`Deleted ${result.deleted} records and ${result.router_deleted} MikroTik users from batch ${batch.id}.`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to delete voucher batch.");
        }
    };

    // Packages list for filtering
    const availablePackagesList = useMemo(() => {
        const list = new Set<string>();
        vouchers.forEach(v => list.add(v.packageName));
        return Array.from(list);
    }, [vouchers]);

    // Filtering Logic
    const filteredVouchers = useMemo(() => {
        const statusOrder: Record<Voucher["status"], number> = {
            Online: 0,
            Offline: 1,
            Unactivated: 2,
            "Sync Issue": 3,
            Expired: 4,
        };
        return vouchers.filter(voucher => {
            const matchesSearch =
                voucher.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (voucher.phone && voucher.phone.toLowerCase().includes(searchQuery.toLowerCase())) ||
                (voucher.batchId && voucher.batchId.toLowerCase().includes(searchQuery.toLowerCase()));

            const matchesPackage = filterPackage === "all" || voucher.packageName === filterPackage;
            const matchesStatus = filterStatus === "all" || voucher.status === filterStatus;

            return matchesSearch && matchesPackage && matchesStatus;
        }).sort((a, b) =>
            statusOrder[a.status] - statusOrder[b.status]
            || (b.expiresAt || b.purchaseTime).localeCompare(a.expiresAt || a.purchaseTime)
        );
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
                online: items.filter((item) => item.status === "Online").length,
                offline: items.filter((item) => item.status === "Offline").length,
                unactivated: items.filter((item) => item.status === "Unactivated").length,
                expired: items.filter((item) => item.status === "Expired").length,
                syncIssue: items.filter((item) => item.status === "Sync Issue").length,
            }))
            .filter((batch) => {
                const matchesSearch = !query
                    || batch.id.toLowerCase().includes(query)
                    || batch.routerName.toLowerCase().includes(query)
                    || batch.packageName.toLowerCase().includes(query);
                const matchesPackage = filterPackage === "all" || batch.packageName === filterPackage;
                const matchesStatus = filterStatus === "all"
                    || (filterStatus === "Online" && batch.online > 0)
                    || (filterStatus === "Offline" && batch.offline > 0)
                    || (filterStatus === "Unactivated" && batch.unactivated > 0)
                    || (filterStatus === "Expired" && batch.expired > 0)
                    || (filterStatus === "Sync Issue" && batch.syncIssue > 0);
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

    // Redirect to advanced print customizer page
    const handleRedirectToPrint = () => {
        const toPrint = selectedVouchers.length > 0
            ? selectedVouchers
            : filteredVouchers.map((v) => v.id);

        if (toPrint.length === 0) {
            toast.error("No vouchers to print. Select some vouchers from the table first.");
            return;
        }
        navigate(`/vouchers/create?printCodes=${toPrint.join(",")}`);
    };

    const previewBatch = (batchRecord: RegistryBatch) => {
        navigate(`/vouchers/create?printBatchId=${batchRecord.id}&routerName=${encodeURIComponent(batchRecord.routerName)}`);
    };

    const downloadBatchPdfDirect = (batchRecord: RegistryBatch) => {
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
                wifiName: findRouterByName(batchRecord.routerName)?.name,
            })),
            `${batchRecord.id}-vouchers.pdf`
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

    const handleCheckExpiredVouchers = async () => {
        if (!selectedRouterId) return;
        try {
            const result = await checkExpiredVouchers.mutateAsync();
            if (result.expired > 0) {
                toast.warning(
                    `${result.expired} of ${result.checked} activated vouchers on ${result.router_name} are expired.`,
                );
            } else {
                toast.success(`No expired activated vouchers found on ${result.router_name}.`);
            }
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to check expired vouchers.");
        }
    };

    const handleDeleteExpiredVouchers = async () => {
        if (!selectedRouterId || !selectedRouter) return;
        const confirmed = window.confirm(
            `Delete all expired, previously activated vouchers from ${selectedRouter.name}, including MikroTik sessions and database records? This cannot be undone.`,
        );
        if (!confirmed) return;

        try {
            const result = await deleteExpiredVouchers.mutateAsync();
            if (result.deleted === 0) {
                toast.success(`No expired activated vouchers found on ${selectedRouter.name}.`);
                return;
            }
            toast.success(
                `Deleted ${result.deleted} expired vouchers (${result.router_deleted} removed from MikroTik).`,
            );
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to delete expired vouchers.");
        }
    };

    const getStatusBadge = (status: Voucher['status']) => {
        switch (status) {
            case "Online":
                return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
            case "Offline":
                return "bg-blue-500/10 text-blue-600 border-blue-500/20";
            case "Expired":
                return "bg-slate-500/10 text-slate-500 border-slate-500/20";
            case "Unactivated":
                return "bg-amber-500/10 text-amber-500 border-amber-500/20";
            case "Sync Issue":
                return "bg-orange-500/10 text-orange-500 border-orange-500/20";
        }
    };

    return (
        <div className={cn(
            "min-h-screen bg-background transition-all duration-300",
            sidebarCollapsed ? "md:pl-[72px]" : "md:pl-[280px]"
        )}>
            <SEO title="Voucher Hub" />
            <AppHeader onCreateForm={() => { }} />

            <main className="max-w-screen mx-auto px-4 sm:px-6 py-6">
                {/* Title Area */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                    <div>
                        <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
                            <Ticket className="w-5 h-5 text-primary" />
                            Vouchers Registry
                        </h1>
                        <p className="text-xs text-muted-foreground mt-1">
                            Track and sync hotspot access vouchers in bulk or single format.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleCheckExpiredVouchers}
                            disabled={!selectedRouterId || checkExpiredVouchers.isPending || deleteExpiredVouchers.isPending}
                            className="gap-2 text-xs font-semibold h-9 flex-1 sm:flex-initial"
                            title="Check first-activated vouchers whose package time has ended"
                        >
                            {checkExpiredVouchers.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                            Check Expired
                        </Button>
                        <Button
                            variant="destructive"
                            size="sm"
                            onClick={handleDeleteExpiredVouchers}
                            disabled={!selectedRouterId || deleteExpiredVouchers.isPending || checkExpiredVouchers.isPending}
                            className="gap-2 text-xs font-semibold h-9 flex-1 sm:flex-initial"
                            title="Delete expired activated vouchers from MikroTik and the database"
                        >
                            {deleteExpiredVouchers.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                            Delete Expired
                        </Button>
                        <Button
                            variant="destructive"
                            size="sm"
                            onClick={handleVerifyAllVouchers}
                            disabled={!selectedRouterId || fetchRouterVouchers.isPending}
                            className="gap-2 text-xs font-semibold h-9 flex-1 sm:flex-initial"
                            title="Verify all database vouchers against the selected MikroTik router"
                        >
                            {fetchRouterVouchers.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                            Verify All
                        </Button>
                        <Button
                            variant="destructive"
                            size="sm"
                            onClick={handleSyncToRouter}
                            disabled={!selectedRouterId || syncRouterVouchers.isPending}
                            className="gap-2 text-xs font-semibold h-9 flex-1 sm:flex-initial"
                            title="Push database vouchers to the selected router"
                        >
                            {syncRouterVouchers.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudUpload className="w-4 h-4" />}
                            Sync Router
                        </Button>
                        
                        <div className="w-full sm:w-[150px]">
                            <Select value={selectedRouterId} onValueChange={setSelectedRouterId} disabled={routersLoading}>
                                <SelectTrigger className="h-9 text-xs">
                                    <SelectValue placeholder={routersLoading ? "Loading..." : "Select router"} />
                                </SelectTrigger>
                                <SelectContent>
                                    {routers.map((router) => (
                                        <SelectItem key={router.id} value={router.id}>{router.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* NAVIGATE TO CREATOR BUTTON */}
                        <Button
                            size="sm"
                            onClick={() => navigate("/vouchers/create")}
                            className="gap-2 text-xs font-bold h-9 bg-primary text-primary-foreground flex-1 sm:flex-initial"
                        >
                            <Sparkles className="w-4 h-4" />
                            Create Vouchers
                        </Button>

                        <Button
                            size="sm"
                            variant="outline"
                            className="gap-2 text-xs font-semibold h-9 flex-1 sm:flex-initial"
                            onClick={handleRedirectToPrint}
                        >
                            <Printer className="w-4 h-4" />
                            Print Customizer ({selectedVouchers.length > 0 ? selectedVouchers.length : filteredVouchers.length})
                        </Button>
                    </div>
                </div>

                {/* Navigation Tabs */}
                <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                    <div className="overflow-x-auto -mx-4 px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
                        <TabsList className="bg-white p-1 border border-primary rounded w-max">
                            <TabsTrigger
                                value="batches"
                                className="gap-2 text-sm font-medium px-4 py-2 rounded transition-all data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                            >
                                <Users className="w-3.5 h-3.5" />
                                Bulk Batches ({vouchersLoading ? "..." : `${voucherBatches.length}`})
                            </TabsTrigger>

                            <TabsTrigger
                                value="singles"
                                className="gap-2 text-xs font-medium px-4 py-2 rounded transition-all data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                            >
                                <Ticket className="w-3.5 h-3.5" />
                                Individual Vouchers ({vouchersLoading ? "..." : `${filteredSingleVouchers.length}`})
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    {/* TAB 1: BULK BATCHES */}
                    <TabsContent value="batches" className="space-y-4 outline-none">
                        {/* Filter controls */}
                        <div className="p-1 rounded flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="flex-1 flex flex-col sm:flex-row sm:items-center gap-3">
                                {/* Search Bar */}
                                <div className="relative flex-1">
                                    <Input
                                        placeholder="Search by Batch ID or Router..."
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
                                            {availablePackagesList.map(name => (
                                                <SelectItem key={name} value={name}>{name}</SelectItem>
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
                                            <SelectItem value="Online">Online</SelectItem>
                                            <SelectItem value="Offline">Offline</SelectItem>
                                            <SelectItem value="Unactivated">Unactivated</SelectItem>
                                            <SelectItem value="Expired">Expired</SelectItem>
                                            <SelectItem value="Sync Issue">Sync Issue</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </div>

                        <BulkBatchesTable
                            batches={voucherBatches}
                            deletingBatch={deleteBatchMutation.isPending}
                            onPreviewBatch={previewBatch}
                            onDownloadBatch={downloadBatchPdfDirect}
                            onDeleteBatch={handleDeleteBatch}
                        />
                    </TabsContent>

                    {/* TAB 2: INDIVIDUAL VOUCHERS */}
                    <TabsContent value="singles" className="space-y-4 outline-none">
                        {/* Filter controls */}
                        <div className="p-1 rounded flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="flex-1 flex flex-col sm:flex-row sm:items-center gap-3">
                                {/* Search Bar */}
                                <div className="relative flex-1">
                                    <Input
                                        placeholder="Search by Code, Phone or Router..."
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
                                            {availablePackagesList.map(name => (
                                                <SelectItem key={name} value={name}>{name}</SelectItem>
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
                                            <SelectItem value="Online">Online</SelectItem>
                                            <SelectItem value="Offline">Offline</SelectItem>
                                            <SelectItem value="Unactivated">Unactivated</SelectItem>
                                            <SelectItem value="Expired">Expired</SelectItem>
                                            <SelectItem value="Sync Issue">Sync Issue</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {selectedVouchers.length > 0 && (
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        onClick={deleteSelected}
                                        disabled={deleteVoucherMutation.isPending}
                                        className="h-9 text-xs gap-1"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        Delete Selected ({selectedVouchers.length})
                                    </Button>
                                )}
                            </div>
                        </div>

                        <IndividualVouchersTable
                            singles={filteredSingleVouchers}
                            selected={selectedVouchers}
                            deletingVoucher={deleteVoucherMutation.isPending}
                            onSelectAll={handleSelectAll}
                            onSelect={handleSelectVoucher}
                            onCopy={copyCode}
                            onDeleteVoucher={handleDeleteVoucher}
                            getStatusClass={getStatusBadge}
                        />
                    </TabsContent>
                </Tabs>
            </main>
        </div>
    );
}

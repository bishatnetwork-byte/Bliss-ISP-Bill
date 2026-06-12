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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    useBranchVouchers,
    useDeleteRouterVoucher,
    useDeleteRouterVoucherBatch,
    useFetchRouterVouchers,
    useQueueRouterVouchers,
    useRouterPackages,
    useRouters,
    useSyncRouterVouchers,
    useVoucherJob,
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
import { BulkBatchesTable, IndividualVouchersTable, RegistryBatch, RegistryVoucher } from "./VoucherRegistryTables";
import {
    DEFAULT_VOUCHER_THEME_ID,
    downloadVoucherPdf,
    getVoucherTheme,
    VOUCHER_PRINT_STYLES,
    VOUCHER_THEMES,
    VoucherCard,
    VoucherProgressDialog,
} from "./templates";

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
    status: 'Active' | 'Expired' | 'Unactivated' | 'Sync Issue';
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
    const availablePackages = routerPackages;

    useEffect(() => {
        if (!selectedRouterId && routers.length > 0) {
            setSelectedRouterId(routers[0].id);
        }
    }, [routers, selectedRouterId]);

    // Only a live RouterOS session is active; provisioned codes remain ready to use.
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
                status: voucherUiStatus(voucher.status),
                type: voucher.payment_reference?.startsWith("BAT-") ? "Bulk" : "Single",
                batchId: voucher.payment_reference?.startsWith("BAT-") ? voucher.payment_reference : undefined,
            }));
    }, [branchVouchersResponse]);

    // Active Tab
    const [activeTab, setActiveTab] = useState<string>("generator");

    // Voucher Generator State
    const [bulkQuantity, setBulkQuantity] = useState<number>(300);
    const [bulkPhone, setBulkPhone] = useState<string>("");
    const [bulkPhoneError, setBulkPhoneError] = useState<string>("");
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
    const [printTheme, setPrintTheme] = useState<string>(DEFAULT_VOUCHER_THEME_ID);
    // Scoped preview: a freshly generated batch/single voucher, or an existing bulk batch
    const [freshVouchers, setFreshVouchers] = useState<{ vouchers: Voucher[]; wifiName?: string } | null>(null);
    const [printBatchRef, setPrintBatchRef] = useState<{ id: string; routerName: string } | null>(null);

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
                setSelectedVouchers([]);
                setPrintBatchRef(null);
                setFreshVouchers({ vouchers: newVouchers, wifiName: voucherJobContext.wifiName });
                setIsPrintPreviewOpen(true);
                toast.success(`Created and verified ${result.count} vouchers on MikroTik.`);
                setActiveTab("batches");
            } else {
                const created = result.vouchers[0];
                if (created) {
                    const newVoucher: Voucher = {
                        id: created.voucher_code,
                        phone: bulkPhone.trim() || undefined,
                        routerName: created.router_name,
                        packageName: voucherJobContext?.packageName || "",
                        duration: voucherJobContext?.duration || "",
                        pricePaid: voucherJobContext?.price || 0,
                        purchaseTime: created.created_at.replace('T', ' ').substring(0, 19),
                        status: voucherUiStatus(created.status),
                        type: "Single",
                    };
                    setPrintBatchRef(null);
                    setFreshVouchers({ vouchers: [newVoucher], wifiName: voucherJobContext?.wifiName });
                    setIsPrintPreviewOpen(true);
                }
                setBulkPhone("");
                toast.success(`Created and verified voucher ${created?.voucher_code || ""}.`);
                setActiveTab("singles");
            }
            if (result.router_sync_error) toast.warning(result.router_sync_error);
        }

        localStorage.removeItem("active-voucher-job");
        localStorage.removeItem("active-voucher-job-context");
        setVoucherJobId("");
        setVoucherJobContext(null);
    }, [branchId, bulkPhone, queryClient, selectedRouterId, voucherJob, voucherJobContext, voucherJobId]);

    const queueVoucherJob = async (payload: Parameters<typeof queueVouchersMutation.mutateAsync>[0], context: VoucherJobContext) => {
        const queued = await queueVouchersMutation.mutateAsync(payload);
        localStorage.setItem("active-voucher-job", queued.job_id);
        localStorage.setItem("active-voucher-job-context", JSON.stringify(context));
        setVoucherJobContext(context);
        setVoucherJobId(queued.job_id);
    };

    useEffect(() => {
        if (availablePackages.length === 0) return;
        if (!availablePackages.some((pkg) => pkg.id === bulkPackageId)) {
            setBulkPackageId(availablePackages[0].id);
        }
    }, [availablePackages, bulkPackageId]);

    useEffect(() => {
        const pkg = availablePackages.find(p => p.id === bulkPackageId);
        if (pkg) setBulkPrice(pkg.price);
    }, [availablePackages, bulkPackageId]);

    // Phone Validation
    const validateBulkPhone = (phone: string) => {
        if (!phone) {
            setBulkPhoneError("Phone number is required");
            return false;
        }
        // simple regex to check positive digit count
        const cleaned = phone.replace(/[^0-9+]/g, "");
        if (cleaned.length < 9) {
            setBulkPhoneError("Phone number is too short");
            return false;
        }
        setBulkPhoneError("");
        return true;
    };

    // Generate Vouchers Action (handles both Single and Bulk depending on quantity)
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

        if (bulkQuantity === 1 && !validateBulkPhone(bulkPhone)) {
            toast.error("Please provide a valid phone number.");
            return;
        }

        const selectedPkg = availablePackages.find(p => p.id === bulkPackageId);
        if (!selectedPkg) {
            toast.error("Create or sync packages for this router first.");
            return;
        }

        if (bulkQuantity === 1) {
            try {
                await queueVoucherJob({
                    package_id: selectedPkg.packageId || Number(selectedPkg.id),
                    quantity: 1,
                    amount: bulkPrice,
                    phone_number: bulkPhone.trim(),
                    prefix: bulkPrefix || "",
                    code_length: bulkLength,
                    code_format: bulkFormat,
                }, {
                    type: "single",
                    packageName: selectedPkg.name,
                    duration: selectedPkg.duration,
                    price: bulkPrice,
                    wifiName: selectedRouter?.name,
                });
            } catch (error) {
                toast.error(error instanceof Error ? error.message : "Failed to queue voucher.");
            }
        } else {
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
                syncIssue: items.filter((item) => item.status === "Sync Issue").length,
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

    // Returns the vouchers currently in scope for the print/PDF preview:
    // freshly generated vouchers > a previewed bulk batch > the table selection > the filtered list.
    const getVouchersToPrint = (): Voucher[] => {
        if (freshVouchers) return freshVouchers.vouchers;
        if (printBatchRef) {
            return vouchers.filter(
                (v) => v.batchId === printBatchRef.id
                    && v.routerName.trim().toUpperCase() === printBatchRef.routerName.trim().toUpperCase(),
            );
        }
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

    // Wi-Fi name to print on the cards currently in scope for the preview/download.
    const previewWifiName = freshVouchers?.wifiName
        ?? (printBatchRef ? findRouterByName(printBatchRef.routerName)?.name : selectedRouter?.name);

    const handleDownloadPreviewPdf = () => {
        const rows = getVouchersToPrint();
        if (rows.length === 0) {
            toast.error("No vouchers to download.");
            return;
        }
        const baseName = freshVouchers?.vouchers[0]?.batchId
            || printBatchRef?.id
            || `vouchers-${new Date().toISOString().slice(0, 10)}`;
        downloadVoucherPdf(
            rows.map((voucher) => ({
                code: voucher.id,
                packageName: voucher.packageName,
                duration: voucher.duration,
                price: voucher.pricePaid,
                status: voucher.status,
                batchId: voucher.batchId,
                wifiName: showWifiName ? previewWifiName : undefined,
            })),
            `${baseName}-vouchers.pdf`,
            printTheme,
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
                wifiName: showWifiName ? findRouterByName(batchRecord.routerName)?.name : undefined,
            })),
            `${batchRecord.id}-vouchers.pdf`,
            printTheme,
        );
        toast.success(`Downloaded batch ${batchRecord.id} as PDF.`);
    };

    // Opens the print/PDF preview scoped to a single bulk batch.
    const previewBatch = (batchRecord: RegistryBatch) => {
        const batch = vouchers.filter(
            (voucher) => voucher.batchId === batchRecord.id
                && voucher.routerName.trim().toUpperCase() === batchRecord.routerName.trim().toUpperCase(),
        );
        if (batch.length === 0) {
            toast.error("This batch has no vouchers to preview.");
            return;
        }
        setFreshVouchers(null);
        setPrintBatchRef({ id: batchRecord.id, routerName: batchRecord.routerName });
        setIsPrintPreviewOpen(true);
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
            case "Sync Issue":
                return "bg-orange-500/10 text-orange-500 border-orange-500/20";
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
                        <p className="mt-1 text-[11px] text-muted-foreground">
                            {selectedRouter ? `${availablePackages.length} saved packages available for ${selectedRouter.name}` : "Select a router to load packages."}
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
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
                        <div className="w-full sm:w-[180px]">
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
                        <Button
                            size="sm"
                            className="gap-2 text-xs font-semibold h-9 flex-1 sm:flex-initial"
                            onClick={() => {
                                const toPrint = selectedVouchers.length > 0
                                    ? vouchers.filter((v) => selectedVouchers.includes(v.id))
                                    : filteredVouchers;
                                if (toPrint.length === 0) {
                                    toast.error("No vouchers to print. Generate some first or select vouchers from the table.");
                                    return;
                                }
                                setFreshVouchers(null);
                                setPrintBatchRef(null);
                                setIsPrintPreviewOpen(true);
                            }}
                        >
                            <Printer className="w-4 h-4" />
                            Print Preview ({selectedVouchers.length > 0 ? selectedVouchers.length : filteredVouchers.length})
                        </Button>
                    </div>
                </div>

                {/* Navigation Tabs */}
                <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                    <div className="overflow-x-auto -mx-4 px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
                        <TabsList className="bg-white p-1 border border-primary rounded w-max">
                            <TabsTrigger
                                value="generator"
                                className="gap-2 text-xs font-medium px-4 py-2 rounded transition-all data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                            >
                                <Sparkles className="w-3.5 h-3.5" />
                                Voucher Generator
                            </TabsTrigger>

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


                    {/* TAB 1: GENERATORS */}
                    <TabsContent value="generator" className="space-y-6 outline-none">
                        <div className="max-w-full mx-auto">
                            {/* Unified Voucher Generator */}
                            <Card className="bg-card border border-border/50 rounded shadow-[0_4px_20px_hsl(var(--primary)/0.02)] flex flex-col justify-between">
                                <CardHeader>
                                    <CardTitle className="text-base font-bold flex items-center gap-2">
                                        <Sliders className="w-4 h-4 text-primary" />
                                        Voucher Generator
                                    </CardTitle>
                                    <CardDescription className="text-xs">
                                        Generate access vouchers in bulk or as a single code.
                                    </CardDescription>
                                </CardHeader>
                                <form onSubmit={handleCreateBulk}>
                                    <CardContent className="space-y-4">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            {/* Quantity */}
                                            <div className="space-y-2">
                                                <Label htmlFor="bulk-qty" className="text-xs font-semibold">
                                                    Quantity (Batch Size)
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

                                        {/* Phone Number Field - Required and Visible only when Quantity is 1 */}
                                        {bulkQuantity === 1 && (
                                            <div className="space-y-2">
                                                <Label htmlFor="bulk-phone" className="text-xs font-semibold">
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
                                                        className={cn("pl-9 h-10 text-sm", bulkPhoneError ? "border-destructive focus-visible:ring-destructive" : "")}
                                                        required
                                                    />
                                                    <Phone className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                                                </div>
                                                {bulkPhoneError ? (
                                                    <p className="text-[11px] text-destructive font-medium">{bulkPhoneError}</p>
                                                ) : (
                                                    <p className="text-[11px] text-muted-foreground font-medium">Used for logging and SMS delivery.</p>
                                                )}
                                            </div>
                                        )}

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                                            {bulkQuantity === 1 ? "Single voucher creation" : `Total Batch Value: UGX ${(bulkPrice * bulkQuantity).toLocaleString()}`}
                                        </div>
                                        <Button type="submit" size="sm" className="h-10 gap-1.5 text-xs font-semibold" disabled={queueVouchersMutation.isPending || !!voucherJobId || packagesLoading}>
                                            {queueVouchersMutation.isPending || voucherJobId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-primary-foreground" />}
                                            {bulkQuantity === 1 ? "Generate Voucher" : `Generate ${bulkQuantity} Vouchers`}
                                        </Button>
                                    </CardFooter>
                                </form>
                            </Card>
                        </div>
                    </TabsContent>

                    {/* TAB 2: BULK BATCHES */}
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
                            onDownloadBatch={downloadBatchPdf}
                            onDeleteBatch={handleDeleteBatch}
                        />
                    </TabsContent>

                    {/* TAB 3: INDIVIDUAL VOUCHERS */}
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
                                            <SelectItem value="Sync Issue">Sync Issue</SelectItem>
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
                                        onClick={() => {
                                            setFreshVouchers(null);
                                            setPrintBatchRef(null);
                                            setIsPrintPreviewOpen(true);
                                        }}
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

            {/* FULL-SCREEN OVERLAY FOR PRINT PREVIEW / PDF GENERATION */}
            {isPrintPreviewOpen && (
                <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm overflow-y-auto flex flex-col print:relative print:inset-auto print:bg-white print:overflow-visible">
                    {/* Controls Bar (Hidden during printing) */}
                    <div className="sticky top-0 z-10 flex flex-col gap-3 border-b border-border/40 bg-card px-6 py-4 shadow-sm print:hidden sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                                <Printer className="w-4 h-4 text-primary" />
                                {freshVouchers
                                    ? "Vouchers Ready - Pick a Template"
                                    : printBatchRef
                                        ? `Batch Preview - ${printBatchRef.id}`
                                        : "Voucher Print & PDF Preview"}
                            </h2>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                {freshVouchers
                                    ? `${freshVouchers.vouchers.length} new voucher${freshVouchers.vouchers.length === 1 ? "" : "s"} created and verified on MikroTik. `
                                    : `Displaying ${getVouchersToPrint().length} vouchers. `}
                                Ready to be printed or downloaded to PDF.
                            </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            {/* Color template picker */}
                            <div className="flex items-center gap-1.5 rounded border border-border/20 bg-muted/40 px-2.5 py-1.5">
                                <Palette className="w-3.5 h-3.5 text-muted-foreground" />
                                {VOUCHER_THEMES.map((theme) => (
                                    <button
                                        key={theme.id}
                                        type="button"
                                        title={theme.name}
                                        onClick={() => setPrintTheme(theme.id)}
                                        className={cn(
                                            "h-5 w-5 rounded-full border-2 transition-transform",
                                            theme.swatch,
                                            printTheme === theme.id ? "scale-110 border-foreground" : "border-transparent hover:scale-105",
                                        )}
                                    />
                                ))}
                            </div>

                            <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors select-none bg-muted/40 px-3 py-1.5 rounded border border-border/20">
                                <input
                                    type="checkbox"
                                    checked={showWifiName}
                                    onChange={(e) => setShowWifiName(e.target.checked)}
                                    className="rounded border-border text-primary focus:ring-primary w-3.5 h-3.5 cursor-pointer"
                                />
                                Show Wi-Fi Name
                            </label>

                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleDownloadPreviewPdf}
                                className="gap-1.5 text-xs font-bold h-9 px-4"
                            >
                                <Download className="w-4 h-4" />
                                Download PDF
                            </Button>
                            <Button
                                size="sm"
                                onClick={handleNativePrint}
                                className="gap-1.5 text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/95 hover:text-primary-foreground h-9 px-4 border-none"
                            >
                                <Printer className="w-4 h-4" />
                                Print
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    setIsPrintPreviewOpen(false);
                                    setFreshVouchers(null);
                                    setPrintBatchRef(null);
                                }}
                                className="h-9 w-9 p-0 rounded-full border border-border/40 hover:bg-muted/50"
                            >
                                <X className="w-4 h-4 text-foreground" />
                            </Button>
                        </div>
                    </div>

                    {/* Printable Container */}
                    <div className="flex-1 max-w-5xl mx-auto w-full p-6 sm:p-8 print:p-0 print:max-w-none">
                        {/* Embedded styles specifically for printing page alignment */}
                        <style dangerouslySetInnerHTML={{ __html: VOUCHER_PRINT_STYLES }} />

                        <div className="print-container">
                            {/* Hotspot Voucher Card Grid */}
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 print-card-grid">
                                {getVouchersToPrint().map((voucher) => (
                                    <VoucherCard
                                        key={voucher.id}
                                        voucher={{
                                            code: voucher.id,
                                            packageName: voucher.packageName,
                                            duration: voucher.duration,
                                            price: voucher.pricePaid,
                                            batchId: voucher.batchId,
                                            wifiName: showWifiName ? previewWifiName : undefined,
                                        }}
                                        theme={getVoucherTheme(printTheme)}
                                        showWifiName={showWifiName}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

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

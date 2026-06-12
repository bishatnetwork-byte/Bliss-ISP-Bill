import AppHeader from "@/components/Header/AppHeader";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
    AlertCircle,
    ArrowLeft,
    Check,
    CheckCircle2,
    Edit3,
    Link,
    Loader2,
    LucideTouchpad,
    PackagePlus,
    Plus,
    RefreshCcwDotIcon,
    Router as RouterIcon,
    Search,
    Trash2,
    Wifi,
    X
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import RouterDetails from "./Router_Details";
import { RouterResponse, RouterUpdate } from "@/api/foreform";
import {
    useRouters,
    useCreateRouter,
    useDeleteRouter,
    useRouterStatus,
    usePingRouter,
    useRebootRouter,
    useUpdateRouter
} from "@/hooks/useRouters";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";

function getErrorMessage(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
}

function randomApiPort() {
    return Math.floor(Math.random() * (60999 - 20000 + 1)) + 20000;
}

function randomToken(length: number) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => chars[byte % chars.length]).join("");
}

export default function RoutersIndex() {
    const navigate = useNavigate();
    const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("sidebar-collapsed") === "true");

    useEffect(() => {
        const handler = (event: Event) => {
            const customEvent = event as CustomEvent<{ collapsed: boolean }>;
            setSidebarCollapsed(customEvent.detail.collapsed);
        };
        window.addEventListener("sidebar-collapse-change", handler);
        return () => window.removeEventListener("sidebar-collapse-change", handler);
    }, []);

    const branchId = localStorage.getItem("selected-workspace") || "biltra";
    const { data: routers = [], isLoading } = useRouters(branchId);

    // Main view states: 'list', 'details', or 'wizard'
    const [view, setView] = useState<'list' | 'details' | 'wizard'>('list');

    // State Variables
    const [selectedRouterId, setSelectedRouterId] = useState<string>("");
    const [searchQuery, setSearchQuery] = useState<string>("");

    // Stepper wizard steps: 1 to 4
    const [currentStep, setCurrentStep] = useState<number>(1);

    // Step Form Fields
    const [newRouterName, setNewRouterName] = useState<string>("");
    const [newRouterModel, setNewRouterModel] = useState<string>("MikroTik hAP ac2");
    const [newRouterIp, setNewRouterIp] = useState<string>("192.168.88.1");
    const [newRouterPort, setNewRouterPort] = useState<number>(() => randomApiPort());
    const [newRouterUser, setNewRouterUser] = useState<string>(() => `tresa_${randomToken(8).toLowerCase()}`);
    const [newRouterPass, setNewRouterPass] = useState<string>(() => randomToken(28));

    // Stepper Connection Test Simulation States
    const [testPingStatus, setTestPingStatus] = useState<'idle' | 'pending' | 'success' | 'failed'>('idle');
    const [testAuthStatus, setTestAuthStatus] = useState<'idle' | 'pending' | 'success' | 'failed'>('idle');
    const [testMetaStatus, setTestMetaStatus] = useState<'idle' | 'pending' | 'success' | 'failed'>('idle');
    const [testProgress, setTestProgress] = useState<number>(0);

    // Edit Form States
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [editingRouter, setEditingRouter] = useState<RouterResponse | null>(null);
    const [editName, setEditName] = useState("");
    const [editHost, setEditHost] = useState("");
    const [editPort, setEditPort] = useState(8728);
    const [editUsername, setEditUsername] = useState("");
    const [editPassword, setEditPassword] = useState("");
    const [editPlaintextLogin, setEditPlaintextLogin] = useState(true);
    const [editDescription, setEditDescription] = useState("");

    const updateRouterMutation = useUpdateRouter(branchId);

    const handleOpenEdit = (router: RouterResponse, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        setEditingRouter(router);
        setEditName(router.name);
        setEditHost(router.host);
        setEditPort(router.port);
        setEditUsername(router.username);
        setEditPassword("");
        setEditPlaintextLogin(router.plaintext_login);
        setEditDescription(router.description || "");
        setIsEditOpen(true);
    };

    const handleSaveEdit = async () => {
        if (!editingRouter) return;
        if (!editName.trim()) {
            toast.error("Please provide a name.");
            return;
        }
        if (!editHost.trim()) {
            toast.error("Please provide a host IP / address.");
            return;
        }

        try {
            const payload: RouterUpdate = {
                name: editName,
                host: editHost,
                port: editPort,
                username: editUsername,
                plaintext_login: editPlaintextLogin,
                description: editDescription,
            };
            if (editPassword) {
                payload.password = editPassword;
            }

            await updateRouterMutation.mutateAsync({
                routerId: editingRouter.id,
                payload
            });
            toast.success("Router credentials updated successfully!");
            setIsEditOpen(false);
        } catch (err: unknown) {
            toast.error(getErrorMessage(err, "Failed to update router credentials"));
        }
    };

    // Auto-select first router if none selected
    useEffect(() => {
        if (!selectedRouterId && routers.length > 0) {
            setSelectedRouterId(routers[0].id);
        }
    }, [routers, selectedRouterId]);

    // Filter Routers List
    const filteredRouters = routers.filter(router =>
        router.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        router.host.includes(searchQuery) ||
        (router.description || "").toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Selected Router Object
    const selectedRouter = routers.find(r => r.id === selectedRouterId) || routers[0];

    // Stepper Navigation Actions
    const handleNextStep = () => {
        if (currentStep === 1) {
            if (!newRouterName.trim()) {
                toast.error("Please provide a name for this router.");
                return;
            }
            if (!newRouterIp.trim()) {
                toast.error("Please provide an IP address.");
                return;
            }
            setCurrentStep(2);
        } else if (currentStep === 2) {
            if (!newRouterUser.trim()) {
                toast.error("Please provide a username.");
                return;
            }
            setCurrentStep(3);
        } else if (currentStep === 3) {
            setCurrentStep(4);
            triggerConnectionTest();
        }
    };

    const handlePrevStep = () => {
        if (currentStep > 1) {
            setCurrentStep(currentStep - 1);
        }
    };

    // Connection Test Simulation Timer
    const triggerConnectionTest = () => {
        setTestPingStatus('pending');
        setTestAuthStatus('idle');
        setTestMetaStatus('idle');
        setTestProgress(10);

        setTimeout(() => {
            setTestPingStatus('success');
            setTestProgress(40);
            setTestAuthStatus('pending');

            setTimeout(() => {
                setTestAuthStatus('success');
                setTestProgress(75);
                setTestMetaStatus('pending');

                setTimeout(() => {
                    setTestMetaStatus('success');
                    setTestProgress(100);
                }, 1500);
            }, 1500);
        }, 1500);
    };

    const createRouterMutation = useCreateRouter(branchId);

    // Complete Stepper Wizard
    const handleFinishConnection = async () => {
        try {
            const newDevice = await createRouterMutation.mutateAsync({
                name: newRouterName,
                host: newRouterIp,
                port: newRouterPort,
                username: newRouterUser,
                password: newRouterPass,
                plaintext_login: false,
                location: "",
                description: newRouterModel,
                is_active: true
            });
            setSelectedRouterId(newDevice.id);
            toast.success(`Successfully connected router: ${newRouterName}`);

            // Reset Stepper and View
            setView('list');
            setCurrentStep(1);
            setNewRouterName("");
            setNewRouterIp("192.168.88.1");
            setNewRouterPort(randomApiPort());
            setNewRouterUser(`tresa_${randomToken(8).toLowerCase()}`);
            setNewRouterPass(randomToken(28));
            setTestPingStatus('idle');
            setTestAuthStatus('idle');
            setTestMetaStatus('idle');
            setTestProgress(0);
        } catch (err: unknown) {
            toast.error(getErrorMessage(err, "Failed to save router config"));
        }
    };

    const pingRouter = usePingRouter();
    const rebootRouter = useRebootRouter();

    const handlePingRouter = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        toast.promise(
            pingRouter.mutateAsync({ routerId: id, payload: { target: "8.8.8.8" } }),
            {
                loading: 'Sending ICMP echo requests...',
                success: (data) => data.reachable
                    ? `Ping reply: ${data.latency_ms}ms (TTL=64)`
                    : `Host unreachable. ${data.error || ""}`,
                error: 'Request timed out.'
            }
        );
    };

    const handleRebootRouter = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!window.confirm("Reboot this MikroTik now? Connected users may briefly lose service.")) return;
        toast.promise(rebootRouter.mutateAsync(id), {
            loading: "Sending reboot command to MikroTik...",
            success: (data) => data.message,
            error: (error) => getErrorMessage(error, "Router reboot failed"),
        });
    };

    const deleteRouterMutation = useDeleteRouter(branchId);

    const handleDeleteRouter = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (routers.length <= 1) {
            toast.error("Cannot delete the last remaining router.");
            return;
        }
        try {
            await deleteRouterMutation.mutateAsync(id);
            if (selectedRouterId === id) {
                const remaining = routers.filter(r => r.id !== id);
                setSelectedRouterId(remaining[0]?.id || "");
            }
            toast.success("Router configuration removed.");
        } catch (err: unknown) {
            toast.error(getErrorMessage(err, "Failed to delete router"));
        }
    };

    const handleSelectRouter = (id: string) => {
        setSelectedRouterId(id);
        setView('details');
    };

    return (
        <div className={cn(
            "min-h-screen bg-background transition-all duration-300 flex flex-col",
            sidebarCollapsed ? "md:pl-[72px]" : "md:pl-[280px]"
        )}>
            <SEO title="MikroTik Router Manager" />
            <AppHeader onCreateForm={() => { }} />

            <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 flex-1 flex flex-col min-h-0">

                {/* ----------------- ROUTER LIST VIEW ----------------- */}
                {view === 'list' && (
                    <div className="space-y-5 flex-1 flex flex-col min-h-0">

                        {/* Header Title & Stats & Create Trigger */}
                        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                            <div>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    Configure, monitor, and link RouterOS Hotspot devices directly to your dashboard.
                                </p>
                            </div>

                            {/* Metrics & Action buttons */}
                            <div className="flex flex-wrap items-center gap-3">
                                {/* <Button
                                    onClick={() => navigate('/router/packages')}
                                    variant="outline"
                                    size="sm"
                                    className="gap-1.5 text-xs font-semibold h-10 px-3"
                                >
                                    <PackagePlus className="w-4 h-4" />
                                    Create & Manage Packages
                                </Button> */}
                                <Button
                                    onClick={() => navigate('/router/setup')}
                                    size="sm"
                                    className="gap-1.5 text-xs font-semibold h-10 px-3 bg-primary text-primary-foreground hover:bg-primary/95 shadow-sm"
                                >
                                    <Wifi className="w-4 h-4" />
                                    Connect & Provision Router
                                </Button>
                            </div>
                        </div>

                        {/* Search Toolbar */}
                        <div className="relative max-w-md">
                            <Input
                                placeholder="Search routers..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9 h-9 text-xs border-border/60 bg-card"
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

                        {/* Full Width Router Cards Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 min-h-0 overflow-y-auto">
                            {isLoading ? (
                                <div className="col-span-full flex items-center justify-center p-12">
                                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                                </div>
                            ) : filteredRouters.length === 0 ? (
                                <Card className="p-10 border border-dashed rounded text-center text-muted-foreground bg-card col-span-full">
                                    <AlertCircle className="w-8 h-8 mx-auto mb-2 text-muted-foreground/60" />
                                    <p className="text-sm font-semibold">No routers found.</p>
                                </Card>
                            ) : (
                                filteredRouters.map((router) => (
                                    <RouterCard
                                        key={router.id}
                                        router={router}
                                        onSelect={handleSelectRouter}
                                        onDelete={handleDeleteRouter}
                                        onEdit={handleOpenEdit}
                                    />
                                ))
                            )}
                        </div>
                    </div>
                )}

                {/* ----------------- ROUTER DETAILS VIEW ----------------- */}
                {view === 'details' && selectedRouter && (
                    <div className="space-y-4 flex-1 flex flex-col min-h-0">
                        {/* Header Details Control */}
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3  pb-6">
                            <div className="flex items-center gap-3">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setView('list')}
                                    className="h-8 px-2 text-xs font-semibold gap-1 rounded-full"
                                >
                                    <ArrowLeft className="w-3.5 h-3.5" />

                                </Button>
                                <div>
                                    <h1 className="text-base font-bold text-foreground flex items-center gap-2">
                                        {selectedRouter.name}
                                    </h1>
                                </div>
                            </div>

                            {/* Details Action Options */}
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={(e) => handleOpenEdit(selectedRouter, e)}
                                    className="h-9 text-xs font-bold border-primary/50 text-primary hover:bg-primary/5"
                                >
                                    <Edit3 className="w-3.5 h-3.5 mr-1.5" />
                                    Edit Credentials
                                </Button>
                                <Button
                                    size="sm"
                                    onClick={(e) => handlePingRouter(selectedRouter.id, e)}
                                    disabled={pingRouter.isPending}
                                    className="h-9 text-xs font-bold"
                                >
                                    <LucideTouchpad className="w-3.5 h-3.5 mr-1" />
                                    Ping Test
                                </Button>
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={(e) => handleRebootRouter(selectedRouter.id, e)}
                                    disabled={rebootRouter.isPending}
                                    className="h-9 text-xs font-bold"
                                >
                                    <RefreshCcwDotIcon className="w-3.5 h-3.5 mr-1" />
                                    Reboot
                                </Button>
                            </div>
                        </div>

                        {/* Active Telemetry Component */}
                        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
                            <RouterDetails router={selectedRouter} />
                        </div>
                    </div>
                )}

                {/* ----------------- INLINE WIZARD SCREEN ----------------- */}
                {view === 'wizard' && (
                    <div className="space-y-4 max-w-4xl mx-auto w-full flex-1 flex flex-col  justify-center">

                        {/* Header toolbar */}
                        <div className="flex items-center justify-between  pb-3">
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        setView('list');
                                        setCurrentStep(1);
                                    }}
                                    className="h-8 px-2 text-xs font-semibold gap-1 rounded-full"
                                >
                                    <ArrowLeft className="w-3.5 h-3.5" />
                                </Button>
                                <div>
                                    <h1 className="text-base font-bold text-foreground">Connect New Router</h1>

                                </div>
                            </div>
                        </div>

                        {/* Inline Setup Panel */}
                        <Card className="bg-card border border-border/60 rounded shadow-none overflow-hidden grid grid-cols-1 md:grid-cols-4 max-h-[420px]">

                            {/* Steps Left Panel Navigation */}
                            <div className="md:col-span-1 bg-muted/20 border-r border-border/50 p-4 space-y-3">
                                {[
                                    { step: 1, title: "Router Info", desc: "Names & Addresses" },
                                    { step: 2, title: "Credentials", desc: "Access Settings" },
                                    { step: 3, title: "Configuration", desc: "Enable Router API" },
                                    { step: 4, title: "Verify Device", desc: "Simulate Login" }
                                ].map((item) => (
                                    <div
                                        key={item.step}
                                        className={cn(
                                            "flex items-start gap-2 p-1.5 rounded transition-colors",
                                            currentStep === item.step ? "bg-primary border border-primary/10" : ""
                                        )}
                                    >
                                        <div className={cn(
                                            "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border shrink-0 mt-0.5 transition-all",
                                            item.step < currentStep ? "bg-primary border-primary text-white" :
                                                item.step === currentStep ? "border-primary text-white font-black" :
                                                    "border-border/60 text-muted-foreground"
                                        )}>
                                            {item.step < currentStep ? <Check className="w-3 h-3" /> : item.step}
                                        </div>
                                        <div className="min-w-0">
                                            <p className={cn(
                                                "text-[12px] font-bold leading-none",
                                                currentStep === item.step ? "text-white" : "text-foreground"
                                            )}>{item.title}</p>
                                            <p className="text-[9px]  mt-0.5 truncate">{item.desc}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Form Input Work Area */}
                            <div className="md:col-span-3 p-5 flex flex-col justify-between min-h-[300px]">

                                <div className="space-y-3">

                                    {/* STEP 1: ROUTER CONFIG */}
                                    {currentStep === 1 && (
                                        <div className="space-y-3">
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="space-y-1">
                                                    <Label htmlFor="router-name" className="text-[10.5px] font-semibold">Router Name</Label>
                                                    <Input
                                                        id="router-name"
                                                        placeholder="e.g. Kampala Hotspot"
                                                        value={newRouterName}
                                                        onChange={(e) => setNewRouterName(e.target.value)}
                                                        className="h-8.5 text-xs"
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <Label htmlFor="router-model" className="text-[10.5px] font-semibold">MikroTik Model</Label>
                                                    <Select value={newRouterModel} onValueChange={setNewRouterModel}>
                                                        <SelectTrigger className="h-8.5 text-xs">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="MikroTik hAP ac2">hAP ac2 (Dual-Band)</SelectItem>
                                                            <SelectItem value="MikroTik hEX S">hEX S (5-Port GigE)</SelectItem>
                                                            <SelectItem value="MikroTik RB3011">RB3011UiAS-RM</SelectItem>
                                                            <SelectItem value="MikroTik RB4011iGS+">RB4011iGS+RM</SelectItem>
                                                            <SelectItem value="MikroTik CCR2004">CCR2004 (Core Cloud)</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-3 gap-3">
                                                <div className="col-span-2 space-y-1">
                                                    <Label htmlFor="router-ip" className="text-[10.5px] font-semibold">IP Address / DNS Host</Label>
                                                    <Input
                                                        id="router-ip"
                                                        placeholder="192.168.88.1"
                                                        value={newRouterIp}
                                                        onChange={(e) => setNewRouterIp(e.target.value)}
                                                        className="h-8.5 text-xs font-mono"
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <Label htmlFor="router-port" className="text-[10.5px] font-semibold">API Port</Label>
                                                    <Input
                                                        id="router-port"
                                                        type="number"
                                                        value={newRouterPort}
                                                        onChange={(e) => setNewRouterPort(Number(e.target.value))}
                                                        className="h-8.5 text-xs font-mono"
                                                    />
                                                </div>
                                            </div>
                                            <p className="text-[9px] text-muted-foreground font-medium">
                                                Ensure API traffic is allowed through firewall rules on this port.
                                            </p>
                                        </div>
                                    )}

                                    {/* STEP 2: CREDENTIALS */}
                                    {currentStep === 2 && (
                                        <div className="space-y-3">
                                            <div className="space-y-1">
                                                <Label htmlFor="router-user" className="text-[10.5px] font-semibold">API Username</Label>
                                                <Input
                                                    id="router-user"
                                                    placeholder="Dedicated API user"
                                                    value={newRouterUser}
                                                    onChange={(e) => setNewRouterUser(e.target.value)}
                                                    className="h-8.5 text-xs font-mono"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label htmlFor="router-pass" className="text-[10.5px] font-semibold">API Password</Label>
                                                <Input
                                                    id="router-pass"
                                                    type="password"
                                                    placeholder="••••••••••••"
                                                    value={newRouterPass}
                                                    onChange={(e) => setNewRouterPass(e.target.value)}
                                                    className="h-8.5 text-xs font-mono"
                                                />
                                            </div>
                                            <div className="p-2 bg-muted/40 rounded border border-border/50 text-[9px] text-muted-foreground leading-normal">
                                                Create a separate API user group in RouterOS with <code>write</code> privileges instead of using default full admin accounts.
                                            </div>
                                        </div>
                                    )}

                                    {/* STEP 3: ENABLE API CONFIG */}
                                    {currentStep === 3 && (
                                        <div className="space-y-3">
                                            <div className="text-[10.5px] font-bold text-foreground">
                                                Please make sure the API service is enabled on your MikroTik router before proceeding.
                                            </div>
                                            <div className="p-2.5 bg-muted/40 rounded border border-border/50 space-y-1">
                                                <div className="text-[8.5px] font-bold uppercase tracking-wider text-muted-foreground">Quick Setup Check</div>
                                                <p className="text-[9.5px] text-foreground/80 leading-relaxed">
                                                    Open Winbox and navigate to <b>IP &rarr; Services</b>. Verify that the <b>api</b> service is active and listening on port <b>{newRouterPort}</b>.
                                                </p>
                                            </div>
                                            <p className="text-[9px] text-muted-foreground font-medium">
                                                Click Next to simulate connecting to the router.
                                            </p>
                                        </div>
                                    )}

                                    {/* STEP 4: VERIFICATION SIMULATOR */}
                                    {currentStep === 4 && (
                                        <div className="space-y-4">
                                            <div className="space-y-1">
                                                <div className="flex justify-between text-[10px] font-bold">
                                                    <span className="text-muted-foreground">Connecting & Configuring Router...</span>
                                                    <span className="text-primary font-mono">{testProgress}%</span>
                                                </div>
                                                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-primary transition-all duration-300"
                                                        style={{ width: `${testProgress}%` }}
                                                    />
                                                </div>
                                            </div>

                                            {/* Test items status */}
                                            <div className="space-y-2 pt-1">
                                                <div className="flex items-center justify-between text-xs">
                                                    <span className="flex items-center gap-2">
                                                        {testPingStatus === 'pending' && <Loader2 className="w-3 h-3 text-primary animate-spin" />}
                                                        {testPingStatus === 'success' && <CheckCircle2 className="w-3 h-3 text-emerald-500" />}
                                                        {testPingStatus === 'idle' && <div className="w-3 h-3 rounded-full border border-border" />}
                                                        Pinging router IP at <code>{newRouterIp}</code>
                                                    </span>
                                                    <span className="font-mono text-[9px] text-muted-foreground">
                                                        {testPingStatus === 'success' && "Success (12ms)"}
                                                        {testPingStatus === 'pending' && "Running..."}
                                                    </span>
                                                </div>

                                                <div className="flex items-center justify-between text-xs">
                                                    <span className="flex items-center gap-2">
                                                        {testAuthStatus === 'pending' && <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />}
                                                        {testAuthStatus === 'success' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                                                        {testAuthStatus === 'idle' && <div className="w-3.5 h-3.5 rounded-full border border-border" />}
                                                        Authenticating API credentials
                                                    </span>
                                                    <span className="font-mono text-[9px] text-muted-foreground">
                                                        {testAuthStatus === 'success' && "Authorized"}
                                                        {testAuthStatus === 'pending' && "Running..."}
                                                    </span>
                                                </div>

                                                <div className="flex items-center justify-between text-xs">
                                                    <span className="flex items-center gap-2">
                                                        {testMetaStatus === 'pending' && <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />}
                                                        {testMetaStatus === 'success' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                                                        {testMetaStatus === 'idle' && <div className="w-3.5 h-3.5 rounded-full border border-border" />}
                                                        Reading RouterOS metadata
                                                    </span>
                                                    <span className="font-mono text-[9px] text-muted-foreground">
                                                        {testMetaStatus === 'success' && `${newRouterModel} Online`}
                                                        {testMetaStatus === 'pending' && "Running..."}
                                                    </span>
                                                </div>
                                            </div>

                                        </div>
                                    )}

                                </div>

                                {/* Footer Controls */}
                                <div className="pt-4 border-t border-border/50 flex items-center justify-between mt-4">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={handlePrevStep}
                                        disabled={currentStep === 1 || currentStep === 4}
                                        className="gap-1 text-xs font-bold"
                                    >
                                        <ArrowLeft className="w-3 h-3" />
                                        Back
                                    </Button>

                                    {currentStep < 4 ? (
                                        <Button
                                            size="sm"
                                            onClick={handleNextStep}
                                            className="gap-1 text-xs font-bold"
                                        >
                                            Next
                                        </Button>
                                    ) : (
                                        <Button
                                            size="sm"
                                            onClick={handleFinishConnection}
                                            disabled={testProgress < 100}
                                            className="gap-1 text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/95"
                                        >
                                            {testProgress < 100 ? (
                                                <>
                                                    <Loader2 className="w-3 h-3 animate-spin" />
                                                    Testing...
                                                </>
                                            ) : (
                                                <>
                                                    <Check className="w-3 h-3" />
                                                    Finish Registration
                                                </>
                                            )}
                                        </Button>
                                    )}
                                </div>

                            </div>

                        </Card>

                    </div>
                )}

            </main>

            <Sheet open={isEditOpen} onOpenChange={setIsEditOpen}>
                <SheetContent side="right" className="w-full sm:max-w-md border-border/40 bg-background overflow-y-auto">
                    <SheetHeader className="pb-6 border-b border-border/40">
                        <SheetTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
                            <Edit3 className="w-5 h-5 text-primary" />
                            Edit Router Credentials
                        </SheetTitle>
                        <SheetDescription className="text-xs text-muted-foreground mt-1">
                            Modify settings for router &ldquo;{editingRouter?.name}&rdquo; below.
                        </SheetDescription>
                    </SheetHeader>

                    <div className="space-y-4 py-6">
                        {/* Name */}
                        <div className="space-y-1.5">
                            <Label htmlFor="edit-name" className="text-xs font-bold text-muted-foreground">
                                Router Name
                            </Label>
                            <Input
                                id="edit-name"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                placeholder="Branch Router"
                                className="bg-card/40 border-border/60 text-xs h-9"
                            />
                        </div>

                        {/* Host Address */}
                        <div className="space-y-1.5">
                            <Label htmlFor="edit-host" className="text-xs font-bold text-muted-foreground">
                                Host IP or DDNS Address
                            </Label>
                            <Input
                                id="edit-host"
                                value={editHost}
                                onChange={(e) => setEditHost(e.target.value)}
                                placeholder="192.168.88.1"
                                className="bg-card/40 border-border/60 text-xs h-9"
                            />
                        </div>

                        {/* API Port */}
                        <div className="space-y-1.5">
                            <Label htmlFor="edit-port" className="text-xs font-bold text-muted-foreground">
                                RouterOS API Port
                            </Label>
                            <Input
                                id="edit-port"
                                type="number"
                                value={editPort}
                                onChange={(e) => setEditPort(parseInt(e.target.value) || 0)}
                                placeholder="Auto assigned"
                                className="bg-card/40 border-border/60 text-xs h-9"
                            />
                        </div>

                        {/* Username */}
                        <div className="space-y-1.5">
                            <Label htmlFor="edit-username" className="text-xs font-bold text-muted-foreground">
                                API Username
                            </Label>
                            <Input
                                id="edit-username"
                                value={editUsername}
                                onChange={(e) => setEditUsername(e.target.value)}
                                placeholder="Dedicated API user"
                                className="bg-card/40 border-border/60 text-xs h-9"
                            />
                        </div>

                        {/* Password */}
                        <div className="space-y-1.5">
                            <Label htmlFor="edit-password" className="text-xs font-bold text-muted-foreground">
                                API Password
                            </Label>
                            <Input
                                id="edit-password"
                                type="password"
                                value={editPassword}
                                onChange={(e) => setEditPassword(e.target.value)}
                                placeholder="•••••••• (Leave blank to keep unchanged)"
                                className="bg-card/40 border-border/60 text-xs h-9"
                            />
                        </div>

                        {/* Plaintext Login checkbox */}
                        <div className="flex items-center space-x-2 py-2">
                            <input
                                type="checkbox"
                                id="edit-plaintext"
                                checked={editPlaintextLogin}
                                onChange={(e) => setEditPlaintextLogin(e.target.checked)}
                                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary dark:bg-card/40 dark:border-border/60"
                            />
                            <Label htmlFor="edit-plaintext" className="text-xs font-bold text-muted-foreground cursor-pointer select-none">
                                Plaintext login protocol (recommended for RouterOS v7)
                            </Label>
                        </div>

                        {/* Description */}
                        <div className="space-y-1.5">
                            <Label htmlFor="edit-description" className="text-xs font-bold text-muted-foreground">
                                Description
                            </Label>
                            <Input
                                id="edit-description"
                                value={editDescription}
                                onChange={(e) => setEditDescription(e.target.value)}
                                placeholder="MikroTik Router Board"
                                className="bg-card/40 border-border/60 text-xs h-9"
                            />
                        </div>
                    </div>

                    <div className="pt-4 border-t border-border/40 flex items-center justify-end gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setIsEditOpen(false)}
                            className="text-xs font-bold"
                        >
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            onClick={handleSaveEdit}
                            disabled={updateRouterMutation.isPending}
                            className="text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/95 gap-1"
                        >
                            {updateRouterMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                            Save Changes
                        </Button>
                    </div>
                </SheetContent>
            </Sheet>
        </div>
    );
}

function RouterCard({
    router,
    onSelect,
    onDelete,
    onEdit,
}: {
    router: RouterResponse;
    onSelect: (id: string) => void;
    onDelete: (id: string, e: React.MouseEvent) => void;
    onEdit: (router: RouterResponse, e: React.MouseEvent) => void;
}) {
    const { data: statusData, isLoading: isStatusLoading } = useRouterStatus(router.id);

    const isOnline = statusData?.connected ?? false;
    const cpuUsage = statusData?.system_resource?.['cpu-load'] ?? 0;

    const totalMemory = statusData?.system_resource?.['total-memory'];
    const freeMemory = statusData?.system_resource?.['free-memory'];
    const memoryUsage = totalMemory ? Math.round(((totalMemory - freeMemory) / totalMemory) * 100) : 0;

    const activeUsers = statusData?.dhcp_leases?.length ?? 0;
    const uptime = statusData?.system_resource?.uptime ?? 'Offline';

    const status = isStatusLoading ? 'Connecting' : (isOnline ? 'Online' : 'Offline');

    return (
        <Card
            onClick={() => onSelect(router.id)}
            className={cn("border shadow-sm cursor-pointer transition-all duration-200 rounded flex flex-col justify-between", isOnline ? "border-emerald-400" : (status === 'Connecting') ? "border-amber-50 " : "border-rose-500")}
        >
            <div className="p-4 space-y-3">
                {/* Details Header */}
                <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className={cn(
                            "p-2 rounded",
                            isOnline ? "bg-emerald-50 text-emerald-600" :
                                (status === 'Connecting') ? "bg-amber-50 text-amber-600" :
                                    "bg-slate-50 text-slate-600"
                        )}>
                            <RouterIcon className="w-4 h-4" />
                        </div>
                        <div>
                            <h3 className="text-xs font-bold text-foreground leading-snug">{router.name}</h3>
                            <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                                {statusData?.system_resource?.['board-name'] || router.description || "MikroTik"}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                        <span className={cn(
                            "w-2 h-2 rounded-full",
                            isOnline ? "bg-emerald-500" :
                                (status === 'Connecting') ? "bg-amber-500 animate-pulse" :
                                    "bg-rose-500"
                        )} />
                        <span className={cn("text-[12px] font-bold",
                            isOnline ? "text-emerald-500" :
                                (status === 'Connecting') ? "text-amber-500" :
                                    "text-rose-500"
                        )}>{status}</span>
                    </div>
                </div>

                {/* Mini Telemetry Values */}
                <div className="grid grid-cols-2 gap-2 text-[12px] pt-1 text-muted-foreground">
                    <div>IP: <span className="text-foreground font-semibold">{router.host}</span></div>
                    <div>Uptime: <span className="text-foreground font-semibold truncate block max-w-[90px]">{uptime}</span></div>
                </div>

                {isOnline && (
                    <div className="grid grid-cols-3 gap-1 pt-2 border-t border-border/20 text-[11px]">
                        <div>
                            <span className="text-muted-foreground">CPU:</span>
                            <span className="font-bold text-foreground ml-0.5">{cpuUsage}%</span>
                        </div>
                        <div>
                            <span className="text-muted-foreground">RAM:</span>
                            <span className="font-bold text-foreground ml-0.5">{memoryUsage}%</span>
                        </div>
                        <div>
                            <span className="text-muted-foreground">Clients:</span>
                            <span className="font-bold text-foreground ml-0.5">{activeUsers}</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Action Bar */}
            <div className={cn("border-t border-border/50 px-4 py-2 flex items-center justify-between text-[10px] rounded-b", isOnline ? "bg-emerald-500" : (status === 'Connecting') ? "bg-amber-500" : " bg-rose-500")}>
                <span className="text-white font-bold hover:underline">View Details &rarr;</span>
                <div className="flex items-center gap-1">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => onEdit(router, e)}
                        className="h-6 w-6 p-0 text-white hover:bg-emerald-600 rounded"
                    >
                        <Edit3 className="w-3 h-3" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => onDelete(router.id, e)}
                        className="h-6 w-6 p-0 text-white hover:bg-emerald-600 rounded"
                    >
                        <Trash2 className="w-3 h-3" />
                    </Button>
                </div>
            </div>
        </Card>
    );
}

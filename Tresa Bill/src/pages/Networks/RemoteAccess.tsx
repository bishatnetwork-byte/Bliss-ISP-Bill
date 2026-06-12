/* eslint-disable @typescript-eslint/no-explicit-any */
import AppHeader from "@/components/Header/AppHeader";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
    Check,
    Copy,
    Globe,
    Loader2,
    RefreshCw,
    Server,
    Wifi,
    WifiOff,
    Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useRouters, useRouterRemoteAccess, usePingRouter } from "@/hooks/useRouters";

export default function RemoteAccess() {
    const [sidebarCollapsed, setSidebarCollapsed] = useState(() =>
        localStorage.getItem("sidebar-collapsed") === "true"
    );

    useEffect(() => {
        const handler = (e: any) => {
            setSidebarCollapsed(e.detail.collapsed);
        };
        window.addEventListener("sidebar-collapse-change", handler);
        return () => window.removeEventListener("sidebar-collapse-change", handler);
    }, []);

    const branchId = localStorage.getItem("selected-workspace") || "biltra";
    const { data: routers = [], isLoading: isLoadingRouters } = useRouters(branchId);
    const routerId = routers[0]?.id || "";

    const {
        data: remoteAccessData,
        isLoading: isLoadingRemoteAccess,
        refetch: refetchRemoteAccess,
        isRefetching
    } = useRouterRemoteAccess(routerId);

    const pingMutation = usePingRouter();

    // Connection check state
    const [isChecking, setIsChecking] = useState(false);
    const [checkResult, setCheckResult] = useState<{
        status: 'idle' | 'checking' | 'success' | 'failed';
        latency?: number | null;
        error?: string | null;
        checkedAt?: string;
    }>({ status: 'idle' });

    const [copiedField, setCopiedField] = useState<"winbox" | "api" | null>(null);

    const isEnabled = remoteAccessData?.enabled ?? false;
    const winboxPort = remoteAccessData?.port ?? 0;
    const winboxPending = isEnabled && winboxPort === 0;
    const winboxUrl = winboxPort
        ? (remoteAccessData?.url || `${remoteAccessData?.host}:${winboxPort}`)
        : "";
    const publicUrl = winboxPort ? winboxUrl : winboxPending ? "Pending reconnect" : "Offline";
    const apiPort = remoteAccessData?.api_port ?? 0;
    const apiUrl = apiPort
        ? (remoteAccessData?.api_endpoint || `${remoteAccessData?.host}:${apiPort}`)
        : "";
    const protocol = remoteAccessData?.protocol ?? "L2TP";
    const service = remoteAccessData?.service ?? "Winbox";
    const port = winboxPort || 8291;
    const routerHost = routers[0]?.host || "192.168.88.1";

    const handleCopy = (field: "winbox" | "api", value: string) => {
        if (!value) return;
        navigator.clipboard.writeText(value);
        setCopiedField(field);
        toast.success("Connection URL copied to clipboard!");
        setTimeout(() => setCopiedField(null), 2000);
    };

    const handleReconnect = async () => {
        toast.promise(
            refetchRemoteAccess(),
            {
                loading: 'Re-establishing remote tunnel connection...',
                success: 'Remote access state refreshed!',
                error: 'Failed to refresh remote access state'
            }
        );
    };

    const handleConnectionCheck = async () => {
        if (!routerId) return;
        if (winboxPending) {
            toast.error("Winbox port not yet allocated. Click Refresh and try again shortly.");
            return;
        }
        setIsChecking(true);
        setCheckResult({ status: 'checking' });

        try {
            const result = await pingMutation.mutateAsync({
                routerId,
                payload: {
                    target: remoteAccessData?.host || routerHost,
                    port: winboxPort || port,
                    timeout_seconds: 5
                }
            });

            setCheckResult({
                status: result.reachable ? 'success' : 'failed',
                latency: result.latency_ms,
                error: result.error,
                checkedAt: new Date().toLocaleTimeString()
            });

            if (result.reachable) {
                toast.success(`Connection verified! Latency: ${result.latency_ms ?? '—'}ms`);
            } else {
                toast.error(result.error || "Remote endpoint unreachable");
            }
        } catch (err: any) {
            setCheckResult({
                status: 'failed',
                error: err.message || "Connection check failed",
                checkedAt: new Date().toLocaleTimeString()
            });
            toast.error(err.message || "Connection check failed");
        } finally {
            setIsChecking(false);
        }
    };

    return (
        <div
            className={cn(
                "min-h-screen bg-background transition-all duration-300",
                sidebarCollapsed ? "md:pl-[72px]" : "md:pl-[280px]"
            )}
        >
            <SEO title="Remote Access Manager" />
            <AppHeader />

            <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
                {/* Heading Banner */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div>
                            <p className="text-xs text-muted-foreground">
                                Manage and monitor your cloud reverse tunnel connections
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-9"
                            onClick={handleReconnect}
                            disabled={!routerId || isRefetching}
                        >
                            <RefreshCw className={cn("w-3.5 h-3.5 mr-2", isRefetching && "animate-spin")} />
                            Refresh
                        </Button>
                        <Button
                            size="sm"
                            className="text-xs h-9 gap-1.5"
                            onClick={handleConnectionCheck}
                            disabled={!routerId || isChecking}
                        >
                            {isChecking ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                                <Wifi className="w-3.5 h-3.5" />
                            )}
                            {isChecking ? "Checking..." : "Check Connection"}
                        </Button>
                    </div>
                </div>

                {isLoadingRouters || isLoadingRemoteAccess ? (
                    <div className="flex items-center justify-center p-12">
                        <Loader2 className="w-8 h-8 text-primary animate-spin" />
                    </div>
                ) : !routerId ? (
                    <Card className="p-10 border border-dashed text-center rounded text-muted-foreground bg-card">
                        <Globe className="w-8 h-8 mx-auto mb-2 text-muted-foreground/60" />
                        <p className="text-sm font-semibold">Please connect a router first to configure Remote Access.</p>
                    </Card>
                ) : (
                    <>
                        {/* Connection Check Result Banner */}
                        {checkResult.status !== 'idle' && (
                            <Card className={cn(
                                "border rounded shadow-none transition-all duration-300",
                                checkResult.status === 'checking' ? "border-amber-500/40 bg-amber-500/5" :
                                checkResult.status === 'success' ? "border-emerald-500/40 bg-emerald-500/5" :
                                "border-destructive/40 bg-destructive/5"
                            )}>
                                <CardContent className="p-4 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        {checkResult.status === 'checking' ? (
                                            <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
                                                <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />
                                            </div>
                                        ) : checkResult.status === 'success' ? (
                                            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                                                <Wifi className="w-4 h-4 text-emerald-500" />
                                            </div>
                                        ) : (
                                            <div className="w-9 h-9 rounded-lg bg-destructive/10 flex items-center justify-center">
                                                <WifiOff className="w-4 h-4 text-destructive" />
                                            </div>
                                        )}
                                        <div>
                                            <p className="text-sm font-bold">
                                                {checkResult.status === 'checking' ? "Running connection diagnostics..." :
                                                 checkResult.status === 'success' ? "Connection Verified ✓" :
                                                 "Connection Failed ✗"}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {checkResult.status === 'checking' ? `Pinging ${remoteAccessData?.host || routerHost}:${port}` :
                                                 checkResult.status === 'success'
                                                    ? `Latency: ${checkResult.latency ?? '—'}ms • Checked at ${checkResult.checkedAt}`
                                                    : `${checkResult.error || 'Unreachable'} • Checked at ${checkResult.checkedAt}`}
                                            </p>
                                        </div>
                                    </div>
                                    {checkResult.status !== 'checking' && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-xs"
                                            onClick={() => setCheckResult({ status: 'idle' })}
                                        >
                                            Dismiss
                                        </Button>
                                    )}
                                </CardContent>
                            </Card>
                        )}

                        {/* Connection Status Overview Banner */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <Card className="border border-primary/40 rounded shadow-none">
                                <CardContent className="p-4 flex items-center justify-between">
                                    <div className="space-y-1">
                                        <span className="text-[12px] text-muted-foreground font-semibold ">
                                            Tunnel State
                                        </span>
                                        <div className="flex items-center gap-2">
                                            <span className={cn(
                                                "w-2.5 h-2.5 rounded-full",
                                                !isEnabled
                                                    ? "bg-muted"
                                                    : isRefetching
                                                        ? "bg-amber-500 animate-pulse"
                                                        : "bg-emerald-500 animate-pulse"
                                            )} />
                                            <span className="text-sm font-bold">
                                                {!isEnabled ? "Disabled" : isRefetching ? "Refreshing..." : "Connected"}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="w-9 h-9 rounded bg-muted/50 flex items-center justify-center">
                                        <Zap className="w-4 h-4 text-muted-foreground" />
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="border border-primary/40 rounded shadow-none">
                                <CardContent className="p-4 flex items-center justify-between gap-3">
                                    <div className="space-y-1 min-w-0">
                                        <span className="text-[12px] text-muted-foreground font-semibold ">
                                            Winbox Access
                                        </span>
                                        <div className="text-sm font-bold font-mono text-foreground flex items-center gap-1.5 truncate">
                                            {winboxPort ? winboxUrl : winboxPending ? "Pending reconnect" : "Offline"}
                                        </div>
                                        <p className="text-[10px] text-muted-foreground truncate">
                                            {winboxPending
                                                ? "Reopen this page after the router reconnects"
                                                : `${protocol} · ${service}`}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => handleCopy("winbox", winboxUrl)}
                                        disabled={!winboxPort}
                                        className="w-9 h-9 rounded bg-muted/50 hover:bg-muted transition-colors flex items-center justify-center text-muted-foreground disabled:opacity-40 shrink-0"
                                    >
                                        {copiedField === "winbox" ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                                    </button>
                                </CardContent>
                            </Card>

                            <Card className="border border-primary/40 rounded shadow-none">
                                <CardContent className="p-4 flex items-center justify-between gap-3">
                                    <div className="space-y-1 min-w-0">
                                        <span className="text-[12px] text-muted-foreground font-semibold ">
                                            API Access
                                        </span>
                                        <div className="text-sm font-bold font-mono text-foreground flex items-center gap-1.5 truncate">
                                            {apiPort ? apiUrl : "Offline"}
                                        </div>
                                        <p className="text-[10px] text-muted-foreground truncate">
                                            {remoteAccessData?.api_protocol ?? "MikroTik API"}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => handleCopy("api", apiUrl)}
                                        disabled={!apiPort}
                                        className="w-9 h-9 rounded bg-muted/50 hover:bg-muted transition-colors flex items-center justify-center text-muted-foreground disabled:opacity-40 shrink-0"
                                    >
                                        {copiedField === "api" ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                                    </button>
                                </CardContent>
                            </Card>
                        </div>

                        {/* VISUAL CONNECTION MAP CARD */}
                        <Card className="border border-border/20 rounded shadow-none overflow-hidden">
                            <CardHeader className="border-b border-border/30 bg-muted/10 pb-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <CardTitle className="text-sm font-bold">Remote Connection Map</CardTitle>
                                        <CardDescription className="text-xs">
                                            Visual mapping of incoming secure tunnels to local gateways
                                        </CardDescription>
                                    </div>
                                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                        <span className={cn(
                                            "w-2 h-2 rounded-full",
                                            isEnabled ? "bg-emerald-500 animate-pulse" : "bg-muted"
                                        )} />
                                        <span>{isEnabled ? "Realtime Link Sync" : "Link Offline"}</span>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="p-0 bg-card text-foreground flex flex-col items-center justify-center min-h-[300px] relative overflow-hidden">
                                {/* Dot Grid Background */}
                                <div
                                    className="absolute inset-0 opacity-5"
                                    style={{
                                        backgroundImage: "radial-gradient(circle, currentColor 1.5px, transparent 1.5px)",
                                        backgroundSize: "20px 20px"
                                    }}
                                />

                                {/* Interactive map visualization */}
                                <div className="relative z-10 w-full max-w-2xl flex flex-row items-center justify-center px-6 py-12">

                                    {/* Node 1: Local Gateway (Router) */}
                                    <div className="relative flex flex-col items-center group shrink-0">
                                        <div className={cn(
                                            "w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-500 z-10",
                                            isEnabled
                                                ? "bg-indigo-500/10 border-2 border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.15)]"
                                                : "bg-muted border border-border"
                                        )}>
                                            <Server className={cn(
                                                "w-8 h-8",
                                                isEnabled ? "text-indigo-600" : "text-muted-foreground"
                                            )} />
                                        </div>
                                        {/* Absolute Label below the icon to prevent pushing the line */}
                                        <div className="absolute top-full mt-3 text-center whitespace-nowrap pointer-events-none">
                                            <p className="text-xs font-bold text-foreground">Local Gateway</p>
                                            <p className="text-[10px] font-mono text-muted-foreground">{routerHost}:{routers[0]?.port || 8728}</p>
                                        </div>
                                    </div>

                                    {/* Node 2: Connection Line/Tunnel with animated pulse */}
                                    <div className="flex-1 h-0.5 relative flex items-center justify-center">
                                        <div className={cn(
                                            "absolute inset-x-0 h-0.5 transition-colors duration-500",
                                            isEnabled && !isRefetching ? "bg-gradient-to-r from-indigo-500 via-sky-500 to-emerald-500" : "bg-border"
                                        )} />

                                        {isEnabled && !isRefetching && (
                                            <>
                                                {/* Horizontal flow pulses */}
                                                <div
                                                    className="absolute w-2 h-2 rounded-full bg-sky-500 shadow-[0_0_8px_rgba(14,165,233,0.6)]"
                                                    style={{
                                                        animation: "tunnelPulse 2s linear infinite"
                                                    }}
                                                />
                                                <div
                                                    className="absolute w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"
                                                    style={{
                                                        animation: "tunnelPulse 2s linear infinite",
                                                        animationDelay: "0.8s"
                                                    }}
                                                />
                                            </>
                                        )}

                                        {/* Status details badge in the center of the line */}
                                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-2.5 py-2 rounded-full text-[9px] font-bold bg-background border border-primary text-primary flex items-center gap-1.5 shadow-md z-20">
                                            <span>{isEnabled && !isRefetching ? "ESTABLISHED" : "DISCONNECTED"}</span>
                                        </div>
                                    </div>

                                    {/* Node 3: Remote Server (Tresa Gateway) */}
                                    <div className="relative flex flex-col items-center group shrink-0">
                                        <div className={cn(
                                            "w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-500 z-10",
                                            isEnabled
                                                ? "bg-emerald-500/10 border-2 border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.15)]"
                                                : "bg-muted border border-border"
                                        )}>
                                            <Globe className={cn(
                                                "w-8 h-8",
                                                isEnabled ? "text-emerald-600" : "text-muted-foreground"
                                            )} />
                                        </div>
                                        {/* Absolute Label below the icon to prevent pushing the line */}
                                        <div className="absolute top-full mt-3 text-center whitespace-nowrap pointer-events-none">
                                            <p className="text-xs font-bold text-foreground">Remote Server</p>
                                            <p className="text-[10px] font-mono text-muted-foreground">{publicUrl}</p>
                                        </div>
                                    </div>

                                </div>

                                {/* Custom animations injection */}
                                <style dangerouslySetInnerHTML={{
                                    __html: `
                                    @keyframes tunnelPulse {
                                        0% { left: 0%; opacity: 0; }
                                        10% { opacity: 1; }
                                        90% { opacity: 1; }
                                        100% { left: 100%; opacity: 0; }
                                    }
                                    @keyframes tunnelPulseVertical {
                                        0% { top: 0%; opacity: 0; }
                                        10% { opacity: 1; }
                                        90% { opacity: 1; }
                                        100% { top: 100%; opacity: 0; }
                                    }
                                    `
                                }} />
                            </CardContent>
                        </Card>
                    </>
                )}
            </main>
        </div>
    );
}

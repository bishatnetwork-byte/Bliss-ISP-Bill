import AppHeader from "@/components/Header/AppHeader";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  CaptivePortalDeployResponse,
  HotspotProvisionResponse,
  RouterHardwareResponse,
  RouterPublishScriptResponse,
  RouterSecureSetupResponse,
} from "@/api/foreform";
import {
  useCreateRouter,
  useDetectRouterHardware,
  usePublishSetupScript,
  useProvisionHotspot,
  useRouter,
  useRouterSecureSetup,
  useRouterStatus,
} from "@/hooks/useRouters";
import { useDeployCaptivePortalR2 } from "@/hooks/useCaptivePortal";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clipboard,
  Cpu,
  Eye,
  EyeOff,
  Loader2,
  Network,
  Play,
  RefreshCcw,
  SaveIcon,
  Terminal,
  Wifi,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function SetUpProvison() {
  const navigate = useNavigate();
  const routeState = useLocation();
  const branchId = localStorage.getItem("selected-workspace") || "biltra";
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("sidebar-collapsed") === "true");

  // Track sidebar layout changes
  useEffect(() => {
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<{ collapsed: boolean }>;
      setSidebarCollapsed(customEvent.detail.collapsed);
    };
    window.addEventListener("sidebar-collapse-change", handler);
    return () => window.removeEventListener("sidebar-collapse-change", handler);
  }, []);

  // Wizard state: 1 = Details, 2 = Provisioning, 3 = Services, 4 = Network & Apply
  const [step, setStep] = useState<number>(1);

  // ── Step 1: Router details ───────────────────────────────────
  const [routerName, setRouterName] = useState("New Router");
  const [location, setLocation] = useState("");
  const [hotspotDnsName, setHotspotDnsName] = useState("");
  const [description, setDescription] = useState("");

  // ── Registration / connection state (kept hidden until done) ─
  const [savedRouterId, setSavedRouterId] = useState("");
  const [connectionInfo, setConnectionInfo] = useState<RouterSecureSetupResponse | null>(null);
  const [publishedScript, setPublishedScript] = useState<RouterPublishScriptResponse | null>(null);

  // ── Step 2: Provisioning script / connection check ───────────
  const [isCopied, setIsCopied] = useState(false);
  const [pollConnection, setPollConnection] = useState(false);
  const [showFallback, setShowFallback] = useState(false);

  // ── Step 3: Hardware & services ──────────────────────────────
  const [hardware, setHardware] = useState<RouterHardwareResponse | null>(null);
  const [wanPort, setWanPort] = useState(1);
  const [enableHotspot, setEnableHotspot] = useState(true);
  const [enablePppoeServer, setEnablePppoeServer] = useState(true);
  const [antiSharing, setAntiSharing] = useState(false);
  const [enablePppoeClient, setEnablePppoeClient] = useState(false);
  const [ispUsername, setIspUsername] = useState("");
  const [ispPassword, setIspPassword] = useState("");

  // ── Step 4: Network, WiFi & apply ────────────────────────────
  const [subnetAddress, setSubnetAddress] = useState("172.16.0.0");
  const [dnsServers, setDnsServers] = useState("8.8.8.8,8.8.4.4");
  const [wifiEnabled, setWifiEnabled] = useState(true);
  const [wifiSsid, setWifiSsid] = useState("Renult Free WiFi");
  const [provisionResult, setProvisionResult] = useState<HotspotProvisionResponse | null>(null);
  const [captivePortalResult, setCaptivePortalResult] = useState<CaptivePortalDeployResponse | null>(null);
  const [applySuccess, setApplySuccess] = useState(false);
  const [showConnectionDetails, setShowConnectionDetails] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  // ── Resume an incomplete setup (navigated here with a saved router id) ─
  const resumeRouterId = (routeState.state as { resumeRouterId?: string } | null)?.resumeRouterId || "";
  const [hasResumed, setHasResumed] = useState(false);
  const resumeRouterQuery = useRouter(resumeRouterId);

  // ── Mutations / queries ──────────────────────────────────────
  const createRouter = useCreateRouter(branchId);
  const secureSetup = useRouterSecureSetup();
  const publishSetupScript = usePublishSetupScript();
  const detectHardware = useDetectRouterHardware();
  const provisionHotspot = useProvisionHotspot();
  const deployCaptivePortal = useDeployCaptivePortalR2(savedRouterId);
  const statusQuery = useRouterStatus(savedRouterId, pollConnection);

  const isCreating = createRouter.isPending || secureSetup.isPending || publishSetupScript.isPending;
  const connected = Boolean(statusQuery.data?.connected);
  const connectionStatus: "waiting" | "connecting" | "connected" = connected
    ? "connected"
    : isCopied
      ? "connecting"
      : "waiting";

  const wlanName = hardware?.wireless_interfaces?.[0]?.name as string | undefined;

  const wanPortOptions = useMemo(() => {
    const ports = hardware?.ethernet_ports ?? [];
    if (ports.length > 0) {
      return ports.map((port, idx) => {
        const defaultName: string = port["default-name"] || port.name || `ether${idx + 1}`;
        const match = /(\d+)/.exec(defaultName);
        const value = match ? parseInt(match[1], 10) : idx + 1;
        const label = port.name && port.name !== defaultName ? `${defaultName} (${port.name})` : defaultName;
        return { value, label };
      });
    }
    return [1, 2, 3, 4, 5].map((n) => ({ value: n, label: `ether${n}` }));
  }, [hardware]);

  const calculated = useMemo(() => {
    const ip = subnetAddress.trim() || "172.16.0.0";
    const parts = ip.split(".");
    const base = parts.length === 4 ? parts.slice(0, 3).join(".") : "172.16.0";
    return {
      bridgeIp: `${base}.1`,
      poolStart: `${base}.2`,
      poolEnd: `${base}.254`,
    };
  }, [subnetAddress]);

  // Stop polling once the router checks in
  useEffect(() => {
    if (connected && pollConnection) {
      setPollConnection(false);
      toast.success("Router connected successfully!");
    }
  }, [connected, pollConnection]);

  // Resume an unfinished setup: prefill details, regenerate the connection
  // script for the already-saved router, and jump straight to step 2.
  useEffect(() => {
    if (!resumeRouterId || hasResumed || !resumeRouterQuery.data) return;
    const router = resumeRouterQuery.data;
    setHasResumed(true);
    setRouterName(router.name);
    setLocation(router.location || "");
    setDescription(router.description || "");
    setSavedRouterId(router.id);

    (async () => {
      try {
        const setup = await secureSetup.mutateAsync(router.id);
        setConnectionInfo(setup);
        const published = await publishSetupScript.mutateAsync(router.id);
        setPublishedScript(published);
        setStep(2);
        toast.message("Resuming setup", { description: `Continue provisioning "${router.name}".` });
      } catch (error) {
        toast.error(getErrorMessage(error, "Failed to resume router setup."));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeRouterId, hasResumed, resumeRouterQuery.data]);

  // Auto-detect hardware the first time we land on the services step
  useEffect(() => {
    if (step === 3 && !hardware && savedRouterId && !detectHardware.isPending) {
      handleDetectHardware();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // ── Step 1: create router + generate setup command ───────────
  const handleNextStep1 = async () => {
    if (!routerName.trim()) {
      toast.error("Router name is required.");
      return;
    }
    try {
      let routerId = savedRouterId;
      if (!routerId) {
        const router = await createRouter.mutateAsync({
          name: routerName.trim(),
          location: location || null,
          description: description.trim() || undefined,
          is_active: true,
        });
        routerId = router.id;
        setSavedRouterId(routerId);
      }
      if (!publishedScript) {
        const setup = await secureSetup.mutateAsync(routerId);
        setConnectionInfo(setup);
        const published = await publishSetupScript.mutateAsync(routerId);
        setPublishedScript(published);
      }
      setStep(2);
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to create router."));
    }
  };

  // ── Step 2: copy script + auto-check connection ───────────────
  const handleCopyPrimary = async () => {
    if (!publishedScript) return;
    await navigator.clipboard.writeText(publishedScript.mikrotik_v7_command);
    toast.success("Setup command copied. Paste it into the router's terminal.");
    setIsCopied(true);
    if (!connected) setPollConnection(true);
  };

  const handleCopyFallback = async () => {
    if (!publishedScript) return;
    await navigator.clipboard.writeText(publishedScript.mikrotik_v6_command);
    toast.success("Fallback commands copied. Paste both lines into the router's terminal.");
    setIsCopied(true);
    if (!connected) setPollConnection(true);
  };

  // ── Step 3: hardware detection ────────────────────────────────
  async function handleDetectHardware() {
    if (!savedRouterId) return;
    try {
      const result = await detectHardware.mutateAsync(savedRouterId);
      setHardware(result);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(`Detected ${result.port_count} ethernet port${result.port_count === 1 ? "" : "s"}${result.has_wireless ? " and a wireless interface" : ""}.`);
      }
    } catch (error) {
      toast.error(getErrorMessage(error, "Hardware detection failed."));
    }
  }

  // ── Step 4: apply configuration ───────────────────────────────
  const handleApply = async () => {
    if (!savedRouterId) return;
    try {
      const result = await provisionHotspot.mutateAsync({
        routerId: savedRouterId,
        payload: {
          wan_interface_index: wanPort,
          mgmt_interface_index: null,
          bridge_ip: calculated.bridgeIp,
          bridge_subnet: 24,
          pool_start: calculated.poolStart,
          pool_end: calculated.poolEnd,
          rate_limit: "2M/2M",
          pppoe_profile_name: "10MBPS",
          pppoe_service_name: "PPPOE",
          enable_pppoe_client: enablePppoeClient,
          isp_username: enablePppoeClient ? (ispUsername.trim() || null) : null,
          isp_password: enablePppoeClient ? (ispPassword || null) : null,
          dns_servers: dnsServers,
          enable_hotspot: enableHotspot,
          enable_pppoe_server: enablePppoeServer,
          hotspot_dns_name: hotspotDnsName.trim() || null,
          enable_anti_sharing: enableHotspot && antiSharing,
          wifi_enabled: Boolean(hardware?.has_wireless) && wifiEnabled,
          wifi_ssid: wifiSsid.trim() || null,
        },
      });
      setProvisionResult(result);
      if (result.success) {
        setApplySuccess(true);
        toast.success(`Router provisioned. ${result.commands_executed} commands executed.`);

        // Once the hotspot packages/profiles are in place, auto-deploy the
        // captive portal so the customer's WiFi login page is ready immediately.
        if (enableHotspot) {
          try {
            const portalResult = await deployCaptivePortal.mutateAsync();
            setCaptivePortalResult(portalResult);
            if (!portalResult.success) {
              toast.error(portalResult.error || "Captive portal deployment completed with issues.");
            }
          } catch (portalError) {
            toast.error(getErrorMessage(portalError, "Captive portal deployment failed."));
          }
        }
      } else {
        toast.error(result.error || "Provisioning completed with failures.");
      }
    } catch (error) {
      toast.error(getErrorMessage(error, "Provisioning failed."));
    }
  };

  const resetWizard = () => {
    setStep(1);
    setRouterName("New Router");
    setLocation("");
    setHotspotDnsName("");
    setDescription("");
    setSavedRouterId("");
    setConnectionInfo(null);
    setPublishedScript(null);
    setIsCopied(false);
    setPollConnection(false);
    setShowFallback(false);
    setHardware(null);
    setWanPort(1);
    setEnableHotspot(true);
    setEnablePppoeServer(true);
    setAntiSharing(false);
    setEnablePppoeClient(false);
    setIspUsername("");
    setIspPassword("");
    setSubnetAddress("172.16.0.0");
    setDnsServers("8.8.8.8,8.8.4.4");
    setWifiEnabled(true);
    setWifiSsid("Renult Free WiFi");
    setProvisionResult(null);
    setCaptivePortalResult(null);
    setApplySuccess(false);
    setShowConnectionDetails(false);
    setShowSecret(false);
  };

  // Leaving mid-wizard abandons a saved-but-unconfigured router, so warn first.
  const handleCancel = () => {
    if (savedRouterId && !applySuccess) {
      if (!window.confirm('This router has been saved but setup is not finished yet. It will stay in your Routers list with a "Finish Setup" prompt so you can come back to it. Leave anyway?')) {
        return;
      }
    }
    navigate('/router');
  };

  return (
    <div
      className={cn(
        "min-h-screen bg-slate-50/50 transition-all duration-300 pb-16",
        sidebarCollapsed ? "md:pl-[72px]" : "md:pl-[280px]"
      )}
    >
      <SEO title="Router Setup" />
      <AppHeader />

      <main className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8">
        {/* Header Section */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Connect & Provision Router</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Register the router, hand the customer a one-line setup command, then configure its services.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={handleCancel}
            className="border-slate-200 text-slate-700 bg-white hover:bg-slate-50 h-10 px-6 font-medium"
          >
            Cancel
          </Button>
        </div>

        {/* Stepper Card */}
        <Card className="mb-4 border-gray-200 shadow-none overflow-hidden bg-white">
          <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-slate-100">
            {/* Step 1: Details */}
            <div
              onClick={() => step > 1 && setStep(1)}
              className={cn(
                "flex-1 p-4 flex items-start gap-4 transition-colors cursor-pointer ",
                step === 1 ? "bg-slate-50/50 " : "hover:bg-slate-50/30"
              )}
            >
              <div
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-sm font-bold transition-all",
                  step > 1
                    ? "border-primary bg-primary text-white"
                    : step === 1
                      ? "border-primary text-primary bg-primary/1 shadow-[0_0_0_3px_rgba(99,102,241,0.15)]"
                      : "border-slate-200 text-slate-400"
                )}
              >
                {step > 1 ? <Check className="h-5 w-5" /> : <SaveIcon className="h-5 w-5" />}
              </div>
              <div className="min-w-0">
                <p className={cn("text-sm font-semibold tracking-tight", step === 1 ? "text-primary " : "text-slate-800")}>Save Router</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  Name your router and we&apos;ll register it.
                </p>
              </div>
            </div>

            {/* Step 2: Provisioning */}
            <div
              onClick={() => step > 2 && setStep(2)}
              className={cn(
                "flex-1 p-4 flex items-start gap-4 transition-colors",
                step > 2 ? "cursor-pointer hover:bg-slate-50/30" : "cursor-default",
                step === 2 ? "bg-slate-50/50" : ""
              )}
            >
              <div
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-sm font-bold transition-all",
                  step > 2
                    ? "border-primary bg-primary text-white"
                    : step === 2
                      ? "border-primary text-primary bg-primary/5 shadow-[0_0_0_3px_rgba(99,102,241,0.15)]"
                      : "border-slate-200 text-slate-400"
                )}
              >
                {step > 2 ? <Check className="h-5 w-5" /> : <Terminal className="h-5 w-5" />}
              </div>
              <div className="min-w-0">
                <p className={cn("text-sm font-semibold tracking-tight", step === 2 ? "text-primary" : "text-slate-800")}>Provisioning</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  Hand the customer the setup command
                </p>
              </div>
            </div>

            {/* Step 3 & 4: Services */}
            <div
              onClick={() => step > 3 && setStep(3)}
              className={cn(
                "flex-1 p-4 flex items-start gap-4 transition-colors",
                step > 3 ? "cursor-pointer hover:bg-slate-50/30" : "cursor-default",
                step >= 3 ? "bg-slate-50/50" : ""
              )}
            >
              <div
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-sm font-bold transition-all",
                  step >= 3
                    ? "border-primary text-primary bg-primary/5 shadow-[0_0_0_3px_rgba(99,102,241,0.15)]"
                    : "border-slate-200 text-slate-400"
                )}
              >
                <Wifi className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className={cn("text-sm font-semibold tracking-tight", step >= 3 ? "text-primary" : "text-slate-800")}>Hotspot & PPPoE</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  Configure network services on the router
                </p>
              </div>
            </div>
          </div>
        </Card>

        {/* Wizard Main Panel */}
        <div className="space-y-6">
          {/* STEP 1: Details */}
          {step === 1 && (
            <Card className="border-slate-100 shadow-sm bg-white">
              <CardContent className="p-6">
                <h2 className="text-base font-semibold text-slate-900 border-b border-slate-100 pb-3 mb-5">
                  Router Information
                </h2>
                <div className="space-y-5">
                  <div className="grid gap-5 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="router-name" className="text-sm font-medium text-slate-700">
                        Router Name<span className="text-destructive ml-0.5">*</span>
                      </Label>
                      <Input
                        id="router-name"
                        value={routerName}
                        onChange={(e) => setRouterName(e.target.value)}
                        placeholder="e.g. Main Office Router"
                        className="border-slate-200 focus-visible:ring-primary h-10"
                      />
                    </div>
                  </div>

                  <div className="grid gap-5 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="hotspot-dns-name" className="text-sm font-medium text-slate-700">
                        Hotspot Portal Domain
                      </Label>
                      <Input
                        id="hotspot-dns-name"
                        value={hotspotDnsName}
                        onChange={(e) => setHotspotDnsName(e.target.value)}
                        placeholder="e.g. wifi.renult.xyz"
                        className="border-slate-200 focus-visible:ring-primary h-10"
                      />
                      <p className="text-xs text-slate-400 mt-1">
                        Optional domain shown in the captive portal address bar.
                        Avoid .app, .dev, .page or .new domains - browsers force
                        HTTPS for them and the login page (plain HTTP) won't load.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description" className="text-sm font-medium text-slate-700">
                      Description
                    </Label>
                    <Textarea
                      id="description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Enter brief description about the router or client details"
                      rows={3}
                      className="border-slate-200 focus-visible:ring-primary resize-none"
                    />
                  </div>

                  <div className="flex justify-end pt-2 border-t border-slate-100 mt-6">
                    <Button onClick={handleNextStep1} disabled={isCreating} className="bg-primary hover:bg-primary/95 text-white h-10 px-6 font-medium disabled:opacity-60">
                      {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {isCreating ? "Setting up..." : "Next"}
                      {!isCreating && <ArrowRight className="ml-2 h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* STEP 2: Provisioning */}
          {step === 2 && (
            <Card className="border-slate-100 shadow-sm bg-white">
              <CardContent className="p-6">
                <h2 className="text-base font-semibold text-slate-900 border-b border-slate-100 pb-3 mb-5">
                  Provisioning Script
                </h2>
                <p className="text-sm text-slate-600 mb-4">
                  Paste this single command into your MikroTik terminal (Winbox or SSH). It downloads and applies the full configuration automatically.
                </p>

                <div className="space-y-5">
                  {publishedScript ? (
                    <>
                      {/* Primary v7 command */}
                      <div className="relative border border-slate-200 rounded bg-slate-50 p-4">
                        <div className="absolute right-3 top-3">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleCopyPrimary}
                            className="h-8 gap-1.5 text-xs border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-sm"
                          >
                            <Clipboard className="h-3.5 w-3.5" />
                            {isCopied ? "Copied" : "Copy"}
                          </Button>
                        </div>
                        <div className="text-xs font-semibold text-gray-600 mb-2">
                          RouterOS v7  single command (recommended)
                        </div>
                        <pre className="text-xs font-mono text-slate-800 break-all select-all pr-24 whitespace-pre-wrap leading-relaxed">
                          {publishedScript.mikrotik_v7_command}
                        </pre>
                      </div>

                      {/* Fallback */}
                      <div>
                        <button
                          type="button"
                          onClick={() => setShowFallback((v) => !v)}
                          className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80"
                        >
                          {showFallback ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          {showFallback ? "Hide" : "Show"} RouterOS v6 fallback commands
                        </button>
                        {showFallback && (
                          <div className="relative border border-slate-200 rounded bg-slate-50 p-4 mt-2">
                            <div className="absolute right-3 top-3">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={handleCopyFallback}
                                className="h-8 gap-1.5 text-xs border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-sm"
                              >
                                <Clipboard className="h-3.5 w-3.5" />
                                Copy
                              </Button>
                            </div>
                            <div className="text-xs font-semibold text-gray-600 mb-2">
                              RouterOS v6.45+  fallback (two lines)
                            </div>
                            <pre className="text-xs font-mono text-slate-800 break-all select-all pr-20 whitespace-pre-wrap leading-relaxed">
                              {publishedScript.mikrotik_v6_command}
                            </pre>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-center gap-2 text-sm text-slate-500 py-6">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Generating setup command...
                    </div>
                  )}

                  {/* Warning Alert */}
                  <div className="flex gap-3.5 rounded border border-amber-200 bg-amber-50/50 p-4">
                    <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-semibold text-amber-800">
                        For "device mode not allowed" error
                      </h4>
                      <ol className="list-decimal pl-4 mt-1.5 text-xs text-amber-700 space-y-1">
                        <li>Run: <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-amber-900">/system/device-mode update mode=advanced</code></li>
                        <li>Unplug power for 10 seconds after reboot</li>
                        <li>Restore power and run the script again</li>
                      </ol>
                    </div>
                  </div>

                  {/* Connection Status Section */}
                  <div className="rounded border border-slate-100 bg-slate-50/40 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <div className="text-xs font-semibold text-slate-500 mb-1">
                        Connection status
                      </div>
                      {connectionStatus === "waiting" && (
                        <p className="text-sm text-slate-600">
                          Copy the command above and paste it into your MikroTik terminal  we&apos;ll start checking automatically.
                        </p>
                      )}
                      {connectionStatus === "connecting" && (
                        <div className="flex items-center gap-2 text-sm text-slate-600 font-medium">
                          <Loader2 className="h-4 w-4 animate-spin text-primary" />
                          Waiting for the router to come online...
                        </div>
                      )}
                      {connectionStatus === "connected" && (
                        <div className="flex items-center gap-2 text-sm text-emerald-600 font-semibold">
                          <CheckCircle2 className="h-4.5 w-4.5 text-emerald-500" />
                          Router connected successfully!
                        </div>
                      )}
                    </div>

                    {connectionStatus !== "connected" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => statusQuery.refetch()}
                        disabled={statusQuery.isFetching || !isCopied}
                        className="text-xs text-primary hover:text-primary/90 hover:bg-primary/5 self-start sm:self-auto gap-1.5"
                      >
                        {statusQuery.isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
                        Check now
                      </Button>
                    )}
                  </div>

                  {/* Card Navigation */}
                  <div className="flex items-center justify-between pt-4 border-t border-slate-100 mt-6">
                    <Button
                      variant="outline"
                      onClick={() => setStep(1)}
                      className="border-slate-200 text-slate-700 bg-white hover:bg-slate-50 shadow-sm h-10 px-5"
                    >
                      Back
                    </Button>
                    <Button
                      onClick={() => setStep(3)}
                      disabled={connectionStatus !== "connected"}
                      className="bg-primary hover:bg-primary/95 text-white h-10 px-6 font-medium disabled:opacity-50"
                    >
                      Next
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* STEP 3: Hardware & Services */}
          {step === 3 && (
            <div className="space-y-6">
              {/* Card 1: Detected Hardware */}
              <Card className="border-slate-100 shadow-sm bg-white">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-5">
                    <h2 className="text-base font-semibold text-slate-900">
                      Detected Hardware
                    </h2>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDetectHardware}
                      disabled={detectHardware.isPending}
                      className="h-8 gap-1.5 text-xs"
                    >
                      {detectHardware.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Cpu className="h-3.5 w-3.5" />}
                      {hardware ? "Re-scan" : "Detect"}
                    </Button>
                  </div>

                  {detectHardware.isPending && !hardware && (
                    <div className="flex items-center justify-center gap-2 text-sm text-slate-500 py-4">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Reading router interfaces...
                    </div>
                  )}

                  {hardware && !hardware.error && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      <div className="rounded border border-slate-100 p-3">
                        <p className="text-xs text-slate-500 mb-0.5">Identity</p>
                        <p className="text-sm font-semibold text-slate-800 truncate">{hardware.identity || "Unknown"}</p>
                      </div>
                      <div className="rounded border border-slate-100 p-3">
                        <p className="text-xs text-slate-500 mb-0.5">Ethernet Ports</p>
                        <p className="text-sm font-semibold text-slate-800">{hardware.port_count}</p>
                      </div>
                      <div className="rounded border border-slate-100 p-3">
                        <p className="text-xs text-slate-500 mb-0.5">Wireless</p>
                        <p className="text-sm font-semibold text-slate-800">{hardware.has_wireless ? `Yes (${wlanName || "wlan1"})` : "No"}</p>
                      </div>
                    </div>
                  )}

                  {hardware?.error && (
                    <div className="flex gap-3 rounded border border-amber-200 bg-amber-50/50 p-4 text-sm text-amber-700">
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                      <p>{hardware.error}</p>
                    </div>
                  )}

                  {!hardware && !detectHardware.isPending && (
                    <p className="text-sm text-slate-500">
                      Click Detect to read the router&apos;s physical interfaces.
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Card 2: Network Services */}
              <Card className="border-slate-100 shadow-sm bg-white">
                <CardContent className="p-6">
                  <h2 className="text-base font-semibold text-slate-900 border-b border-slate-100 pb-3 mb-5">
                    Network Services
                  </h2>
                  <div className="space-y-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-0.5">
                        <Label htmlFor="srv-hotspot" className="text-sm font-medium text-slate-700 cursor-pointer">
                          Hotspot Captive Portal
                        </Label>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Customers see a login page before getting internet access.
                        </p>
                      </div>
                      <Switch
                        id="srv-hotspot"
                        checked={enableHotspot}
                        onCheckedChange={setEnableHotspot}
                        className="data-[state=checked]:bg-primary"
                      />
                    </div>

                    <div className="flex items-start justify-between gap-4 pt-4 border-t border-slate-50">
                      <div className="space-y-0.5">
                        <Label htmlFor="srv-pppoe" className="text-sm font-medium text-slate-700 cursor-pointer">
                          PPPoE Server
                        </Label>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Lets downstream PPPoE clients (e.g. CPE devices) authenticate against this router.
                        </p>
                      </div>
                      <Switch
                        id="srv-pppoe"
                        checked={enablePppoeServer}
                        onCheckedChange={setEnablePppoeServer}
                        className="data-[state=checked]:bg-primary"
                      />
                    </div>

                    {enableHotspot && (
                      <div className="flex items-start justify-between gap-4 pt-4 border-t border-slate-50">
                        <div className="space-y-0.5">
                          <Label htmlFor="anti-sharing" className="text-sm font-medium text-slate-700 cursor-pointer">
                            Anti-Sharing Protection (Recommended)
                          </Label>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            Adds firewall mangle rules so each voucher works on one device at a time.
                          </p>
                        </div>
                        <Switch
                          id="anti-sharing"
                          checked={antiSharing}
                          onCheckedChange={setAntiSharing}
                          className="data-[state=checked]:bg-primary"
                        />
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Card 3: Internet Uplink */}
              <Card className="border-slate-100 shadow-sm bg-white">
                <CardContent className="p-6">
                  <h2 className="text-base font-semibold text-slate-900 border-b border-slate-100 pb-3 mb-5">
                    Internet Uplink
                  </h2>
                  <div className="space-y-5">
                    <div className="space-y-2 max-w-xs">
                      <Label htmlFor="wan-port" className="text-sm font-medium text-slate-700">
                        WAN Port (ISP connection)
                      </Label>
                      <Select value={String(wanPort)} onValueChange={(val) => setWanPort(Number(val))}>
                        <SelectTrigger id="wan-port" className="border-slate-200 focus-visible:ring-primary h-10 bg-white">
                          <SelectValue placeholder="Select port" />
                        </SelectTrigger>
                        <SelectContent>
                          {wanPortOptions.map((opt) => (
                            <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="rounded border border-slate-100 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-0.5">
                          <Label htmlFor="pppoe-client" className="text-sm font-medium text-slate-700 cursor-pointer">
                            Connect to ISP via PPPoE
                          </Label>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            Creates a pppoe-out client on the WAN port to dial your upstream ISP.
                          </p>
                        </div>
                        <Switch
                          id="pppoe-client"
                          checked={enablePppoeClient}
                          onCheckedChange={setEnablePppoeClient}
                          className="data-[state=checked]:bg-primary"
                        />
                      </div>

                      {enablePppoeClient && (
                        <div className="grid gap-4 sm:grid-cols-2 mt-4 pt-4 border-t border-slate-50">
                          <div className="space-y-2">
                            <Label htmlFor="isp-username" className="text-sm font-medium text-slate-700">ISP Username</Label>
                            <Input
                              id="isp-username"
                              value={ispUsername}
                              onChange={(e) => setIspUsername(e.target.value)}
                              placeholder="username"
                              className="border-slate-200 focus-visible:ring-primary h-10"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="isp-password" className="text-sm font-medium text-slate-700">ISP Password</Label>
                            <Input
                              id="isp-password"
                              type="password"
                              value={ispPassword}
                              onChange={(e) => setIspPassword(e.target.value)}
                              placeholder="password"
                              className="border-slate-200 focus-visible:ring-primary h-10"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Step Navigation */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 mt-6">
                      <Button
                        variant="outline"
                        onClick={() => setStep(2)}
                        className="border-slate-200 text-slate-700 bg-white hover:bg-slate-50 shadow-sm h-10 px-5"
                      >
                        Back
                      </Button>
                      <Button
                        onClick={() => setStep(4)}
                        className="bg-primary hover:bg-primary/95 text-white h-10 px-6 font-medium"
                      >
                        Next
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* STEP 4: Network, WiFi & Apply */}
          {step === 4 && (
            <div className="space-y-6">
              {/* Card: Network Configuration */}
              <Card className="border-slate-100 shadow-sm bg-white">
                <CardContent className="p-6">
                  <h2 className="text-base font-semibold text-slate-900 border-b border-slate-100 pb-3 mb-5">
                    Network Configuration
                  </h2>
                  <div className="space-y-5">
                    <div className="grid gap-5 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="subnet-address" className="text-sm font-medium text-slate-700">
                          Hotspot Subnet<span className="text-destructive ml-0.5">*</span>
                        </Label>
                        <Input
                          id="subnet-address"
                          value={subnetAddress}
                          onChange={(e) => setSubnetAddress(e.target.value)}
                          placeholder="e.g. 172.16.0.0"
                          className="border-slate-200 focus-visible:ring-primary h-10"
                        />
                        <p className="text-xs text-slate-400 mt-1">
                          /24 network used for the hotspot bridge and PPPoE clients.
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="dns-servers" className="text-sm font-medium text-slate-700">
                          DNS Servers<span className="text-destructive ml-0.5">*</span>
                        </Label>
                        <Input
                          id="dns-servers"
                          value={dnsServers}
                          onChange={(e) => setDnsServers(e.target.value)}
                          placeholder="e.g. 8.8.8.8,8.8.4.4"
                          className="border-slate-200 focus-visible:ring-primary h-10"
                        />
                        <p className="text-xs text-slate-400 mt-1">
                          Comma-separated resolver IPs handed out to clients.
                        </p>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-slate-50">
                      <div className="text-xs font-semibold text-slate-500 mb-1">
                        Calculated Values
                      </div>
                      <p className="text-sm font-medium text-slate-800">
                        Bridge IP: <span className="font-semibold text-primary">{calculated.bridgeIp}/24</span> · Pool: <span className="font-semibold text-primary">{calculated.poolStart} - {calculated.poolEnd}</span>
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Card: WiFi (only if a wireless interface was detected) */}
              {hardware?.has_wireless && (
                <Card className="border-slate-100 shadow-sm bg-white">
                  <CardContent className="p-6">
                    <h2 className="text-base font-semibold text-slate-900 border-b border-slate-100 pb-3 mb-5">
                      WiFi Configuration
                    </h2>
                    <div className="space-y-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-0.5">
                          <Label htmlFor="wifi-enabled" className="text-sm font-medium text-slate-700 cursor-pointer">
                            Enable WiFi ({wlanName || "wlan1"})
                          </Label>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            Bridges the wireless interface and broadcasts the SSID below.
                          </p>
                        </div>
                        <Switch
                          id="wifi-enabled"
                          checked={wifiEnabled}
                          onCheckedChange={setWifiEnabled}
                          className="data-[state=checked]:bg-primary"
                        />
                      </div>

                      {wifiEnabled && (
                        <div className="space-y-2 pt-3 border-t border-slate-50 transition-all">
                          <Label htmlFor="wifi-ssid" className="text-sm font-medium text-slate-700">
                            WiFi Network Name (SSID)<span className="text-destructive ml-0.5">*</span>
                          </Label>
                          <Input
                            id="wifi-ssid"
                            value={wifiSsid}
                            onChange={(e) => setWifiSsid(e.target.value)}
                            placeholder="e.g. Renult Free WiFi"
                            className="border-slate-200 focus-visible:ring-primary h-10"
                          />
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Card: Apply Configuration */}
              <Card className="border-slate-100 shadow-sm bg-white">
                <CardContent className="p-6">
                  <div className="space-y-5">
                    {!applySuccess && (
                      <div className="text-center py-6">
                        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 mb-3">
                          <Network className="h-6 w-6" />
                        </div>
                        <h3 className="text-sm font-semibold text-slate-900">Apply Configuration</h3>
                        <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 leading-relaxed">
                          Configures the bridge, IP pools, services, and WiFi directly on the router over its secure connection.
                        </p>
                        <Button
                          onClick={handleApply}
                          disabled={provisionHotspot.isPending}
                          className="mt-5 bg-emerald-600 hover:bg-emerald-700 text-white h-11 px-6 font-medium gap-2 shadow-sm disabled:opacity-60"
                        >
                          {provisionHotspot.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-white" />}
                          {provisionHotspot.isPending ? "Applying..." : "Apply Configuration to Router"}
                        </Button>
                      </div>
                    )}

                    {/* Provisioning console */}
                    {(provisionHotspot.isPending ||
                      (provisionResult && provisionResult.command_log.length > 0) ||
                      deployCaptivePortal.isPending ||
                      captivePortalResult) && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-semibold text-slate-700">Provisioning Console</span>
                            {provisionResult && provisionResult.command_log.length > 0 && (
                              <span className="font-semibold text-primary">
                                {provisionResult.command_log.filter((c) => c.success).length} / {provisionResult.command_log.length} succeeded
                              </span>
                            )}
                          </div>
                          <div className="rounded-lg overflow-hidden border border-slate-800 bg-slate-950 shadow-inner">
                            <div className="flex items-center gap-1.5 border-b border-slate-800 bg-slate-900/80 px-3 py-2">
                              <span className="h-2.5 w-2.5 rounded-full bg-rose-500/70" />
                              <span className="h-2.5 w-2.5 rounded-full bg-amber-500/70" />
                              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
                              <span className="ml-2 text-[11px] font-medium text-slate-400">tresa@provisioning ~ console</span>
                            </div>
                            <div className="max-h-[300px] overflow-y-auto p-3 font-mono text-[11px] leading-5 text-slate-100">
                              {provisionResult?.command_log.map((command, index) => (
                                <p key={`${command.step}-${index}`} className="break-words">
                                  <span className={command.success ? "text-emerald-400" : "text-rose-400"}>
                                    {command.success ? "[OK]" : "[FAIL]"}
                                  </span>{" "}
                                  <span className="text-slate-300">$ {command.step}</span>
                                  {command.error && <span className="text-rose-400"> {command.error}</span>}
                                </p>
                              ))}
                              {provisionResult && !provisionResult.success && provisionResult.error && (
                                <p className="break-words text-rose-400">[FAIL] $ {provisionResult.error}</p>
                              )}
                              {provisionHotspot.isPending && (
                                <p className="text-sky-400">
                                  $ Applying hotspot/PPPoE configuration...
                                  <span className="ml-1 inline-block animate-pulse text-slate-400">▋</span>
                                </p>
                              )}
                              {deployCaptivePortal.isPending && (
                                <p className="text-sky-400">
                                  $ Deploying WiFi login page...
                                  <span className="ml-1 inline-block animate-pulse text-slate-400">▋</span>
                                </p>
                              )}
                              {captivePortalResult && (
                                captivePortalResult.success ? (
                                  <p className="break-words text-emerald-400">
                                    [OK] $ WiFi login page deployed ({captivePortalResult.fetched_files.length} file(s))
                                  </p>
                                ) : (
                                  <p className="break-words text-rose-400">[FAIL] $ WiFi login page {captivePortalResult.error}</p>
                                )
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                    {/* Success prompt */}
                    {applySuccess && (
                      <div className="text-center py-6 border border-emerald-100 bg-emerald-50/20 rounded-lg p-5">
                        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 mb-3 shadow-[0_0_0_4px_rgba(16,185,129,0.1)]">
                          <Check className="h-6 w-6 stroke-[3px]" />
                        </div>
                        <h3 className="text-base font-bold text-slate-900">Router Commissioned Successfully</h3>
                        <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 leading-relaxed">
                          All settings have been configured, bridge networks established, and dashboard monitoring initiated.
                        </p>

                        {/* Connection details  hidden until provisioning succeeds */}
                        {connectionInfo && (
                          <div className="mt-5 max-w-md mx-auto text-left">
                            <button
                              type="button"
                              onClick={() => setShowConnectionDetails((v) => !v)}
                              className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 mx-auto"
                            >
                              {showConnectionDetails ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                              {showConnectionDetails ? "Hide" : "Show"} connection details
                            </button>
                            {showConnectionDetails && (
                              <div className="mt-3 grid grid-cols-2 gap-3 rounded border border-slate-100 bg-slate-50/40 p-4">
                                <div className="space-y-1">
                                  <p className="text-[11px] font-semibold text-slate-500">Router Address</p>
                                  <p className="font-mono text-xs text-slate-800 break-all">{connectionInfo.host}</p>
                                </div>
                                <div className="space-y-1">
                                  <p className="text-[11px] font-semibold text-slate-500">API Port</p>
                                  <p className="font-mono text-xs text-slate-800">{connectionInfo.api_port}</p>
                                </div>
                                <div className="space-y-1">
                                  <p className="text-[11px] font-semibold text-slate-500">API Username</p>
                                  <p className="font-mono text-xs text-slate-800 break-all">{connectionInfo.api_username}</p>
                                </div>
                                <div className="space-y-1">
                                  <p className="text-[11px] font-semibold text-slate-500">API Password</p>
                                  <div className="flex items-center gap-2">
                                    <p className="font-mono text-xs text-slate-800 break-all">
                                      {showSecret ? connectionInfo.api_password : "••••••••"}
                                    </p>
                                    <button type="button" onClick={() => setShowSecret((v) => !v)} className="text-slate-400 hover:text-slate-600">
                                      {showSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        <div className="mt-5 flex justify-center gap-3">
                          <Button
                            onClick={() => navigate('/router')}
                            className="bg-primary hover:bg-primary/95 text-white h-10 px-5 font-semibold shadow-sm"
                          >
                            Return to Routers
                          </Button>
                          <Button
                            variant="outline"
                            onClick={resetWizard}
                            className="border-slate-200 text-slate-700 bg-white hover:bg-slate-50 shadow-sm h-10 px-5"
                          >
                            Provision Another
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Navigation */}
                    {!applySuccess && (
                      <div className="flex items-center justify-between pt-6 border-t border-slate-100 mt-6">
                        <Button
                          variant="outline"
                          onClick={() => setStep(3)}
                          disabled={provisionHotspot.isPending}
                          className="border-slate-200 text-slate-700 bg-white hover:bg-slate-50 shadow-sm h-10 px-5 disabled:opacity-50"
                        >
                          Back
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

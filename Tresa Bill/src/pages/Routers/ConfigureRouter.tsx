import AppHeader from "@/components/Header/AppHeader";
import SEO from "@/components/SEO";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { HotspotCommandResult, RouterHardwareResponse, RouterPublishScriptResponse } from "@/api/foreform";
import {
  useCreateRouter,
  useDetectRouterHardware,
  usePublishSetupScript,
  useProvisionHotspot,
  useRouters,
  useRouterSecureSetup,
  useTestRouterConnection,
} from "@/hooks/useRouters";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clipboard,
  Cpu,
  Download,
  ExternalLink,
  Loader2,
  Network,
  Play,
  Rocket,
  Router,
  Save,
  Server,
  TerminalSquare,
  Wifi,
  Wrench,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

type TimelineState = "idle" | "active" | "done" | "error";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function commandSummary(commands: HotspotCommandResult[]) {
  return {
    passed: commands.filter((command) => command.success).length,
    failed: commands.filter((command) => !command.success).length,
  };
}

export default function ConfigureRouter() {
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("sidebar-collapsed") === "true");
  const branchId = localStorage.getItem("selected-workspace") || "biltra";
  const { data: routers = [], isLoading: routersLoading } = useRouters(branchId);

  const [name, setName] = useState("New MikroTik router");
  const [host, setHost] = useState("23.92.30.38");
  const [port, setPort] = useState(0);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [tunnelScript, setTunnelScript] = useState("");
  const [publishedScript, setPublishedScript] = useState<RouterPublishScriptResponse | null>(null);
  const [plaintextLogin, setPlaintextLogin] = useState(true);
  const [description, setDescription] = useState("Auto-registered through the Tresa CHR concentrator");
  const [selectedRouterId, setSelectedRouterId] = useState("");
  const [provisionTargetId, setProvisionTargetId] = useState("");
  const [hardware, setHardware] = useState<RouterHardwareResponse | null>(null);
  const [commands, setCommands] = useState<HotspotCommandResult[]>([]);
  const [apiConnected, setApiConnected] = useState(false);
  const [savedRouterId, setSavedRouterId] = useState("");
  const [portError, setPortError] = useState<string | null>(null);
  const [enableUpstreamPppoe, setEnableUpstreamPppoe] = useState(true);

  const [wanPort, setWanPort] = useState(1);
  const [mgmtPortEnabled, setMgmtPortEnabled] = useState(false);
  const [mgmtPort, setMgmtPort] = useState(5);
  const [bridgeIp, setBridgeIp] = useState("172.16.0.1");
  const [poolStart, setPoolStart] = useState("172.16.0.2");
  const [poolEnd, setPoolEnd] = useState("172.16.0.254");
  const [rateLimit, setRateLimit] = useState("2M/2M");
  const [profileName, setProfileName] = useState("10MBPS");
  const [pppoeServiceName, setPppoeServiceName] = useState("PPPOE");
  const [ispUsername, setIspUsername] = useState("");
  const [ispPassword, setIspPassword] = useState("");
  const [dnsServers, setDnsServers] = useState("8.8.8.8,8.8.4.4");

  const testConnection = useTestRouterConnection();
  const createRouter = useCreateRouter(branchId);
  const secureSetup = useRouterSecureSetup();
  const publishSetupScript = usePublishSetupScript();
  const detectHardware = useDetectRouterHardware();
  const provisionHotspot = useProvisionHotspot();

  useEffect(() => {
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<{ collapsed: boolean }>;
      setSidebarCollapsed(customEvent.detail.collapsed);
    };
    window.addEventListener("sidebar-collapse-change", handler);
    return () => window.removeEventListener("sidebar-collapse-change", handler);
  }, []);

  useEffect(() => {
    const firstRouter = routers[0]?.id || "";
    if (!selectedRouterId) setSelectedRouterId(firstRouter);
    if (!provisionTargetId) setProvisionTargetId(savedRouterId || firstRouter);
  }, [provisionTargetId, routers, savedRouterId, selectedRouterId]);

  const selectedRouter = routers.find((router) => router.id === provisionTargetId);
  const canTestApi = host.trim().length > 0 && port > 0 && username.trim().length > 0 && password.length > 0;
  const activeRouterId = savedRouterId || provisionTargetId;
  const commandStats = commandSummary(commands);

  const timeline = useMemo(() => {
    const hasHardware = Boolean(hardware && !hardware.error);
    const provisioned = commands.length > 0 && commandStats.failed === 0;
    const failedProvision = commands.length > 0 && commandStats.failed > 0;
    return [
      { label: "Save Router", detail: savedRouterId ? "Saved in workspace" : "Create or select target", state: activeRouterId ? "done" : createRouter.isPending ? "active" : "idle" as TimelineState },
      { label: "Publish Script", detail: publishedScript ? "Hosted on Cloudflare R2" : tunnelScript ? "Script generated" : "Generate registration script", state: publishedScript ? "done" : (secureSetup.isPending || publishSetupScript.isPending) ? "active" : "idle" as TimelineState },
      { label: "CHR NAT", detail: port ? `${host || "23.92.30.38"}:${port}` : "Allocated automatically", state: portError ? "error" : apiConnected ? "done" : testConnection.isPending ? "active" : "idle" as TimelineState },
      { label: "Detect Ports", detail: hasHardware ? `${hardware?.port_count} ether ports` : "Read RouterOS interfaces", state: hasHardware ? "done" : detectHardware.isPending ? "active" : hardware?.error ? "error" : "idle" as TimelineState },
      { label: "Provision Hotspot", detail: provisioned ? `${commands.length} commands applied` : "Bridge, PPPoE, NAT, DNS", state: failedProvision ? "error" : provisioned ? "done" : provisionHotspot.isPending ? "active" : "idle" as TimelineState },
    ];
  }, [activeRouterId, apiConnected, commandStats.failed, commands.length, createRouter.isPending, detectHardware.isPending, hardware, host, port, portError, provisionHotspot.isPending, publishedScript, publishSetupScript.isPending, savedRouterId, secureSetup.isPending, testConnection.isPending, tunnelScript]);

  const handleCopyScript = async () => {
    if (!tunnelScript) {
      toast.error("Save the router first to generate its secure setup script.");
      return;
    }
    await navigator.clipboard.writeText(tunnelScript);
    toast.success("Script copied. Paste the complete block in one operation; do not run it line by line.");
  };

  const handleDownloadScript = () => {
    if (!tunnelScript) {
      toast.error("Create the pending router first to generate its registration script.");
      return;
    }
    const safeName = (name.trim() || "tresa-router").replace(/[^a-zA-Z0-9_-]+/g, "-");
    const url = URL.createObjectURL(new Blob([tunnelScript], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${safeName}-registration.rsc`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success("RouterOS registration file downloaded.");
  };

  const handleTestApi = async () => {
    if (!canTestApi) {
      toast.error("Host, API port, username, and password are required.");
      return;
    }
    setPortError(null);
    setApiConnected(false);
    try {
      const result = await testConnection.mutateAsync({
        host: host.trim(),
        port,
        username: username.trim(),
        password,
        plaintext_login: plaintextLogin,
      });
      setApiConnected(result.connected);
      setPortError(result.connected ? null : result.error || "API port reachable but login failed.");
      if (result.connected) {
        toast.success(`API connected${result.latency_ms ? ` in ${result.latency_ms}ms` : ""}.`);
      } else {
        toast.error(result.error || "API port check failed.");
      }
    } catch (error: unknown) {
      setPortError(getErrorMessage(error, "API port check failed."));
      toast.error(getErrorMessage(error, "API port check failed."));
    }
  };

  const handleSaveRouter = async () => {
    if (savedRouterId) {
      try {
        const setup = await secureSetup.mutateAsync(savedRouterId);
        setPort(setup.api_port);
        setUsername(setup.api_username);
        setPassword(setup.api_password);
        setTunnelScript(setup.script);
        const published = await publishSetupScript.mutateAsync(savedRouterId);
        setPublishedScript(published);
        toast.success("Setup command refreshed and re-published.");
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, "Failed to generate secure setup script."));
      }
      return;
    }
    if (!host.trim()) {
      toast.error("Tunnel IP / host is required.");
      return;
    }
    try {
      const router = await createRouter.mutateAsync({
        name: name.trim() || host.trim(),
        host: host.trim(),
        plaintext_login: plaintextLogin,
        location: "CHR tunnel",
        description,
        is_active: true,
      });
      setSavedRouterId(router.id);
      setProvisionTargetId(router.id);
      const setup = await secureSetup.mutateAsync(router.id);
      setPort(setup.api_port);
      setUsername(setup.api_username);
      setPassword(setup.api_password);
      setTunnelScript(setup.script);
      const published = await publishSetupScript.mutateAsync(router.id);
      setPublishedScript(published);
      toast.success("Router created. Give the customer the setup command below.");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to save router."));
    }
  };

  const handleCopyText = async (text: string, message: string) => {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    toast.success(message);
  };

  const handleDetectHardware = async () => {
    if (!activeRouterId) {
      toast.error("Save a new router or select an existing router first.");
      return;
    }
    try {
      const result = await detectHardware.mutateAsync(activeRouterId);
      setHardware(result);
      setCommands([]);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(`Detected ${result.port_count} ethernet ports${result.has_wireless ? " and wireless" : ""}.`);
      }
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Hardware detection failed."));
    }
  };

  const handleProvision = async () => {
    if (!activeRouterId) {
      toast.error("Choose a router to provision.");
      return;
    }
    try {
      const result = await provisionHotspot.mutateAsync({
        routerId: activeRouterId,
        payload: {
          wan_interface_index: wanPort,
          mgmt_interface_index: mgmtPortEnabled ? mgmtPort : null,
          bridge_ip: bridgeIp,
          bridge_subnet: 24,
          pool_start: poolStart,
          pool_end: poolEnd,
          rate_limit: rateLimit,
          pppoe_profile_name: profileName,
          pppoe_service_name: pppoeServiceName,
          pppoe_users: [
            { username: "altech", password: "altech", profile: profileName },
            { username: "hspotagent", password: "test123", profile: profileName },
          ],
          enable_pppoe_client: enableUpstreamPppoe,
          isp_username: ispUsername || null,
          isp_password: ispPassword || null,
          dns_servers: dnsServers,
        },
      });
      setHardware({
        router_id: result.router_id,
        router_name: result.router_name,
        identity: (result.hardware.identity as string | undefined) || null,
        ethernet_ports: (result.hardware.ethernet_ports as RouterHardwareResponse["ethernet_ports"] | undefined) || [],
        has_wireless: Boolean(result.hardware.has_wireless),
        wireless_interfaces: (result.hardware.wireless_interfaces as RouterHardwareResponse["wireless_interfaces"] | undefined) || [],
        port_count: Number(result.hardware.port_count || 0),
        error: (result.hardware.error as string | undefined) || null,
      });
      setCommands(result.command_log);
      if (result.success) {
        toast.success(`Hotspot provisioned. ${result.commands_executed} commands executed.`);
      } else {
        toast.error(result.error || "Provisioning completed with failures.");
      }
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Provisioning failed."));
    }
  };

  return (
    <div
      className={cn(
        "min-h-screen bg-background transition-all duration-300",
        sidebarCollapsed ? "md:pl-[72px]" : "md:pl-[280px]"
      )}
    >
      <SEO title="Router Commissioning" />
      <AppHeader />

      <main className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6 xl:px-8">
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="icon" className="h-9 w-9 rounded-full" onClick={() => navigate("/router")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-xl font-bold text-foreground">Connect & Provision Router</h1>
              <p className="text-xs text-muted-foreground">Save the router, then hand the customer a single command it registers, opens the CHR tunnel, and configures itself with no further changes on your end.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="rounded gap-1">
              <Server className="h-3.5 w-3.5" />
              CHR 23.92.30.38
            </Badge>
            <Badge variant={activeRouterId ? "default" : "secondary"} className="rounded gap-1">
              <Router className="h-3.5 w-3.5" />
              {selectedRouter?.name || (savedRouterId ? "New router ready" : "No target selected")}
            </Badge>
          </div>
        </div>

        <Card className="mb-5 rounded border-border/60 shadow-none">
          <CardContent className="p-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
              {timeline.map((item, index) => (
                <div key={item.label} className="relative min-w-0">
                  {index < timeline.length - 1 && (
                    <div className={cn(
                      "absolute left-[34px] right-[-12px] top-4 hidden h-0.5 md:block",
                      item.state === "done" ? "bg-primary" : "bg-border"
                    )} />
                  )}
                  <div className="relative z-10 flex items-start gap-2 md:block">
                    <div className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-bold",
                      item.state === "done" && "border-primary bg-primary text-primary-foreground",
                      item.state === "active" && "border-primary bg-background text-primary",
                      item.state === "error" && "border-destructive bg-destructive text-destructive-foreground",
                      item.state === "idle" && "border-border bg-background text-muted-foreground"
                    )}>
                      {item.state === "active" ? <Loader2 className="h-4 w-4 animate-spin" /> : index + 1}
                    </div>
                    <div className="mt-1 min-w-0 md:mt-2">
                      <p className="truncate text-xs font-bold text-foreground">{item.label}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{item.detail}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(420px,0.85fr)]">
          <div className="space-y-5">
            <Card className="rounded border-primary/40 shadow-none">
              <CardHeader className="border-b border-border/50 pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Rocket className="h-4 w-4 text-primary" />
                  Customer Setup Command
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 p-4">
                {publishedScript ? (
                  <>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">RouterOS v7 single command (recommended)</Label>
                      <div className="flex items-start gap-2">
                        <pre className="min-w-0 flex-1 overflow-x-auto rounded bg-slate-950 p-3 text-[11px] leading-5 text-emerald-300">
                          <code>{publishedScript.mikrotik_v7_command}</code>
                        </pre>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 shrink-0"
                          onClick={() => handleCopyText(publishedScript.mikrotik_v7_command, "v7 command copied. Paste it into the router's terminal.")}
                        >
                          <Clipboard className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">RouterOS v6.45+ fallback (two lines)</Label>
                      <div className="flex items-start gap-2">
                        <pre className="min-w-0 flex-1 overflow-x-auto rounded bg-slate-950 p-3 text-[11px] leading-5 text-slate-100">
                          <code>{publishedScript.mikrotik_v6_command}</code>
                        </pre>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 shrink-0"
                          onClick={() => handleCopyText(publishedScript.mikrotik_v6_command, "v6 commands copied. Paste both lines into the router's terminal.")}
                        >
                          <Clipboard className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 rounded border border-border/60 p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold">Hosted script URL</p>
                        <p className="truncate font-mono text-[11px] text-muted-foreground">{publishedScript.script_url}</p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => handleCopyText(publishedScript.script_url, "Script URL copied.")}>
                          <Clipboard className="h-3.5 w-3.5" />
                          Copy URL
                        </Button>
                        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" asChild>
                          <a href={publishedScript.script_url} target="_blank" rel="noreferrer">
                            <ExternalLink className="h-3.5 w-3.5" />
                            Open
                          </a>
                        </Button>
                      </div>
                    </div>

                    <Alert className="rounded">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle className="text-sm">Give this to the customer</AlertTitle>
                      <AlertDescription className="text-xs">
                        Send the single command above. They paste it once into their MikroTik terminal (Winbox or SSH) the
                        router registers itself with Renult, opens the CHR tunnel, and is ready in the dashboard.
                        No access to your CHR is required. {publishedScript.expires_note}
                      </AlertDescription>
                    </Alert>
                  </>
                ) : (
                  <div className="rounded border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                    Save the router below to generate its one-line setup command and hosted script URL.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="rounded border-border/60 shadow-none">
              <CardHeader className="flex flex-row items-center justify-between border-b border-border/50 pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <TerminalSquare className="h-4 w-4 text-primary" />
                  Auto-Registration Script
                </CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={handleDownloadScript}>
                    <Download className="h-3.5 w-3.5" />
                    Download .rsc
                  </Button>
                  <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={handleCopyScript}>
                    <Clipboard className="h-3.5 w-3.5" />
                    Copy Block
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <pre className="max-h-[330px] overflow-auto bg-slate-950 p-4 text-[11px] leading-5 text-slate-100">
                  <code>{tunnelScript || "# Create the pending router below to generate its one-time registration script."}</code>
                </pre>
              </CardContent>
            </Card>

            <Card className="rounded border-border/60 shadow-none">
              <CardHeader className="border-b border-border/50 pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Wifi className="h-4 w-4 text-primary" />
                  Router Registration
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 p-4">
                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="router-name" className="text-xs font-semibold">Router Name</Label>
                    <Input id="router-name" value={name} onChange={(event) => setName(event.target.value)} className="h-9 text-xs" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="router-description" className="text-xs font-semibold">Description</Label>
                    <Input id="router-description" value={description} onChange={(event) => setDescription(event.target.value)} className="h-9 text-xs" />
                  </div>
                </div>

                <div className="grid gap-3 lg:grid-cols-[1fr_120px_1fr_1fr]">
                  <div className="space-y-1.5">
                    <Label htmlFor="router-host" className="text-xs font-semibold">CHR Public Host</Label>
                    <Input id="router-host" value={host} readOnly className="h-9 font-mono text-xs" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="router-port" className="text-xs font-semibold">Reserved NAT Port</Label>
                    <Input id="router-port" type="number" value={port || ""} readOnly placeholder="Auto" className="h-9 font-mono text-xs" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="router-user" className="text-xs font-semibold">Bootstrap User</Label>
                    <Input id="router-user" value={username} readOnly placeholder="Generated" className="h-9 font-mono text-xs" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="router-password" className="text-xs font-semibold">Bootstrap Secret</Label>
                    <Input id="router-password" type="password" value={password} readOnly placeholder="Generated" className="h-9 font-mono text-xs" />
                  </div>
                </div>

                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-center gap-3 rounded border border-border/60 px-3 py-2">
                    <Switch id="plaintext-login" checked={plaintextLogin} onCheckedChange={setPlaintextLogin} />
                    <Label htmlFor="plaintext-login" className="text-xs font-semibold">Plaintext RouterOS API login</Label>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button variant="outline" className="h-9 gap-1.5 text-xs font-semibold" onClick={handleTestApi} disabled={testConnection.isPending}>
                      {testConnection.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                      Check Provisioned Port
                    </Button>
                    <Button className="h-9 gap-1.5 text-xs font-semibold" onClick={handleSaveRouter} disabled={createRouter.isPending || secureSetup.isPending || publishSetupScript.isPending}>
                      {createRouter.isPending || secureSetup.isPending || publishSetupScript.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      {savedRouterId ? "Refresh Setup Command" : "Generate Setup Command"}
                    </Button>
                  </div>
                </div>

                {portError && (
                  <Alert variant="destructive" className="rounded">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle className="text-sm">API check failed</AlertTitle>
                    <AlertDescription className="break-words text-xs">{portError}</AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-5">
            <Card className="rounded border-border/60 shadow-none">
              <CardHeader className="border-b border-border/50 pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Wrench className="h-4 w-4 text-primary" />
                  Provision Existing Router
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 p-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Router Target</Label>
                  <Select value={provisionTargetId} onValueChange={(value) => {
                    setProvisionTargetId(value);
                    setHardware(null);
                    setCommands([]);
                  }}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder={routersLoading ? "Loading routers..." : "Select saved router"} />
                    </SelectTrigger>
                    <SelectContent>
                      {savedRouterId && <SelectItem value={savedRouterId}>Newly saved router</SelectItem>}
                      {routers.map((router) => (
                        <SelectItem key={router.id} value={router.id}>{router.name} · {router.host}:{router.port}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">WAN Port</Label>
                    <Input type="number" min={1} value={wanPort} onChange={(event) => setWanPort(Number(event.target.value))} className="h-9 text-xs" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Management Port</Label>
                    <div className="flex gap-2">
                      <Input type="number" min={1} value={mgmtPort} onChange={(event) => setMgmtPort(Number(event.target.value))} disabled={!mgmtPortEnabled} className="h-9 text-xs" />
                      <div className="flex h-9 items-center gap-2 rounded border border-border/60 px-2">
                        <Checkbox checked={mgmtPortEnabled} onCheckedChange={(checked) => setMgmtPortEnabled(Boolean(checked))} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Bridge IP</Label>
                    <Input value={bridgeIp} onChange={(event) => setBridgeIp(event.target.value)} className="h-9 font-mono text-xs" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Pool Start</Label>
                    <Input value={poolStart} onChange={(event) => setPoolStart(event.target.value)} className="h-9 font-mono text-xs" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Pool End</Label>
                    <Input value={poolEnd} onChange={(event) => setPoolEnd(event.target.value)} className="h-9 font-mono text-xs" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Rate Limit</Label>
                    <Input value={rateLimit} onChange={(event) => setRateLimit(event.target.value)} className="h-9 font-mono text-xs" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">PPP Profile</Label>
                    <Input value={profileName} onChange={(event) => setProfileName(event.target.value)} className="h-9 text-xs" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">PPPoE Service</Label>
                    <Input value={pppoeServiceName} onChange={(event) => setPppoeServiceName(event.target.value)} className="h-9 text-xs" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">DNS Servers</Label>
                    <Input value={dnsServers} onChange={(event) => setDnsServers(event.target.value)} className="h-9 font-mono text-xs" />
                  </div>
                </div>

                <div className="rounded border border-border/60 p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <Label className="text-xs font-semibold">Upstream ISP PPPoE Client</Label>
                      <p className="text-[11px] text-muted-foreground">Creates `pppoe-out1` on the WAN port.</p>
                    </div>
                    <Switch checked={enableUpstreamPppoe} onCheckedChange={setEnableUpstreamPppoe} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Input placeholder="ISP username" value={ispUsername} onChange={(event) => setIspUsername(event.target.value)} disabled={!enableUpstreamPppoe} className="h-9 text-xs" />
                    <Input placeholder="ISP password" type="password" value={ispPassword} onChange={(event) => setIspPassword(event.target.value)} disabled={!enableUpstreamPppoe} className="h-9 text-xs" />
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <Button variant="outline" className="h-9 gap-1.5 text-xs font-semibold" onClick={handleDetectHardware} disabled={detectHardware.isPending || !activeRouterId}>
                    {detectHardware.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Cpu className="h-3.5 w-3.5" />}
                    Detect Ports
                  </Button>
                  <Button className="h-9 gap-1.5 text-xs font-semibold" onClick={handleProvision} disabled={provisionHotspot.isPending || !activeRouterId}>
                    {provisionHotspot.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Network className="h-3.5 w-3.5" />}
                    Provision Hotspot
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded border-border/60 shadow-none">
              <CardHeader className="border-b border-border/50 pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  Provisioning Results
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 p-4">
                {hardware ? (
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="rounded border border-border/60 p-2">
                      <p className="text-[11px] text-muted-foreground">Identity</p>
                      <p className="truncate font-semibold">{hardware.identity || "Unknown"}</p>
                    </div>
                    <div className="rounded border border-border/60 p-2">
                      <p className="text-[11px] text-muted-foreground">Ether Ports</p>
                      <p className="font-semibold">{hardware.port_count}</p>
                    </div>
                    <div className="rounded border border-border/60 p-2">
                      <p className="text-[11px] text-muted-foreground">Wireless</p>
                      <p className="font-semibold">{hardware.has_wireless ? "Yes" : "No"}</p>
                    </div>
                  </div>
                ) : (
                  <div className="rounded border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                    Run Detect Ports or Provision Hotspot to see router hardware and command output.
                  </div>
                )}

                {commands.length > 0 && (
                  <>
                    <Separator />
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold">Commands</span>
                      <span className="text-muted-foreground">{commandStats.passed} passed · {commandStats.failed} failed</span>
                    </div>
                    <div className="max-h-[280px] space-y-2 overflow-auto pr-1">
                      {commands.map((command, index) => (
                        <div key={`${command.step}-${index}`} className="rounded border border-border/60 p-2 text-xs">
                          <div className="flex items-start gap-2">
                            {command.success ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" /> : <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />}
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold">{command.step}</p>
                              <p className="font-mono text-[10px] text-muted-foreground">{command.action} {command.path}</p>
                              {command.error && <p className="mt-1 break-words text-[11px] text-destructive">{command.error}</p>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                <Textarea
                  readOnly
                  value={hardware?.ethernet_ports?.map((portItem) => `${portItem["default-name"] || portItem.name || "ether"} -> ${portItem.name || "unknown"}`).join("\n") || ""}
                  placeholder="Detected port mapping will appear here."
                  className="min-h-[86px] font-mono text-[11px]"
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}

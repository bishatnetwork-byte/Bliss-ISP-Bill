import {
  PlatformRouterCommandRequest,
  PlatformRouterResponse,
  renultApi,
} from "@/api/foreform";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Eye,
  Loader2,
  Pencil,
  RadioTower,
  RefreshCw,
  RotateCcw,
  Save,
  ScrollText,
  Search,
  Send,
  TerminalSquare,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import PlatformAdminLayout from "./PlatformAdminLayout";

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "N/A";
}

function statusClass(value?: string | null) {
  const normalized = String(value || "").toLowerCase();
  if (["online", "connected", "up"].includes(normalized)) return "bg-emerald-100 text-emerald-700";
  if (["offline", "down", "disconnected"].includes(normalized)) return "bg-red-100 text-red-700";
  return "bg-muted text-muted-foreground";
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function MikrotikManagerPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeRouter, setActiveRouter] = useState<PlatformRouterResponse | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editActive, setEditActive] = useState(true);

  const routersQuery = useQuery({
    queryKey: ["platformAdmin", "routers", search],
    queryFn: () => renultApi.platformAdmin.routers(search),
    staleTime: 30 * 1000,
  });

  const routers = routersQuery.data || [];
  const selectedRouters = useMemo(
    () => routers.filter((router) => selectedIds.includes(router.id)),
    [routers, selectedIds],
  );

  useEffect(() => {
    setSelectedIds((current) => current.filter((id) => routers.some((router) => router.id === id)));
  }, [routers]);

  const logsQuery = useQuery({
    queryKey: ["platformAdmin", "routerLogs", activeRouter?.id],
    queryFn: () => renultApi.platformAdmin.routerLogs(activeRouter!.id),
    enabled: logsOpen && !!activeRouter,
    staleTime: 10 * 1000,
  });

  const updateRouter = useMutation({
    mutationFn: () => renultApi.platformAdmin.updateRouter(activeRouter!.id, {
      name: editName,
      location: editLocation || null,
      description: editDescription || null,
      is_active: editActive,
    }),
    onSuccess: (router) => {
      queryClient.invalidateQueries({ queryKey: ["platformAdmin", "routers"] });
      setActiveRouter(router);
      toast.success("Router updated.");
    },
    onError: (error) => toast.error(errorMessage(error, "Could not update router.")),
  });

  const deleteRouter = useMutation({
    mutationFn: (routerId: string) => renultApi.platformAdmin.deleteRouter(routerId),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["platformAdmin", "routers"] });
      setDetailsOpen(false);
      setActiveRouter(null);
      toast.success(result.message);
    },
    onError: (error) => toast.error(errorMessage(error, "Could not delete router.")),
  });

  const pushCommand = useMutation({
    mutationFn: (payload: PlatformRouterCommandRequest) => renultApi.platformAdmin.pushRouterCommand(payload),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["platformAdmin", "routers"] });
      toast.success(`${result.succeeded}/${result.total} MikroTiks accepted ${result.command}.`);
    },
    onError: (error) => toast.error(errorMessage(error, "Command push failed.")),
  });

  const openDetails = (router: PlatformRouterResponse) => {
    setActiveRouter(router);
    setEditName(router.name);
    setEditLocation(router.location || "");
    setEditDescription(router.description || "");
    setEditActive(router.is_active);
    setDetailsOpen(true);
  };

  const openLogs = (router: PlatformRouterResponse) => {
    setActiveRouter(router);
    setLogsOpen(true);
  };

  const toggleRouter = (routerId: string, checked: boolean) => {
    setSelectedIds((current) => checked ? [...current, routerId] : current.filter((id) => id !== routerId));
  };

  const allSelected = routers.length > 0 && selectedIds.length === routers.length;

  return (
    <PlatformAdminLayout activeSection="mikrotik_manager" title="MikroTik Manager">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground">MikroTik Manager</h1>
            <p className="text-sm text-muted-foreground">
              Platform-wide router inventory, admin actions, logs, and owner notifications.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={() => routersQuery.refetch()}
              disabled={routersQuery.isFetching}
              className="h-9"
            >
              {routersQuery.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Refresh
            </Button>
            <Button onClick={() => setCommandOpen(true)} disabled={selectedIds.length === 0} className="h-9">
              <Send className="mr-2 h-4 w-4" />
              Push Action ({selectedIds.length})
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Routers" value={routers.length} />
          <Metric label="Active" value={routers.filter((router) => router.is_active).length} />
          <Metric label="Online" value={routers.filter((router) => ["online", "connected"].includes(router.status)).length} />
          <Metric label="Provisioned" value={routers.filter((router) => router.hotspot_provisioned).length} />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search router, owner, branch, or host..."
              className="h-9 pl-9"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Commands are audited and owners receive notifications.
          </p>
        </div>

        <Card className="overflow-hidden rounded border-border/70 shadow-none">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={(checked) => setSelectedIds(checked ? routers.map((router) => router.id) : [])}
                      aria-label="Select all routers"
                    />
                  </TableHead>
                  <TableHead>Router</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Host</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Seen</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {routersQuery.isLoading ? (
                  <TableRow><TableCell colSpan={7} className="h-28 text-center text-sm text-muted-foreground">Loading routers...</TableCell></TableRow>
                ) : routers.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="h-28 text-center text-sm text-muted-foreground">No MikroTiks found on the platform.</TableCell></TableRow>
                ) : routers.map((router) => (
                  <TableRow key={router.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.includes(router.id)}
                        onCheckedChange={(checked) => toggleRouter(router.id, Boolean(checked))}
                        aria-label={`Select ${router.name}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-foreground">{router.name}</div>
                      <div className="text-xs text-muted-foreground">{router.branch_name}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{router.owner_name}</div>
                      <div className="text-xs text-muted-foreground">{router.location || "No location"}</div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{router.host}:{router.port}</TableCell>
                    <TableCell>
                      <Badge className={cn("rounded px-2 py-0.5 capitalize", statusClass(router.status))}>{router.status || "unknown"}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(router.last_seen)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openDetails(router)} title="View details">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openLogs(router)} title="View logs">
                          <ScrollText className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-xl">
          <SheetHeader className="border-b px-6 py-5 text-left">
            <SheetTitle className="flex items-center gap-2"><Pencil className="h-5 w-5" /> Router Details</SheetTitle>
            <SheetDescription>Rename, disable, inspect, or delete this MikroTik.</SheetDescription>
          </SheetHeader>
          {activeRouter && (
            <div className="space-y-5 px-6 py-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <Info label="Owner" value={activeRouter.owner_name} />
                <Info label="Branch" value={activeRouter.branch_name} />
                <Info label="API Host" value={`${activeRouter.host}:${activeRouter.port}`} />
                <Info label="Tunnel IP" value={activeRouter.tunnel_ip || "N/A"} />
                <Info label="PPP User" value={activeRouter.ppp_username || "N/A"} />
                <Info label="Updated" value={formatDate(activeRouter.updated_at)} />
              </div>

              <div className="space-y-3">
                <Label htmlFor="router-edit-name">Router name</Label>
                <Input id="router-edit-name" value={editName} onChange={(event) => setEditName(event.target.value)} />
                <Label htmlFor="router-edit-location">Location</Label>
                <Input id="router-edit-location" value={editLocation} onChange={(event) => setEditLocation(event.target.value)} />
                <Label htmlFor="router-edit-description">Description</Label>
                <Textarea id="router-edit-description" value={editDescription} onChange={(event) => setEditDescription(event.target.value)} rows={4} />
                <div className="flex items-center justify-between rounded border px-3 py-2">
                  <div>
                    <Label htmlFor="router-active">Router enabled</Label>
                    <p className="text-xs text-muted-foreground">Disable platform actions without deleting the router.</p>
                  </div>
                  <Switch id="router-active" checked={editActive} onCheckedChange={setEditActive} />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={() => updateRouter.mutate()} disabled={updateRouter.isPending || !editName.trim()}>
                  {updateRouter.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save Changes
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    if (window.confirm(`Delete ${activeRouter.name}? This removes it from the platform.`)) {
                      deleteRouter.mutate(activeRouter.id);
                    }
                  }}
                  disabled={deleteRouter.isPending}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Router
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <CommandPanel
        open={commandOpen}
        onOpenChange={setCommandOpen}
        routers={selectedRouters}
        pending={pushCommand.isPending}
        onPush={(payload) => pushCommand.mutate(payload)}
      />

      <Sheet open={logsOpen} onOpenChange={setLogsOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-2xl">
          <SheetHeader className="border-b px-6 py-5 text-left">
            <SheetTitle className="flex items-center gap-2"><ScrollText className="h-5 w-5" /> Router Logs</SheetTitle>
            <SheetDescription>{activeRouter?.name || "Selected MikroTik"}</SheetDescription>
          </SheetHeader>
          <div className="space-y-3 px-6 py-5">
            <Button variant="outline" onClick={() => logsQuery.refetch()} disabled={!activeRouter || logsQuery.isFetching}>
              {logsQuery.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Refresh Logs
            </Button>
            <div className="rounded border bg-muted/30">
              {logsQuery.isLoading ? (
                <div className="p-6 text-sm text-muted-foreground">Loading logs...</div>
              ) : logsQuery.data?.error ? (
                <div className="p-6 text-sm text-red-600">{logsQuery.data.error}</div>
              ) : (
                <div className="max-h-[70vh] overflow-auto p-3 font-mono text-xs">
                  {(logsQuery.data?.logs || []).map((log, index) => (
                    <div key={index} className="border-b border-border/40 py-2 last:border-0">
                      <span className="text-muted-foreground">{String(log.time || "")}</span>{" "}
                      <span className="text-foreground">{String(log.topics || "")}</span>{" "}
                      <span>{String(log.message || JSON.stringify(log))}</span>
                    </div>
                  ))}
                  {logsQuery.data?.logs?.length === 0 && <div className="p-3 text-muted-foreground">No logs returned.</div>}
                </div>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </PlatformAdminLayout>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border bg-card px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value.toLocaleString()}</div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border bg-muted/20 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 break-words text-sm font-medium">{value}</div>
    </div>
  );
}

function CommandPanel({
  open,
  onOpenChange,
  routers,
  pending,
  onPush,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  routers: PlatformRouterResponse[];
  pending: boolean;
  onPush: (payload: PlatformRouterCommandRequest) => void;
}) {
  const [command, setCommand] = useState<PlatformRouterCommandRequest["command"]>("ping");
  const [target, setTarget] = useState("8.8.8.8");
  const [scriptName, setScriptName] = useState("TresaAdminHelp");
  const [scriptSource, setScriptSource] = useState(":log info \"Tresa admin helper ran\"");
  const [runNow, setRunNow] = useState(true);
  const [schedulerName, setSchedulerName] = useState("TresaAdminScheduler");
  const [schedulerInterval, setSchedulerInterval] = useState("1h");
  const [schedulerStartTime, setSchedulerStartTime] = useState("startup");
  const [schedulerOnEvent, setSchedulerOnEvent] = useState(":log info \"Tresa scheduler ran\"");

  const push = () => {
    if (routers.length === 0) return;
    if (command === "reboot" && !window.confirm(`Reboot ${routers.length} selected MikroTik(s)?`)) return;
    onPush({
      router_ids: routers.map((router) => router.id),
      command,
      target,
      script_name: scriptName,
      script_source: scriptSource,
      run_now: runNow,
      scheduler_name: schedulerName,
      scheduler_interval: schedulerInterval,
      scheduler_start_time: schedulerStartTime,
      scheduler_on_event: schedulerOnEvent,
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-xl">
        <SheetHeader className="border-b px-6 py-5 text-left">
          <SheetTitle className="flex items-center gap-2"><TerminalSquare className="h-5 w-5" /> Push MikroTik Action</SheetTitle>
          <SheetDescription>Send a supervised admin action to selected platform routers.</SheetDescription>
        </SheetHeader>
        <div className="space-y-5 px-6 py-5">
          <div className="rounded border bg-muted/20 p-3 text-sm">
            <div className="font-medium">{routers.length} selected router(s)</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {routers.slice(0, 4).map((router) => router.name).join(", ")}
              {routers.length > 4 ? ` and ${routers.length - 4} more` : ""}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Action</Label>
            <Select value={command} onValueChange={(value) => setCommand(value as PlatformRouterCommandRequest["command"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ping"><RadioTower className="mr-2 inline h-4 w-4" />Ping from router</SelectItem>
                <SelectItem value="reboot"><RotateCcw className="mr-2 inline h-4 w-4" />Reboot router</SelectItem>
                <SelectItem value="script"><TerminalSquare className="mr-2 inline h-4 w-4" />Push script</SelectItem>
                <SelectItem value="scheduler"><Activity className="mr-2 inline h-4 w-4" />Create scheduler</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {command === "ping" && (
            <div className="space-y-2">
              <Label htmlFor="ping-target">Ping target</Label>
              <Input id="ping-target" value={target} onChange={(event) => setTarget(event.target.value)} />
            </div>
          )}

          {command === "script" && (
            <div className="space-y-3">
              <Label htmlFor="script-name">Script name</Label>
              <Input id="script-name" value={scriptName} onChange={(event) => setScriptName(event.target.value)} />
              <div className="flex items-center justify-between rounded border px-3 py-2">
                <Label htmlFor="script-run-now">Run immediately</Label>
                <Switch id="script-run-now" checked={runNow} onCheckedChange={setRunNow} />
              </div>
              <Label htmlFor="script-source">RouterOS script</Label>
              <Textarea id="script-source" value={scriptSource} onChange={(event) => setScriptSource(event.target.value)} rows={10} className="font-mono text-xs" />
            </div>
          )}

          {command === "scheduler" && (
            <div className="space-y-3">
              <Label htmlFor="scheduler-name">Scheduler name</Label>
              <Input id="scheduler-name" value={schedulerName} onChange={(event) => setSchedulerName(event.target.value)} />
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="scheduler-interval">Interval</Label>
                  <Input id="scheduler-interval" value={schedulerInterval} onChange={(event) => setSchedulerInterval(event.target.value)} placeholder="1h" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="scheduler-start">Start time</Label>
                  <Input id="scheduler-start" value={schedulerStartTime} onChange={(event) => setSchedulerStartTime(event.target.value)} placeholder="startup" />
                </div>
              </div>
              <Label htmlFor="scheduler-event">On-event script</Label>
              <Textarea id="scheduler-event" value={schedulerOnEvent} onChange={(event) => setSchedulerOnEvent(event.target.value)} rows={10} className="font-mono text-xs" />
            </div>
          )}

          <Button onClick={push} disabled={pending || routers.length === 0} className="w-full">
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Push to selected MikroTik(s)
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

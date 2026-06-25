import { RouterIpBinding, RouterIpBindingPayload } from "@/api/foreform";
import AppHeader from "@/components/Header/AppHeader";
import SEO from "@/components/SEO";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCreateRouterIpBinding,
  useDeleteRouterIpBinding,
  useRouterIpBindings,
  useRouters,
  useUpdateRouterIpBinding,
} from "@/hooks/useRouters";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  Edit3,
  Laptop,
  ListFilter,
  Loader2,
  LockKeyhole,
  Plus,
  RefreshCw,
  Router,
  Search,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import IPBindingPanel from "./IPBindingPanel";

type BindingType = RouterIpBindingPayload["type"];
type BindingFilter = "all" | BindingType;

const steps = [
  "Select the MikroTik router that owns the hotspot.",
  "Enter the device MAC address in uppercase format.",
  "Enter the hotspot IP address to bind to that MAC.",
  "Choose bypassed to skip login or blocked to deny access.",
];

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function bindingStyle(type: BindingType) {
  if (type === "bypassed") return "border-emerald-500/20 bg-emerald-500/10 text-emerald-700";
  if (type === "blocked") return "border-red-500/20 bg-red-500/10 text-red-700";
  return "border-blue-500/20 bg-blue-500/10 text-blue-700";
}

function bindingLabel(type: BindingType) {
  if (type === "bypassed") return "Bypassed";
  if (type === "blocked") return "Blocked";
  return "Regular";
}

function StatCard({
  label,
  value,
  helper,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  helper: string;
  icon: typeof ShieldCheck;
  tone: string;
}) {
  return (
    <Card className="rounded border-primary/10 shadow-none">
      <CardContent className="flex items-center justify-between gap-4 p-4">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-bold">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
        </div>
        <div className={cn("rounded bg-muted p-2.5", tone)}>
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

function BindingListSkeleton() {
  return (
    <div className="space-y-0">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="space-y-3 border-b p-4">
          <div className="flex items-center justify-between gap-4">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-9 w-20" />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ hasRouter, onAdd }: { hasRouter: boolean; onAdd: () => void }) {
  return (
    <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
      <LockKeyhole className="h-10 w-10 text-muted-foreground/35" />
      <p className="mt-3 text-sm font-semibold">{hasRouter ? "No IP bindings on this router" : "Select or add a router first"}</p>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground">
        {hasRouter
          ? "Add a device by MAC and IP address, then choose whether it should bypass login or be blocked."
          : "IP bindings are stored on a MikroTik router, so the page needs a router before it can load entries."}
      </p>
      {hasRouter && (
        <Button className="mt-4 gap-2" size="sm" onClick={onAdd}>
          <Plus className="h-4 w-4" />
          Add binding
        </Button>
      )}
    </div>
  );
}

function BindingRow({
  binding,
  busy,
  onEdit,
  onDelete,
}: {
  binding: RouterIpBinding;
  busy: boolean;
  onEdit: (binding: RouterIpBinding) => void;
  onDelete: (id: string) => void;
}) {
  const name = binding.comment || "Unnamed device";
  return (
    <div className="grid gap-3 px-3 py-4 transition-colors hover:bg-muted/40 sm:grid-cols-[1fr_auto] sm:items-center sm:px-4 lg:grid-cols-[1.1fr_0.85fr_0.65fr_auto]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{name}</span>
          <Badge variant="outline" className={bindingStyle(binding.type)}>
            {bindingLabel(binding.type)}
          </Badge>
          {binding.disabled && (
            <Badge variant="outline" className="border-muted bg-muted text-muted-foreground">
              disabled
            </Badge>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          RouterOS ID <span className="font-mono">{binding.id}</span>
          {binding.server ? ` · server ${binding.server}` : ""}
        </p>
      </div>

      <div className="grid gap-3 text-xs sm:grid-cols-2 sm:text-right lg:text-left">
        <div>
          <p className="text-muted-foreground">MAC address</p>
          <p className="mt-1 font-mono font-semibold">{binding.mac_address || "Any"}</p>
        </div>
        <div>
          <p className="text-muted-foreground">IP address</p>
          <p className="mt-1 font-mono font-semibold">{binding.address || "Any"}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Laptop className="h-4 w-4" />
        Hotspot client rule
      </div>

      <div className="flex justify-start gap-2 sm:justify-end">
        <Button variant="outline" size="icon" aria-label={`Edit ${name}`} disabled={busy} onClick={() => onEdit(binding)}>
          <Edit3 className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" aria-label={`Delete ${name}`} disabled={busy} onClick={() => onDelete(binding.id)}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-destructive" />}
        </Button>
      </div>
    </div>
  );
}

function SetupGuide() {
  return (
    <Card className="rounded border-primary/10 shadow-none">
      <CardHeader className="border-b p-4">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Router className="h-4 w-4 text-primary" />
          How it maps to MikroTik
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        {steps.map((step, index) => (
          <div key={step} className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              {index + 1}
            </span>
            <p className="text-sm text-muted-foreground">{step}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default function IPBindingsPage() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("sidebar-collapsed") === "true");
  const [branchId, setBranchId] = useState(() => localStorage.getItem("selected-workspace") || "");
  const [selectedRouterId, setSelectedRouterId] = useState("");
  const [editing, setEditing] = useState<RouterIpBinding | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<BindingFilter>("all");
  const [deletingId, setDeletingId] = useState("");

  const routersQuery = useRouters(branchId);
  const routers = routersQuery.data || [];
  const selectedRouter = routers.find((router) => router.id === selectedRouterId) || routers[0];
  const selectedId = selectedRouter?.id || "";
  const bindingsQuery = useRouterIpBindings(selectedId);
  const createBinding = useCreateRouterIpBinding();
  const updateBinding = useUpdateRouterIpBinding();
  const deleteBinding = useDeleteRouterIpBinding();

  useEffect(() => {
    const collapseHandler = (event: Event) => {
      setSidebarCollapsed((event as CustomEvent<{ collapsed: boolean }>).detail.collapsed);
    };
    const branchHandler = (event: Event) => {
      setBranchId((event as CustomEvent<{ id?: string }>).detail?.id || "");
      setSelectedRouterId("");
      setEditing(null);
      setPanelOpen(false);
    };
    window.addEventListener("sidebar-collapse-change", collapseHandler);
    window.addEventListener("renult-branch-change", branchHandler);
    return () => {
      window.removeEventListener("sidebar-collapse-change", collapseHandler);
      window.removeEventListener("renult-branch-change", branchHandler);
    };
  }, []);

  useEffect(() => {
    if (!selectedRouterId && routers.length > 0) {
      setSelectedRouterId(routers[0].id);
    }
  }, [routers, selectedRouterId]);

  const bindings = bindingsQuery.data?.bindings || [];
  const filteredBindings = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return bindings.filter((binding) => {
      const matchesType = typeFilter === "all" || binding.type === typeFilter;
      const matchesSearch =
        !query ||
        binding.comment?.toLowerCase().includes(query) ||
        binding.mac_address.toLowerCase().includes(query) ||
        binding.address.includes(query) ||
        binding.id.toLowerCase().includes(query);
      return matchesType && matchesSearch;
    });
  }, [bindings, searchQuery, typeFilter]);

  const bypassedCount = bindings.filter((binding) => binding.type === "bypassed").length;
  const blockedCount = bindings.filter((binding) => binding.type === "blocked").length;
  const disabledCount = bindings.filter((binding) => binding.disabled).length;
  const saving = createBinding.isPending || updateBinding.isPending;

  const openNewPanel = () => {
    setEditing(null);
    setPanelOpen(true);
  };

  const openEditPanel = (binding: RouterIpBinding) => {
    setEditing(binding);
    setPanelOpen(true);
  };

  const handlePanelOpenChange = (open: boolean) => {
    setPanelOpen(open);
    if (!open) setEditing(null);
  };

  const saveBinding = async (payload: RouterIpBindingPayload, bindingId?: string) => {
    if (!selectedId) return;
    try {
      if (bindingId) {
        await updateBinding.mutateAsync({ routerId: selectedId, bindingId, payload });
        toast.success("IP binding updated on MikroTik.");
      } else {
        await createBinding.mutateAsync({ routerId: selectedId, payload });
        toast.success("IP binding created on MikroTik.");
      }
      setEditing(null);
      setPanelOpen(false);
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not save IP binding."));
    }
  };

  const removeBinding = async (bindingId: string) => {
    if (!selectedId) return;
    setDeletingId(bindingId);
    try {
      await deleteBinding.mutateAsync({ routerId: selectedId, bindingId });
      if (editing?.id === bindingId) setEditing(null);
      if (editing?.id === bindingId) setPanelOpen(false);
      toast.success("IP binding deleted from MikroTik.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not delete IP binding."));
    } finally {
      setDeletingId("");
    }
  };

  return (
    <div className={cn("min-h-screen bg-background transition-all duration-300", sidebarCollapsed ? "md:pl-[72px]" : "md:pl-[280px]")}>
      <SEO title="IP Bindings" />
      <AppHeader />
      <main className="mx-auto max-w-7xl space-y-4 px-3 py-4 sm:space-y-5 sm:px-6 sm:py-5">
        <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="rounded border-primary/20 bg-primary/10 text-primary">MikroTik</Badge>
              <Badge variant="secondary" className="rounded">IP Bindings</Badge>
            </div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-xl">IP Bindings</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              Manage MikroTik hotspot IP bindings for trusted devices, blocked clients, and pinned MAC-to-IP access.
            </p>
          </div>
          <div className="grid w-full min-w-0 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] lg:w-auto lg:min-w-[520px]">
            <Select value={selectedId} onValueChange={(value) => { setSelectedRouterId(value); setEditing(null); setPanelOpen(false); }}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={routersQuery.isLoading ? "Loading routers..." : "Select router"} />
              </SelectTrigger>
              <SelectContent>
                {routers.map((router) => (
                  <SelectItem key={router.id} value={router.id}>
                    {router.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" className="w-full gap-2 sm:w-auto" disabled={!selectedId || bindingsQuery.isFetching} onClick={() => bindingsQuery.refetch()}>
              <RefreshCw className={cn("h-4 w-4", bindingsQuery.isFetching && "animate-spin")} />
              Refresh
            </Button>
            <Button className="w-full gap-2 sm:w-auto" disabled={!selectedId} onClick={openNewPanel}>
              <Plus className="h-4 w-4" />
              New binding
            </Button>
          </div>
        </div>

        {bindingsQuery.data && !bindingsQuery.data.connected && (
          <Alert className="border-red-200 bg-red-50 text-red-900">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Router connection failed</AlertTitle>
            <AlertDescription>{bindingsQuery.data.error || "Could not read IP bindings from this MikroTik router."}</AlertDescription>
          </Alert>
        )}

        {bindingsQuery.isError && (
          <Alert className="border-red-200 bg-red-50 text-red-900 rounded">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Could not load IP bindings</AlertTitle>
            <AlertDescription>{getErrorMessage(bindingsQuery.error, "Check router API access and try again.")}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total bindings" value={bindings.length} helper="Live router entries" icon={ShieldCheck} tone="text-primary" />
          <StatCard label="Bypassed" value={bypassedCount} helper="Skip hotspot login" icon={CheckCircle2} tone="text-emerald-600" />
          <StatCard label="Blocked" value={blockedCount} helper="Restricted devices" icon={Ban} tone="text-red-600" />
          <StatCard label="Disabled" value={disabledCount} helper="Saved but inactive" icon={ListFilter} tone="text-amber-600" />
        </div>

        <div className="grid gap-5">
          <Card className="rounded border-primary/10 shadow-none">
            <CardHeader className="gap-4 border-b p-3 sm:p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <LockKeyhole className="h-4 w-4 text-primary" />
                  Device access list
                </CardTitle>
                <div className="grid w-full gap-2 sm:grid-cols-[minmax(0,1fr)_160px] lg:w-auto">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="w-full pl-9 lg:w-72"
                      placeholder="Search MAC, IP, comment..."
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                    />
                  </div>
                  <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as BindingFilter)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All types</SelectItem>
                      <SelectItem value="bypassed">Bypassed</SelectItem>
                      <SelectItem value="blocked">Blocked</SelectItem>
                      <SelectItem value="regular">Regular</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {bindingsQuery.isLoading || routersQuery.isLoading ? (
                <BindingListSkeleton />
              ) : filteredBindings.length === 0 ? (
                <EmptyState hasRouter={Boolean(selectedId)} onAdd={openNewPanel} />
              ) : (
                <div className="divide-y">
                  {filteredBindings.map((binding) => (
                    <BindingRow
                      key={binding.id}
                      binding={binding}
                      busy={deletingId === binding.id}
                      onEdit={openEditPanel}
                      onDelete={removeBinding}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

        </div>
        <SetupGuide />
      </main>
      <IPBindingPanel
        open={panelOpen}
        routerId={selectedId}
        routerName={selectedRouter?.name || ""}
        editing={editing}
        saving={saving}
        onOpenChange={handlePanelOpenChange}
        onSave={saveBinding}
      />
    </div>
  );
}

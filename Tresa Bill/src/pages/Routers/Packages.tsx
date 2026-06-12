import { RouterPackagePayload } from "@/api/foreform";
import AppHeader from "@/components/Header/AppHeader";
import SEO from "@/components/SEO";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  useCreateRouterPackage,
  useDeleteRouterPackage,
  useRouterPackages,
  useRouters,
  useSyncRouterPackages,
  useUpdateRouterTrial,
} from "@/hooks/useRouters";
import { cn } from "@/lib/utils";
import { AlertCircle, ArrowLeft, Loader2, PackagePlus, Plus, RefreshCw, Timer, Trash2, Wifi } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

const initialForm: RouterPackagePayload = {
  limit: "24hours",
  devices: "1",
  data: "SuperFast Upto 100MBps",
  profile: "24hours",
  total: "1000",
  priority: 1,
  speed_type: "SuperFast",
  rate_limit: "100M/100M",
};

export default function RouterPackages() {
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("sidebar-collapsed") === "true");
  const branchId = localStorage.getItem("selected-workspace") || "biltra";
  const { data: routers = [], isLoading: routersLoading } = useRouters(branchId);
  const [selectedRouterId, setSelectedRouterId] = useState("");
  const [form, setForm] = useState<RouterPackagePayload>(initialForm);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isTrialOpen, setIsTrialOpen] = useState(false);
  const [trialEnabled, setTrialEnabled] = useState(false);
  const [trialMinutes, setTrialMinutes] = useState(30);
  const selectedRouter = routers.find((router) => router.id === selectedRouterId);
  const routerName = selectedRouter?.name || "";

  useEffect(() => {
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<{ collapsed: boolean }>;
      setSidebarCollapsed(customEvent.detail.collapsed);
    };
    window.addEventListener("sidebar-collapse-change", handler);
    return () => window.removeEventListener("sidebar-collapse-change", handler);
  }, []);

  useEffect(() => {
    if (!selectedRouterId && routers.length > 0) {
      setSelectedRouterId(routers[0].id);
    }
  }, [routers, selectedRouterId]);

  useEffect(() => {
    if (selectedRouter) {
      setTrialEnabled(selectedRouter.trial_enabled);
      setTrialMinutes(selectedRouter.trial_minutes || 30);
    }
  }, [selectedRouter?.id, selectedRouter?.trial_enabled, selectedRouter?.trial_minutes]);

  const packagesQuery = useRouterPackages(selectedRouterId);
  const createPackage = useCreateRouterPackage(selectedRouterId);
  const syncPackages = useSyncRouterPackages(selectedRouterId);
  const deletePackage = useDeleteRouterPackage(selectedRouterId);
  const updateTrial = useUpdateRouterTrial(branchId);
  const packages = packagesQuery.data?.data.voucher || [];
  const publicPackagesPath = routerName ? `packages?router_id=${routerName.toUpperCase()}` : "packages?router_id=ROUTER";

  const totalValue = useMemo(() => {
    return packages.reduce((sum, item) => sum + Number(item.total || 0), 0);
  }, [packages]);

  const updateForm = (key: keyof RouterPackagePayload, value: string | number) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleCreatePackage = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedRouterId) {
      toast.error("Select a router first.");
      return;
    }

    try {
      const result = await createPackage.mutateAsync({
        ...form,
        limit: form.limit.trim(),
        devices: form.devices.trim(),
        data: form.data.trim(),
        profile: form.profile.trim(),
        total: form.total.trim(),
        speed_type: form.speed_type.trim(),
        rate_limit: form.rate_limit?.trim() || null,
      });
      if (result.router_sync_error) {
        toast.warning(`Package saved, but MikroTik sync failed: ${result.router_sync_error}`);
      } else {
        toast.success("Package saved and pushed to MikroTik.");
      }
      setForm((current) => ({
        ...current,
        priority: current.priority + 1,
        profile: "",
        limit: "",
        total: "",
      }));
      setIsCreateOpen(false);
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to create package."));
    }
  };

  const handleSync = async () => {
    if (!selectedRouterId) {
      toast.error("Select a router first.");
      return;
    }

    try {
      const result = await syncPackages.mutateAsync();
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(`Imported ${result.imported} package profiles from MikroTik.`);
      }
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to sync packages from MikroTik."));
    }
  };

  const handleDelete = async (packageRowId: number) => {
    try {
      await deletePackage.mutateAsync(packageRowId);
      toast.success("Package removed from database.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to delete package."));
    }
  };

  const handleSaveTrial = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedRouterId) {
      toast.error("Select a router first.");
      return;
    }

    try {
      const result = await updateTrial.mutateAsync({
        routerId: selectedRouterId,
        payload: { trial_enabled: trialEnabled, trial_minutes: trialMinutes },
      });
      if (result.router_sync_error) {
        toast.warning(`Trial settings saved, but MikroTik sync failed: ${result.router_sync_error}`);
      } else {
        toast.success(trialEnabled ? "Free trial enabled on MikroTik." : "Free trial disabled on MikroTik.");
      }
      setIsTrialOpen(false);
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to update trial settings."));
    }
  };

  return (
    <div className={cn("min-h-screen bg-background transition-all duration-300", sidebarCollapsed ? "md:pl-[72px]" : "md:pl-[280px]")}>
      <SEO title="Router Packages" />
      <AppHeader onCreateForm={() => { }} />

      <main className="max-w-screen mx-auto px-4 sm:px-6 py-6 space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex justify-between w-full items-center gap-3">
            <div>
              <h1 className="text-lg font-bold">Router Packages</h1>
              <p className="text-xs text-muted-foreground">Configure hotspot packages and view saved router profile metrics.</p>
            </div>

            <div className="flex gap-1">
              <Select value={selectedRouterId} onValueChange={setSelectedRouterId} disabled={routersLoading}>
                <SelectTrigger className="h-10 text-xs">
                  <SelectValue placeholder={routersLoading ? "Loading routers..." : "Select router"} />
                </SelectTrigger>
                <SelectContent>
                  {routers.map((router) => (
                    <SelectItem key={router.id} value={router.id}>{router.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                onClick={handleSync}
                size="sm"
                disabled={syncPackages.isPending}
                className="gap-1.5 text-xs font-semibold h-10 px-3"
              >
                {syncPackages.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Refresh All
              </Button>

              <Button
                onClick={() => setIsTrialOpen(true)}
                variant="outline"
                size="sm"
                disabled={!selectedRouterId}
                className="gap-1.5 text-xs font-semibold h-10 px-3"
              >
                <Timer className="h-4 w-4" />
                Trial
                {selectedRouter?.trial_enabled ? (
                  <Badge variant="secondary" className="ml-1 rounded text-[10px]">On</Badge>
                ) : null}
              </Button>

              <Button onClick={() => setIsCreateOpen(true)} disabled={!selectedRouterId} className="gap-2 h-10 text-xs font-semibold">
                <Plus className="h-4 w-4" />
                Add Package
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Card className="rounded border-border/40 shadow-none p-4 bg-card">
              <div className="text-xs font-semibold text-muted-foreground">Packages</div>
              <div className="mt-1 text-2xl font-bold">{packages.length}</div>
            </Card>
            <Card className="rounded border-border/40 shadow-none p-4 bg-card">
              <div className="text-xs font-semibold text-muted-foreground">Total Menu Value</div>
              <div className="mt-1 text-2xl font-bold">UGX {totalValue.toLocaleString()}</div>
            </Card>
            <Card className="rounded border-border/40 shadow-none p-4 bg-card">
              <div className="text-xs font-semibold text-muted-foreground">Portal Endpoint</div>
              <div className="mt-2 truncate font-mono text-xs text-primary">{publicPackagesPath}</div>
            </Card>
          </div>

          {packagesQuery.error ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Packages unavailable</AlertTitle>
              <AlertDescription>{getErrorMessage(packagesQuery.error, "Failed to load packages.")}</AlertDescription>
            </Alert>
          ) : null}

          <Card className="rounded border-border/40 shadow-none overflow-hidden bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Package</TableHead>
                  <TableHead className="text-xs">Profile</TableHead>
                  <TableHead className="text-xs">Devices</TableHead>
                  <TableHead className="text-xs">Rate</TableHead>
                  <TableHead className="text-xs">Price</TableHead>
                  <TableHead className="w-[70px] text-right text-xs">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {packagesQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                      <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                      Loading packages...
                    </TableCell>
                  </TableRow>
                ) : packages.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                      <Wifi className="mx-auto mb-2 h-5 w-5 opacity-60" />
                      No packages saved for this router yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  packages.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="text-xs font-bold">{item.limit}</div>
                        <div className="text-[11px] text-muted-foreground">{item.data}</div>
                      </TableCell>
                      <TableCell className="text-xs font-mono">{item.profile}</TableCell>
                      <TableCell className="text-xs">{item.devices}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="rounded text-[10px]">{item.rate_limit || item.speed_type}</Badge>
                      </TableCell>
                      <TableCell className="text-xs font-bold">UGX {Number(item.total || 0).toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(item.id)} disabled={deletePackage.isPending}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </div>
      </main>

      <Sheet open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md border-border/40 bg-background overflow-y-auto">
          <SheetHeader className="pb-4">
            <SheetTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
              <PackagePlus className="w-5 h-5 text-primary" />
              Package Setup
            </SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground mt-1">
              Create hotspot packages, push MikroTik profiles, and publish them to the captive portal.
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleCreatePackage} className="space-y-5 py-6">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground">Router</Label>
              <Select value={selectedRouterId} onValueChange={setSelectedRouterId} disabled={routersLoading}>
                <SelectTrigger className="h-9 text-xs bg-card/40 border-border/60">
                  <SelectValue placeholder={routersLoading ? "Loading routers..." : "Select router"} />
                </SelectTrigger>
                <SelectContent>
                  {routers.map((router) => (
                    <SelectItem key={router.id} value={router.id}>{router.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-muted-foreground">Limit</Label>
                <Select value={form.limit} onValueChange={(value) => updateForm("limit", value)}>
                  <SelectTrigger className="h-9 text-xs bg-card/40 border-border/60">
                    <SelectValue placeholder="Select limit" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1hour">1 Hour</SelectItem>
                    <SelectItem value="2hours">2 Hours</SelectItem>
                    <SelectItem value="3hours">3 Hours</SelectItem>
                    <SelectItem value="6hours">6 Hours</SelectItem>
                    <SelectItem value="12hours">12 Hours</SelectItem>
                    <SelectItem value="24hours">24 Hours (1 Day)</SelectItem>
                    <SelectItem value="2days">2 Days</SelectItem>
                    <SelectItem value="3days">3 Days</SelectItem>
                    <SelectItem value="7days">7 Days (1 Week)</SelectItem>
                    <SelectItem value="14days">14 Days (2 Weeks)</SelectItem>
                    <SelectItem value="30days">30 Days (1 Month)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-muted-foreground">Devices</Label>
                <Input value={form.devices} onChange={(event) => updateForm("devices", event.target.value)} placeholder="1" className="h-9 text-xs bg-card/40 border-border/60" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground">Profile Name</Label>
              <Input value={form.profile} onChange={(event) => updateForm("profile", event.target.value)} placeholder="24hours" className="h-9 text-xs bg-card/40 border-border/60" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground">Speed Description</Label>
              <Input value={form.data} onChange={(event) => updateForm("data", event.target.value)} placeholder="SuperFast Upto 100MBps" className="h-9 text-xs bg-card/40 border-border/60" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-muted-foreground">Price UGX</Label>
                <Input value={form.total} onChange={(event) => updateForm("total", event.target.value)} placeholder="1000" className="h-9 text-xs bg-card/40 border-border/60" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-muted-foreground">Priority</Label>
                <Input type="number" value={form.priority} onChange={(event) => updateForm("priority", Number(event.target.value))} className="h-9 text-xs bg-card/40 border-border/60" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-muted-foreground">Speed Type</Label>
                <Input value={form.speed_type} onChange={(event) => updateForm("speed_type", event.target.value)} placeholder="SuperFast" className="h-9 text-xs bg-card/40 border-border/60" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-muted-foreground">Rate Limit</Label>
                <Input value={form.rate_limit || ""} onChange={(event) => updateForm("rate_limit", event.target.value)} placeholder="100M/100M" className="h-9 text-xs bg-card/40 border-border/60" />
              </div>
            </div>

            <Button type="submit" disabled={!selectedRouterId || createPackage.isPending} className="w-full gap-2 mt-2 h-9 text-xs font-semibold">
              {createPackage.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackagePlus className="h-4 w-4" />}
              Save And Push Package
            </Button>
          </form>
        </SheetContent>
      </Sheet>

      <Sheet open={isTrialOpen} onOpenChange={setIsTrialOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md border-border/40 bg-background overflow-y-auto">
          <SheetHeader className="pb-4">
            <SheetTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
              <Timer className="w-5 h-5 text-primary" />
              Free Trial Access
            </SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground mt-1">
              Let new devices on {routerName || "this router"} browse for free for a limited time before they need to buy a package.
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSaveTrial} className="space-y-5 py-6">
            <div className="flex items-center justify-between rounded border border-border/60 bg-card/40 p-3">
              <div className="space-y-0.5 pr-3">
                <Label className="text-xs font-bold text-muted-foreground">Enable Free Trial</Label>
                <p className="text-[11px] text-muted-foreground">
                  Devices can request the trial once per day from the connect page.
                </p>
              </div>
              <Switch checked={trialEnabled} onCheckedChange={setTrialEnabled} />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground">Trial Duration (minutes)</Label>
              <Input
                type="number"
                min={1}
                max={1440}
                value={trialMinutes}
                onChange={(event) => setTrialMinutes(Number(event.target.value))}
                disabled={!trialEnabled}
                className="h-9 text-xs bg-card/40 border-border/60"
              />
              <p className="text-[11px] text-muted-foreground">
                How long a device can use the internet for free, e.g. 30 minutes.
              </p>
            </div>

            <Button type="submit" disabled={!selectedRouterId || updateTrial.isPending} className="w-full gap-2 mt-2 h-9 text-xs font-semibold">
              {updateTrial.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Timer className="h-4 w-4" />}
              Save Trial Settings
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}

import { BranchResponse, renultApi, StaffResponse } from "@/api/foreform";
import AppHeader from "@/components/Header/AppHeader";
import SEO from "@/components/SEO";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Building2, Handshake, Pencil, Plus, Trash2, User, UserPlus } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

type PartnerPayoutMode = "percentage" | "fixed" | "daily";

interface PartnerAgreement {
  id: string;
  name: string;
  phone_number: string;
  email: string;
  payout_mode: PartnerPayoutMode;
  percentage: number;
  fixed_amount: number;
  daily_revenue_amount: number;
  applies_online: boolean;
  applies_voucher: boolean;
  is_active: boolean;
  created_at: string;
}

const defaultPartnerForm = {
  name: "",
  phone_number: "",
  email: "",
  payout_mode: "percentage" as PartnerPayoutMode,
  percentage: 50,
  fixed_amount: 0,
  daily_revenue_amount: 0,
  applies_online: true,
  applies_voucher: true,
  is_active: true,
};

function partnerStorageKey(branchId: string) {
  return `branch-partners:${branchId}`;
}

function loadStoredPartners(branchId: string): PartnerAgreement[] {
  try {
    const raw = localStorage.getItem(partnerStorageKey(branchId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveStoredPartners(branchId: string, partners: PartnerAgreement[]) {
  localStorage.setItem(partnerStorageKey(branchId), JSON.stringify(partners));
}

function formatMoney(amount: number) {
  return `UGX ${Number(amount || 0).toLocaleString()}`;
}

export default function BranchesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [branches, setBranches] = useState<BranchResponse[]>([]);
  const [staff, setStaff] = useState<StaffResponse[]>([]);
  const [partners, setPartners] = useState<PartnerAgreement[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(localStorage.getItem("selected-workspace"));
  const [isLoading, setIsLoading] = useState(true);
  const [isStaffLoading, setIsStaffLoading] = useState(false);
  const [isBranchOpen, setIsBranchOpen] = useState(false);
  const [isStaffOpen, setIsStaffOpen] = useState(false);
  const [isPartnerOpen, setIsPartnerOpen] = useState(false);
  const [isEditStaffOpen, setIsEditStaffOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffResponse | null>(null);
  const [branchName, setBranchName] = useState("");
  const [partnerForm, setPartnerForm] = useState(defaultPartnerForm);
  const [staffForm, setStaffForm] = useState({
    full_name: "",
    email: "",
    phone_number: "",
    role: "staff",
    share_percentage: 10,
    permissions: ["dashboard", "routers", "sales", "vouchers"],
  });
  const [editForm, setEditForm] = useState({
    full_name: "",
    email: "",
    phone_number: "",
    role: "staff",
    share_percentage: 0,
    permissions: [] as string[],
    is_active: true,
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("sidebar-collapsed") === "true");

  const selectedBranch = useMemo(
    () => branches.find((branch) => branch.id === selectedBranchId) || branches[0],
    [branches, selectedBranchId],
  );

  const loadBranches = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await renultApi.branches.list();
      setBranches(data);
      const next = data.find((branch) => branch.id === selectedBranchId) || data[0];
      if (next) {
        setSelectedBranchId(next.id);
        localStorage.setItem("selected-workspace", next.id);
      }
    } catch (err: unknown) {
      toast.error(errorMessage(err, "Failed to load branches"));
    } finally {
      setIsLoading(false);
    }
  }, [selectedBranchId]);

  const loadStaff = useCallback(async () => {
    if (!selectedBranch?.id) {
      setStaff([]);
      return;
    }
    setIsStaffLoading(true);
    try {
      setStaff(await renultApi.staff.list(selectedBranch.id));
    } catch (err: unknown) {
      toast.error(errorMessage(err, "Failed to load staff"));
    } finally {
      setIsStaffLoading(false);
    }
  }, [selectedBranch?.id]);

  useEffect(() => { loadBranches(); }, [loadBranches]);
  useEffect(() => { loadStaff(); }, [loadStaff]);
  useEffect(() => {
    if (!selectedBranch?.id) {
      setPartners([]);
      return;
    }
    setPartners(loadStoredPartners(selectedBranch.id));
  }, [selectedBranch?.id]);
  useEffect(() => {
    const action = searchParams.get("new");
    if (action === "branch") setIsBranchOpen(true);
    if (action === "staff") setIsStaffOpen(true);
    if (action === "partner") setIsPartnerOpen(true);
  }, [searchParams]);
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ collapsed: boolean }>).detail;
      setSidebarCollapsed(detail.collapsed);
    };
    window.addEventListener("sidebar-collapse-change", handler);
    return () => window.removeEventListener("sidebar-collapse-change", handler);
  }, []);

  const createBranch = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const branch = await renultApi.branches.create({ name: branchName });
      setBranches((prev) => [branch, ...prev]);
      setSelectedBranchId(branch.id);
      localStorage.setItem("selected-workspace", branch.id);
      window.dispatchEvent(new CustomEvent("renult-branch-change", { detail: branch }));
      setBranchName("");
      setIsBranchOpen(false);
      setSearchParams({});
      toast.success("Branch created");
    } catch (err: unknown) {
      toast.error(errorMessage(err, "Failed to create branch"));
    }
  };

  const createStaff = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedBranch) return;
    try {
      const created = await renultApi.staff.create(selectedBranch.id, {
        ...staffForm,
        phone_number: staffForm.phone_number || null,
      });
      setStaff((prev) => [created, ...prev]);
      setStaffForm({ full_name: "", email: "", phone_number: "", role: "staff", share_percentage: 10, permissions: ["dashboard", "routers", "sales", "vouchers"] });
      setIsStaffOpen(false);
      setSearchParams({});
      toast.success("Agent invited and login password emailed");
    } catch (err: unknown) {
      toast.error(errorMessage(err, "Failed to add staff"));
    }
  };

  const createPartner = (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedBranch) return;
    if (!partnerForm.applies_online && !partnerForm.applies_voucher) {
      toast.error("Choose Online payments, Voucher sales, or both.");
      return;
    }

    const next: PartnerAgreement = {
      id: crypto.randomUUID(),
      ...partnerForm,
      percentage: Math.min(100, Math.max(0, Number(partnerForm.percentage || 0))),
      fixed_amount: Math.max(0, Number(partnerForm.fixed_amount || 0)),
      daily_revenue_amount: Math.max(0, Number(partnerForm.daily_revenue_amount || 0)),
      created_at: new Date().toISOString(),
    };
    const nextPartners = [next, ...partners];
    setPartners(nextPartners);
    saveStoredPartners(selectedBranch.id, nextPartners);
    setPartnerForm(defaultPartnerForm);
    setIsPartnerOpen(false);
    setSearchParams({});
    toast.success("Partner agreement added");
  };

  const deleteStaff = async (id: string) => {
    try {
      await renultApi.staff.delete(id);
      setStaff((prev) => prev.filter((item) => item.id !== id));
      toast.success("Staff member removed");
    } catch (err: unknown) {
      toast.error(errorMessage(err, "Failed to delete staff"));
    }
  };

  const openEditStaff = (person: StaffResponse) => {
    setEditingStaff(person);
    setEditForm({
      full_name: person.full_name,
      email: person.email,
      phone_number: person.phone_number || "",
      role: person.role,
      share_percentage: person.share_percentage,
      permissions: person.permissions,
      is_active: person.is_active,
    });
    setIsEditStaffOpen(true);
  };

  const updateStaff = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingStaff) return;
    try {
      const updated = await renultApi.staff.update(editingStaff.id, {
        full_name: editForm.full_name,
        email: editForm.email,
        phone_number: editForm.phone_number || null,
        role: editForm.role,
        share_percentage: editForm.share_percentage,
        permissions: editForm.permissions,
        is_active: editForm.is_active,
      });
      setStaff((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setIsEditStaffOpen(false);
      setEditingStaff(null);
      toast.success("Staff member updated");
    } catch (err: unknown) {
      toast.error(errorMessage(err, "Failed to update staff"));
    }
  };

  const toggleStaffActive = async (person: StaffResponse) => {
    try {
      const updated = await renultApi.staff.update(person.id, { is_active: !person.is_active });
      setStaff((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      toast.success(updated.is_active ? `${updated.full_name} activated` : `${updated.full_name} deactivated`);
    } catch (err: unknown) {
      toast.error(errorMessage(err, "Failed to update staff status"));
    }
  };

  const togglePartnerActive = (partner: PartnerAgreement) => {
    if (!selectedBranch) return;
    const nextPartners = partners.map((item) => (
      item.id === partner.id ? { ...item, is_active: !item.is_active } : item
    ));
    setPartners(nextPartners);
    saveStoredPartners(selectedBranch.id, nextPartners);
    toast.success(`${partner.name} ${partner.is_active ? "paused" : "activated"}`);
  };

  const deletePartner = (id: string) => {
    if (!selectedBranch) return;
    const nextPartners = partners.filter((item) => item.id !== id);
    setPartners(nextPartners);
    saveStoredPartners(selectedBranch.id, nextPartners);
    toast.success("Partner agreement removed");
  };

  const partnerPayoutLabel = (partner: PartnerAgreement) => {
    if (partner.payout_mode === "percentage") return `${partner.percentage}% share`;
    if (partner.payout_mode === "fixed") return `${formatMoney(partner.fixed_amount)} fixed`;
    return `${formatMoney(partner.daily_revenue_amount)} daily`;
  };

  const partnerSourceLabel = (partner: PartnerAgreement) => {
    if (partner.applies_online && partner.applies_voucher) return "Online + Voucher";
    if (partner.applies_online) return "Online";
    return "Voucher";
  };

  const selectBranch = (branch: BranchResponse) => {
    setSelectedBranchId(branch.id);
    localStorage.setItem("selected-workspace", branch.id);
    window.dispatchEvent(new CustomEvent("renult-branch-change", { detail: branch }));
  };

  return (
    <div className={`min-h-screen bg-background transition-all duration-300 ${sidebarCollapsed ? "md:pl-[72px]" : "md:pl-[280px]"}`}>
      <SEO title="Branches" path="/branches" />
      <AppHeader />
      <main className="px-4 sm:px-6 py-6 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Branches & Staff</h1>
            <p className="text-sm text-muted-foreground">Manage locations and branch team members.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="h-10 text-xs gap-1.5" onClick={() => setIsBranchOpen(true)}>
              <Plus className="w-4 h-4" />
              Create New Branch
            </Button>
            <Button className="h-10 text-xs gap-1.5" disabled={!selectedBranch} onClick={() => setIsStaffOpen(true)}>
              <UserPlus className="w-4 h-4" />
              Add New Staff
            </Button>
            <Button className="h-10 text-xs gap-1.5" disabled={!selectedBranch} onClick={() => setIsPartnerOpen(true)}>
              <Handshake className="w-4 h-4" />
              Add Partner
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4">
          <Card className="border-border/20 shadow-none rounded-none">
            <CardHeader className="border-b border-border/40">
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="w-4 h-4 text-primary" />
                Branches
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2">
              {isLoading ? (
                <div className="space-y-2 p-2">
                  {[1, 2, 3].map((item) => (
                    <div key={item} className="flex items-center gap-3 px-1 py-2">
                      <Skeleton className="h-8 w-8 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-3 w-3/4" />
                        <Skeleton className="h-2.5 w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : branches.length === 0 ? (
                <div className="h-32 flex items-center justify-center text-sm text-muted-foreground">No branches yet.</div>
              ) : branches.map((branch) => (
                <button
                  key={branch.id}
                  onClick={() => selectBranch(branch)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded text-left transition-colors ${selectedBranch?.id === branch.id ? "bg-primary/10 text-primary" : "hover:bg-muted/60 text-foreground/80"}`}
                >
                  <Avatar className="w-8 h-8">
                    <AvatarImage src={branch.avatar_url} />
                    <AvatarFallback>{branch.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{branch.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{new Date(branch.created_at).toLocaleDateString()}</p>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card className="rounded-none border-border/0">
              <CardHeader className="border-b border-border/40">
                <CardTitle className="text-base flex items-center gap-2">
                  <User className="w-4 h-4 text-primary" />
                  {selectedBranch ? `${selectedBranch.name} Staff` : "Staff"}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {isStaffLoading ? (
                  <div className="space-y-3 p-4">
                    {[1, 2, 3].map((item) => (
                      <div key={item} className="flex items-center gap-3">
                        <Skeleton className="h-7 w-7 rounded-full" />
                        <Skeleton className="h-3 flex-1" />
                        <Skeleton className="h-3 w-24" />
                        <Skeleton className="h-3 w-16" />
                      </div>
                    ))}
                  </div>
                ) : !selectedBranch ? (
                  <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">Create a branch to add staff.</div>
                ) : staff.length === 0 ? (
                  <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">No staff for this branch yet.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Share</TableHead>
                        <TableHead>Active</TableHead>
                        <TableHead className="w-16" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {staff.map((person) => (
                        <TableRow key={person.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Avatar className="w-7 h-7">
                                <AvatarImage src={person.avatar_url} />
                                <AvatarFallback>{person.full_name.slice(0, 2).toUpperCase()}</AvatarFallback>
                              </Avatar>
                              <span className="font-medium text-xs">{person.full_name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs">{person.email}</TableCell>
                          <TableCell className="text-xs">{person.phone_number || "-"}</TableCell>
                          <TableCell className="text-xs capitalize">{person.role}</TableCell>
                          <TableCell className="text-xs font-semibold">{person.share_percentage}%</TableCell>
                          <TableCell>
                            <Switch
                              checked={person.is_active}
                              onCheckedChange={() => toggleStaffActive(person)}
                              aria-label={person.is_active ? "Deactivate agent" : "Activate agent"}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <button onClick={() => openEditStaff(person)} className="text-muted-foreground hover:text-primary transition-colors" aria-label="Edit staff">
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button onClick={() => deleteStaff(person.id)} className="text-muted-foreground hover:text-destructive transition-colors" aria-label="Delete staff">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-none border-border/0">
              <CardHeader className="border-b border-border/40">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Handshake className="w-4 h-4 text-primary" />
                    Partner Revenue Service
                  </CardTitle>
                  <Button size="sm" className="h-8 text-xs gap-1.5" disabled={!selectedBranch} onClick={() => setIsPartnerOpen(true)}>
                    <Plus className="w-3.5 h-3.5" />
                    Partner
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {!selectedBranch ? (
                  <div className="h-32 flex items-center justify-center text-sm text-muted-foreground">Create a branch to add partner agreements.</div>
                ) : partners.length === 0 ? (
                  <div className="h-32 flex items-center justify-center text-sm text-muted-foreground">No partner agreements for this branch yet.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Partner</TableHead>
                        <TableHead>Contact</TableHead>
                        <TableHead>Applies to</TableHead>
                        <TableHead>Payout</TableHead>
                        <TableHead>Active</TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {partners.map((partner) => (
                        <TableRow key={partner.id}>
                          <TableCell>
                            <div>
                              <p className="text-xs font-semibold">{partner.name}</p>
                              <p className="text-[11px] text-muted-foreground">{new Date(partner.created_at).toLocaleDateString()}</p>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs">
                            <div>
                              <p>{partner.phone_number || "-"}</p>
                              <p className="text-[11px] text-muted-foreground">{partner.email || "-"}</p>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs font-medium">{partnerSourceLabel(partner)}</TableCell>
                          <TableCell className="text-xs font-semibold">{partnerPayoutLabel(partner)}</TableCell>
                          <TableCell>
                            <Switch
                              checked={partner.is_active}
                              onCheckedChange={() => togglePartnerActive(partner)}
                              aria-label={partner.is_active ? "Pause partner agreement" : "Activate partner agreement"}
                            />
                          </TableCell>
                          <TableCell>
                            <button onClick={() => deletePartner(partner.id)} className="text-muted-foreground hover:text-destructive transition-colors" aria-label="Delete partner">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      <Dialog open={isBranchOpen} onOpenChange={(open) => { setIsBranchOpen(open); if (!open) setSearchParams({}); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>New Branch</DialogTitle></DialogHeader>
          <form onSubmit={createBranch} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Branch name</Label>
              <Input value={branchName} onChange={(e) => setBranchName(e.target.value)} required placeholder="Kampala Branch" />
            </div>
            <Button type="submit" className="w-full h-9">Create branch</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Sheet open={isStaffOpen} onOpenChange={(open) => { setIsStaffOpen(open); if (!open) setSearchParams({}); }}>
        <SheetContent side="right" className="w-full sm:max-w-md flex flex-col gap-0 p-0">
          <SheetHeader className="px-6 py-5 border-b border-border/40">
            <SheetTitle>
              <div className="flex items-center gap-2.5">

                <div>
                  <p className="text-sm font-semibold">Add New Staff</p>
                  {selectedBranch && (
                    <p className="text-xs text-muted-foreground font-normal">Create New Agent for {selectedBranch.name} Branch</p>
                  )}
                </div>
              </div>
            </SheetTitle>
          </SheetHeader>
          <form onSubmit={createStaff} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Full name</Label>
              <Input placeholder="Jane Doe" value={staffForm.full_name} onChange={(e) => setStaffForm((p) => ({ ...p, full_name: e.target.value }))} required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Email address</Label>
              <Input type="email" placeholder="jane@example.com" value={staffForm.email} onChange={(e) => setStaffForm((p) => ({ ...p, email: e.target.value }))} required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Phone number <span className="text-muted-foreground">(optional)</span></Label>
              <Input placeholder="+256 700 000000" value={staffForm.phone_number} onChange={(e) => setStaffForm((p) => ({ ...p, phone_number: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Role</Label>
              <Select value={staffForm.role} onValueChange={(role) => setStaffForm((prev) => ({ ...prev, role }))}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {["admin", "manager", "support", "staff"].map((role) => (
                    <SelectItem key={role} value={role} className="text-xs capitalize">{role}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Revenue share (%) <span className="text-rose-400">*</span></Label>
              <Input type="number" min={0} max={100} step="0.1" value={staffForm.share_percentage} onChange={(e) => setStaffForm((p) => ({ ...p, share_percentage: Number(e.target.value) }))} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Allowed areas <span className="text-rose-500">*</span></Label>
              <div className="grid grid-cols-2 gap-2 rounded border border-border/60 p-3 bg-muted/20">
                {["routers", "sales", "vouchers", "support", "network", "captive"].map((permission) => (
                  <label key={permission} className="flex items-center gap-2 text-xs capitalize cursor-pointer">
                    <Checkbox
                      checked={staffForm.permissions.includes(permission)}
                      onCheckedChange={(checked) => setStaffForm((prev) => ({
                        ...prev,
                        permissions: checked
                          ? [...prev.permissions, permission]
                          : prev.permissions.filter((item) => item !== permission),
                      }))}
                    />
                    {permission}
                  </label>
                ))}
              </div>
            </div>
            <div className="pt-2">
              <Button type="submit" className="w-full h-9 gap-2">
                <UserPlus className="w-4 h-4" />
                Invite Agent
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      <Sheet open={isPartnerOpen} onOpenChange={(open) => { setIsPartnerOpen(open); if (!open) setSearchParams({}); }}>
        <SheetContent side="right" className="w-full sm:max-w-md flex flex-col gap-0 p-0">
          <SheetHeader className="px-6 py-5 border-b border-border/40">
            <SheetTitle>
              <div className="flex items-center gap-2.5">
                <div>
                  <p className="text-sm font-semibold">Add Partner</p>
                  {selectedBranch && (
                    <p className="text-xs text-muted-foreground font-normal">Configure revenue sharing for {selectedBranch.name}</p>
                  )}
                </div>
              </div>
            </SheetTitle>
          </SheetHeader>
          <form onSubmit={createPartner} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Partner name</Label>
              <Input placeholder="Partner company or person" value={partnerForm.name} onChange={(e) => setPartnerForm((p) => ({ ...p, name: e.target.value }))} required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Phone number <span className="text-muted-foreground">(optional)</span></Label>
              <Input placeholder="+256 700 000000" value={partnerForm.phone_number} onChange={(e) => setPartnerForm((p) => ({ ...p, phone_number: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Email address <span className="text-muted-foreground">(optional)</span></Label>
              <Input type="email" placeholder="partner@example.com" value={partnerForm.email} onChange={(e) => setPartnerForm((p) => ({ ...p, email: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Revenue source</Label>
              <div className="grid grid-cols-2 gap-2 rounded border border-border/60 p-3 bg-muted/20">
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <Checkbox
                    checked={partnerForm.applies_online}
                    onCheckedChange={(checked) => setPartnerForm((p) => ({ ...p, applies_online: Boolean(checked) }))}
                  />
                  Online payments
                </label>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <Checkbox
                    checked={partnerForm.applies_voucher}
                    onCheckedChange={(checked) => setPartnerForm((p) => ({ ...p, applies_voucher: Boolean(checked) }))}
                  />
                  Voucher sales
                </label>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Payout type</Label>
              <Select value={partnerForm.payout_mode} onValueChange={(payout_mode) => setPartnerForm((prev) => ({ ...prev, payout_mode: payout_mode as PartnerPayoutMode }))}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Select payout type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage" className="text-xs">Percentage share</SelectItem>
                  <SelectItem value="fixed" className="text-xs">Fixed amount</SelectItem>
                  <SelectItem value="daily" className="text-xs">Daily revenue amount</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {partnerForm.payout_mode === "percentage" && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Partner share (%)</Label>
                <Input type="number" min={0} max={100} step="0.1" value={partnerForm.percentage} onChange={(e) => setPartnerForm((p) => ({ ...p, percentage: Number(e.target.value) }))} />
              </div>
            )}
            {partnerForm.payout_mode === "fixed" && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Fixed amount</Label>
                <Input type="number" min={0} step="100" value={partnerForm.fixed_amount} onChange={(e) => setPartnerForm((p) => ({ ...p, fixed_amount: Number(e.target.value) }))} />
              </div>
            )}
            {partnerForm.payout_mode === "daily" && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Daily revenue amount</Label>
                <Input type="number" min={0} step="100" value={partnerForm.daily_revenue_amount} onChange={(e) => setPartnerForm((p) => ({ ...p, daily_revenue_amount: Number(e.target.value) }))} />
              </div>
            )}
            <div className="flex items-center justify-between rounded border border-border/60 p-3 bg-muted/20">
              <div>
                <Label className="text-xs font-medium">Agreement active</Label>
                <p className="text-[11px] text-muted-foreground">Inactive agreements stay saved but do not count for payouts.</p>
              </div>
              <Switch checked={partnerForm.is_active} onCheckedChange={(checked) => setPartnerForm((p) => ({ ...p, is_active: checked }))} />
            </div>
            <div className="pt-2">
              <Button type="submit" className="w-full h-9 gap-2">
                <Handshake className="w-4 h-4" />
                Save Partner Agreement
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      <Sheet open={isEditStaffOpen} onOpenChange={(open) => { setIsEditStaffOpen(open); if (!open) setEditingStaff(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-md flex flex-col gap-0 p-0">
          <SheetHeader className="px-6 py-5 border-b border-border/40">
            <SheetTitle>
              <div className="flex items-center gap-2.5">
                <div>
                  <p className="text-sm font-semibold">Edit Staff</p>
                  {editingStaff && (
                    <p className="text-xs text-muted-foreground font-normal">Update details for {editingStaff.full_name}</p>
                  )}
                </div>
              </div>
            </SheetTitle>
          </SheetHeader>
          <form onSubmit={updateStaff} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Full name</Label>
              <Input placeholder="Jane Doe" value={editForm.full_name} onChange={(e) => setEditForm((p) => ({ ...p, full_name: e.target.value }))} required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Email address</Label>
              <Input type="email" placeholder="jane@example.com" value={editForm.email} onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))} required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Phone number <span className="text-muted-foreground">(optional)</span></Label>
              <Input placeholder="+256 700 000000" value={editForm.phone_number} onChange={(e) => setEditForm((p) => ({ ...p, phone_number: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Role</Label>
              <Select value={editForm.role} onValueChange={(role) => setEditForm((prev) => ({ ...prev, role }))}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {["admin", "manager", "support", "staff"].map((role) => (
                    <SelectItem key={role} value={role} className="text-xs capitalize">{role}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Revenue share (%) <span className="text-rose-400">*</span></Label>
              <Input type="number" min={0} max={100} step="0.1" value={editForm.share_percentage} onChange={(e) => setEditForm((p) => ({ ...p, share_percentage: Number(e.target.value) }))} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Allowed areas <span className="text-rose-500">*</span></Label>
              <div className="grid grid-cols-2 gap-2 rounded border border-border/60 p-3 bg-muted/20">
                {["routers", "sales", "vouchers", "support", "network", "captive"].map((permission) => (
                  <label key={permission} className="flex items-center gap-2 text-xs capitalize cursor-pointer">
                    <Checkbox
                      checked={editForm.permissions.includes(permission)}
                      onCheckedChange={(checked) => setEditForm((prev) => ({
                        ...prev,
                        permissions: checked
                          ? [...prev.permissions, permission]
                          : prev.permissions.filter((item) => item !== permission),
                      }))}
                    />
                    {permission}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between rounded border border-border/60 p-3 bg-muted/20">
              <div>
                <Label className="text-xs font-medium">Account active</Label>
                <p className="text-[11px] text-muted-foreground">Deactivated agents lose access and stop earning revenue share.</p>
              </div>
              <Switch checked={editForm.is_active} onCheckedChange={(checked) => setEditForm((p) => ({ ...p, is_active: checked }))} />
            </div>
            <div className="pt-2">
              <Button type="submit" className="w-full h-9 gap-2">
                <Pencil className="w-4 h-4" />
                Save changes
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}

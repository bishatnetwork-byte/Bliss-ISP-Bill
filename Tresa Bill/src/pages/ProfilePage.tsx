import { renultApi } from "@/api/foreform";
import AppHeader from "@/components/Header/AppHeader";
import SEO from "@/components/SEO";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/lib/auth";
import { KeyRound, Loader2, Mail, Phone, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function ProfilePage() {
  const { user } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("sidebar-collapsed") === "true");
  const [branchName, setBranchName] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const handler = (event: Event) => {
      setSidebarCollapsed((event as CustomEvent<{ collapsed: boolean }>).detail.collapsed);
    };
    window.addEventListener("sidebar-collapse-change", handler);
    return () => window.removeEventListener("sidebar-collapse-change", handler);
  }, []);

  useEffect(() => {
    if (!user?.staff_branch_id) {
      setBranchName(null);
      return;
    }
    renultApi.branches.list()
      .then((branches) => {
        const branch = branches.find((item) => item.id === user.staff_branch_id);
        setBranchName(branch?.name || null);
      })
      .catch(() => setBranchName(null));
  }, [user?.staff_branch_id]);

  const handlePasswordSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setIsSaving(true);
    try {
      await renultApi.auth.setPassword({
        current_password: currentPassword || null,
        new_password: newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password updated");
    } catch (err: unknown) {
      toast.error(errorMessage(err, "Failed to update password"));
    } finally {
      setIsSaving(false);
    }
  };

  if (!user) return null;

  const initials = user.full_name
    ? user.full_name.split(" ").map((part) => part[0]).join("").toUpperCase().slice(0, 2)
    : user.email[0].toUpperCase();
  const isStaff = user.account_type === "staff";

  return (
    <div className={`min-h-screen bg-background transition-all duration-300 ${sidebarCollapsed ? "md:pl-[72px]" : "md:pl-[280px]"}`}>
      <SEO title="My Profile" path="/profile" />
      <AppHeader />
      <main className="px-4 sm:px-6 py-6 max-w-4xl mx-auto space-y-4">
        <div>
          <h1 className="text-lg font-semibold text-foreground">My Profile</h1>
          <p className="text-sm text-muted-foreground">View your account details and update your password.</p>
        </div>

        <Card className="border-border/20 shadow-none rounded-none">
          <CardContent className="p-6 flex flex-col sm:flex-row sm:items-center gap-4">
            <Avatar className="w-16 h-16">
              <AvatarImage src={user.avatar_url || undefined} />
              <AvatarFallback className="text-lg">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0 space-y-1">
              <p className="text-base font-semibold truncate">{user.full_name}</p>
              <p className="text-sm text-muted-foreground flex items-center gap-1.5 truncate">
                <Mail className="w-3.5 h-3.5 shrink-0" />
                {user.email}
              </p>
              {user.phone_number && (
                <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 shrink-0" />
                  {user.phone_number}
                </p>
              )}
            </div>
            <div className="flex flex-col items-start sm:items-end gap-2">
              <Badge variant="secondary" className="capitalize">
                {isStaff ? (user.staff_role || "Staff") : "Owner"}
              </Badge>
              {isStaff && branchName && (
                <span className="text-xs text-muted-foreground">Branch: {branchName}</span>
              )}
            </div>
          </CardContent>
        </Card>

        {isStaff && (
          <Card className="border-border/20 shadow-none rounded-none">
            <CardHeader className="border-b border-border/40">
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-primary" />
                Agent details
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground text-xs mb-1">Revenue share</p>
                <p className="font-semibold">{user.share_percentage}%</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs mb-1">Role</p>
                <p className="font-semibold capitalize">{user.staff_role || "Staff"}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs mb-1">Permissions</p>
                <p className="font-semibold capitalize">{user.staff_permissions?.join(", ") || "—"}</p>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="border-border/20 shadow-none rounded-none">
          <CardHeader className="border-b border-border/40">
            <CardTitle className="text-base flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-primary" />
              Change password
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <form onSubmit={handlePasswordSubmit} className="space-y-4 max-w-md">
              <div className="flex flex-col gap-1.5">
                <Label className="text-[13px] font-medium text-muted-foreground">Current password</Label>
                <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="••••••••" className="text-sm h-10 bg-card border-border/50" />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label className="text-[13px] font-medium text-muted-foreground">New password</Label>
                <Input type="password" minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••••" className="text-sm h-10 bg-card border-border/50" />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label className="text-[13px] font-medium text-muted-foreground">Confirm new password</Label>
                <Input type="password" minLength={8} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" className="text-sm h-10 bg-card border-border/50" />
              </div>

              <Separator className="bg-border/30" />

              <div className="flex items-center justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => { setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); }} className="h-9 text-[13px] font-medium border-border/50">
                  Cancel
                </Button>
                <Button disabled={isSaving} className="h-9 text-[13px] font-medium bg-primary hover:bg-primary/90">
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Update password
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

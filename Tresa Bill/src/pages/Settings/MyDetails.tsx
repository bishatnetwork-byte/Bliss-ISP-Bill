import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/lib/auth";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import SettingsLayout from "./SettingsLayout";
import { renultApi } from "@/api/foreform";

function splitName(name: string | undefined) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || "",
    lastName: parts.slice(1).join(" "),
  };
}

export default function MyDetailsPage() {
  const { user, refreshUser } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const names = useMemo(() => splitName(user?.full_name), [user?.full_name]);
  const [firstName, setFirstName] = useState(names.firstName);
  const [lastName, setLastName] = useState(names.lastName);
  const [phoneNumber, setPhoneNumber] = useState(user?.phone_number || "");

  useEffect(() => {
    setFirstName(names.firstName);
    setLastName(names.lastName);
    setPhoneNumber(user?.phone_number || "");
  }, [names.firstName, names.lastName, user?.phone_number]);

  const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
  const hasChanges =
    fullName !== (user?.full_name || "").trim() ||
    phoneNumber.trim() !== (user?.phone_number || "").trim();

  const resetForm = () => {
    setFirstName(names.firstName);
    setLastName(names.lastName);
    setPhoneNumber(user?.phone_number || "");
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshUser();
      toast.success("Account details refreshed");
    } catch {
      toast.error("Failed to refresh account details");
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (fullName.length < 2) {
      toast.error("Full name is required");
      return;
    }

    setIsSaving(true);
    try {
      await renultApi.auth.updateMe({
        full_name: fullName,
        phone_number: phoneNumber.trim() || null,
      });
      await refreshUser();
      toast.success("Profile updated");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SettingsLayout title="My Details">
      <div className="max-w-3xl mx-auto px-6 sm:px-10 py-8">
        <h1 className="text-lg font-semibold text-foreground mb-0.5">
          My Details
        </h1>
        <p className="text-sm text-muted-foreground mb-4">
          Update your personal information and account details
        </p>
        <Separator className="mb-8 bg-border/30" />

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* name row */}
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.2fr] gap-y-4 gap-x-12">
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-0.5">
                Full name
              </h3>
              <p className="text-[13px] text-muted-foreground">
                This will be displayed on your profile.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex-1 flex flex-col gap-1.5">
                <Label className="text-[13px] text-muted-foreground">First name</Label>
                <Input value={firstName} onChange={(event) => setFirstName(event.target.value)} className="text-sm h-10 bg-card border-border/50" autoComplete="given-name" />
              </div>
              <div className="flex-1 flex flex-col gap-1.5">
                <Label className="text-[13px] text-muted-foreground">Last name</Label>
                <Input value={lastName} onChange={(event) => setLastName(event.target.value)} className="text-sm h-10 bg-card border-border/50" autoComplete="family-name" />
              </div>
            </div>
          </div>

          <Separator className="bg-border/30" />

          {/* email row */}
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.2fr] gap-y-4 gap-x-12">
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-0.5">
                Email address
              </h3>
              <p className="text-[13px] text-muted-foreground">
                Used for sign-in and notifications.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Input value={user?.email || ""} className="text-sm h-10 bg-muted/40 border-border/50" readOnly disabled />
              <p className="text-[12px] text-muted-foreground">Email cannot be changed here.</p>
            </div>
          </div>

          <Separator className="bg-border/30" />

          {/* phone row */}
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.2fr] gap-y-4 gap-x-12">
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-0.5">
                Phone number
              </h3>
              <p className="text-[13px] text-muted-foreground">
                Used for account verification and branch alerts.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Input value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} className="text-sm h-10 bg-card border-border/50" autoComplete="tel" />
            </div>
          </div>

          <Separator className="bg-border/30" />

          {/* timezone row */}
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.2fr] gap-y-4 gap-x-12">
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-0.5">
                Timezone
              </h3>
              <p className="text-[13px] text-muted-foreground">
                Your local timezone for scheduling.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Input defaultValue="East Africa Time (UTC+3)" className="text-sm h-10 bg-card border-border/50" readOnly />
            </div>
          </div>

          <Separator className="bg-border/30" />

          {/* action buttons */}
          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={handleRefresh} disabled={isRefreshing || isSaving} className="h-9 text-[13px] font-medium border-border/50">
              {isRefreshing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Refresh details
            </Button>
            <Button type="button" variant="outline" onClick={resetForm} disabled={!hasChanges || isSaving} className="h-9 text-[13px] font-medium border-border/50">
              Reset changes
            </Button>
            <Button disabled={!hasChanges || isSaving} className="h-9 text-[13px] font-medium bg-primary hover:bg-primary/90">
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Save profile
            </Button>
          </div>
        </form>
      </div>
    </SettingsLayout>
  );
}

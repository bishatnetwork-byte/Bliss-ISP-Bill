import { SubscriptionPayload, SubscriptionResponse, renultApi } from "@/api/foreform";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { BellRing, CalendarClock, Loader2, Mail, MessageSquare, Pencil, Plus, Trash2 } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import SettingsLayout from "./SettingsLayout";

const blankForm: SubscriptionPayload = {
  name: "",
  provider: "",
  category: "ISP Bill",
  amount: 0,
  currency: "UGX",
  due_date: new Date().toISOString().slice(0, 10),
  alert_days_before: 3,
  notify_in_app: true,
  notify_email: false,
  notify_sms: false,
  sms_phone: "",
  notes: "",
  is_active: true,
};

const CATEGORY_OPTIONS = [
  "ISP Bill",
  "Hosting",
  "Domain",
  "Software",
  "Router Lease",
  "Electricity",
  "Rent",
  "Payroll",
  "Other",
];

function dueLabel(days: number) {
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `${days} days left`;
}

function dueClass(days: number) {
  if (days < 0) return "bg-destructive/10 text-destructive border-destructive/20";
  if (days <= 3) return "bg-amber-500/10 text-amber-600 border-amber-500/20";
  return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
}

function toPayload(row: SubscriptionResponse): SubscriptionPayload {
  return {
    name: row.name,
    provider: row.provider || "",
    category: row.category,
    amount: row.amount,
    currency: row.currency,
    due_date: row.due_date,
    alert_days_before: row.alert_days_before,
    notify_in_app: row.notify_in_app,
    notify_email: row.notify_email,
    notify_sms: row.notify_sms,
    sms_phone: row.sms_phone || "",
    notes: row.notes || "",
    is_active: row.is_active,
  };
}

export default function SubscriptionsPage() {
  const [items, setItems] = useState<SubscriptionResponse[]>([]);
  const [form, setForm] = useState<SubscriptionPayload>(blankForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const categorySelectValue = CATEGORY_OPTIONS.includes(form.category) ? form.category : "__custom__";

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => a.days_until_due - b.days_until_due),
    [items],
  );

  const loadSubscriptions = async () => {
    setIsLoading(true);
    try {
      setItems(await renultApi.subscriptions.list({ limit: 100 }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load subscriptions");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSubscriptions();
  }, []);

  const updateForm = <K extends keyof SubscriptionPayload>(key: K, value: SubscriptionPayload[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const resetForm = () => {
    setForm(blankForm);
    setEditingId(null);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) {
      toast.error("Enter a subscription name");
      return;
    }
    setIsSaving(true);
    const payload = {
      ...form,
      provider: form.provider?.trim() || null,
      sms_phone: form.sms_phone?.trim() || null,
      notes: form.notes?.trim() || null,
      amount: Number(form.amount || 0),
      alert_days_before: Number(form.alert_days_before || 0),
    };
    try {
      if (editingId) {
        await renultApi.subscriptions.update(editingId, payload);
        toast.success("Subscription updated");
      } else {
        await renultApi.subscriptions.create(payload);
        toast.success("Subscription saved");
      }
      resetForm();
      await loadSubscriptions();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save subscription");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (item: SubscriptionResponse) => {
    if (!window.confirm(`Delete ${item.name}?`)) return;
    try {
      await renultApi.subscriptions.delete(item.id);
      toast.success("Subscription deleted");
      setItems((current) => current.filter((row) => row.id !== item.id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete subscription");
    }
  };

  const handleNotify = async (item: SubscriptionResponse) => {
    try {
      const result = await renultApi.subscriptions.notify(item.id);
      toast.success(result.message);
      await loadSubscriptions();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send reminder");
    }
  };

  return (
    <SettingsLayout title="Subscription Reminders">
      <div className="mx-auto max-w-6xl px-6 py-8 sm:px-10">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Subscriptions</h1>
            <p className="mt-1 text-sm text-muted-foreground">Track ISP bills, hosting, software, and other recurring payments.</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="w-fit rounded">{items.length} saved</Badge>
            <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs" onClick={resetForm}>
              <Plus className="h-3.5 w-3.5" />
              New bill
            </Button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <form onSubmit={handleSubmit} className="h-fit rounded border border-border/20 bg-card p-5 lg:sticky lg:top-20 lg:order-2">
            <div className="mb-4 flex items-center gap-2">
              <Plus className="h-4 w-4 text-primary" />
              <div>
                <h2 className="text-sm font-semibold">{editingId ? "Edit subscription" : "Add subscription"}</h2>
                <p className="mt-0.5 text-[11px] text-muted-foreground">Right panel for quick bill setup.</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="sub-name">Name</Label>
                <Input id="sub-name" value={form.name} onChange={(event) => updateForm("name", event.target.value)} placeholder="Internet subscription" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="sub-provider">Provider</Label>
                  <Input id="sub-provider" value={form.provider || ""} onChange={(event) => updateForm("provider", event.target.value)} placeholder="MTN, Airtel..." />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="sub-category">Category</Label>
                  <Select
                    value={categorySelectValue}
                    onValueChange={(value) => updateForm("category", value === "__custom__" ? "" : value)}
                  >
                    <SelectTrigger id="sub-category">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORY_OPTIONS.map((category) => (
                        <SelectItem key={category} value={category}>{category}</SelectItem>
                      ))}
                      <SelectItem value="__custom__">Custom category</SelectItem>
                    </SelectContent>
                  </Select>
                  {categorySelectValue === "__custom__" && (
                    <Input
                      value={form.category}
                      onChange={(event) => updateForm("category", event.target.value)}
                      placeholder="Type category"
                    />
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="sub-amount">Amount</Label>
                  <Input id="sub-amount" type="number" min="0" value={form.amount} onChange={(event) => updateForm("amount", Number(event.target.value))} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="sub-currency">Currency</Label>
                  <Input id="sub-currency" value={form.currency} onChange={(event) => updateForm("currency", event.target.value.toUpperCase())} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="sub-due-date">Due date</Label>
                  <Input id="sub-due-date" type="date" value={form.due_date} onChange={(event) => updateForm("due_date", event.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="sub-alert-days">Alert days before</Label>
                  <Input id="sub-alert-days" type="number" min="0" max="60" value={form.alert_days_before} onChange={(event) => updateForm("alert_days_before", Number(event.target.value))} />
                </div>
              </div>

              <div className="space-y-3 rounded border border-border/20 bg-muted/20 p-3">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="notify-app" className="flex items-center gap-2 text-xs"><BellRing className="h-3.5 w-3.5" /> In-app</Label>
                  <Switch id="notify-app" checked={form.notify_in_app} onCheckedChange={(value) => updateForm("notify_in_app", value)} />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="notify-email" className="flex items-center gap-2 text-xs"><Mail className="h-3.5 w-3.5" /> Email</Label>
                  <Switch id="notify-email" checked={form.notify_email} onCheckedChange={(value) => updateForm("notify_email", value)} />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="notify-sms" className="flex items-center gap-2 text-xs"><MessageSquare className="h-3.5 w-3.5" /> SMS</Label>
                  <Switch id="notify-sms" checked={form.notify_sms} onCheckedChange={(value) => updateForm("notify_sms", value)} />
                </div>
                {form.notify_sms && (
                  <Input value={form.sms_phone || ""} onChange={(event) => updateForm("sms_phone", event.target.value)} placeholder="+256 7XX XXX XXX" />
                )}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="sub-notes">Notes</Label>
                <Textarea id="sub-notes" value={form.notes || ""} onChange={(event) => updateForm("notes", event.target.value)} placeholder="Account number, plan, or payment instructions" />
              </div>

              <div className="flex items-center justify-between rounded border border-border/20 px-3 py-2">
                <Label htmlFor="sub-active" className="text-xs">Active reminder</Label>
                <Switch id="sub-active" checked={form.is_active} onCheckedChange={(value) => updateForm("is_active", value)} />
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={isSaving} className="flex-1">
                  {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editingId ? "Save changes" : "Add subscription"}
                </Button>
                {editingId && (
                  <Button type="button" variant="outline" onClick={resetForm}>Cancel</Button>
                )}
              </div>
            </div>
          </form>

          <div className="rounded border border-border/20 bg-card lg:order-1">
            <div className="flex items-center justify-between border-b border-border/20 px-5 py-4">
              <h2 className="text-sm font-semibold">Upcoming bills</h2>
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
            </div>

            {isLoading ? (
              <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading subscriptions...
              </div>
            ) : sortedItems.length === 0 ? (
              <div className="flex h-40 items-center justify-center px-6 text-center text-sm text-muted-foreground">
                No subscriptions yet. Add your ISP bill or any recurring payment to start the countdown.
              </div>
            ) : (
              <div className="divide-y divide-border/20">
                {sortedItems.map((item) => (
                  <div key={item.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-sm font-semibold">{item.name}</h3>
                        <Badge variant="outline" className={`rounded ${dueClass(item.days_until_due)}`}>{dueLabel(item.days_until_due)}</Badge>
                        {!item.is_active && <Badge variant="secondary" className="rounded">Paused</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {item.provider || item.category} · {item.currency} {item.amount.toLocaleString()} · Due {new Date(`${item.due_date}T00:00:00`).toLocaleDateString()}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Alerts: {item.alert_days_before} day(s) before · {[
                          item.notify_in_app && "app",
                          item.notify_email && "email",
                          item.notify_sms && "sms",
                        ].filter(Boolean).join(", ") || "none"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => handleNotify(item)}>
                        Remind now
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingId(item.id); setForm(toPayload(item)); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(item)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </SettingsLayout>
  );
}

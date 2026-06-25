import { MessageActivityResponse, MessageContactResponse } from "@/api/foreform";
import AppHeader from "@/components/Header/AppHeader";
import SEO from "@/components/SEO";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useBulkSms } from "@/hooks/useBulkSms";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock3,
  CreditCard,
  Loader2,
  MessageSquareText,
  Plus,
  Search,
  Send,
  Settings2,
  Smartphone,
  Users,
  Wallet,
  X,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const VOUCHER_TEMPLATE = "{wifi_name}: your Wi-Fi voucher code is {code}.";
const LOW_BALANCE_THRESHOLD = 1000;

function normalizeUgandanPhone(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("256") && digits.length === 12) return `+${digits}`;
  if (digits.startsWith("0") && digits.length === 10) return `+256${digits.slice(1)}`;
  if (digits.startsWith("7") && digits.length === 9) return `+256${digits}`;
  return null;
}

function renderPreview(message: string, contact?: MessageContactResponse) {
  return message
    .replaceAll("{wifi_name}", contact?.wifi_name || "WIFI NAME")
    .replaceAll("{code}", contact?.voucher_code || "ABC123")
    .replaceAll("{}", contact?.voucher_code || "ABC123");
}

function statusStyle(status: MessageActivityResponse["status"]) {
  if (status === "completed") return "border-emerald-500/20 bg-emerald-500/10 text-emerald-700";
  if (status === "partial") return "border-amber-500/20 bg-amber-500/10 text-amber-700";
  if (status === "failed") return "border-destructive/20 bg-destructive/10 text-destructive";
  return "border-blue-500/20 bg-blue-500/10 text-blue-700";
}

function BulkSmsSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="space-y-2 rounded border p-3">
          <div className="flex items-center justify-between gap-4">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-5 w-20" />
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}

export default function BulkSMSPage() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("sidebar-collapsed") === "true",
  );
  const [branchId, setBranchId] = useState(
    () => localStorage.getItem("selected-workspace") || "",
  );
  const [composerOpen, setComposerOpen] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [contactPickerOpen, setContactPickerOpen] = useState(false);
  const [manualNumber, setManualNumber] = useState("");
  const [selectedNumbers, setSelectedNumbers] = useState<string[]>([]);
  const [messageType, setMessageType] = useState<"custom" | "voucher">("voucher");
  const [message, setMessage] = useState(VOUCHER_TEMPLATE);
  const [thresholdInput, setThresholdInput] = useState(String(LOW_BALANCE_THRESHOLD));

  const bulkSms = useBulkSms(branchId);
  const contacts = bulkSms.contacts.data?.contacts || [];
  const walletBalance = bulkSms.wallet.data?.balance || 0;
  const smsCost = bulkSms.settings.data?.sms_cost_ugx || 0;
  const lowBalanceThreshold = bulkSms.settings.data?.low_balance_threshold || LOW_BALANCE_THRESHOLD;
  const isWalletLow = Boolean(branchId) && !bulkSms.wallet.isLoading && walletBalance < lowBalanceThreshold;

  useEffect(() => {
    const collapseHandler = (event: Event) => {
      setSidebarCollapsed((event as CustomEvent<{ collapsed: boolean }>).detail.collapsed);
    };
    const branchHandler = (event: Event) => {
      setBranchId((event as CustomEvent<{ id?: string }>).detail?.id || "");
      setSelectedNumbers([]);
    };
    window.addEventListener("sidebar-collapse-change", collapseHandler);
    window.addEventListener("renult-branch-change", branchHandler);
    return () => {
      window.removeEventListener("sidebar-collapse-change", collapseHandler);
      window.removeEventListener("renult-branch-change", branchHandler);
    };
  }, []);

  useEffect(() => {
    if (!bulkSms.draft.data) return;
    setMessage(bulkSms.draft.data.message || VOUCHER_TEMPLATE);
    setMessageType(bulkSms.draft.data.message_type);
    setSelectedNumbers(bulkSms.draft.data.recipients);
  }, [bulkSms.draft.data]);

  useEffect(() => {
    if (bulkSms.settings.data?.low_balance_threshold) {
      setThresholdInput(String(bulkSms.settings.data.low_balance_threshold));
    }
  }, [bulkSms.settings.data?.low_balance_threshold]);

  useEffect(() => {
    if (!branchId || !bulkSms.draft.isSuccess || bulkSms.send.isPending) return;
    const timer = window.setTimeout(() => {
      bulkSms.saveDraft.mutate({
        message,
        message_type: messageType,
        recipients: selectedNumbers,
      });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [branchId, bulkSms.draft.isSuccess, bulkSms.send.isPending, message, messageType, selectedNumbers]);

  const contactNumbers = useMemo(() => new Set(contacts.map((contact) => contact.phone_number)), [contacts]);
  const filteredContacts = useMemo(() => {
    const query = contactSearch.trim().toLowerCase();
    if (!query) return contacts;
    return contacts.filter((contact) =>
      contact.phone_number.toLowerCase().includes(query) ||
      contact.wifi_name.toLowerCase().includes(query) ||
      contact.voucher_code.toLowerCase().includes(query),
    );
  }, [contactSearch, contacts]);
  const selectedContacts = useMemo(
    () => contacts.filter((contact) => selectedNumbers.includes(contact.phone_number)),
    [contacts, selectedNumbers],
  );
  const activities = bulkSms.activity.data?.activities || [];
  const sentTotal = activities.reduce((sum, item) => sum + item.sent, 0);
  const failedTotal = activities.reduce((sum, item) => sum + item.failed, 0);

  const addNumber = (phoneNumber: string) => {
    setSelectedNumbers((current) => {
      if (current.includes(phoneNumber)) return current;
      if (current.length >= 100) {
        toast.error("You can send to up to 100 numbers at a time.");
        return current;
      }
      return [...current, phoneNumber];
    });
  };

  const toggleContact = (phoneNumber: string) => {
    setSelectedNumbers((current) =>
      current.includes(phoneNumber)
        ? current.filter((number) => number !== phoneNumber)
        : current.length < 100
          ? [...current, phoneNumber]
          : current,
    );
  };

  const addManualNumber = () => {
    const normalized = normalizeUgandanPhone(manualNumber);
    if (!normalized) {
      toast.error("Enter a valid Ugandan number, for example 0772 123 456.");
      return;
    }
    if (messageType === "voucher" && !contactNumbers.has(normalized)) {
      toast.error("Voucher-code SMS requires a customer with an existing voucher.");
      return;
    }
    addNumber(normalized);
    setManualNumber("");
  };

  const selectAllFiltered = () => {
    const visibleNumbers = filteredContacts.map((contact) => contact.phone_number);
    const allSelected = visibleNumbers.every((number) => selectedNumbers.includes(number));
    setSelectedNumbers((current) =>
      allSelected
        ? current.filter((number) => !visibleNumbers.includes(number))
        : Array.from(new Set([...current, ...visibleNumbers])).slice(0, 100),
    );
  };

  const changeMessageType = (value: "custom" | "voucher") => {
    setMessageType(value);
    setMessage(value === "voucher" ? VOUCHER_TEMPLATE : "");
    if (value === "voucher") {
      setSelectedNumbers((current) => current.filter((number) => contactNumbers.has(number)));
    }
  };

  const hasVoucherCodePlaceholder = message.includes("{code}") || message.includes("{}");
  const estimatedCost = (smsCost || 0) * selectedNumbers.length;
  const canSend =
    Boolean(branchId) &&
    selectedNumbers.length > 0 &&
    Boolean(message.trim()) &&
    (messageType === "custom" || hasVoucherCodePlaceholder) &&
    walletBalance >= Math.max(smsCost, estimatedCost) &&
    !bulkSms.send.isPending;

  const handleSend = async () => {
    if (!canSend) return;
    try {
      const response = await bulkSms.send.mutateAsync({
        phone_numbers: selectedNumbers,
        message: message.trim(),
        use_voucher_template: messageType === "voucher",
      });
      setComposerOpen(false);
      setSelectedNumbers([]);
      const note = response.total_charged
        ? ` UGX ${response.total_charged.toLocaleString()} deducted.`
        : "";
      if (response.failed) toast.warning(`${response.sent} sent, ${response.failed} failed.${note}`);
      else toast.success(`Bulk SMS sent to ${response.sent} recipient${response.sent === 1 ? "" : "s"}.${note}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send Bulk SMS.");
    }
  };

  const saveAutomation = (patch: Partial<{
    voucher_sms_enabled: boolean;
    low_balance_sms_enabled: boolean;
    low_balance_threshold: number;
    admin_buy_for_sms_enabled: boolean;
  }>) => {
    const current = bulkSms.settings.data;
    bulkSms.saveSettings.mutate({
      voucher_sms_enabled: patch.voucher_sms_enabled ?? current?.voucher_sms_enabled ?? false,
      low_balance_sms_enabled: patch.low_balance_sms_enabled ?? current?.low_balance_sms_enabled ?? false,
      low_balance_threshold: patch.low_balance_threshold ?? current?.low_balance_threshold ?? LOW_BALANCE_THRESHOLD,
      admin_buy_for_sms_enabled: patch.admin_buy_for_sms_enabled ?? current?.admin_buy_for_sms_enabled ?? false,
    }, {
      onSuccess: () => toast.success("Bulk SMS settings saved."),
      onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save settings."),
    });
  };
  const saveThreshold = () => {
    saveAutomation({ low_balance_threshold: Number(thresholdInput) || LOW_BALANCE_THRESHOLD });
  };

  return (
    <div className={cn("min-h-screen bg-background transition-all duration-300", sidebarCollapsed ? "md:pl-[72px]" : "md:pl-[280px]")}>
      <SEO title="Bulk SMS" />
      <AppHeader />
      <main className="mx-auto max-w-7xl space-y-5 px-4 py-5 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl font-bold">Bulk SMS</h1>
            <p className="mt-1 text-sm text-muted-foreground">Send voucher codes to customers and control captive-portal SMS automation.</p>
          </div>
          <Button className="gap-2" onClick={() => setComposerOpen(true)}>
            <Plus className="h-4 w-4" />
            Compose
          </Button>
        </div>

        {isWalletLow && (
          <Alert className="border-red-200 bg-red-50 text-red-900">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>SMS wallet balance is low</AlertTitle>
            <AlertDescription>
              This branch has UGX {walletBalance.toLocaleString()}. The sidebar Bulk SMS icon flashes until the balance is at least UGX {lowBalanceThreshold.toLocaleString()}.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-3 md:grid-cols-4">
          <Card className="rounded border-primary/10 shadow-none">
            <CardContent className="flex items-center justify-between p-4">
              <div><p className="text-xs text-muted-foreground">SMS wallet</p><p className="mt-1 text-2xl font-bold">UGX {walletBalance.toLocaleString()}</p></div>
              <Wallet className={cn("h-7 w-7", isWalletLow ? "text-red-500" : "text-primary/40")} />
            </CardContent>
          </Card>
          <Card className="rounded border-primary/10 shadow-none">
            <CardContent className="flex items-center justify-between p-4">
              <div><p className="text-xs text-muted-foreground">Voucher contacts</p><p className="mt-1 text-2xl font-bold">{bulkSms.contacts.data?.total || 0}</p></div>
              <Users className="h-7 w-7 text-primary/40" />
            </CardContent>
          </Card>
          <Card className="rounded border-primary/10 shadow-none">
            <CardContent className="flex items-center justify-between p-4">
              <div><p className="text-xs text-muted-foreground">SMS sent</p><p className="mt-1 text-2xl font-bold">{sentTotal}</p></div>
              <CheckCircle2 className="h-7 w-7 text-emerald-500/50" />
            </CardContent>
          </Card>
          <Card className="rounded border-primary/10 shadow-none">
            <CardContent className="flex items-center justify-between p-4">
              <div><p className="text-xs text-muted-foreground">Failed</p><p className="mt-1 text-2xl font-bold">{failedTotal}</p></div>
              <XCircle className="h-7 w-7 text-destructive/50" />
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
          <Card className="rounded border-primary/10 shadow-none">
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2 text-sm">
                <MessageSquareText className="h-4 w-4 text-primary" />
                Delivery history
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {bulkSms.activity.isLoading ? <BulkSmsSkeleton /> : activities.length === 0 ? (
                <div className="flex min-h-64 flex-col items-center justify-center px-5 text-center">
                  <MessageSquareText className="h-10 w-10 text-muted-foreground/30" />
                  <p className="mt-3 text-sm font-medium">No Bulk SMS yet</p>
                  <p className="mt-1 text-xs text-muted-foreground">Compose a message or enable captive-portal voucher SMS.</p>
                </div>
              ) : (
                <div className="divide-y">
                  {activities.map((activity) => {
                    const completed = activity.sent + activity.failed;
                    const progress = activity.status === "sending" ? 55 : Math.round((completed / Math.max(activity.recipients.length, 1)) * 100);
                    return (
                      <div key={activity.id} className="space-y-3 p-4 sm:p-5">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline" className={statusStyle(activity.status)}>
                                {activity.status === "sending" && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                                {activity.status}
                              </Badge>
                              <Badge variant="secondary">{activity.message_type === "voucher" ? "Voucher code" : "Custom"}</Badge>
                            </div>
                            <p className="mt-2 line-clamp-2 text-sm">{renderPreview(activity.message, contacts.find((contact) => activity.recipients.includes(contact.phone_number)))}</p>
                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {activity.recipients.length} recipients</span>
                              <span className="flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" /> {new Date(activity.created_at).toLocaleString()}</span>
                              <span>UGX {activity.total_charged.toLocaleString()} charged</span>
                            </div>
                          </div>
                          <div className="flex gap-4 text-xs">
                            <span className="text-emerald-600">{activity.sent} sent</span>
                            <span className="text-destructive">{activity.failed} failed</span>
                          </div>
                        </div>
                        <Progress value={progress} className="h-1.5" />
                        {activity.error && <p className="text-xs text-destructive">{activity.error}</p>}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded border-primary/10 shadow-none">
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Settings2 className="h-4 w-4 text-primary" />
                Automation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 p-4">
              {bulkSms.settings.isLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">Send voucher code after portal purchase</p>
                      <p className="text-xs text-muted-foreground">Off by default. Uses wallet balance for each SMS.</p>
                    </div>
                    <Switch
                      checked={bulkSms.settings.data?.voucher_sms_enabled || false}
                      onCheckedChange={(checked) => saveAutomation({ voucher_sms_enabled: checked })}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">Low-balance SMS warning</p>
                      <p className="text-xs text-muted-foreground">Stops auto voucher SMS and warns the account phone when balance is low.</p>
                    </div>
                    <Switch
                      checked={bulkSms.settings.data?.low_balance_sms_enabled || false}
                      onCheckedChange={(checked) => saveAutomation({ low_balance_sms_enabled: checked })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="low-balance">Warning threshold</Label>
                    <Input
                      id="low-balance"
                      type="number"
                      min={smsCost || 1}
                      value={thresholdInput}
                      onBlur={saveThreshold}
                      onChange={(event) => setThresholdInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.currentTarget.blur();
                        }
                      }}
                    />
                  </div>
                  {/* <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">Admin buy-for-user SMS</p>
                      <p className="text-xs text-muted-foreground">Default is off for purchases made on behalf of another customer.</p>
                    </div>
                    <Switch
                      checked={bulkSms.settings.data?.admin_buy_for_sms_enabled || false}
                      onCheckedChange={(checked) => saveAutomation({ admin_buy_for_sms_enabled: checked })}
                    />
                  </div> */}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      <Sheet open={composerOpen} onOpenChange={setComposerOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
          <SheetHeader className="border-b px-6 py-5">
            <SheetTitle>Compose Bulk SMS</SheetTitle>
            <SheetDescription>Select customers with voucher codes or add a Ugandan mobile number.</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <div className="space-y-2">
              <Label>Message type</Label>
              <Select value={messageType} onValueChange={(value) => changeMessageType(value as "custom" | "voucher")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="voucher">Voucher code</SelectItem>
                  <SelectItem value="custom">Custom SMS</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Recipients</Label>
              <Popover open={contactPickerOpen} onOpenChange={setContactPickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-11 w-full justify-between font-normal" disabled={!branchId}>
                    <span>{selectedNumbers.length ? `${selectedNumbers.length} selected` : "Search voucher customers"}</span>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
                  <div className="flex items-center border-b px-3">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <Input value={contactSearch} onChange={(event) => setContactSearch(event.target.value)} placeholder="Search phone, Wi-Fi, or code" className="border-0 shadow-none focus-visible:ring-0" />
                  </div>
                  <div className="flex items-center justify-between border-b px-3 py-2">
                    <span className="text-xs text-muted-foreground">{filteredContacts.length} contacts</span>
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={selectAllFiltered}>Select all</Button>
                  </div>
                  <ScrollArea className="h-64">
                    <div className="p-1.5">
                      {bulkSms.contacts.isLoading && <BulkSmsSkeleton />}
                      {!bulkSms.contacts.isLoading && filteredContacts.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No contacts found.</p>}
                      {filteredContacts.map((contact) => (
                        <button key={contact.phone_number} type="button" onClick={() => toggleContact(contact.phone_number)} className="flex w-full items-center gap-3 rounded px-2.5 py-2 text-left hover:bg-muted">
                          <Checkbox checked={selectedNumbers.includes(contact.phone_number)} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{contact.phone_number}</p>
                            <p className="truncate text-xs text-muted-foreground">{contact.wifi_name} · {contact.voucher_code}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label htmlFor="manual-number">Add Ugandan number</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Smartphone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input id="manual-number" inputMode="tel" value={manualNumber} onChange={(event) => setManualNumber(event.target.value.replace(/[^\d+\s-]/g, ""))} placeholder="0772 123 456" className="pl-9" />
                </div>
                <Button type="button" variant="outline" onClick={addManualNumber}>Add</Button>
              </div>
            </div>

            {selectedNumbers.length > 0 && (
              <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto rounded border bg-muted/20 p-2">
                {selectedNumbers.map((phoneNumber) => (
                  <Badge key={phoneNumber} variant="secondary" className="gap-1 font-mono font-normal">
                    {phoneNumber}
                    <button type="button" onClick={() => toggleContact(phoneNumber)} aria-label={`Remove ${phoneNumber}`}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="bulk-message">Message</Label>
              <Textarea id="bulk-message" value={message} onChange={(event) => setMessage(event.target.value)} maxLength={1000} rows={6} className="resize-none" />
              {messageType === "voucher" && !hasVoucherCodePlaceholder && <p className="text-xs text-amber-600">Add {"{code}"} or {"{}"} to include each customer's voucher code.</p>}
            </div>

            <div className="space-y-2">
              <Label>Preview</Label>
              <div className="rounded-2xl rounded-bl-sm bg-primary px-4 py-3 text-sm leading-6 text-primary-foreground">
                {renderPreview(message || "Your message will appear here.", selectedContacts[0])}
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{message.length}/1000 characters</span>
                <span>Est. UGX {estimatedCost.toLocaleString()}</span>
              </div>
            </div>
          </div>
          <div className="border-t bg-background px-6 py-4">
            {walletBalance < estimatedCost && <p className="mb-2 text-center text-xs text-destructive">Wallet balance is too low for this send.</p>}
            <Button className="h-11 w-full gap-2" disabled={!canSend} onClick={handleSend}>
              {bulkSms.send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send to {selectedNumbers.length} number{selectedNumbers.length === 1 ? "" : "s"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

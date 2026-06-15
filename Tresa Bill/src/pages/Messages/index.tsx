import {
  BulkMessageResponse,
  MessageActivityResponse,
  MessageContactResponse,
  renultApi,
} from "@/api/foreform";
import AppHeader from "@/components/Header/AppHeader";
import SEO from "@/components/SEO";
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ChevronDown,
  Clock3,
  Loader2,
  MessageSquareText,
  Plus,
  Search,
  Send,
  Smartphone,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const VOUCHER_TEMPLATE = "{wifi_name}: YOUR CODE IS {code}.";

type MessageStatus = "sending" | "completed" | "partial" | "failed";

interface MessageActivity {
  id: string;
  createdAt: string;
  message: string;
  recipients: string[];
  type: "custom" | "voucher";
  status: MessageStatus;
  response?: BulkMessageResponse;
  error?: string;
}

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

function statusStyle(status: MessageStatus) {
  if (status === "completed") return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
  if (status === "partial") return "bg-amber-500/10 text-amber-600 border-amber-500/20";
  if (status === "failed") return "bg-destructive/10 text-destructive border-destructive/20";
  return "bg-blue-500/10 text-blue-600 border-blue-500/20";
}

function mapActivity(activity: MessageActivityResponse): MessageActivity {
  return {
    id: activity.id,
    createdAt: activity.created_at,
    message: activity.message,
    recipients: activity.recipients,
    type: activity.message_type,
    status: activity.status,
    error: activity.error || undefined,
    response: {
      id: activity.id,
      success: activity.status === "completed",
      sent: activity.sent,
      failed: activity.failed,
      results: activity.results,
      cost_per_sms: activity.cost_per_sms,
      total_charged: activity.total_charged,
      wallet_balance: activity.wallet_balance,
      created_at: activity.created_at,
    },
  };
}

export default function MessagesPage() {
  const queryClient = useQueryClient();
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

  useEffect(() => {
    const collapseHandler = (event: Event) => {
      setSidebarCollapsed((event as CustomEvent<{ collapsed: boolean }>).detail.collapsed);
    };
    const branchHandler = (event: Event) => {
      const nextBranchId = (event as CustomEvent<{ id?: string }>).detail?.id || "";
      setBranchId(nextBranchId);
      setSelectedNumbers([]);
    };
    window.addEventListener("sidebar-collapse-change", collapseHandler);
    window.addEventListener("renult-branch-change", branchHandler);
    return () => {
      window.removeEventListener("sidebar-collapse-change", collapseHandler);
      window.removeEventListener("renult-branch-change", branchHandler);
    };
  }, []);

  const contactsQuery = useQuery({
    queryKey: ["messageContacts", branchId],
    queryFn: () => renultApi.messages.contacts(branchId, { limit: 500 }),
    enabled: Boolean(branchId),
  });
  const activitiesQuery = useQuery({
    queryKey: ["messageActivity", branchId],
    queryFn: () => renultApi.messages.activity(branchId),
    enabled: Boolean(branchId),
    refetchInterval: 15000,
  });
  const draftQuery = useQuery({
    queryKey: ["messageDraft", branchId],
    queryFn: () => renultApi.messages.draft(branchId),
    enabled: Boolean(branchId),
  });
  const activities = useMemo(
    () => (activitiesQuery.data?.activities || []).map(mapActivity),
    [activitiesQuery.data?.activities],
  );

  useEffect(() => {
    if (!draftQuery.data) return;
    setMessage(draftQuery.data.message || VOUCHER_TEMPLATE);
    setMessageType(draftQuery.data.message_type);
    setSelectedNumbers(draftQuery.data.recipients);
  }, [draftQuery.data]);

  const preferencesQuery = useQuery({
    queryKey: ["notificationPreferences"],
    queryFn: () => renultApi.monitoring.preferences(),
    staleTime: 5 * 60 * 1000,
  });
  const costPerSms = preferencesQuery.data?.sms_cost_ugx || 0;

  const contacts = useMemo(
    () => contactsQuery.data?.contacts || [],
    [contactsQuery.data?.contacts],
  );
  const contactNumbers = useMemo(
    () => new Set(contacts.map((contact) => contact.phone_number)),
    [contacts],
  );
  const filteredContacts = useMemo(() => {
    const query = contactSearch.trim().toLowerCase();
    if (!query) return contacts;
    return contacts.filter(
      (contact) =>
        contact.phone_number.toLowerCase().includes(query) ||
        contact.wifi_name.toLowerCase().includes(query) ||
        contact.voucher_code.toLowerCase().includes(query),
    );
  }, [contactSearch, contacts]);

  const selectedContacts = useMemo(
    () => contacts.filter((contact) => selectedNumbers.includes(contact.phone_number)),
    [contacts, selectedNumbers],
  );

  const sendMutation = useMutation({
    mutationFn: (payload: { phoneNumbers: string[]; body: string; useVoucherTemplate: boolean }) =>
      renultApi.messages.send(branchId, {
        phone_numbers: payload.phoneNumbers,
        message: payload.body,
        use_voucher_template: payload.useVoucherTemplate,
      }),
  });

  useEffect(() => {
    if (!branchId || !draftQuery.isSuccess || sendMutation.isPending) return;
    const timer = window.setTimeout(() => {
      renultApi.messages.saveDraft(branchId, {
        message,
        message_type: messageType,
        recipients: selectedNumbers,
      }).then((draft) => {
        queryClient.setQueryData(["messageDraft", branchId], draft);
      }).catch(() => undefined);
    }, 700);
    return () => window.clearTimeout(timer);
  }, [branchId, draftQuery.isSuccess, message, messageType, queryClient, selectedNumbers, sendMutation.isPending]);

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
      toast.error("Token messages can only be sent to customers with a saved voucher.");
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

  const firstContact = selectedContacts[0];
  const preview = renderPreview(message || "Your message will appear here.", firstContact);
  const hasVoucherCodePlaceholder = message.includes("{code}") || message.includes("{}");
  const canSend =
    Boolean(branchId) &&
    selectedNumbers.length > 0 &&
    Boolean(message.trim()) &&
    (messageType === "custom" || hasVoucherCodePlaceholder) &&
    !sendMutation.isPending;

  const handleSend = async () => {
    if (!canSend) return;
    const phoneNumbers = [...selectedNumbers];
    const body = message.trim();
    setComposerOpen(false);

    try {
      const response = await sendMutation.mutateAsync({
        phoneNumbers,
        body,
        useVoucherTemplate: messageType === "voucher",
      });
      await queryClient.invalidateQueries({ queryKey: ["messageActivity", branchId] });
      await queryClient.invalidateQueries({ queryKey: ["messageDraft", branchId] });
      const costNote = response.total_charged
        ? ` ${response.total_charged} UGX deducted from the branch wallet (balance: ${response.wallet_balance} UGX).`
        : "";
      if (response.failed) toast.warning(`${response.sent} sent, ${response.failed} failed.${costNote}`);
      else toast.success(`Message submitted to ${response.sent} number${response.sent === 1 ? "" : "s"}.${costNote}`);
      setSelectedNumbers([]);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Could not send messages.";
      await queryClient.invalidateQueries({ queryKey: ["messageActivity", branchId] });
      toast.error(errorMessage);
    }
  };

  const totalSubmitted = activities.reduce((sum, item) => sum + (item.response?.sent || 0), 0);
  const totalFailed = activities.reduce((sum, item) => sum + (item.response?.failed || 0), 0);

  return (
    <div
      className={cn(
        "min-h-screen bg-background transition-all duration-300",
        sidebarCollapsed ? "md:pl-[72px]" : "md:pl-[280px]",
      )}
    >
      <SEO title="Customer Messages" />
      <AppHeader />

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-5 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl font-bold">Customer Messages</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Track bulk SMS delivery and send messages to customers or any Ugandan number.
            </p>
          </div>
          <Button className="gap-2" onClick={() => setComposerOpen(true)}>
            <Plus className="h-4 w-4" />
            Compose bulk SMS
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="rounded border-primary/10 shadow-none">
            <CardContent className="flex items-center justify-between p-4">
              <div><p className="text-xs text-muted-foreground">Customer contacts</p><p className="mt-1 text-2xl font-bold">{contactsQuery.data?.total || 0}</p></div>
              <Users className="h-7 w-7 text-primary/40" />
            </CardContent>
          </Card>
          <Card className="rounded border-primary/10 shadow-none">
            <CardContent className="flex items-center justify-between p-4">
              <div><p className="text-xs text-muted-foreground">Submitted messages</p><p className="mt-1 text-2xl font-bold">{totalSubmitted}</p></div>
              <CheckCircle2 className="h-7 w-7 text-emerald-500/50" />
            </CardContent>
          </Card>
          <Card className="rounded border-primary/10 shadow-none">
            <CardContent className="flex items-center justify-between p-4">
              <div><p className="text-xs text-muted-foreground">Failed messages</p><p className="mt-1 text-2xl font-bold">{totalFailed}</p></div>
              <XCircle className="h-7 w-7 text-destructive/50" />
            </CardContent>
          </Card>
        </div>

        <Card className="rounded border-primary/10 shadow-none">
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2 text-sm">
              <MessageSquareText className="h-4 w-4 text-primary" />
              Message activity
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {activities.length === 0 ? (
              <div className="flex min-h-64 flex-col items-center justify-center px-5 text-center">
                <MessageSquareText className="h-10 w-10 text-muted-foreground/30" />
                <p className="mt-3 text-sm font-medium">No saved messages for this branch</p>
                <p className="mt-1 text-xs text-muted-foreground">Press Compose bulk SMS to start a new message.</p>
              </div>
            ) : (
              <div className="divide-y">
                {activities.map((activity) => {
                  const completed = (activity.response?.sent || 0) + (activity.response?.failed || 0);
                  const progress = activity.status === "sending"
                    ? 55
                    : Math.round((completed / activity.recipients.length) * 100);
                  return (
                    <div key={activity.id} className="space-y-3 p-4 sm:p-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className={statusStyle(activity.status)}>
                              {activity.status === "sending" && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                              {activity.status}
                            </Badge>
                            <Badge variant="secondary">{activity.type === "voucher" ? "Voucher token" : "General SMS"}</Badge>
                          </div>
                          <p className="mt-2 line-clamp-2 text-sm">{renderPreview(activity.message, contacts.find((contact) => activity.recipients.includes(contact.phone_number)))}</p>
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {activity.recipients.length} recipients</span>
                            <span className="flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" /> {new Date(activity.createdAt).toLocaleTimeString()}</span>
                            {!!activity.response?.total_charged && (
                              <span className="flex items-center gap-1 text-amber-600">{activity.response.total_charged} UGX charged · balance {activity.response.wallet_balance} UGX</span>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-4 text-xs">
                          <span className="text-emerald-600">{activity.response?.sent || 0} submitted</span>
                          <span className="text-destructive">{activity.response?.failed || 0} failed</span>
                        </div>
                      </div>
                      <Progress value={progress} className="h-1.5" />
                      {activity.error && <p className="text-xs text-destructive">{activity.error}</p>}
                      {activity.response && (
                        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                          {activity.response.results.map((result) => (
                            <div key={result.phone_number} className="flex items-start justify-between gap-2 rounded border px-2.5 py-2 text-xs">
                              <div className="min-w-0">
                                <p className="font-mono">{result.phone_number}</p>
                                {!result.success && (
                                  <p className="mt-1 break-words text-[10px] text-destructive">{result.message}</p>
                                )}
                              </div>
                              {result.success
                                ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                : <XCircle className="h-3.5 w-3.5 text-destructive" />}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      <Sheet open={composerOpen} onOpenChange={setComposerOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
          <SheetHeader className="border-b px-6 py-5">
            <SheetTitle>Compose bulk SMS</SheetTitle>
            <SheetDescription>
              Select saved customers or add a Ugandan mobile number.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <div className="space-y-2">
              <Label>Message type</Label>
              <Select value={messageType} onValueChange={(value) => changeMessageType(value as "custom" | "voucher")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="voucher">Wi-Fi voucher token</SelectItem>
                  <SelectItem value="custom">General message</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Customer contacts</Label>
              <Popover open={contactPickerOpen} onOpenChange={setContactPickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-11 w-full justify-between font-normal" disabled={!branchId}>
                    <span>{selectedNumbers.length ? `${selectedNumbers.length} numbers selected` : "Search customer contacts"}</span>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
                  <div className="flex items-center border-b px-3">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <Input
                      value={contactSearch}
                      onChange={(event) => setContactSearch(event.target.value)}
                      placeholder="Search phone, Wi-Fi, or token..."
                      className="border-0 shadow-none focus-visible:ring-0"
                    />
                  </div>
                  <div className="flex items-center justify-between border-b px-3 py-2">
                    <span className="text-xs text-muted-foreground">{filteredContacts.length} contacts</span>
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={selectAllFiltered}>Select all</Button>
                  </div>
                  <ScrollArea className="h-64">
                    <div className="p-1.5">
                      {contactsQuery.isLoading && <p className="py-8 text-center text-sm text-muted-foreground">Loading customers...</p>}
                      {!contactsQuery.isLoading && filteredContacts.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No contacts found.</p>}
                      {filteredContacts.map((contact) => (
                        <button
                          key={contact.phone_number}
                          type="button"
                          onClick={() => toggleContact(contact.phone_number)}
                          className="flex w-full items-center gap-3 rounded px-2.5 py-2 text-left hover:bg-muted"
                        >
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
                  <Input
                    id="manual-number"
                    inputMode="tel"
                    value={manualNumber}
                    onChange={(event) => setManualNumber(event.target.value.replace(/[^\d+\s-]/g, ""))}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addManualNumber();
                      }
                    }}
                    placeholder="0772 123 456"
                    className="pl-9"
                  />
                </div>
                <Button type="button" variant="outline" onClick={addManualNumber}>Add</Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Uganda formats `077…`, `77…`, and `256…` are converted to `+256…`.
                {messageType === "voucher" && " Token messages require a saved customer contact."}
              </p>
            </div>

            {selectedNumbers.length > 0 && (
              <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto rounded border bg-muted/20 p-2">
                {selectedNumbers.map((phoneNumber) => (
                  <Badge key={phoneNumber} variant="secondary" className="gap-1 font-mono font-normal">
                    {phoneNumber}
                    {!contactNumbers.has(phoneNumber) && <span className="text-[9px] text-muted-foreground">manual</span>}
                    <button type="button" onClick={() => toggleContact(phoneNumber)} aria-label={`Remove ${phoneNumber}`}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="bulk-message">Message</Label>
              <Textarea
                id="bulk-message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                maxLength={1000}
                rows={6}
                placeholder="Type the SMS message..."
                className="resize-none"
              />
              {messageType === "voucher" && !hasVoucherCodePlaceholder && (
                <p className="text-xs text-amber-600">Add {"{code}"} or {"{}"} to include each customer's token.</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Preview</Label>
              <div className="rounded-2xl rounded-bl-sm bg-primary px-4 py-3 text-sm leading-6 text-primary-foreground">
                {preview}
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{message.length}/1000 characters</span>
                <span>{message.length <= 160 ? 1 : Math.ceil(message.length / 153)} SMS segments</span>
              </div>
            </div>
          </div>

          <div className="border-t bg-background px-6 py-4">
            {costPerSms > 0 && (
              <p className="mb-2 text-center text-xs text-muted-foreground">
                {costPerSms} UGX per SMS
                {selectedNumbers.length > 0 && (
                  <> · est. {costPerSms * selectedNumbers.length} UGX for {selectedNumbers.length} recipient{selectedNumbers.length === 1 ? "" : "s"}</>
                )}
              </p>
            )}
            <Button className="h-11 w-full gap-2" disabled={!canSend} onClick={handleSend}>
              {sendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send to {selectedNumbers.length} number{selectedNumbers.length === 1 ? "" : "s"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

import React, { useState, useMemo, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { VOUCHER_THEMES } from "../templates/voucherThemes";
import { downloadVoucherPdf } from "../templates/voucherPdf";
import { toast } from "sonner";
import { Download, Check, Clock, ArrowRight, ArrowLeft, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Voucher {
  id: string;
  phone?: string;
  routerName: string;
  packageName: string;
  duration: string;
  pricePaid: number;
  purchaseTime: string;
  status: string;
  batchId?: string;
  useCase: string;
  note: string;
}

interface DownloadByCommentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  uniqueNotes: string[];
  vouchers: Voucher[];
  selectedRouterName?: string;
  selectedRouterHost?: string;
}

// Parse timestamp-based batch notes into friendly dates
function formatBatchNote(note: string): string {
  if (!note) return "Unnamed Batch";

  // Format matching BAT-ADM-YYYYMMDDTHHMMSS
  const admMatch = note.match(/BAT-ADM-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/i);
  if (admMatch) {
    const [, y, m, d, hh, mm, ss] = admMatch;
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthIndex = parseInt(m, 10) - 1;
    const monthName = months[monthIndex] || m;
    const hour = parseInt(hh, 10);
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;
    return `Admin Batch — ${monthName} ${parseInt(d, 10)}, ${y} at ${displayHour}:${mm} ${ampm}`;
  }

  // Generic format YYYYMMDDTHHMMSS
  const genericMatch = note.match(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
  if (genericMatch) {
    const [, y, m, d, hh, mm, ss] = genericMatch;
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthIndex = parseInt(m, 10) - 1;
    const monthName = months[monthIndex] || m;
    const hour = parseInt(hh, 10);
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;
    return `Batch — ${monthName} ${parseInt(d, 10)}, ${y} at ${displayHour}:${mm} ${ampm}`;
  }

  return note;
}

// Miniature stylesheet preview renderer using active theme color
function MiniSheetPreview({
  layoutId,
  themeId,
}: {
  layoutId: string;
  themeId: string;
}) {
  const theme = VOUCHER_THEMES.find((t) => t.id === themeId) || VOUCHER_THEMES[0];
  const cards = Array.from({ length: 12 });

  return (
    <div className="w-full h-[85px] bg-slate-50 dark:bg-zinc-900 border border-border rounded-md p-1.5 flex flex-col justify-between overflow-hidden">
      <div className="grid grid-cols-4 gap-1 h-full">
        {cards.map((_, i) => {
          if (layoutId === "classic") {
            return (
              <div key={i} className="border border-zinc-200 dark:border-zinc-800 rounded-[2px] bg-white dark:bg-zinc-950 overflow-hidden flex flex-col justify-between h-full p-[2px]">
                <div className={cn("h-[3px] w-full rounded-[1px]", theme.header)} />
                <div className="h-[2px] w-[60%] bg-zinc-200 dark:bg-zinc-800 rounded-[1px] my-auto" />
                <div className="border-t border-zinc-100 dark:border-zinc-900 h-[1px] w-full" />
                <div className="flex justify-between w-full h-[2px]">
                  <div className="w-[30%] bg-zinc-200 dark:bg-zinc-800 rounded-[1px] h-full" />
                  <div className="w-[40%] bg-zinc-200 dark:bg-zinc-800 rounded-[1px] h-full" />
                </div>
              </div>
            );
          } else if (layoutId === "minimal") {
            return (
              <div key={i} className="border border-zinc-200 dark:border-zinc-800 rounded-[2px] bg-white dark:bg-zinc-950 overflow-hidden flex flex-col justify-center gap-[2px] h-full p-[2px]">
                <div className="h-[2px] w-[50%] bg-zinc-200 dark:bg-zinc-800 rounded-[1px] mx-auto" />
                <div className="h-[2px] w-[80%] bg-zinc-300 dark:bg-zinc-700 rounded-[1px] mx-auto" />
                <div className="h-[2px] w-[40%] bg-zinc-200 dark:bg-zinc-800 rounded-[1px] mx-auto" />
              </div>
            );
          } else if (layoutId === "qrcode-left") {
            return (
              <div key={i} className="border border-zinc-200 dark:border-zinc-800 rounded-[2px] bg-white dark:bg-zinc-950 overflow-hidden flex items-center justify-between gap-[2px] h-full p-[2px]">
                <div className="w-2.5 h-2.5 bg-zinc-800 dark:bg-zinc-200 rounded-[1px] shrink-0" />
                <div className="flex flex-col gap-[1px] w-full items-start pl-[2px]">
                  <div className="h-[1.5px] w-[80%] bg-zinc-200 dark:bg-zinc-800 rounded-[1px]" />
                  <div className="h-[2px] w-[90%] bg-zinc-300 dark:bg-zinc-700 rounded-[1px]" />
                  <div className="h-[1.5px] w-[50%] bg-zinc-200 dark:bg-zinc-800 rounded-[1px]" />
                </div>
              </div>
            );
          } else if (layoutId === "qrcode-right") {
            return (
              <div key={i} className="border border-zinc-200 dark:border-zinc-800 rounded-[2px] bg-white dark:bg-zinc-950 overflow-hidden flex items-center justify-between gap-[2px] h-full p-[2px]">
                <div className="flex flex-col gap-[1px] w-full items-start pr-[2px]">
                  <div className="h-[1.5px] w-[80%] bg-zinc-200 dark:bg-zinc-800 rounded-[1px]" />
                  <div className="h-[2px] w-[90%] bg-zinc-300 dark:bg-zinc-700 rounded-[1px]" />
                  <div className="h-[1.5px] w-[50%] bg-zinc-200 dark:bg-zinc-800 rounded-[1px]" />
                </div>
                <div className="w-2.5 h-2.5 bg-zinc-800 dark:bg-zinc-200 rounded-[1px] shrink-0" />
              </div>
            );
          } else {
            // modern-gradient
            return (
              <div key={i} className={cn("border border-zinc-200 dark:border-zinc-800 rounded-[2px] overflow-hidden flex flex-col justify-between h-full p-[2px]", theme.header)}>
                <div className="h-[2px] w-[40%] bg-white/40 rounded-[1px]" />
                <div className="h-[3px] w-[80%] bg-white rounded-[1px] mx-auto my-auto" />
                <div className="h-[2.5px] w-full bg-white/20 rounded-[1px]" />
              </div>
            );
          }
        })}
      </div>
    </div>
  );
}

// Custom local hook for responsive checks
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 768px)");
    setIsMobile(media.matches);
    const listener = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);
  return isMobile;
}

export function DownloadByCommentDialog({
  open,
  onOpenChange,
  uniqueNotes,
  vouchers,
  selectedRouterName,
  selectedRouterHost,
}: DownloadByCommentDialogProps) {
  const isMobile = useIsMobile();

  // Wizard steps: "select-batch" | "choose-template"
  const [step, setStep] = useState<"select-batch" | "choose-template">("select-batch");

  // Selection states
  const [selectedNote, setSelectedNote] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedTheme, setSelectedTheme] = useState<string>("violet");
  const [selectedLayout, setSelectedLayout] = useState<"classic" | "minimal" | "qrcode-left" | "qrcode-right" | "modern-gradient">("classic");

  // Customization options
  const [showQrCode, setShowQrCode] = useState<boolean>(true);
  const [showWifiName, setShowWifiName] = useState<boolean>(true);
  const [customWifiName, setCustomWifiName] = useState<string>("");
  const [showPrice, setShowPrice] = useState<boolean>(true);
  const [showPackage, setShowPackage] = useState<boolean>(true);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);

  // Set default note
  useEffect(() => {
    if (uniqueNotes.length > 0 && !selectedNote) {
      setSelectedNote(uniqueNotes[0]);
    }
  }, [uniqueNotes, selectedNote]);

  // Reset to step 1 when dialog is closed/opened
  useEffect(() => {
    if (!open) {
      setStep("select-batch");
    }
  }, [open]);

  // Filter notes by search query
  const batchList = useMemo(() => {
    const list = uniqueNotes.map((note) => {
      const count = vouchers.filter((v) => v.note === note).length;
      return { note, count };
    });
    const q = searchQuery.toLowerCase().trim();
    if (!q) return list;
    return list.filter((b) => b.note.toLowerCase().includes(q));
  }, [uniqueNotes, vouchers, searchQuery]);

  const selectedCount = useMemo(() => {
    if (!selectedNote) return 0;
    return vouchers.filter((v) => v.note === selectedNote).length;
  }, [vouchers, selectedNote]);

  const handleDownload = () => {
    if (!selectedNote) {
      toast.error("Please select a batch to download.");
      return;
    }

    const batchVouchers = vouchers.filter((v) => v.note === selectedNote);
    if (batchVouchers.length === 0) {
      toast.error("No vouchers found in selected batch.");
      return;
    }

    downloadVoucherPdf(
      batchVouchers.map((v) => ({
        code: v.id,
        packageName: v.packageName,
        duration: v.duration,
        price: v.pricePaid,
        status: v.status,
        batchId: v.batchId,
        wifiName: selectedRouterName || "WIFI HOTSPOT",
      })),
      `vouchers-${selectedNote.replace(/[^a-zA-Z0-9-]/g, "_")}.pdf`,
      {
        themeId: selectedTheme,
        layoutDesign: selectedLayout,
        showQrCode,
        qrCodeFormat: "gateway",
        qrGatewayIp: selectedRouterHost || "10.0.0.1",
        showWifiName,
        customWifiName: customWifiName || undefined,
        showPrice,
        showPackage,
      }
    );

    toast.success(`Successfully downloaded ${batchVouchers.length} vouchers PDF!`);
    onOpenChange(false);
  };

  // Render Inner Content of Step 1
  const renderStep1 = () => (
    <div className="space-y-4">
      {/* Search notes bar */}
      <div className="relative">
        <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search notes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 h-9 text-xs"
        />
      </div>

      {/* Selected Batch Box */}
      <div className="bg-muted/40 border border-border rounded p-3.5 space-y-2">
        <span className="text-[12px] font-bold  text-muted-foreground">Selected Batch:</span>
        {selectedNote ? (
          <div className="flex items-center justify-between bg-primary/20 border border-primary rounded px-3 py-2">
            <div className="min-w-0 flex-1 pr-2">
              <span className="text-xs font-bold text-primary block truncate" title={formatBatchNote(selectedNote)}>
                {formatBatchNote(selectedNote)}
              </span>
              <span className="text-[10px] text-primary font-mono truncate block" title={selectedNote}>
                ID: {selectedNote}
              </span>
            </div>
            <button
              onClick={() => setSelectedNote("")}
              className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground py-1">No batch selected. Tap a card below to select.</div>
        )}

        <div className="flex justify-between items-center pt-2 border-t border-border/60">
          <span className="text-xs font-semibold text-muted-foreground">Total Vouchers:</span>
          <span className="bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 px-2 py-0.5 rounded-full text-[10px] font-bold">
            {selectedCount} / 300
          </span>
        </div>
      </div>

      {/* Recent Batches List */}
      <div className="space-y-2">
        <span className="text-[11px] font-bold  text-muted-foreground block">Recent Batches:</span>
        <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
          {batchList.length === 0 ? (
            <div className="text-xs text-center text-muted-foreground py-6">No matching batch notes found.</div>
          ) : (
            batchList.map((batch, index) => {
              const isSelected = selectedNote === batch.note;
              const isTopTwo = index < 2;
              return (
                <button
                  key={batch.note}
                  type="button"
                  onClick={() => setSelectedNote(batch.note)}
                  className={cn(
                    "w-full text-left p-3 rounded border transition-all flex justify-between items-center relative",
                    isSelected
                      ? "border-primary dark:border-primary ring-1 ring-primary dark:ring-primary bg-primary/20"
                      : "border-border hover:bg-muted",
                    isTopTwo && !isSelected && "border-primary bg-primary/10"
                  )}
                >
                  <div className="space-y-0.5 pr-4 min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {isTopTwo && (
                        <span className={cn(
                          "text-[9px] px-1 py-0.2 rounded font-bold ",
                          index === 0 ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                        )}>
                          {index === 0 ? "LATEST BATCH 1" : "LATEST BATCH 2"}
                        </span>
                      )}
                      <span className="text-xs font-bold text-foreground truncate block max-w-full" title={formatBatchNote(batch.note)}>
                        {formatBatchNote(batch.note)}
                      </span>
                    </div>
                    <span className="text-[10px] text-muted-foreground font-mono block truncate" title={batch.note}>
                      ID: {batch.note}
                    </span>
                  </div>
                  <span className="bg-muted border border-primary text-primary px-2 py-1 rounded-full text-[11px] font-bold shrink-0">
                    {batch.count}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );

  // Render Inner Content of Step 2
  const renderStep2 = () => (
    <div className="space-y-5">
      {/* Selected batch summary + Theme Selection row */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-card/30 p-3 rounded border border-border">
        <div className="text-xs">
          <span className="text-muted-foreground">Printing Batch: </span>
          <strong className="text-foreground">{formatBatchNote(selectedNote)}</strong>
          <span className="text-muted-foreground"> ({selectedCount} vouchers)</span>
        </div>

        {/* Theme color picker */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-muted-foreground">Color Palette:</span>
          <div className="flex items-center gap-1.5">
            {VOUCHER_THEMES.map((theme) => (
              <button
                key={theme.id}
                type="button"
                onClick={() => setSelectedTheme(theme.id)}
                title={theme.name}
                className={cn(
                  "w-5 h-5 rounded-full border transition-all",
                  theme.swatch,
                  selectedTheme === theme.id ? "ring-2 ring-primary scale-110 border-white" : "border-border hover:scale-105"
                )}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Template Visual Grid Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          {
            id: "classic",
            title: "Branded Business Voucher",
            desc: "Professional card style with hotspot branding and contact info",
            badges: ["Hotspot Name", "Support Contacts", "55 Pieces", "Professional"],
          },
          {
            id: "minimal",
            title: "Classic Template",
            desc: "Clean and professional design with 60 pieces per page",
            badges: ["Password Icon", "60 Pieces", "Black & White", "Budget Friendly"],
          },
          {
            id: "qrcode-right",
            title: "Modern QR Template",
            desc: "Contemporary design with vibrant color and QR code",
            badges: ["QR Code", "40 Pieces", "Full Color", "Modern Design"],
          },
        ].map((template) => {
          const isSelected = selectedLayout === template.id;
          return (
            <button
              key={template.id}
              type="button"
              onClick={() => setSelectedLayout(template.id as any)}
              className={cn(
                "group rounded-xl border text-left bg-background hover:bg-muted/10 transition-all flex flex-col overflow-hidden relative",
                isSelected
                  ? "border-zinc-900 dark:border-white ring-2 ring-zinc-900 dark:ring-white"
                  : "border-border hover:border-muted-foreground/40"
              )}
            >
              {/* Thumbnail representation of the sheet */}
              <div className="p-2.5 bg-muted/20 border-b border-border relative">
                <MiniSheetPreview layoutId={template.id} themeId={selectedTheme} />
                {isSelected && (
                  <div className="absolute top-4 right-4 bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 p-0.5 rounded-full shadow">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                )}
              </div>

              {/* Card Content details */}
              <div className="p-3.5 flex-1 flex flex-col justify-between space-y-2">
                <div className="space-y-1">
                  <span className="text-xs font-bold text-foreground block tracking-tight group-hover:text-primary transition-colors">
                    {template.title}
                  </span>
                  <p className="text-[10px] text-muted-foreground leading-normal">
                    {template.desc}
                  </p>
                </div>

                {/* Pill badges */}
                <div className="flex flex-wrap gap-1 pt-1.5">
                  {template.badges.map((b) => (
                    <span
                      key={b}
                      className="bg-muted border border-border/60 text-foreground text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                    >
                      {b}
                    </span>
                  ))}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Customization switches collapsible accordion */}
      <div className="border border-border rounded overflow-hidden">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/40 text-xs font-bold text-foreground hover:bg-muted/60 transition-colors rounded"
        >
          <span>Voucher Layout Details & Configurations</span>
          <span className="text-[10px] text-muted-foreground font-normal">
            {showAdvanced ? "Hide settings" : "Show advanced settings"}
          </span>
        </button>
        {showAdvanced && (
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-border bg-card">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-xs font-bold text-foreground">Include QR Login Code</Label>
                  <p className="text-[10px] text-muted-foreground">Renders camera-scannable login gateway link</p>
                </div>
                <Switch checked={showQrCode} onCheckedChange={setShowQrCode} />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-xs font-bold text-foreground">Include UGX Pricing</Label>
                  <p className="text-[10px] text-muted-foreground">Print voucher purchase rate on voucher</p>
                </div>
                <Switch checked={showPrice} onCheckedChange={setShowPrice} />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-xs font-bold text-foreground">Include Profile Info</Label>
                  <p className="text-[10px] text-muted-foreground">Displays package duration (e.g. 1 Day)</p>
                </div>
                <Switch checked={showPackage} onCheckedChange={setShowPackage} />
              </div>
            </div>

            <div className="space-y-3 border-t md:border-t-0 md:border-l border-border pt-3 md:pt-0 md:pl-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-xs font-bold text-foreground">Display Wi-Fi SSID</Label>
                  <p className="text-[10px] text-muted-foreground">Render network SSID name on header bar</p>
                </div>
                <Switch checked={showWifiName} onCheckedChange={setShowWifiName} />
              </div>
              {showWifiName && (
                <div className="space-y-1 pl-1">
                  <Label className="text-[10px] text-muted-foreground font-bold">Custom SSID Name</Label>
                  <Input
                    placeholder={selectedRouterName || "e.g. TRESA WIFI"}
                    value={customWifiName}
                    onChange={(e) => setCustomWifiName(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // Render on Mobile Side Sheet
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="bg-popover text-popover-foreground p-5 w-full max-w-sm flex flex-col justify-between overflow-y-auto h-full border-l border-border">
          {step === "select-batch" ? (
            <div className="space-y-4 flex-1 flex flex-col justify-between h-full">
              <div className="space-y-4">
                <SheetHeader className="border-b border-border pb-3">
                  <SheetTitle className="text-foreground text-md font-bold flex items-center gap-2">
                    <Clock className="w-5 h-5 text-primary" />
                    Download by Batch Comment
                  </SheetTitle>
                  <SheetDescription className="text-muted-foreground text-xs">
                    Choose one of the recent voucher generation batches to print.
                  </SheetDescription>
                </SheetHeader>
                {renderStep1()}
              </div>

              <SheetFooter className="border-t border-border pt-4 flex flex-row justify-end gap-2 shrink-0">
                <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="text-muted-foreground hover:bg-muted text-xs h-9">
                  Cancel
                </Button>
                <Button
                  disabled={!selectedNote || selectedCount === 0}
                  onClick={() => setStep("choose-template")}
                  className="gap-1 text-xs font-bold h-9 px-4"
                >
                  Next
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </SheetFooter>
            </div>
          ) : (
            <div className="space-y-5 flex-1 flex flex-col justify-between h-full">
              <div className="space-y-4">
                <SheetHeader className="border-b border-border pb-3">
                  <SheetTitle className="text-foreground text-md font-bold flex items-center gap-2">
                    Choose PDF Template
                  </SheetTitle>
                  <SheetDescription className="text-muted-foreground text-xs">
                    Configure styles and color palettes.
                  </SheetDescription>
                </SheetHeader>
                {renderStep2()}
              </div>

              <SheetFooter className="border-t border-border pt-4 flex flex-row gap-2 justify-end shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setStep("select-batch")}
                  className="gap-1 text-muted-foreground hover:bg-muted text-xs h-9"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="text-xs h-9">
                    Cancel
                  </Button>
                  <Button
                    onClick={handleDownload}
                    disabled={!selectedNote || selectedCount === 0}
                    className="gap-1.5 h-9 px-4 text-xs font-bold"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download PDF
                  </Button>
                </div>
              </SheetFooter>
            </div>
          )}
        </SheetContent>
      </Sheet>
    );
  }

  // Render on Desktop Dialog
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(
        "bg-popover text-popover-foreground rounded-xl border border-border shadow-lg overflow-y-auto max-h-[95vh] transition-all duration-300",
        step === "select-batch" ? "max-w-md p-5" : "max-w-4xl p-6"
      )}>
        {step === "select-batch" ? (
          <div className="space-y-4">
            <DialogHeader className="flex flex-row items-center justify-between border-b border-border pb-3">
              <DialogTitle className="text-foreground text-md font-bold flex items-center gap-2">
                <Clock className="w-5 h-5 text-primary" />
                Download by Batch Note
              </DialogTitle>
            </DialogHeader>

            {renderStep1()}

            <DialogFooter className="border-t border-border pt-4 flex flex-row justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="text-muted-foreground hover:bg-muted">
                Cancel
              </Button>
              <Button
                disabled={!selectedNote || selectedCount === 0}
                onClick={() => setStep("choose-template")}
                className="gap-1 text-xs font-bold h-9 px-4"
              >
                Next: Choose Template
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-5">
            <DialogHeader className="border-b border-border pb-3">
              <DialogTitle className="text-foreground text-lg font-bold flex items-center gap-2">
                Choose PDF Template
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Select a visual voucher ticket sheet template and configure styling colors.
              </DialogDescription>
            </DialogHeader>

            {renderStep2()}

            <DialogFooter className="border-t border-border pt-4 flex flex-row gap-2 justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep("select-batch")}
                className="gap-1 text-muted-foreground hover:bg-muted text-xs h-9"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="text-xs h-9">
                  Cancel
                </Button>
                <Button
                  onClick={handleDownload}
                  disabled={!selectedNote || selectedCount === 0}
                  className="gap-1.5 h-9 px-4 text-xs font-bold"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download PDF
                </Button>
              </div>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

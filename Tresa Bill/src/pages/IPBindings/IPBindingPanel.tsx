import { RouterIpBinding, RouterIpBindingPayload } from "@/api/foreform";
import { Button } from "@/components/ui/button";
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
import { Copy, KeyRound, Loader2, Router } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type BindingType = RouterIpBindingPayload["type"];

function formatMac(value: string) {
  const chars = value.replace(/[^a-fA-F0-9]/g, "").slice(0, 12).toUpperCase();
  return chars.match(/.{1,2}/g)?.join(":") || "";
}

function isValidIp(value: string) {
  const parts = value.trim().split(".");
  return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) >= 0 && Number(part) <= 255);
}

function routerCommand(payload: RouterIpBindingPayload, id?: string) {
  const fields = [
    `mac-address=${payload.mac_address || "AA:BB:CC:DD:EE:FF"}`,
    `address=${payload.address || "172.16.0.25"}`,
    `type=${payload.type}`,
    payload.comment ? `comment="${payload.comment}"` : "",
    payload.server ? `server=${payload.server}` : "",
    payload.disabled ? "disabled=yes" : "",
  ].filter(Boolean);
  return id
    ? `/ip hotspot ip-binding set ${id} ${fields.join(" ")}`
    : `/ip hotspot ip-binding add ${fields.join(" ")}`;
}

interface IPBindingPanelProps {
  open: boolean;
  routerId: string;
  routerName: string;
  editing: RouterIpBinding | null;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (payload: RouterIpBindingPayload, bindingId?: string) => void;
}

export default function IPBindingPanel({
  open,
  routerId,
  routerName,
  editing,
  saving,
  onOpenChange,
  onSave,
}: IPBindingPanelProps) {
  const [macAddress, setMacAddress] = useState("");
  const [address, setAddress] = useState("");
  const [type, setType] = useState<BindingType>("bypassed");
  const [comment, setComment] = useState("");
  const [server, setServer] = useState("");
  const [disabled, setDisabled] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMacAddress(editing?.mac_address || "");
    setAddress(editing?.address || "");
    setType(editing?.type || "bypassed");
    setComment(editing?.comment || "");
    setServer(editing?.server && editing.server !== "all" ? editing.server : "");
    setDisabled(editing?.disabled || false);
  }, [editing, open]);

  const payload: RouterIpBindingPayload = {
    mac_address: formatMac(macAddress),
    address: address.trim(),
    type,
    comment: comment.trim() || null,
    server: server.trim() || null,
    disabled,
  };
  const command = routerCommand(payload, editing?.id);

  const submit = () => {
    if (!routerId) {
      toast.error("Select a router first.");
      return;
    }
    if (payload.mac_address.length !== 17) {
      toast.error("Enter a valid MAC address.");
      return;
    }
    if (!isValidIp(payload.address)) {
      toast.error("Enter a valid IPv4 address.");
      return;
    }
    onSave(payload, editing?.id);
  };

  const copyCommand = async () => {
    await navigator.clipboard.writeText(command);
    toast.success("RouterOS command copied.");
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col p-0 sm:max-w-md">
        <SheetHeader className="border-b px-5 py-4 pr-12">
          <SheetTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4 text-primary" />
            {editing ? "Edit IP binding" : "New IP binding"}
          </SheetTitle>
          <SheetDescription>
            Saving writes directly to {routerName || "the selected router"}.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="rounded border bg-muted/35 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Target router</p>
                <p className="text-sm font-semibold">{routerName || "No router selected"}</p>
              </div>
              <Router className="h-5 w-5 text-primary" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ip-binding-mac">MAC address</Label>
            <Input
              id="ip-binding-mac"
              className="font-mono uppercase"
              placeholder="AA:BB:CC:DD:EE:FF"
              value={macAddress}
              onChange={(event) => setMacAddress(formatMac(event.target.value))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ip-binding-address">IP address</Label>
            <Input
              id="ip-binding-address"
              className="font-mono"
              placeholder="172.16.0.25"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={type} onValueChange={(value) => setType(value as BindingType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bypassed">Bypassed - skips login</SelectItem>
                  <SelectItem value="blocked">Blocked - no access</SelectItem>
                  <SelectItem value="regular">Regular - pinned address</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ip-binding-server">Hotspot server</Label>
              <Input
                id="ip-binding-server"
                placeholder="all or hotspot1"
                value={server}
                onChange={(event) => setServer(event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ip-binding-comment">Comment / device name</Label>
            <Input
              id="ip-binding-comment"
              placeholder="Front desk POS"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
            />
          </div>

          <div className="flex items-center justify-between gap-3 rounded border p-3">
            <div>
              <p className="text-sm font-medium">Disabled</p>
              <p className="text-xs text-muted-foreground">Keep the rule saved on MikroTik but inactive.</p>
            </div>
            <Switch checked={disabled} onCheckedChange={setDisabled} />
          </div>

          <div className="rounded border bg-muted/35 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold">RouterOS preview</p>
              <Button variant="ghost" size="icon" aria-label="Copy RouterOS command" onClick={copyCommand}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <code className="block whitespace-pre-wrap break-all font-mono text-xs text-muted-foreground">{command}</code>
          </div>
        </div>

        <div className="border-t p-4">
          <div className="flex gap-2">
            <Button className="flex-1" disabled={!routerId || saving} onClick={submit}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? "Update on router" : "Create on router"}
            </Button>
            <Button variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

import {
  TelegramConnectionResponse,
  TelegramPreferenceUpdate,
  renultApi,
} from "@/api/foreform";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Bot, CheckCircle2, Loader2, Send, Unplug } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import SettingsLayout from "./SettingsLayout";

const preferenceRows: Array<{
  key: keyof TelegramPreferenceUpdate;
  title: string;
  description: string;
}> = [
  {
    key: "voucher_purchases",
    title: "Purchased vouchers",
    description: "Customer name verification, phone, package, amount, voucher code, router, and status.",
  },
  {
    key: "voucher_batches",
    title: "Created voucher batches",
    description: "Router, package, quantity, and a preview of the generated voucher codes.",
  },
  {
    key: "withdrawal_receipts",
    title: "Withdrawal receipts",
    description: "Recipient, provider, amount, fee, net amount, branch, and transaction reference.",
  },
  {
    key: "router_alerts",
    title: "Router status alerts",
    description: "Router activation, offline detection, and recovery notifications.",
  },
  {
    key: "hourly_router_ping",
    title: "Hourly router ping",
    description: "A once-per-hour Telegram confirmation while each router heartbeat remains online.",
  },
];

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function TelegramConnectPage() {
  const [connection, setConnection] = useState<TelegramConnectionResponse | null>(null);
  const [botToken, setBotToken] = useState("");
  const [secondaryBotToken, setSecondaryBotToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<"connect" | "connect-secondary" | "save" | "test" | "disconnect" | "disconnect-secondary" | null>(null);

  useEffect(() => {
    renultApi.telegram.connection()
      .then(setConnection)
      .catch((error) => toast.error(errorMessage(error, "Failed to load Telegram connection")))
      .finally(() => setLoading(false));
  }, []);

  const connect = async () => {
    if (!botToken.trim()) {
      toast.error("Enter the bot token from BotFather");
      return;
    }
    setAction("connect");
    try {
      const result = await renultApi.telegram.connect(botToken.trim());
      setConnection(result);
      setBotToken("");
      toast.success("Telegram connected");
    } catch (error) {
      toast.error(errorMessage(error, "Could not connect Telegram"));
    } finally {
      setAction(null);
    }
  };

  const connectSecondary = async () => {
    if (!secondaryBotToken.trim()) {
      toast.error("Enter the same bot token after messaging the second Telegram chat");
      return;
    }
    setAction("connect-secondary");
    try {
      const result = await renultApi.telegram.connect(secondaryBotToken.trim(), 2);
      setConnection(result);
      setSecondaryBotToken("");
      toast.success("Second Telegram destination connected");
    } catch (error) {
      toast.error(errorMessage(error, "Could not connect the second Telegram chat"));
    } finally {
      setAction(null);
    }
  };

  const savePreferences = async () => {
    if (!connection) return;
    setAction("save");
    try {
      const result = await renultApi.telegram.updatePreferences({
        voucher_purchases: connection.voucher_purchases,
        voucher_batches: connection.voucher_batches,
        withdrawal_receipts: connection.withdrawal_receipts,
        router_alerts: connection.router_alerts,
        hourly_router_ping: connection.hourly_router_ping,
      });
      setConnection(result);
      toast.success("Telegram notification settings saved");
    } catch (error) {
      toast.error(errorMessage(error, "Failed to save Telegram settings"));
    } finally {
      setAction(null);
    }
  };

  const sendTest = async () => {
    setAction("test");
    try {
      await renultApi.telegram.test();
      toast.success("Test notification sent");
    } catch (error) {
      toast.error(errorMessage(error, "Test notification failed"));
    } finally {
      setAction(null);
    }
  };

  const disconnect = async () => {
    setAction("disconnect");
    try {
      await renultApi.telegram.disconnect();
      setConnection((current) => current ? { ...current, connected: false, bot_username: null, chat_id: null, chat_title: null, secondary_chat_id: null, secondary_chat_title: null } : current);
      toast.success("Telegram disconnected");
    } catch (error) {
      toast.error(errorMessage(error, "Failed to disconnect Telegram"));
    } finally {
      setAction(null);
    }
  };

  const disconnectSecondary = async () => {
    setAction("disconnect-secondary");
    try {
      await renultApi.telegram.disconnect(2);
      setConnection((current) => current ? { ...current, secondary_chat_id: null, secondary_chat_title: null } : current);
      toast.success("Second Telegram destination disconnected");
    } catch (error) {
      toast.error(errorMessage(error, "Failed to disconnect the second Telegram chat"));
    } finally {
      setAction(null);
    }
  };

  const updatePreference = (key: keyof TelegramPreferenceUpdate, checked: boolean) => {
    setConnection((current) => current ? { ...current, [key]: checked } : current);
  };

  return (
    <SettingsLayout title="Telegram Connection">
      <div className="max-w-3xl mx-auto px-6 sm:px-10 py-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Telegram connection</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Connect your own Telegram bot. The token stays encrypted on the backend and is never sent to a router.
            </p>
          </div>
          {connection?.connected && (
            <Badge className="gap-1 rounded bg-emerald-600 hover:bg-emerald-600">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Connected
            </Badge>
          )}
        </div>
        <Separator className="my-6 bg-border/30" />

        {loading ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading Telegram settings...
          </div>
        ) : !connection?.connected ? (
          <div className="space-y-6">
            <div className="border border-border/30 bg-card p-5">
              <div className="flex items-start gap-3">
                <Bot className="mt-0.5 h-5 w-5 text-primary" />
                <div className="space-y-2 text-sm">
                  <p className="font-semibold">Connect through a Telegram bot</p>
                  <p className="text-muted-foreground">1. Open Telegram and create a bot with <strong>@BotFather</strong>.</p>
                  <p className="text-muted-foreground">2. Open your new bot and send <strong>/start</strong>.</p>
                  <p className="text-muted-foreground">3. Paste the BotFather token below and connect.</p>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="telegram-token">Bot token</Label>
              <Input
                id="telegram-token"
                type="password"
                autoComplete="off"
                placeholder="123456789:AA..."
                value={botToken}
                onChange={(event) => setBotToken(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && connect()}
              />
              <p className="text-xs text-muted-foreground">
                Renult uses the latest chat that messaged this bot. For a group, add the bot to the group and send a message there before connecting.
              </p>
            </div>
            <div className="flex justify-end">
              <Button onClick={connect} disabled={action === "connect"}>
                {action === "connect" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Connect Telegram
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-7">
            <div className="flex flex-col gap-4 border border-border/30 bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold">@{connection.bot_username}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Sending to {connection.chat_title || "Telegram chat"} · Chat ID {connection.chat_id}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={sendTest} disabled={action !== null}>
                  {action === "test" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Send test
                </Button>
                <Button variant="outline" className="text-destructive" onClick={disconnect} disabled={action !== null}>
                  {action === "disconnect" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Unplug className="mr-2 h-4 w-4" />}
                  Disconnect
                </Button>
              </div>
            </div>

            <div className="border border-border/30 bg-card p-5">
              <h2 className="text-sm font-semibold">Second notification chat</h2>
              {connection.secondary_chat_id ? (
                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium">{connection.secondary_chat_title || "Secondary Telegram chat"}</p>
                    <p className="text-xs text-muted-foreground">Chat ID {connection.secondary_chat_id}</p>
                  </div>
                  <Button variant="outline" className="text-destructive" onClick={disconnectSecondary} disabled={action !== null}>
                    {action === "disconnect-secondary" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Unplug className="mr-2 h-4 w-4" />}
                    Disconnect second chat
                  </Button>
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Add the same bot to another chat, send a message there, then paste the bot token to discover that second destination.
                  </p>
                  <div className="flex gap-2">
                    <Input
                      type="password"
                      autoComplete="off"
                      placeholder="Same BotFather token"
                      value={secondaryBotToken}
                      onChange={(event) => setSecondaryBotToken(event.target.value)}
                    />
                    <Button onClick={connectSecondary} disabled={action !== null}>
                      {action === "connect-secondary" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Add second chat
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div>
              <h2 className="text-sm font-semibold">Notifications sent to Telegram</h2>
              <p className="mt-1 text-xs text-muted-foreground">The Telegram page only controls the connection and event choices. Notifications are generated securely by the backend.</p>
              <div className="mt-4 divide-y divide-border/30 border-y border-border/30">
                {preferenceRows.map((row) => (
                  <div key={row.key} className="flex items-center justify-between gap-5 py-4">
                    <div>
                      <Label htmlFor={row.key} className="text-sm font-medium">{row.title}</Label>
                      <p className="mt-0.5 text-xs text-muted-foreground">{row.description}</p>
                    </div>
                    <Switch
                      id={row.key}
                      checked={connection[row.key]}
                      onCheckedChange={(checked) => updatePreference(row.key, checked)}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={savePreferences} disabled={action !== null}>
                {action === "save" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save notification settings
              </Button>
            </div>
          </div>
        )}
      </div>
    </SettingsLayout>
  );
}

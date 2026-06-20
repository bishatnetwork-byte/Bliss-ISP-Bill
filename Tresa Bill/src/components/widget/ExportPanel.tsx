/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    X, FileText, Loader2, PlugZap, Unplug, CheckCircle2,
    RefreshCw, ExternalLink, Download, Link2,
} from "lucide-react";
import { exportCSV, exportPDF } from "@/lib/exportResponses";
import { base44 } from "@/api/foreform";
import { toast } from "sonner";
import { Link } from "react-router-dom";

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */

type ConnectionStatus = {
    provider: string;
    is_connected: boolean;
    connected_email?: string;
    connected_at?: string;
    scopes?: string;
    setup_required?: boolean;
    message?: string;
};

type ConnectorDef = {
    id: string;
    provider: string;
    name: string;
    iconUrl: string;
    auth: "google" | "twitter";
    description: string;
};

export interface ExportSidebarProps {
    open: boolean;
    onClose: () => void;
    form: any;
    responses: any[];
}

/* ------------------------------------------------------------------ */
/* Static data                                                          */
/* ------------------------------------------------------------------ */

const CONNECTORS: ConnectorDef[] = [
    {
        id: "gsheets",
        provider: "google_sheets",
        name: "Google Sheets",
        iconUrl: "/google-sheets.svg",
        auth: "google",
        description: "Sync responses into spreadsheets",
    },
    {
        id: "gdrive",
        provider: "google_drive",
        name: "Google Drive",
        iconUrl: "/google-drive.svg",
        auth: "google",
        description: "Back up files to Drive",
    },
    {
        id: "gmail",
        provider: "gmail",
        name: "Gmail",
        iconUrl: "https://upload.wikimedia.org/wikipedia/commons/7/7e/Gmail_icon_%282020%29.svg",
        auth: "google",
        description: "Email workflows for forms",
    },
    {
        id: "youtube",
        provider: "youtube",
        name: "YouTube",
        iconUrl: "https://upload.wikimedia.org/wikipedia/commons/0/09/YouTube_full-color_icon_%282017%29.svg",
        auth: "google",
        description: "AI-assisted video workflows",
    },
    {
        id: "twitter",
        provider: "twitter",
        name: "Twitter X",
        iconUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2d/Twitter_X.png/960px-Twitter_X.png",
        auth: "twitter",
        description: "Publish form links & campaigns",
    },
];

const TWITTER_VERIFIER_KEY = "foreform:twitter-oauth-verifier";
const TWITTER_REDIRECT_URI_KEY = "foreform:twitter-oauth-redirect-uri";

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

function SheetsIcon() {
    return (
        <svg className="w-4 h-4 shrink-0" viewBox="0 0 48 48">
            <path fill="#21A366" d="M28 2H10c-2.2 0-4 1.8-4 4v36c0 2.2 1.8 4 4 4h28c2.2 0 4-1.8 4-4V14L28 2z" />
            <path fill="#185C37" d="M42 14H32c-2.2 0-4-1.8-4-4V2l14 12z" />
            <path fill="#FFF" d="M12 22h24v2H12zm0 6h24v2H12zm0 6h24v2H12z" />
        </svg>
    );
}

function DriveIcon() {
    return (
        <svg className="w-4 h-4 shrink-0" viewBox="0 0 48 48">
            <path fill="#FFC107" d="M30.3 32.5l-6-10.4 8.2-14.1h12l-6 10.4z" />
            <path fill="#1976D2" d="M17.5 32.5l-6.2-10.7 6.2-10.7 12.4 21.4z" />
            <path fill="#4CAF50" d="M30.3 32.5H4.7l6-10.4 25.6 0z" />
        </svg>
    );
}

/* ------------------------------------------------------------------ */
/* Component                                                            */
/* ------------------------------------------------------------------ */

export default function ExportSidebar({ open, onClose, form, responses }: ExportSidebarProps) {
    const [tab, setTab] = useState<"export" | "connect">("export");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [pushingSheets, setPushingSheets] = useState(false);
    const [pushingDrive, setPushingDrive] = useState(false);
    const [statuses, setStatuses] = useState<ConnectionStatus[]>([]);
    const [loadingStatuses, setLoadingStatuses] = useState(false);
    const [busyProvider, setBusyProvider] = useState<string | null>(null);

    /* Filtered responses -------------------------------------------- */
    const filtered = responses.filter((r) => {
        const d = r.created_date ? new Date(r.created_date) : null;
        if (!d) return true;
        if (dateFrom && d < new Date(dateFrom)) return false;
        if (dateTo && d > new Date(dateTo + "T23:59:59")) return false;
        return true;
    });

    /* Load connector statuses --------------------------------------- */
    const fetchStatuses = async () => {
        setLoadingStatuses(true);
        try {
            const data = await base44.integrations.Connections.status();
            setStatuses(data);
        } catch (err: any) {
            toast.error(err?.message || "Failed to load connection statuses");
        } finally {
            setLoadingStatuses(false);
        }
    };

    useEffect(() => {
        if (open) fetchStatuses();
    }, [open]);

    const getStatus = (provider: string) => statuses.find((s) => s.provider === provider);
    const connectedCount = CONNECTORS.filter((c) => getStatus(c.provider)?.is_connected).length;

    /* Connect / Disconnect ------------------------------------------ */
    const handleConnect = async (connector: ConnectorDef) => {
        setBusyProvider(connector.provider);
        try {
            if (connector.auth === "twitter") {
                const { auth_url, code_verifier, redirect_uri } = await base44.integrations.Twitter.getAuthUrl();
                localStorage.setItem(TWITTER_VERIFIER_KEY, code_verifier);
                if (redirect_uri) localStorage.setItem(TWITTER_REDIRECT_URI_KEY, redirect_uri);
                window.location.href = auth_url;
                return;
            }
            const { auth_url } = await base44.integrations.Google.getAuthUrl(connector.provider);
            window.location.href = auth_url;
        } catch (err: any) {
            toast.error(err?.message || `Failed to start ${connector.name} connection`);
            setBusyProvider(null);
        }
    };

    const handleDisconnect = async (connector: ConnectorDef) => {
        setBusyProvider(connector.provider);
        try {
            if (connector.auth === "twitter") {
                await base44.integrations.Twitter.disconnect();
            } else {
                await base44.integrations.Google.disconnect(connector.provider);
            }
            toast.success(`${connector.name} disconnected`);
            await fetchStatuses();
        } catch (err: any) {
            toast.error(err?.message || `Failed to disconnect ${connector.name}`);
        } finally {
            setBusyProvider(null);
        }
    };

    /* Cloud push ---------------------------------------------------- */
    const handlePushToSheets = async () => {
        if (!form?.id) return;
        setPushingSheets(true);
        try {
            const result = await base44.integrations.Sheets.push(form.id, `${form.title || "Form"} Responses`);
            if (result.success && result.url) {
                toast.success(result.message, { action: { label: "Open Sheet", onClick: () => window.open(result.url, "_blank") } });
            } else {
                toast.success(result.message);
            }
        } catch (err: any) {
            toast.error(err?.message || "Failed to push to Sheets. Is it connected?");
        } finally {
            setPushingSheets(false);
        }
    };

    const handlePushToDrive = async () => {
        if (!form?.id) return;
        setPushingDrive(true);
        try {
            const result = await base44.integrations.Google.pushToDrive(form.id);
            if (result.success && result.url) {
                toast.success(result.message, { action: { label: "Open Drive", onClick: () => window.open(result.url, "_blank") } });
            } else {
                toast.success(result.message);
            }
        } catch (err: any) {
            toast.error(err?.message || "Failed to push to Drive. Is it connected?");
        } finally {
            setPushingDrive(false);
        }
    };

    /* ---------------------------------------------------------------- */
    /* Render                                                            */
    /* ---------------------------------------------------------------- */

    if (!open) return null;

    return (
        <>
            {/* Scrim */}
            <div
                className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px] transition-opacity"
                onClick={onClose}
                aria-hidden="true"
            />

            {/* Sidebar panel */}
            <aside
                id="export-sidebar"
                className="fixed inset-y-0 right-0 z-50 flex flex-col w-full max-w-[400px] bg-card border-l border-border shadow-2xl"
                aria-label="Export and connections panel"
            >
                {/* ── Header ── */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
                    <div>
                        <h2 className="text-sm font-semibold leading-none">Export &amp; Connections</h2>
                        <p className="text-xs text-muted-foreground mt-1">
                            {responses.length} response{responses.length !== 1 ? "s" : ""}
                            {" · "}
                            <span className={connectedCount > 0 ? "text-emerald-500 font-medium" : ""}>
                                {connectedCount} service{connectedCount !== 1 ? "s" : ""} connected
                            </span>
                        </p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close panel">
                        <X className="w-4 h-4" />
                    </Button>
                </div>

                {/* ── Tabs ── */}
                <div className="flex gap-0 border-b border-border shrink-0">
                    {(["export", "connect"] as const).map((t) => (
                        <button
                            key={t}
                            id={`export-sidebar-tab-${t}`}
                            onClick={() => setTab(t)}
                            className={`flex-1 py-2.5 text-xs font-semibold transition-colors relative ${tab === t
                                ? "text-primary"
                                : "text-muted-foreground hover:text-foreground"
                                }`}
                        >
                            {t === "export" ? (
                                <span className="flex items-center justify-center gap-1.5"><Download className="w-3.5 h-3.5" />Export</span>
                            ) : (
                                <span className="flex items-center justify-center gap-1.5"><Link2 className="w-3.5 h-3.5" />Connections</span>
                            )}
                            {tab === t && (
                                <span className="absolute bottom-0 left-4 right-4 h-0.5 bg-primary rounded-full" />
                            )}
                        </button>
                    ))}
                </div>

                {/* ── Scrollable body ── */}
                <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">

                    {/* ============ EXPORT TAB ============ */}
                    {tab === "export" && (
                        <>
                            {/* Date range filter */}
                            <section>
                                <p className="text-[12px] font-bold text-muted-foreground mb-3">
                                    Date Range Filter
                                </p>
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1">
                                        <Label className="text-xs">From</Label>
                                        <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 text-xs" />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs">To</Label>
                                        <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 text-xs" />
                                    </div>
                                </div>
                                <p className="text-xs text-muted-foreground mt-2">
                                    {filtered.length} of {responses.length} response{responses.length !== 1 ? "s" : ""} selected
                                </p>
                            </section>

                            {/* Download */}
                            <section>
                                <p className="text-[12px] font-bold text-muted-foreground mb-3">
                                    Download
                                </p>
                                <div className="space-y-2">
                                    <Button
                                        id="export-csv-btn"
                                        variant="outline"
                                        size="sm"
                                        className="w-full gap-2 justify-start text-green-600 bg-green-600/5 border-green-600/40 hover:bg-green-600/10 hover:text-green-600"
                                        onClick={() => exportCSV(form, filtered)}
                                        disabled={filtered.length === 0}
                                    >
                                        <SheetsIcon />
                                        Export as CSV
                                        <span className="ml-auto text-xs opacity-50">{filtered.length} rows</span>
                                    </Button>
                                    <Button
                                        id="export-pdf-btn"
                                        variant="outline"
                                        size="sm"
                                        className="w-full gap-2 justify-start text-red-500 bg-red-500/5 border-red-500/40 hover:bg-red-500/10 hover:text-red-500"
                                        onClick={() => exportPDF(form, filtered)}
                                        disabled={filtered.length === 0}
                                    >
                                        <FileText className="w-4 h-4 shrink-0" />
                                        Export as PDF
                                        <span className="ml-auto text-xs opacity-50">{filtered.length} pages</span>
                                    </Button>
                                </div>
                            </section>

                            {/* Push to cloud */}
                            <section>
                                <p className="text-[12px] font-bold text-muted-foreground mb-3">
                                    Push to Cloud
                                </p>
                                <div className="space-y-2">
                                    <Button
                                        id="push-sheets-btn"
                                        variant="outline"
                                        size="sm"
                                        className="w-full gap-2 justify-start text-emerald-600 bg-emerald-600/5 border-emerald-600/40 hover:bg-emerald-600/10 hover:text-emerald-600"
                                        onClick={handlePushToSheets}
                                        disabled={pushingSheets || filtered.length === 0}
                                    >
                                        {pushingSheets ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <SheetsIcon />}
                                        Push to Google Sheets
                                    </Button>
                                    <Button
                                        id="push-drive-btn"
                                        variant="outline"
                                        size="sm"
                                        className="w-full gap-2 justify-start text-blue-600 bg-blue-600/5 border-blue-600/40 hover:bg-blue-600/10 hover:text-blue-600"
                                        onClick={handlePushToDrive}
                                        disabled={pushingDrive || filtered.length === 0}
                                    >
                                        {pushingDrive ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <DriveIcon />}
                                        Push to Google Drive
                                    </Button>
                                </div>
                                <p className="text-[12px] text-muted-foreground mt-2 italic">
                                    Requires Google Sheets or Drive to be connected.
                                </p>
                            </section>
                        </>
                    )}

                    {/* ============ CONNECTIONS TAB ============ */}
                    {tab === "connect" && (
                        <>
                            <div className="flex items-center justify-between">
                                <p className="text-[12px] font-bold text-muted-foreground">
                                    Integrations
                                </p>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={fetchStatuses}
                                    disabled={loadingStatuses}
                                    aria-label="Refresh statuses"
                                >
                                    {loadingStatuses
                                        ? <Loader2 className="w-3 h-3 animate-spin" />
                                        : <RefreshCw className="w-3 h-3" />}
                                </Button>
                            </div>

                            <div className="space-y-2">
                                {CONNECTORS.map((connector) => {
                                    const status = getStatus(connector.provider);
                                    const isConnected = Boolean(status?.is_connected);
                                    const isBusy = busyProvider === connector.provider;

                                    return (
                                        <div
                                            key={connector.id}
                                            className="flex items-center gap-3 px-3 py-3 rounded border border-border bg-transparent  transition-colors"
                                        >
                                            {/* Icon */}
                                            <div className="w-8 h-8 flex items-center justify-center shrink-0">
                                                <img
                                                    src={connector.iconUrl}
                                                    alt={connector.name}
                                                    className="w-5 h-5 object-contain"
                                                    onError={(e) => {
                                                        (e.target as HTMLImageElement).src =
                                                            `https://ui-avatars.com/api/?name=${connector.name}&background=111827&color=fff&rounded=true`;
                                                    }}
                                                />
                                            </div>

                                            {/* Info */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5">
                                                    <p className="text-xs font-semibold leading-none">{connector.name}</p>
                                                    {isConnected && <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />}
                                                </div>
                                                <p className="text-[12px] text-muted-foreground mt-0.5 truncate">
                                                    {isConnected
                                                        ? status?.connected_email || "Connected"
                                                        : status?.setup_required
                                                            ? "Server setup required"
                                                            : connector.description}
                                                </p>
                                            </div>

                                            {/* Action */}
                                            <Button
                                                id={`connector-${connector.id}-btn`}
                                                variant={isConnected ? "outline" : "default"}
                                                size="sm"
                                                className={`h-7 border-none text-xs px-2.5 shrink-0 ${!isConnected ? "bg-primary/90 hover:bg-primary" : "text-white bg-rose-600 hover:bg-rose-800 hover:text-white"}`}
                                                disabled={isBusy || status?.setup_required}
                                                onClick={() =>
                                                    isConnected ? handleDisconnect(connector) : handleConnect(connector)
                                                }
                                            >
                                                {isBusy ? (
                                                    <Loader2 className="w-3 h-3 animate-spin" />
                                                ) : isConnected ? (
                                                    <><Unplug className="w-3 h-3 mr-1" />Off</>
                                                ) : (
                                                    <><PlugZap className="w-3 h-3 mr-1" />Connect</>
                                                )}
                                            </Button>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Link to full connectors page */}
                            <Link
                                to="/connectors"
                                className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline mt-2"
                            >
                                <ExternalLink className="w-3 h-3" />
                                Manage all connections
                            </Link>
                        </>
                    )}
                </div>
            </aside>
        </>
    );
}

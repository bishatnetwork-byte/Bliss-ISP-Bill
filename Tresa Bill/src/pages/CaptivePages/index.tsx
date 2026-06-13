import { CaptivePortalDeployResponse, CaptivePortalResponse, renultApi } from "@/api/foreform";
import AppHeader from "@/components/Header/AppHeader";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCaptivePortal, useDeployCaptivePortalR2, useUpsertCaptivePortal } from "@/hooks/useCaptivePortal";
import { useRouters } from "@/hooks/useRouters";
import { Fireworks } from "fireworks-js";
import {
    ArrowLeft,
    ArrowRight,
    Check,
    CheckCircle2,
    ExternalLink,
    FileText,
    Globe,
    Loader2,
    Rocket,
    Save,
    Settings,
    Upload,
    XCircle
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

const errorMessage = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

export default function CaptiveIndex() {
    const [currentStep, setCurrentStep] = useState(0);

    const STEPS = [
        { num: "01", title: "General Info", subtitle: "Name & description" },
        { num: "02", title: "Branding & Template", subtitle: "Logo, contact & styling" },
        { num: "03", title: "Preview & Deploy", subtitle: "Verify & push to MikroTik" },
    ];
    const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("sidebar-collapsed") === "true");

    useEffect(() => {
        const handler = (e: Event) => {
            setSidebarCollapsed(Boolean((e as CustomEvent<{ collapsed?: boolean }>).detail?.collapsed));
        };
        window.addEventListener("sidebar-collapse-change", handler);
        return () => window.removeEventListener("sidebar-collapse-change", handler);
    }, []);

    const fireworksRef = useRef<HTMLDivElement | null>(null);
    const fireworksInstanceRef = useRef<Fireworks | null>(null);

    const branchId = localStorage.getItem("selected-workspace") || "biltra";
    const { data: routers = [], isLoading: isLoadingRouters } = useRouters(branchId);

    // Support selecting among multiple routers
    const [selectedRouterId, setSelectedRouterId] = useState<string>("");

    useEffect(() => {
        if (routers.length > 0 && !selectedRouterId) {
            setSelectedRouterId(routers[0].id);
        }
    }, [routers, selectedRouterId]);

    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const urlTemplate = searchParams.get("template");

    const { data: captivePortalData, isLoading: isLoadingPortal } = useCaptivePortal(selectedRouterId);
    const upsertMutation = useUpsertCaptivePortal(selectedRouterId);
    const deployMutation = useDeployCaptivePortalR2(selectedRouterId);

    const [draft, setDraft] = useState<Partial<CaptivePortalResponse> | null>(null);
    const [pushResult, setPushResult] = useState<CaptivePortalDeployResponse | null>(null);
    const [deployState, setDeployState] = useState<"idle" | "saving" | "pushing" | "success" | "error">("idle");
    const [deployError, setDeployError] = useState<string>("");
    const [resultDialogOpen, setResultDialogOpen] = useState(false);
    const [logoUploading, setLogoUploading] = useState(false);
    const logoInputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        if (deployState === "success" && resultDialogOpen && fireworksRef.current) {
            if (!fireworksInstanceRef.current) {
                fireworksInstanceRef.current = new Fireworks(fireworksRef.current, {
                    gravity: 1.4,
                    opacity: 0.4,
                    autoresize: true,
                    acceleration: 1.00,
                });
            }
            fireworksInstanceRef.current.start();
        } else {
            if (fireworksInstanceRef.current) {
                fireworksInstanceRef.current.stop();
                fireworksInstanceRef.current.clear();
                fireworksInstanceRef.current = null;
            }
        }

        return () => {
            if (fireworksInstanceRef.current) {
                fireworksInstanceRef.current.stop();
                fireworksInstanceRef.current.clear();
                fireworksInstanceRef.current = null;
            }
        };
    }, [deployState, resultDialogOpen]);

    useEffect(() => {
        if (captivePortalData) {
            setDraft({
                ...captivePortalData,
                portal_template: urlTemplate || captivePortalData.portal_template || "renault"
            });
        } else if (selectedRouterId) {
            setDraft({
                title: "Renault WIFI",
                description: "High-speed internet access portal",
                phone_one: "+256771234567",
                phone_two: "+256752345678",
                logo_url: "",
                portal_template: urlTemplate || "renault"
            });
        }
    }, [captivePortalData, selectedRouterId, urlTemplate]);

    // Reset deploy state when router changes
    useEffect(() => {
        setDeployState("idle");
        setPushResult(null);
        setDeployError("");
        setResultDialogOpen(false);
    }, [selectedRouterId]);

    const handleLogoUpload = async (file: File) => {
        if (!file.type.startsWith("image/")) {
            toast.error("Please choose an image file.");
            return;
        }
        setLogoUploading(true);
        try {
            const uploaded = await renultApi.uploads.upload(file, "captive-portal-logos");
            updateDraft({ logo_url: uploaded.url });
            toast.success("Logo uploaded.");
        } catch (error) {
            toast.error(errorMessage(error, "Could not upload logo."));
        } finally {
            setLogoUploading(false);
        }
    };

    const updateDraft = (updates: Partial<CaptivePortalResponse>) => {
        if (!draft) return;
        setDraft(prev => prev ? { ...prev, ...updates } : null);
        // Reset deploy state when user edits anything
        if (deployState === "success" || deployState === "error") {
            setDeployState("idle");
            setPushResult(null);
            setResultDialogOpen(false);
        }
    };

    const handleSaveOnly = async () => {
        if (!draft || !selectedRouterId) return;
        try {
            setDeployState("saving");
            await upsertMutation.mutateAsync({
                title: draft.title || "Renault WIFI",
                description: draft.description || "High-speed internet access portal",
                phone_one: draft.phone_one || "",
                phone_two: draft.phone_two || "",
                logo_url: draft.logo_url || "",
                portal_template: draft.portal_template || "renault"
            });
            toast.success("Portal configuration saved to server.");
            setDeployState("idle");
        } catch (err: unknown) {
            toast.error(errorMessage(err, "Failed to save captive portal config"));
            setDeployState("error");
            setDeployError(errorMessage(err, "Save failed"));
        }
    };

    const handleSaveAndPush = async () => {
        if (!draft || !selectedRouterId) return;
        setDeployState("saving");
        setDeployError("");
        setPushResult(null);

        try {
            // Step 1: Save config to backend
            await upsertMutation.mutateAsync({
                title: draft.title || "Renault WIFI",
                description: draft.description || "High-speed internet access portal",
                phone_one: draft.phone_one || "",
                phone_two: draft.phone_two || "",
                logo_url: draft.logo_url || "",
                portal_template: draft.portal_template || "renault"
            });

            // Step 2: Host on cloud and pull onto the MikroTik via /tool fetch
            setDeployState("pushing");
            const result = await deployMutation.mutateAsync();

            if (result.success) {
                setPushResult(result);
                setDeployState("success");
                setResultDialogOpen(true);
                toast.success("Captive portal deployed to MikroTik successfully!");
            } else {
                setDeployState("error");
                setPushResult(result);
                setDeployError(result.error || "Deployment returned unsuccessful status");
                setResultDialogOpen(true);
                toast.error(result.error || "Failed to deploy to MikroTik");
            }
        } catch (err: unknown) {
            setDeployState("error");
            setDeployError(errorMessage(err, "Deployment failed"));
            setResultDialogOpen(true);
            toast.error(errorMessage(err, "Failed to deploy captive portal"));
        }
    };

    const launchLivePreview = () => {
        if (!draft) return;
        localStorage.setItem("foreform_captive_portal_preview", JSON.stringify({
            id: draft.id || "preview-id",
            router_id: selectedRouterId,
            router_name: routers.find(r => r.id === selectedRouterId)?.name || "Router",
            title: draft.title,
            description: draft.description,
            phone_one: draft.phone_one,
            phone_two: draft.phone_two,
            logo_url: draft.logo_url,
            portal_template: draft.portal_template,
            last_pushed_at: draft.last_pushed_at
        }));
        window.open("/captive-portals/preview", "_blank");
    };

    return (
        <div className={`min-h-screen bg-background transition-all duration-300 ${sidebarCollapsed ? "md:pl-[72px]" : "md:pl-[280px]"}`}>
            <SEO title="Captive Portals Portal Builder" />
            <AppHeader />

            <main className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6 space-y-6">
                {/* Header Section */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div className="flex items-center gap-3">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate("/captive-portals")}
                            className="p-1.5 hover:bg-muted shrink-0 rounded-full border border-border/40"
                        >
                            <ArrowLeft className="w-5 h-5 text-muted-foreground hover:text-foreground" />
                        </Button>
                        <div>
                            <h2 className="text-xl font-extrabold tracking-tight">Captive Portal Builder</h2>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Configure landing pages for Wi-Fi users before granting internet access.
                            </p>
                        </div>
                    </div>
                    {/* Router selector */}
                    {routers.length > 0 && (
                        <div className="flex items-center gap-2">
                            <Label htmlFor="routerSelector" className="text-xs font-semibold whitespace-nowrap">Active Router:</Label>
                            <Select
                                value={selectedRouterId}
                                onValueChange={(val) => {
                                    setSelectedRouterId(val);
                                    setCurrentStep(0);
                                }}
                            >
                                <SelectTrigger id="routerSelector" className="w-[240px] bg-background">
                                    <SelectValue placeholder="Select Router" />
                                </SelectTrigger>
                                <SelectContent className="bg-popover border border-border">
                                    {routers.map((router) => (
                                        <SelectItem key={router.id} value={router.id}>
                                            {router.name} ({router.host})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                </div>

                {isLoadingRouters || isLoadingPortal ? (
                    <div className="flex items-center justify-center p-12">
                        <Loader2 className="w-8 h-8 text-primary animate-spin" />
                    </div>
                ) : !selectedRouterId ? (
                    <Card className="p-10 border border-dashed text-center text-muted-foreground rounded bg-card">
                        <Globe className="w-8 h-8 mx-auto mb-2 text-muted-foreground/60" />
                        <p className="text-sm font-semibold">Please connect a router first to configure Captive Portals.</p>
                    </Card>
                ) : draft ? (
                    <div className="space-y-6">
                        {/* ── Timeline Stepper ── */}
                        <div className="cp-timeline">
                            {STEPS.map((step, i) => (
                                <React.Fragment key={step.num}>
                                    <div
                                        className={`cp-timeline-step ${i === currentStep ? "cp-timeline-step--active" : i < currentStep ? "cp-timeline-step--completed" : "cp-timeline-step--inactive"}`}
                                        onClick={() => setCurrentStep(i)}
                                    >
                                        <div className="cp-timeline-step__circle">
                                            {i < currentStep ? <Check className="w-4 h-4" /> : step.num}
                                        </div>
                                        <div className="cp-timeline-step__text">
                                            <span className="cp-timeline-step__title">{step.title}</span>
                                            <span className="cp-timeline-step__subtitle">{step.subtitle}</span>
                                        </div>
                                    </div>
                                    {i < STEPS.length - 1 && (
                                        <div className={`cp-timeline-connector ${i < currentStep ? "cp-timeline-connector--done" : ""}`} />
                                    )}
                                </React.Fragment>
                            ))}
                        </div>

                        {/* Action buttons */}
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                                <Button variant="outline" size="sm" onClick={launchLivePreview} className="gap-1.5 text-xs">
                                    <ExternalLink className="w-3.5 h-3.5" /> Live Preview
                                </Button>
                            </div>
                            <div className="flex items-center gap-2">
                                {currentStep > 0 && (
                                    <Button variant="outline" size="sm" className="text-xs" onClick={() => setCurrentStep(s => s - 1)}>
                                        Back <ArrowLeft className="w-3.5 h-3.5" />
                                    </Button>
                                )}
                                {currentStep < STEPS.length - 1 && (
                                    <Button size="sm" className="text-xs gap-1" onClick={() => setCurrentStep(s => s + 1)}>
                                        Edit & Customise <ArrowRight className="w-3.5 h-3.5" />
                                    </Button>
                                )}
                            </div>
                        </div>

                        <div className="max-w-4xl mx-auto space-y-6">


                            {/* Step 2: General Info */}
                            {currentStep === 0 && (
                                <Card className="border-border/0 shadow-none rounded">
                                    <CardContent className="p-5 space-y-4">
                                        <div>
                                            <Label htmlFor="portalTitle" className="text-xs font-bold mb-1.5 block">Welcome Heading / Title</Label>
                                            <Input
                                                id="portalTitle"
                                                value={draft.title || ""}
                                                onChange={(e) => updateDraft({ title: e.target.value })}
                                                placeholder="e.g. Renault WIFI"
                                            />
                                        </div>
                                        <div className="space-y-4 pt-2 border-t border-border/30">
                                            <div>
                                                <Label htmlFor="welcomeDescription" className="text-xs font-bold mb-1.5 block">Welcome Description / Subtitle</Label>
                                                <Textarea
                                                    id="welcomeDescription"
                                                    rows={3}
                                                    value={draft.description || ""}
                                                    onChange={(e) => updateDraft({ description: e.target.value })}
                                                    placeholder="Enter connection instructions or welcome greeting."
                                                />
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            )}

                            {/* Step 3: Branding & Appearance */}
                            {currentStep === 1 && (
                                <Card className="border-border/0 shadow-none rounded">
                                    <CardHeader className="py-4 px-5 border-b border-border/30">
                                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                                            <Settings className="w-4 h-4 text-muted-foreground" /> Branding & Appearance
                                        </CardTitle>
                                        <CardDescription className="text-xs">
                                            Configure the custom logo, support numbers, and theme template.
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="p-5 space-y-4">
                                        <div>
                                            <Label htmlFor="logoUrl" className="text-xs font-bold mb-1.5 block">Logo Image URL / Path (Optional)</Label>
                                            <div className="flex items-center gap-3">
                                                {draft.logo_url && (
                                                    <img
                                                        src={draft.logo_url}
                                                        alt="Logo preview"
                                                        className="w-11 h-11 rounded-lg border border-border/40 object-cover shrink-0 bg-muted"
                                                    />
                                                )}
                                                <Input
                                                    id="logoUrl"
                                                    value={draft.logo_url || ""}
                                                    onChange={(e) => updateDraft({ logo_url: e.target.value })}
                                                    placeholder="e.g. mm_logo.jpg or https://example.com/logo.png"
                                                />
                                                <input
                                                    ref={logoInputRef}
                                                    type="file"
                                                    accept="image/*"
                                                    className="hidden"
                                                    onChange={(e) => {
                                                        const file = e.target.files?.[0];
                                                        if (file) handleLogoUpload(file);
                                                        e.target.value = "";
                                                    }}
                                                />
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    className="shrink-0 gap-2"
                                                    disabled={logoUploading}
                                                    onClick={() => logoInputRef.current?.click()}
                                                >
                                                    {logoUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                                                    Upload
                                                </Button>
                                            </div>
                                            <p className="text-[11px] text-muted-foreground mt-1.5">
                                                Upload an image (stored on Cloudflare R2) or paste a direct image URL.
                                            </p>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div>
                                                <Label htmlFor="phoneOne" className="text-xs font-bold mb-1.5 block">Support Phone 1</Label>
                                                <Input
                                                    id="phoneOne"
                                                    value={draft.phone_one || ""}
                                                    onChange={(e) => updateDraft({ phone_one: e.target.value })}
                                                    placeholder="e.g. +256771234567"
                                                />
                                            </div>
                                            <div>
                                                <Label htmlFor="phoneTwo" className="text-xs font-bold mb-1.5 block">Support Phone 2</Label>
                                                <Input
                                                    id="phoneTwo"
                                                    value={draft.phone_two || ""}
                                                    onChange={(e) => updateDraft({ phone_two: e.target.value })}
                                                    placeholder="e.g. +256752345678"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <Label htmlFor="themeSelector" className="text-xs font-bold mb-1.5 block">Visual Palette Theme</Label>
                                            <Select
                                                value={draft.portal_template || "renault"}
                                                onValueChange={(val) => updateDraft({ portal_template: val })}
                                            >
                                                <SelectTrigger id="themeSelector" className="bg-background">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent className="bg-popover border border-border">
                                                    <SelectItem value="classic">Classic (Clean & Professional)</SelectItem>
                                                    <SelectItem value="modern">Modern (Sleek & Smooth)</SelectItem>
                                                    <SelectItem value="blue_modern">Blue Modern (Carousel Ads Support)</SelectItem>
                                                    <SelectItem value="brown_cards">Brown Cards (Warm Earth Tones)</SelectItem>
                                                    <SelectItem value="adsmob">AdsMob Portal (Banner, Flash & Video Ads)</SelectItem>
                                                    <SelectItem value="offline">Offline Voucher Portal (No Mobile Money)</SelectItem>
                                                    <SelectItem value="renault">Renault Custom Portal (UGX Mobile Money & Voucher)</SelectItem>
                                                    <SelectItem value="auroaa">Auroraa RouterOS Portal (Full Hotspot Bundle)</SelectItem>
                                                    <SelectItem value="light">Classic Clean (Light)</SelectItem>
                                                    <SelectItem value="dark">Stealth Slate (Dark)</SelectItem>
                                                    <SelectItem value="glassmorphic">Frosted Neon (Glassmorphic)</SelectItem>
                                                    <SelectItem value="sunset">Sunset Glow (Warm Gradient)</SelectItem>
                                                    <SelectItem value="ocean">Ocean Breeze (Teal-Emerald Gradient)</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </CardContent>
                                </Card>
                            )}

                            {/* Step 3: Deploy */}
                            {currentStep === 2 && (
                                <div className="space-y-4">
                                    {/* Action Buttons */}
                                    <Card className="border-border/0 shadow-none rounded max-w-xl mx-auto">
                                        <CardContent className="p-5 space-y-3">
                                            <Button
                                                onClick={launchLivePreview}
                                                variant="outline"
                                                className="w-full gap-2 font-semibold py-5 text-xs"
                                            >
                                                <ExternalLink className="w-4 h-4" /> Open Fullscreen Live Preview
                                            </Button>

                                            <Button
                                                onClick={handleSaveOnly}
                                                variant="outline"
                                                className="w-full gap-2 font-semibold py-5 text-xs"
                                                disabled={deployState === "saving" || deployState === "pushing"}
                                            >
                                                {deployState === "saving" ? (
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    <Save className="w-4 h-4" />
                                                )}
                                                Save Configuration Only
                                            </Button>

                                            <Button
                                                onClick={handleSaveAndPush}
                                                className="w-full gap-2 font-bold py-6 text-sm bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg"
                                                disabled={deployState === "saving" || deployState === "pushing"}
                                            >
                                                {deployState === "saving" ? (
                                                    <>
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                        Saving Configuration...
                                                    </>
                                                ) : deployState === "pushing" ? (
                                                    <>
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                        Deploying to MikroTik Router...
                                                    </>
                                                ) : deployState === "success" ? (
                                                    <>
                                                        <CheckCircle2 className="w-4 h-4" />
                                                        Re-Deploy to MikroTik
                                                    </>
                                                ) : (
                                                    <>
                                                        <Rocket className="w-4 h-4" />
                                                        Save & Push to MikroTik Gateway
                                                    </>
                                                )}
                                            </Button>

                                            {/* Deploy status indicator */}
                                            {(deployState === "saving" || deployState === "pushing") && (
                                                <div className="flex items-center gap-2 justify-center text-xs text-muted-foreground pt-1">
                                                    <Upload className="w-3.5 h-3.5 animate-bounce text-primary" />
                                                    {deployState === "saving"
                                                        ? "Persisting portal settings to backend database..."
                                                        : "Hosting portal on cloud and pulling files onto your router..."
                                                    }
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>
                                </div>
                            )}

                            {/* Deployment Result Dialog — shown after a deploy attempt for a focused, mobile-friendly result view */}
                            <Dialog open={resultDialogOpen} onOpenChange={setResultDialogOpen}>
                                <DialogContent className="max-h-[85vh] overflow-y-auto rounded sm:max-w-lg">
                                    {deployState === "success" && pushResult ? (
                                        <>
                                            <DialogHeader>
                                                <DialogTitle className="flex items-center gap-2 text-emerald-600">
                                                    <CheckCircle2 className="w-5 h-5" /> Deployment Successful
                                                </DialogTitle>
                                                <DialogDescription>
                                                    Router: <strong>{pushResult.router_name}</strong> — {pushResult.fetched_files.length} file{pushResult.fetched_files.length !== 1 ? "s" : ""} deployed
                                                </DialogDescription>
                                            </DialogHeader>
                                            <div className="space-y-3">
                                                {pushResult.deployed_directory && (
                                                    <p className="text-xs text-muted-foreground">
                                                        Directory: <strong className="font-mono">/{pushResult.deployed_directory}</strong>
                                                        {pushResult.updated_profiles.length > 0 && (
                                                            <> — profile{pushResult.updated_profiles.length !== 1 ? "s" : ""}: <strong>{pushResult.updated_profiles.join(", ")}</strong></>
                                                        )}
                                                    </p>
                                                )}
                                                {pushResult.fetched_files.length > 0 && (
                                                    <div className="space-y-1 max-h-48 overflow-y-auto">
                                                        {pushResult.fetched_files.map((file, i) => (
                                                            <div key={i} className="flex items-center gap-1.5 text-xs text-emerald-700 font-mono bg-emerald-500/10 px-2.5 py-1 rounded">
                                                                <FileText className="w-3 h-3 shrink-0" /> {file}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                            <DialogFooter>
                                                <Button onClick={() => setResultDialogOpen(false)} className="w-full sm:w-auto">Done</Button>
                                            </DialogFooter>
                                        </>
                                    ) : deployState === "error" ? (
                                        <>
                                            <DialogHeader>
                                                <DialogTitle className="flex items-center gap-2 text-destructive">
                                                    <XCircle className="w-5 h-5" /> Deployment Failed
                                                </DialogTitle>
                                                <DialogDescription>{deployError}</DialogDescription>
                                            </DialogHeader>
                                            {pushResult?.diagnostics && Object.keys(pushResult.diagnostics).length > 0 && (
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px]">
                                                    {Object.entries(pushResult.diagnostics).map(([key, value]) => (
                                                        <div key={key} className="rounded border border-destructive/15 bg-muted/40 px-2 py-1">
                                                            <span className="font-bold text-muted-foreground">{key.replace(/_/g, " ")}: </span>
                                                            <span className="font-mono break-all">{value}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            <DialogFooter>
                                                <Button variant="outline" onClick={() => setResultDialogOpen(false)} className="w-full sm:w-auto">Close</Button>
                                            </DialogFooter>
                                        </>
                                    ) : null}
                                </DialogContent>
                            </Dialog>
                        </div>
                    </div>
                ) : null}
            </main>
            <div
                ref={fireworksRef}
                className="fixed inset-0 pointer-events-none z-[9999]"
            />
        </div>
    );
}

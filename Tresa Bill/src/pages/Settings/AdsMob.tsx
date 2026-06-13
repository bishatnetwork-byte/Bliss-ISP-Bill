import { PortalAdResponse, PortalAdUpsert, renultApi } from "@/api/foreform";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  useCreatePortalAd,
  useDeletePortalAd,
  usePortalAds,
  useUpdatePortalAd,
} from "@/hooks/usePortalAds";
import { useRouters } from "@/hooks/useRouters";
import {
  BarChart3,
  Eye,
  Image,
  Loader2,
  Megaphone,
  MonitorPlay,
  MousePointerClick,
  Plus,
  Save,
  Store,
  Trash2,
  Upload,
  Video,
  Youtube,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import SettingsLayout from "./SettingsLayout";

const DEFAULT_AD: PortalAdUpsert = {
  enabled: true,
  advertiser_name: "",
  business_type: "other",
  placement: "banner",
  media_type: "image",
  title: "Sponsored offer",
  description: "Discover this offer while you connect.",
  media_url: null,
  target_url: null,
  duration_seconds: 5,
  sort_order: 0,
};

const BUSINESS_TYPES = [
  ["shop", "Shop / Retail"],
  ["restaurant", "Restaurant / Cafe"],
  ["hotel", "Hotel / Travel"],
  ["service", "Local Service"],
  ["event", "Event"],
  ["youtube", "YouTube Creator"],
  ["other", "Other"],
];

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

function youtubeEmbed(url: string | null) {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    const id = parsed.hostname === "youtu.be"
      ? parsed.pathname.split("/")[1]
      : parsed.pathname.startsWith("/shorts/")
        ? parsed.pathname.split("/")[2]
        : parsed.searchParams.get("v");
    return id ? `https://www.youtube.com/embed/${id}` : "";
  } catch {
    return "";
  }
}

function AdPreview({ ad }: { ad: PortalAdUpsert }) {
  const embedUrl = ad.media_type === "youtube" ? youtubeEmbed(ad.media_url) : "";
  return (
    <div className="mx-auto max-w-[340px] overflow-hidden rounded-[26px] border-[7px] border-slate-950 bg-slate-50 shadow-xl">
      <div className="bg-slate-950 px-5 py-6 text-white">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-orange-400">WiFi Portal</p>
        <h3 className="mt-1 font-bold">Connect to the internet</h3>
      </div>
      <div className="space-y-3 p-3">
        <div className={ad.placement === "flash" ? "overflow-hidden rounded bg-slate-950 text-white" : "overflow-hidden rounded border bg-white"}>
          <div className="h-40 bg-gradient-to-br from-orange-500 to-amber-300">
            {embedUrl ? (
              <iframe title="YouTube ad preview" src={embedUrl} className="h-full w-full" allowFullScreen />
            ) : ad.media_url ? (
              ad.media_type === "video" ? (
                <video src={ad.media_url} className="h-full w-full object-cover" controls muted />
              ) : (
                <img src={ad.media_url} alt="" className="h-full w-full object-cover" />
              )
            ) : (
              <div className="flex h-full items-center justify-center text-white">
                {ad.media_type === "youtube" ? <Youtube className="h-10 w-10" /> : ad.media_type === "video" ? <Video className="h-10 w-10" /> : <Image className="h-10 w-10" />}
              </div>
            )}
          </div>
          <div className="space-y-1 p-3">
            <span className="text-[9px] font-bold uppercase tracking-widest text-orange-500">Sponsored</span>
            <p className="font-bold">{ad.title || "Sponsored offer"}</p>
            <p className="text-xs opacity-70">{ad.description}</p>
          </div>
        </div>
        <div className="space-y-2 rounded border bg-white p-3">
          <div className="h-8 rounded bg-slate-100" />
          <div className="h-9 rounded bg-orange-500" />
        </div>
      </div>
    </div>
  );
}

interface EditorProps {
  draft: PortalAdUpsert;
  setDraft: (value: PortalAdUpsert) => void;
  onSave: () => void;
  saving: boolean;
  saveLabel: string;
}

function AdEditor({ draft, setDraft, onSave, saving, saveLabel }: EditorProps) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const update = (updates: Partial<PortalAdUpsert>) => setDraft({ ...draft, ...updates });

  const upload = async (file: File) => {
    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      toast.error("Choose an image or video file.");
      return;
    }
    setUploading(true);
    try {
      const uploaded = await renultApi.uploads.upload(file, "portal-ads");
      update({ media_url: uploaded.url, media_type: file.type.startsWith("video/") ? "video" : "image" });
      toast.success("Media uploaded to Cloudflare R2.");
    } catch (error) {
      toast.error(errorMessage(error, "Upload failed."));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Campaign details</CardTitle>
          <CardDescription>Promote a local business, offer, service, event, or YouTube video.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between rounded border p-4">
            <div>
              <Label>Campaign active</Label>
              <p className="mt-1 text-xs text-muted-foreground">Only active campaigns enter the captive rotation.</p>
            </div>
            <Switch checked={draft.enabled} onCheckedChange={(enabled) => update({ enabled })} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Advertiser / business</Label>
              <Input value={draft.advertiser_name} onChange={(e) => update({ advertiser_name: e.target.value })} placeholder="Kampala Coffee House" />
            </div>
            <div className="space-y-2">
              <Label>Business category</Label>
              <Select value={draft.business_type} onValueChange={(business_type) => update({ business_type })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BUSINESS_TYPES.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Placement</Label>
              <Select value={draft.placement} onValueChange={(placement: "banner" | "flash") => update({ placement })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="banner">Rotating banner</SelectItem>
                  <SelectItem value="flash">Full-screen flash</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Media</Label>
              <Select value={draft.media_type} onValueChange={(media_type: "image" | "video" | "youtube") => update({ media_type })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="image">Image</SelectItem>
                  <SelectItem value="video">Uploaded video</SelectItem>
                  <SelectItem value="youtube">YouTube link</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Rotation order</Label>
              <Input type="number" min={0} value={draft.sort_order} onChange={(e) => update({ sort_order: Math.max(0, Number(e.target.value) || 0) })} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>{draft.media_type === "youtube" ? "YouTube URL" : "Media URL"}</Label>
            <input ref={inputRef} type="file" accept="image/*,video/*" className="hidden" onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
              e.currentTarget.value = "";
            }} />
            <div className="flex gap-2">
              <Input value={draft.media_url || ""} onChange={(e) => update({ media_url: e.target.value })} placeholder={draft.media_type === "youtube" ? "https://youtube.com/watch?v=..." : "Cloudflare R2 or direct URL"} />
              {draft.media_type !== "youtube" && (
                <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} disabled={uploading}>
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                </Button>
              )}
            </div>
            {draft.media_type === "youtube" && <p className="text-xs text-muted-foreground">Captive views are measured here. YouTube Studio remains the source for YouTube-organic metrics.</p>}
          </div>

          <div className="space-y-2">
            <Label>Headline</Label>
            <Input value={draft.title} onChange={(e) => update({ title: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={draft.description} onChange={(e) => update({ description: e.target.value })} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Click-through URL</Label>
              <Input value={draft.target_url || ""} onChange={(e) => update({ target_url: e.target.value })} placeholder="Website, menu, map, shop, or channel URL" />
            </div>
            <div className="space-y-2">
              <Label>Flash duration</Label>
              <Input type="number" min={1} max={60} value={draft.duration_seconds} onChange={(e) => update({ duration_seconds: Math.min(60, Math.max(1, Number(e.target.value) || 1)) })} />
            </div>
          </div>
          <div className="flex justify-end border-t pt-5">
            <Button onClick={onSave} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {saveLabel}
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card className="h-fit xl:sticky xl:top-20">
        <CardHeader>
          <CardTitle className="text-base">Live preview</CardTitle>
          <CardDescription>Preview of this ad inside the captive experience.</CardDescription>
        </CardHeader>
        <CardContent><AdPreview ad={draft} /></CardContent>
      </Card>
    </div>
  );
}

export default function AdsMobPage() {
  const navigate = useNavigate();
  const [branchId, setBranchId] = useState(() => localStorage.getItem("selected-workspace") || "");
  const { data: routers = [], isLoading: routersLoading } = useRouters(branchId);
  const [routerId, setRouterId] = useState("");
  const { data: ads = [], isLoading } = usePortalAds(routerId);
  const createAd = useCreatePortalAd(routerId);
  const updateAd = useUpdatePortalAd(routerId);
  const deleteAd = useDeletePortalAd(routerId);
  const [tab, setTab] = useState("saved");
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<PortalAdUpsert>(DEFAULT_AD);
  const [newDraft, setNewDraft] = useState<PortalAdUpsert>(DEFAULT_AD);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    const handler = (event: Event) => setBranchId((event as CustomEvent<{ id: string }>).detail.id);
    window.addEventListener("renult-branch-change", handler);
    return () => window.removeEventListener("renult-branch-change", handler);
  }, []);

  useEffect(() => {
    if (!routerId && routers.length) setRouterId(routers[0].id);
    if (routerId && !routers.some((router) => router.id === routerId)) setRouterId(routers[0]?.id || "");
  }, [routerId, routers]);

  useEffect(() => {
    if (!ads.length) {
      setSelectedId("");
      return;
    }
    const selected = ads.find((ad) => ad.id === selectedId) || ads[0];
    setSelectedId(selected.id);
    setDraft(toDraft(selected));
  }, [ads, selectedId]);

  const selectedAd = useMemo(() => ads.find((ad) => ad.id === selectedId), [ads, selectedId]);

  const selectAd = (ad: PortalAdResponse) => {
    setSelectedId(ad.id);
    setDraft(toDraft(ad));
  };

  const toggleAd = async (ad: PortalAdResponse, enabled: boolean) => {
    try {
      await updateAd.mutateAsync({ adId: ad.id, payload: { ...toDraft(ad), enabled } });
      toast.success(enabled ? "Ad added to rotation." : "Ad paused.");
    } catch (error) {
      toast.error(errorMessage(error, "Could not update ad."));
    }
  };

  const publish = async () => {
    if (!routerId) return;
    setPublishing(true);
    try {
      const captive = await renultApi.captivePortal.get(routerId);
      await renultApi.captivePortal.upsert(routerId, { ...captive, portal_template: "adsmob" });
      const result = await renultApi.captivePortal.deployR2(routerId);
      if (!result.success) throw new Error(result.error || "Deployment failed.");
      toast.success("AdsMob portal published with campaign rotation.");
    } catch (error) {
      toast.error(errorMessage(error, "Could not publish AdsMob."));
    } finally {
      setPublishing(false);
    }
  };

  return (
    <SettingsLayout title="AdsMob Campaigns">
      <div className="mx-auto max-w-7xl space-y-6 px-6 py-8 sm:px-10">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-primary"><Megaphone className="h-5 w-5" /><span className="text-xs font-semibold uppercase tracking-[0.18em]">Captive advertising</span></div>
            <h1 className="text-2xl font-bold">AdsMob Campaign Studio</h1>
            <p className="mt-1 text-sm text-muted-foreground">Create rotating campaigns for shops, restaurants, services, and creators.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select value={routerId} onValueChange={setRouterId} disabled={routersLoading || !routers.length}>
              <SelectTrigger className="w-full sm:w-[230px]"><SelectValue placeholder="Select router" /></SelectTrigger>
              <SelectContent>{routers.map((router) => <SelectItem key={router.id} value={router.id}>{router.name}</SelectItem>)}</SelectContent>
            </Select>
            <Button variant="outline" disabled={!routerId} onClick={() => navigate(`/settings/adsmob/analytics?router=${routerId}`)}><BarChart3 className="mr-2 h-4 w-4" />Analytics</Button>
            <Button disabled={!routerId || publishing} onClick={() => void publish()}>{publishing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MonitorPlay className="mr-2 h-4 w-4" />}Publish Portal</Button>
          </div>
        </div>

        {!routerId ? (
          <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">Select a router to manage its advertising campaigns.</CardContent></Card>
        ) : (
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="saved"><Megaphone className="mr-2 h-4 w-4" />Saved Ads ({ads.length})</TabsTrigger>
              <TabsTrigger value="create"><Plus className="mr-2 h-4 w-4" />Create Ad</TabsTrigger>
            </TabsList>

            <TabsContent value="saved" className="mt-6 space-y-6">
              {isLoading ? <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div> : !ads.length ? (
                <Card><CardContent className="py-16 text-center"><Store className="mx-auto h-9 w-9 text-muted-foreground" /><p className="mt-3 font-semibold">No ads created yet</p><Button className="mt-4" onClick={() => setTab("create")}><Plus className="mr-2 h-4 w-4" />Create first ad</Button></CardContent></Card>
              ) : (
                <>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {ads.map((ad) => (
                      <button key={ad.id} onClick={() => selectAd(ad)} className={`rounded border p-4 text-left transition ${selectedId === ad.id ? "border-primary bg-primary/5 shadow-sm" : "hover:border-primary/40"}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0"><p className="truncate font-bold">{ad.title}</p><p className="truncate text-xs text-muted-foreground">{ad.advertiser_name || "Unnamed advertiser"}</p></div>
                          <Switch checked={ad.enabled} onClick={(e) => e.stopPropagation()} onCheckedChange={(enabled) => void toggleAd(ad, enabled)} />
                        </div>
                        <div className="mt-4 flex flex-wrap gap-1.5"><Badge variant="secondary">{ad.placement}</Badge><Badge variant="outline">{ad.media_type}</Badge><Badge className={ad.enabled ? "bg-emerald-500/10 text-emerald-600" : "bg-slate-500/10 text-slate-500"}>{ad.enabled ? "Active" : "Paused"}</Badge></div>
                        <div className="mt-4 grid grid-cols-3 gap-2 border-t pt-3 text-xs"><span><Eye className="mr-1 inline h-3 w-3" />{ad.views}</span><span><MousePointerClick className="mr-1 inline h-3 w-3" />{ad.clicks}</span><span>{ad.ctr.toFixed(1)}% CTR</span></div>
                      </button>
                    ))}
                  </div>
                  {selectedAd && (
                    <div className="space-y-3">
                      <div className="flex justify-end">
                        <Button variant="destructive" size="sm" disabled={deleteAd.isPending} onClick={async () => {
                          if (!window.confirm(`Delete "${selectedAd.title}" and its collected analytics?`)) return;
                          try { await deleteAd.mutateAsync(selectedAd.id); toast.success("Ad deleted."); } catch (error) { toast.error(errorMessage(error, "Delete failed.")); }
                        }}><Trash2 className="mr-2 h-4 w-4" />Delete ad</Button>
                      </div>
                      <AdEditor draft={draft} setDraft={setDraft} saving={updateAd.isPending} saveLabel="Save changes" onSave={async () => {
                        try { await updateAd.mutateAsync({ adId: selectedAd.id, payload: draft }); toast.success("Ad updated."); } catch (error) { toast.error(errorMessage(error, "Could not update ad.")); }
                      }} />
                    </div>
                  )}
                </>
              )}
            </TabsContent>

            <TabsContent value="create" className="mt-6">
              <AdEditor draft={newDraft} setDraft={setNewDraft} saving={createAd.isPending} saveLabel="Create campaign" onSave={async () => {
                try {
                  const created = await createAd.mutateAsync({ ...newDraft, sort_order: newDraft.sort_order || ads.length });
                  setNewDraft({ ...DEFAULT_AD, sort_order: ads.length + 1 });
                  setSelectedId(created.id);
                  setTab("saved");
                  toast.success("Campaign created and added to rotation.");
                } catch (error) { toast.error(errorMessage(error, "Could not create campaign.")); }
              }} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </SettingsLayout>
  );
}

function toDraft(ad: PortalAdResponse): PortalAdUpsert {
  return {
    enabled: ad.enabled,
    advertiser_name: ad.advertiser_name,
    business_type: ad.business_type,
    placement: ad.placement,
    media_type: ad.media_type,
    title: ad.title,
    description: ad.description,
    media_url: ad.media_url,
    target_url: ad.target_url,
    duration_seconds: ad.duration_seconds,
    sort_order: ad.sort_order,
  };
}

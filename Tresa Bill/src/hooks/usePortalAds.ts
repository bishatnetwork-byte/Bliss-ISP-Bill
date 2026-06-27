import { PortalAdUpsert, renultApi } from "@/api/foreform";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function usePortalAds(routerId: string, platformAdmin = false) {
  return useQuery({
    queryKey: [platformAdmin ? "platformPortalAds" : "portalAds", routerId],
    queryFn: () => platformAdmin ? renultApi.platformAdmin.routerAds(routerId) : renultApi.ads.list(routerId),
    enabled: !!routerId,
    retry: 1,
  });
}

export function useCreatePortalAd(routerId: string, platformAdmin = false) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: PortalAdUpsert) =>
      platformAdmin ? renultApi.platformAdmin.createRouterAd(routerId, payload) : renultApi.ads.create(routerId, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [platformAdmin ? "platformPortalAds" : "portalAds", routerId] }),
  });
}

export function useUpdatePortalAd(routerId: string, platformAdmin = false) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ adId, payload }: { adId: string; payload: PortalAdUpsert }) =>
      platformAdmin ? renultApi.platformAdmin.updateRouterAd(routerId, adId, payload) : renultApi.ads.update(routerId, adId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [platformAdmin ? "platformPortalAds" : "portalAds", routerId] });
      queryClient.invalidateQueries({ queryKey: [platformAdmin ? "platformPortalAdAnalytics" : "portalAdAnalytics", routerId] });
    },
  });
}

export function useDeletePortalAd(routerId: string, platformAdmin = false) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (adId: string) =>
      platformAdmin ? renultApi.platformAdmin.deleteRouterAd(routerId, adId) : renultApi.ads.delete(routerId, adId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [platformAdmin ? "platformPortalAds" : "portalAds", routerId] });
      queryClient.invalidateQueries({ queryKey: [platformAdmin ? "platformPortalAdAnalytics" : "portalAdAnalytics", routerId] });
    },
  });
}

export function usePortalAdAnalytics(routerId: string, days: number, platformAdmin = false) {
  return useQuery({
    queryKey: [platformAdmin ? "platformPortalAdAnalytics" : "portalAdAnalytics", routerId, days],
    queryFn: () => platformAdmin ? renultApi.platformAdmin.routerAdAnalytics(routerId, days) : renultApi.ads.analytics(routerId, days),
    enabled: !!routerId,
    retry: 1,
  });
}

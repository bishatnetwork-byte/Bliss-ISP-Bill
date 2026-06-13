import { PortalAdUpsert, renultApi } from "@/api/foreform";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function usePortalAds(routerId: string) {
  return useQuery({
    queryKey: ["portalAds", routerId],
    queryFn: () => renultApi.ads.list(routerId),
    enabled: !!routerId,
    retry: 1,
  });
}

export function useCreatePortalAd(routerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: PortalAdUpsert) => renultApi.ads.create(routerId, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["portalAds", routerId] }),
  });
}

export function useUpdatePortalAd(routerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ adId, payload }: { adId: string; payload: PortalAdUpsert }) =>
      renultApi.ads.update(routerId, adId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portalAds", routerId] });
      queryClient.invalidateQueries({ queryKey: ["portalAdAnalytics", routerId] });
    },
  });
}

export function useDeletePortalAd(routerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (adId: string) => renultApi.ads.delete(routerId, adId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portalAds", routerId] });
      queryClient.invalidateQueries({ queryKey: ["portalAdAnalytics", routerId] });
    },
  });
}

export function usePortalAdAnalytics(routerId: string, days: number) {
  return useQuery({
    queryKey: ["portalAdAnalytics", routerId, days],
    queryFn: () => renultApi.ads.analytics(routerId, days),
    enabled: !!routerId,
    retry: 1,
  });
}

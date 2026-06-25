import { useQueries, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { renultApi, RouterCreate, RouterUpdate, RouterTrialUpdate, RouterPingRequest, RouterTestConnectionRequest, HotspotProvisionConfig, RouterPackagePayload, VoucherBatchCreate, RouterPublishScriptResponse, RouterResponse, RouterIpBindingPayload } from "@/api/foreform";

// ── Hook Implementations ─────────────────────────────────────────────
// All hooks call the real API. On failure the query enters the standard
// react-query error state so the UI can show proper loading / error
// feedback instead of silently substituting mock data.

export function useRouters(branchId: string, query?: { limit?: number; offset?: number }) {
  return useQuery({
    queryKey: ["routers", branchId, query],
    queryFn: () => renultApi.routers.list(branchId, query),
    enabled: !!branchId,
    retry: 1,
    staleTime: 30000,
    gcTime: 300000,
  });
}

export function useRouter(routerId: string) {
  return useQuery({
    queryKey: ["router", routerId],
    queryFn: () => renultApi.routers.get(routerId),
    enabled: !!routerId,
    retry: 1,
  });
}

export function useCreateRouter(branchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: RouterCreate) => renultApi.routers.create(branchId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["routers", branchId] });
    },
  });
}

export function useUpdateRouter(branchId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ routerId, payload }: { routerId: string; payload: RouterUpdate }) =>
      renultApi.routers.update(routerId, payload),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["router", variables.routerId] });
      if (branchId) {
        queryClient.invalidateQueries({ queryKey: ["routers", branchId] });
      } else {
        queryClient.invalidateQueries({ queryKey: ["routers"] });
      }
    },
  });
}

export function useUpdateRouterTrial(branchId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ routerId, payload }: { routerId: string; payload: RouterTrialUpdate }) =>
      renultApi.routers.updateTrial(routerId, payload),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["router", variables.routerId] });
      if (branchId) {
        queryClient.invalidateQueries({ queryKey: ["routers", branchId] });
      } else {
        queryClient.invalidateQueries({ queryKey: ["routers"] });
      }
    },
  });
}

export function useDeleteRouter(branchId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (routerId: string) => renultApi.routers.delete(routerId),
    onSuccess: () => {
      if (branchId) {
        queryClient.invalidateQueries({ queryKey: ["routers", branchId] });
      } else {
        queryClient.invalidateQueries({ queryKey: ["routers"] });
      }
    },
  });
}

export function useRouterStatus(routerId: string, enabled = true) {
  return useQuery({
    queryKey: ["routerStatus", routerId],
    queryFn: () => renultApi.routers.status(routerId),
    enabled: !!routerId && enabled,
    refetchInterval: 10000,
    retry: 1,
    staleTime: 5000,
  });
}

export function useRouterFeatures(routerId: string) {
  return useQuery({
    queryKey: ["routerFeatures", routerId],
    queryFn: () => renultApi.routers.features(routerId),
    enabled: !!routerId,
  });
}

export function useRouterActiveUsers(routerId: string) {
  return useQuery({
    queryKey: ["routerActiveUsers", routerId],
    queryFn: () => renultApi.routers.activeUsers(routerId),
    enabled: !!routerId,
    refetchInterval: 15000,
  });
}

// Aggregates active hotspot users across every router in a branch.
export function useBranchActiveUsers(routers: RouterResponse[]) {
  return useQueries({
    queries: routers.map((router) => ({
      queryKey: ["routerActiveUsers", router.id],
      queryFn: () => renultApi.routers.activeUsers(router.id),
      refetchInterval: 15000,
      retry: 1,
    })),
  });
}

// Aggregates live router status (interfaces, dhcp leases, etc.) across every router in a branch.
export function useBranchRouterStatus(routers: RouterResponse[]) {
  return useQueries({
    queries: routers.map((router) => ({
      queryKey: ["routerStatus", router.id],
      queryFn: () => renultApi.routers.status(router.id),
      refetchInterval: 15000,
      retry: 1,
    })),
  });
}

export function useRouterVouchers(routerId: string) {
  return useQuery({
    queryKey: ["routerVouchers", routerId],
    queryFn: () => renultApi.routers.vouchers(routerId),
    enabled: !!routerId,
  });
}

export function useRouterIpBindings(routerId: string) {
  return useQuery({
    queryKey: ["routerIpBindings", routerId],
    queryFn: () => renultApi.routers.ipBindings(routerId),
    enabled: !!routerId,
    retry: 1,
  });
}

export function useCreateRouterIpBinding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ routerId, payload }: { routerId: string; payload: RouterIpBindingPayload }) =>
      renultApi.routers.createIpBinding(routerId, payload),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["routerIpBindings", variables.routerId] });
    },
  });
}

export function useUpdateRouterIpBinding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ routerId, bindingId, payload }: { routerId: string; bindingId: string; payload: RouterIpBindingPayload }) =>
      renultApi.routers.updateIpBinding(routerId, bindingId, payload),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["routerIpBindings", variables.routerId] });
    },
  });
}

export function useDeleteRouterIpBinding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ routerId, bindingId }: { routerId: string; bindingId: string }) =>
      renultApi.routers.deleteIpBinding(routerId, bindingId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["routerIpBindings", variables.routerId] });
    },
  });
}

export function useRouterLogs(routerId: string, live = true) {
  return useQuery({
    queryKey: ["routerLogs", routerId],
    queryFn: () => renultApi.routers.logs(routerId),
    enabled: !!routerId,
    refetchInterval: live ? 2000 : false,
    retry: 1,
  });
}

export function useRouterRemoteAccess(routerId: string) {
  return useQuery({
    queryKey: ["routerRemoteAccess", routerId],
    queryFn: () => renultApi.routers.remoteAccess(routerId),
    enabled: !!routerId,
    retry: 1,
  });
}

export function useRouterSecureSetup() {
  return useMutation({
    mutationFn: (routerId: string) => renultApi.routers.secureSetup(routerId),
  });
}

export function usePublishSetupScript() {
  return useMutation<RouterPublishScriptResponse, Error, string>({
    mutationFn: (routerId: string) => renultApi.routers.publishSetupScript(routerId),
  });
}

export function usePingRouter() {
  return useMutation({
    mutationFn: ({ routerId, payload }: { routerId: string; payload: RouterPingRequest }) =>
      renultApi.routers.ping(routerId, payload),
  });
}

export function useRebootRouter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (routerId: string) => renultApi.routers.reboot(routerId),
    onSuccess: (_, routerId) => {
      queryClient.invalidateQueries({ queryKey: ["routerStatus", routerId] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useDeployRouterHeartbeat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (routerId: string) => renultApi.routers.deployHeartbeat(routerId),
    onSuccess: (_, routerId) => {
      queryClient.invalidateQueries({ queryKey: ["routerStatus", routerId] });
    },
  });
}

export function useTestRouterConnection() {
  return useMutation({
    mutationFn: (payload: RouterTestConnectionRequest) =>
      renultApi.routers.testConnection(payload),
  });
}

export function useDetectRouterHardware() {
  return useMutation({
    mutationFn: (routerId: string) =>
      renultApi.routers.hardware(routerId),
  });
}

export function useProvisionHotspot() {
  return useMutation({
    mutationFn: ({ routerId, payload }: { routerId: string; payload: HotspotProvisionConfig }) =>
      renultApi.routers.provisionHotspot(routerId, payload),
  });
}

export function useRouterPackages(routerId: string) {
  return useQuery({
    queryKey: ["routerPackages", routerId],
    queryFn: () => renultApi.packages.listForRouter(routerId),
    enabled: !!routerId,
    retry: 1,
  });
}

export function useCreateRouterPackage(routerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: RouterPackagePayload) => renultApi.packages.create(routerId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["routerPackages", routerId] });
    },
  });
}

export function useUpdateRouterPackage(routerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ packageRowId, payload }: { packageRowId: number; payload: Partial<RouterPackagePayload> }) =>
      renultApi.packages.update(routerId, packageRowId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["routerPackages", routerId] });
    },
  });
}

export function useSyncRouterPackages(routerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => renultApi.packages.sync(routerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["routerPackages", routerId] });
    },
  });
}

export function useDeleteRouterPackage(routerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (packageRowId: number) => renultApi.packages.delete(routerId, packageRowId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["routerPackages", routerId] });
    },
  });
}

export function useCreateRouterVouchers(routerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: VoucherBatchCreate) => renultApi.packages.createVouchers(routerId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["routerVouchers", routerId] });
    },
  });
}

export function useQueueRouterVouchers(routerId: string) {
  return useMutation({
    mutationFn: (payload: VoucherBatchCreate) => renultApi.packages.queueVouchers(routerId, payload),
  });
}

export function useVoucherJob(jobId: string) {
  return useQuery({
    queryKey: ["voucherJob", jobId],
    queryFn: () => renultApi.packages.voucherJob(jobId),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && ["COMPLETED", "COMPLETED_WITH_ERRORS", "FAILED"].includes(status) ? false : 750;
    },
    retry: 2,
  });
}

export function useFetchRouterVouchers(routerId: string, branchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => renultApi.packages.fetchVouchers(routerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["routerVouchers", routerId] });
      queryClient.invalidateQueries({ queryKey: ["branchVouchers", branchId] });
      queryClient.invalidateQueries({ queryKey: ["voucherSupportSummary", branchId] });
    },
  });
}

export function useSyncRouterVouchers(routerId: string, branchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => renultApi.packages.syncVouchers(routerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["routerVouchers", routerId] });
      queryClient.invalidateQueries({ queryKey: ["branchVouchers", branchId] });
      queryClient.invalidateQueries({ queryKey: ["voucherSupportSummary", branchId] });
    },
  });
}

export function useCheckExpiredRouterVouchers(routerId: string, branchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => renultApi.packages.checkExpiredVouchers(routerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["routerVouchers", routerId] });
      queryClient.invalidateQueries({ queryKey: ["branchVouchers", branchId] });
      queryClient.invalidateQueries({ queryKey: ["voucherSupportSummary", branchId] });
    },
  });
}

export function useDeleteExpiredRouterVouchers(routerId: string, branchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => renultApi.packages.deleteExpiredVouchers(routerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["routerVouchers", routerId] });
      queryClient.invalidateQueries({ queryKey: ["branchVouchers", branchId] });
      queryClient.invalidateQueries({ queryKey: ["voucherSupportSummary", branchId] });
    },
  });
}

export function useDeleteRouterVoucher(branchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ routerId, voucherCode }: { routerId: string; voucherCode: string }) =>
      renultApi.packages.deleteVoucher(routerId, voucherCode),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["routerVouchers"] });
      queryClient.invalidateQueries({ queryKey: ["branchVouchers", branchId] });
      queryClient.invalidateQueries({ queryKey: ["voucherSupportSummary", branchId] });
    },
  });
}

export function useDeleteRouterVoucherBatch(branchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ routerId, batchId }: { routerId: string; batchId: string }) =>
      renultApi.packages.deleteVoucherBatch(routerId, batchId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["routerVouchers"] });
      queryClient.invalidateQueries({ queryKey: ["branchVouchers", branchId] });
      queryClient.invalidateQueries({ queryKey: ["voucherSupportSummary", branchId] });
    },
  });
}

export function useBranchVouchers(branchId: string, query?: { limit?: number; offset?: number; search?: string; status_filter?: string }) {
  return useQuery({
    queryKey: ["branchVouchers", branchId, query],
    queryFn: () => renultApi.packages.branchVouchers(branchId, query),
    enabled: !!branchId,
    retry: 1,
    refetchInterval: 30000,
  });
}

export function useVoucherSupportSummary(branchId: string) {
  return useQuery({
    queryKey: ["voucherSupportSummary", branchId],
    queryFn: () => renultApi.packages.supportSummary(branchId),
    enabled: !!branchId,
    retry: 1,
  });
}

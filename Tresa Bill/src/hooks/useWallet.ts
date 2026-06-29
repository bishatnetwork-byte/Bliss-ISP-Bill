import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  renultApi,
  BranchWalletResponse,
  WalletTransactionResponse,
  DepositRequest,
  WithdrawalChallengeRequest,
  WithdrawalConfirmRequest,
  WithdrawalPasscodeConfirmRequest,
  DepositWithdrawResponse,
  PlatformSummaryResponse,
  ClientWalletSummary
} from "@/api/foreform";

// ── Wallet Hook Implementations ───────────────────────────────────────

export function useMyWallets() {
  return useQuery({
    queryKey: ["myWallets"],
    queryFn: () => renultApi.wallets.myWallets(),
    retry: 1,
  });
}

export function useBranchWallet(branchId: string, enabled = true) {
  return useQuery({
    queryKey: ["branchWallet", branchId],
    queryFn: () => renultApi.wallets.getBranchWallet(branchId),
    enabled: !!branchId && enabled,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}

export function useBranchTransactions(branchId: string, query?: { limit?: number; offset?: number }) {
  return useQuery({
    queryKey: ["branchTransactions", branchId, query],
    queryFn: () => renultApi.wallets.branchTransactions(branchId, query),
    enabled: !!branchId,
    retry: 1,
  });
}

export function useDeposit(branchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: DepositRequest) => renultApi.wallets.deposit(branchId, payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["branchWallet", branchId] });
      queryClient.invalidateQueries({ queryKey: ["branchTransactions", branchId] });
      queryClient.invalidateQueries({ queryKey: ["myWallets"] });
      queryClient.invalidateQueries({ queryKey: ["platformSummary"] });
    },
  });
}

export function useRequestWithdrawal(branchId: string) {
  return useMutation({
    mutationFn: (payload: WithdrawalChallengeRequest) => renultApi.wallets.requestWithdrawal(branchId, payload),
  });
}

export function useConfirmWithdrawal(branchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: WithdrawalConfirmRequest) => renultApi.wallets.confirmWithdrawal(branchId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branchWallet", branchId] });
      queryClient.invalidateQueries({ queryKey: ["branchTransactions", branchId] });
      queryClient.invalidateQueries({ queryKey: ["myWallets"] });
      queryClient.invalidateQueries({ queryKey: ["platformSummary"] });
    },
  });
}

export function useWithdrawalSecurity(branchId: string) {
  return useQuery({
    queryKey: ["withdrawalSecurity", branchId],
    queryFn: () => renultApi.wallets.withdrawalSecurity(branchId),
    enabled: !!branchId,
    retry: 1,
  });
}

export function useSetWithdrawalPasscode(branchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (passcode: string) => renultApi.wallets.setWithdrawalPasscode(branchId, passcode),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["withdrawalSecurity", branchId] });
      queryClient.invalidateQueries({ queryKey: ["branchWallet", branchId] });
    },
  });
}

export function useSetWithdrawalMethod(branchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (method: "email" | "passcode") => renultApi.wallets.setWithdrawalMethod(branchId, method),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["withdrawalSecurity", branchId] });
    },
  });
}

export function useRequestWithdrawalPasscodeReset(branchId: string) {
  return useMutation({
    mutationFn: () => renultApi.wallets.requestWithdrawalPasscodeReset(branchId),
  });
}

export function useConfirmWithdrawalPasscodeReset(branchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: WithdrawalConfirmRequest) => renultApi.wallets.confirmWithdrawalPasscodeReset(branchId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["withdrawalSecurity", branchId] });
      queryClient.invalidateQueries({ queryKey: ["branchWallet", branchId] });
    },
  });
}

export function useConfirmWithdrawalWithPasscode(branchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: WithdrawalPasscodeConfirmRequest) => renultApi.wallets.confirmWithdrawalWithPasscode(branchId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branchWallet", branchId] });
      queryClient.invalidateQueries({ queryKey: ["branchTransactions", branchId] });
      queryClient.invalidateQueries({ queryKey: ["myWallets"] });
      queryClient.invalidateQueries({ queryKey: ["platformSummary"] });
    },
  });
}

export function useWithdrawalConfig() {
  return useQuery({
    queryKey: ["withdrawalConfig"],
    queryFn: () => renultApi.wallets.config(),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export function usePlatformSummary() {
  return useQuery({
    queryKey: ["platformSummary"],
    queryFn: () => renultApi.wallets.platformSummary(),
    retry: 1,
  });
}

export function usePlatformClients() {
  return useQuery({
    queryKey: ["platformClients"],
    queryFn: () => renultApi.wallets.platformClients(),
    retry: 1,
  });
}

export function usePlatformClientDetail(userId: string) {
  return useQuery({
    queryKey: ["platformClientDetail", userId],
    queryFn: () => renultApi.wallets.platformClientDetail(userId),
    enabled: !!userId,
    retry: 1,
  });
}

export function useFreezeWallet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (walletId: string) => renultApi.wallets.freezeWallet(walletId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["myWallets"] });
      queryClient.invalidateQueries({ queryKey: ["branchWallet"] });
      queryClient.invalidateQueries({ queryKey: ["platformClients"] });
      queryClient.invalidateQueries({ queryKey: ["platformSummary"] });
    },
  });
}

export function useUnfreezeWallet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (walletId: string) => renultApi.wallets.unfreezeWallet(walletId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["myWallets"] });
      queryClient.invalidateQueries({ queryKey: ["branchWallet"] });
      queryClient.invalidateQueries({ queryKey: ["platformClients"] });
      queryClient.invalidateQueries({ queryKey: ["platformSummary"] });
    },
  });
}

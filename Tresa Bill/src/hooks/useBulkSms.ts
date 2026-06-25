import {
  BulkMessageRequest,
  MessageDraftResponse,
  SmsWalletMutationResponse,
  renultApi,
} from "@/api/foreform";
import { useBranchWallet } from "@/hooks/useWallet";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function useBulkSms(branchId: string) {
  const queryClient = useQueryClient();

  const contacts = useQuery({
    queryKey: ["bulkSmsContacts", branchId],
    queryFn: () => renultApi.messages.contacts(branchId, { limit: 500 }),
    enabled: Boolean(branchId),
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const activity = useQuery({
    queryKey: ["bulkSmsActivity", branchId],
    queryFn: () => renultApi.messages.activity(branchId),
    enabled: Boolean(branchId),
    staleTime: 20 * 1000,
    refetchInterval: 30 * 1000,
  });

  const draft = useQuery({
    queryKey: ["bulkSmsDraft", branchId],
    queryFn: () => renultApi.messages.draft(branchId),
    enabled: Boolean(branchId),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const settings = useQuery({
    queryKey: ["bulkSmsSettings", branchId],
    queryFn: () => renultApi.messages.settings(branchId),
    enabled: Boolean(branchId),
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const mainWallet = useBranchWallet(branchId, Boolean(branchId));

  const wallet = useQuery({
    queryKey: ["bulkSmsWallet", branchId],
    queryFn: () => renultApi.messages.wallet(branchId),
    enabled: Boolean(branchId),
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });

  const walletTransactions = useQuery({
    queryKey: ["bulkSmsWalletTransactions", branchId],
    queryFn: () => renultApi.messages.walletTransactions(branchId, { limit: 50 }),
    enabled: Boolean(branchId),
    staleTime: 20 * 1000,
  });

  const refreshWallets = (data?: SmsWalletMutationResponse) => {
    if (data) queryClient.setQueryData(["bulkSmsWallet", branchId], data.wallet);
    queryClient.invalidateQueries({ queryKey: ["bulkSmsWallet", branchId] });
    queryClient.invalidateQueries({ queryKey: ["bulkSmsWalletTransactions", branchId] });
    queryClient.invalidateQueries({ queryKey: ["branchWallet", branchId] });
    queryClient.invalidateQueries({ queryKey: ["branchTransactions", branchId] });
    queryClient.invalidateQueries({ queryKey: ["myWallets"] });
    queryClient.invalidateQueries({ queryKey: ["platformSummary"] });
    window.dispatchEvent(new CustomEvent("bulk-sms-balance-change"));
  };

  const send = useMutation({
    mutationFn: (payload: BulkMessageRequest) => renultApi.messages.send(branchId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bulkSmsActivity", branchId] });
      queryClient.invalidateQueries({ queryKey: ["bulkSmsDraft", branchId] });
      refreshWallets();
    },
  });

  const saveDraft = useMutation({
    mutationFn: (payload: Pick<MessageDraftResponse, "message" | "message_type" | "recipients">) =>
      renultApi.messages.saveDraft(branchId, payload),
    onSuccess: (data) => queryClient.setQueryData(["bulkSmsDraft", branchId], data),
  });

  const saveSettings = useMutation({
    mutationFn: (payload: {
      voucher_sms_enabled: boolean;
      low_balance_sms_enabled: boolean;
      low_balance_threshold: number;
      admin_buy_for_sms_enabled: boolean;
    }) => renultApi.messages.saveSettings(branchId, payload),
    onSuccess: (data) => {
      queryClient.setQueryData(["bulkSmsSettings", branchId], data);
      window.dispatchEvent(new CustomEvent("bulk-sms-balance-change"));
    },
  });

  const transferToWallet = useMutation({
    mutationFn: (payload: { amount: number }) => renultApi.messages.transferToWallet(branchId, payload),
    onSuccess: refreshWallets,
  });

  const mobileMoneyTopup = useMutation({
    mutationFn: (payload: { amount: number; phone_number: string }) => renultApi.messages.mobileMoneyTopup(branchId, payload),
    onSuccess: refreshWallets,
  });

  const verifyMobileMoneyTopup = useMutation({
    mutationFn: (transactionId: string) => renultApi.messages.verifyMobileMoneyTopup(branchId, transactionId),
    onSuccess: refreshWallets,
  });

  return {
    contacts,
    activity,
    draft,
    settings,
    mainWallet,
    wallet,
    walletTransactions,
    send,
    saveDraft,
    saveSettings,
    transferToWallet,
    mobileMoneyTopup,
    verifyMobileMoneyTopup,
  };
}

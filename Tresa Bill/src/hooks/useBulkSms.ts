import {
  BulkMessageRequest,
  MessageDraftResponse,
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

  const wallet = useBranchWallet(branchId, Boolean(branchId));

  const send = useMutation({
    mutationFn: (payload: BulkMessageRequest) => renultApi.messages.send(branchId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bulkSmsActivity", branchId] });
      queryClient.invalidateQueries({ queryKey: ["bulkSmsDraft", branchId] });
      queryClient.invalidateQueries({ queryKey: ["branchWallet", branchId] });
      queryClient.invalidateQueries({ queryKey: ["myWallets"] });
      window.dispatchEvent(new CustomEvent("bulk-sms-balance-change"));
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

  return { contacts, activity, draft, settings, wallet, send, saveDraft, saveSettings };
}

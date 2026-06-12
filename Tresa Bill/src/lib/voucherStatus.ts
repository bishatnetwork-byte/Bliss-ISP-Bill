export type VoucherUiStatus = "Active" | "Expired" | "Unactivated" | "Sync Issue";

export function voucherUiStatus(status: string): VoucherUiStatus {
  if (status === "ACTIVE") return "Active";
  if (status === "EXPIRED") return "Expired";
  // Provisioning failed or the code is missing from the router entirely -
  // distinct from time-based expiry, since these vouchers were never usable.
  if (status === "ROUTER_MISSING" || status === "ROUTER_SYNC_FAILED") return "Sync Issue";
  return "Unactivated";
}

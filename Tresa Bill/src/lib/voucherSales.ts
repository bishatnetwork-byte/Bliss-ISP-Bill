export type VoucherSalesStatus = "Active" | "Expired" | "Unactivated" | "Sync Issue";

export interface VoucherSalesLike {
  payment_reference?: string | null;
  phone_number?: string | null;
  status: string;
  activated_at?: string | null;
  expires_at?: string | null;
  created_at: string;
}

export function isAdminGeneratedVoucher(voucher: Pick<VoucherSalesLike, "payment_reference" | "phone_number">) {
  return voucher.phone_number === "BULK" || Boolean(voucher.payment_reference?.startsWith("BAT-"));
}

export function isSystemGeneratedVoucher(voucher: Pick<VoucherSalesLike, "payment_reference" | "phone_number">) {
  return !isAdminGeneratedVoucher(voucher);
}

export function voucherSalesStatus(voucher: Pick<VoucherSalesLike, "status">): VoucherSalesStatus {
  if (voucher.status === "ACTIVE" || voucher.status === "ONLINE" || voucher.status === "OFFLINE") return "Active";
  if (voucher.status === "EXPIRED") return "Expired";
  if (voucher.status === "ROUTER_MISSING" || voucher.status === "ROUTER_SYNC_FAILED") return "Sync Issue";
  return "Unactivated";
}

export function isVoucherRevenueSale(voucher: VoucherSalesLike) {
  if (isSystemGeneratedVoucher(voucher)) return true;

  const status = voucherSalesStatus(voucher);
  return status === "Active" || status === "Expired" || Boolean(voucher.activated_at || voucher.expires_at);
}

export function voucherRevenueDate(voucher: VoucherSalesLike) {
  if (isSystemGeneratedVoucher(voucher)) return voucher.created_at;
  return voucher.activated_at || voucher.expires_at || voucher.created_at;
}

export function voucherPaymentMode(voucher: Pick<VoucherSalesLike, "payment_reference" | "phone_number">) {
  return isAdminGeneratedVoucher(voucher) ? "Voucher Printing" as const : "Online Payment" as const;
}

export function voucherPaymentMethod(voucher: Pick<VoucherSalesLike, "payment_reference" | "phone_number">) {
  return isAdminGeneratedVoucher(voucher) ? "Cash" as const : "MTN Mobile Money" as const;
}

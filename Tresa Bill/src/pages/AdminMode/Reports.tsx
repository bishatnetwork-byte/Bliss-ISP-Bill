import {
  PlatformAllTransactionResponse,
  PlatformAuditResponse,
  PlatformUserResponse,
  PlatformVoucherAuditResponse,
} from "@/api/foreform";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, FileSpreadsheet } from "lucide-react";

function toCsv(headers: string[], rows: (string | number)[][]) {
  const escape = (value: string | number) => {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [headers, ...rows].map((row) => row.map(escape).join(",")).join("\n");
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

interface ReportsPanelProps {
  users: PlatformUserResponse[];
  transactions: PlatformAllTransactionResponse[];
  audit: PlatformAuditResponse[];
  voucherAudit: PlatformVoucherAuditResponse[];
  loading: boolean;
}

export default function ReportsPanel({ users, transactions, audit, voucherAudit, loading }: ReportsPanelProps) {
  const reports = [
    {
      key: "users",
      label: "Global Users",
      description: `${users.length} users — name, email, phone, assets, wallet balance, status.`,
      disabled: users.length === 0,
      onExport: () => downloadCsv(
        "renult-users.csv",
        toCsv(
          ["Name", "Email", "Phone", "Branches", "Routers", "Vouchers", "Wallet Balance", "Active", "Verified"],
          users.map((u) => [u.full_name, u.email, u.phone_number || "", u.branches, u.routers, u.vouchers, u.wallet_balance, u.is_active ? "Yes" : "No", u.is_verified ? "Yes" : "No"]),
        ),
      ),
    },
    {
      key: "transactions",
      label: "All Transactions",
      description: `${transactions.length} deposits & withdrawals across every client branch.`,
      disabled: transactions.length === 0,
      onExport: () => downloadCsv(
        "renult-transactions.csv",
        toCsv(
          ["Date", "Owner", "Branch", "Type", "Amount", "Fee", "Net", "Status"],
          transactions.map((t) => [t.created_at, t.owner_name, t.branch_name, t.transaction_type, t.amount, t.fee_amount, t.net_amount, t.status]),
        ),
      ),
    },
    {
      key: "audit",
      label: "Admin Audit Log",
      description: `${audit.length} platform admin actions.`,
      disabled: audit.length === 0,
      onExport: () => downloadCsv(
        "renult-admin-audit.csv",
        toCsv(
          ["Date", "Admin", "Action", "Target Type", "Target ID", "Details"],
          audit.map((a) => [a.created_at, a.actor_name || "System", a.action, a.target_type, a.target_id || "", JSON.stringify(a.details || {})]),
        ),
      ),
    },
    {
      key: "voucher_audit",
      label: "Voucher Activation Audit",
      description: `${voucherAudit.length} voucher status transitions.`,
      disabled: voucherAudit.length === 0,
      onExport: () => downloadCsv(
        "renult-voucher-audit.csv",
        toCsv(
          ["Time", "Voucher", "Router", "Event", "Previous Status", "New Status", "Activated", "Expires"],
          voucherAudit.map((v) => [v.created_at, v.voucher_code, v.router_name, v.event, v.previous_status || "NEW", v.new_status, v.activated_at || "", v.expires_at || ""]),
        ),
      ),
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {reports.map((report) => (
        <Card key={report.key} className="shadow-none rounded border border-border/20">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <FileSpreadsheet className="h-4 w-4 text-primary" />
              {report.label}
            </CardTitle>
            <CardDescription className="text-xs">{report.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button size="sm" variant="outline" className="gap-2 text-xs" disabled={loading || report.disabled} onClick={report.onExport}>
              <Download className="h-3.5 w-3.5" /> Export CSV
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

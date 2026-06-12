import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { Download, Info, Printer, Trash2 } from "lucide-react";

export interface RegistryVoucher {
  id: string;
  phone?: string;
  routerName: string;
  packageName: string;
  pricePaid: number;
  purchaseTime: string;
  status: "Active" | "Expired" | "Unactivated" | "Sync Issue";
}

export interface RegistryBatch {
  id: string;
  routerName: string;
  packageName: string;
  createdAt: string;
  quantity: number;
  totalValue: number;
  active: number;
  unactivated: number;
  expired: number;
  syncIssue: number;
}

interface BulkBatchesTableProps {
  batches: RegistryBatch[];
  deletingBatch: boolean;
  onPreviewBatch: (batch: RegistryBatch) => void;
  onDownloadBatch: (batch: RegistryBatch) => void;
  onDeleteBatch: (batch: RegistryBatch) => void;
}

export function BulkBatchesTable({
  batches,
  deletingBatch,
  onPreviewBatch,
  onDownloadBatch,
  onDeleteBatch,
}: BulkBatchesTableProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between">
        <div>
          <h3 className="text-sm font-bold">Bulk Voucher Batches</h3>
          <p className="text-[12px] text-muted-foreground">Each generated batch is kept as one bundle.</p>
        </div>
        <Badge variant="secondary" className="text-[10px]">{batches.length} batches</Badge>
      </div>
      <Card className="border border-border/10 shadow-none overflow-hidden rounded">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/10">
              <TableRow>
                <TableHead className="text-sm text-black/80 font-bold">Batch Reference</TableHead>
                <TableHead className="text-sm text-black/80 font-bold">Created</TableHead>
                <TableHead className="text-sm text-black/80 font-bold">Router / Package</TableHead>
                <TableHead className="text-sm text-black/80 font-bold">Quantity</TableHead>
                <TableHead className="text-sm text-black/80 font-bold">Batch Value</TableHead>
                <TableHead className="text-sm text-black/80 font-bold">Router Status</TableHead>
                <TableHead className="text-right text-black text-xs font-bold">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-xs text-muted-foreground">
                    <Info className="w-5 h-5 mx-auto mb-2 opacity-60" />
                    No bulk batches match the current filters.
                  </TableCell>
                </TableRow>
              ) : batches.map((batch) => (
                <TableRow key={`${batch.routerName}:${batch.id}`}>
                  <TableCell>
                    <p className="font-mono text-xs font-bold text-primary">{batch.id}</p>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{batch.createdAt}</TableCell>
                  <TableCell>
                    <p className="text-xs font-semibold">{batch.routerName}</p>
                    <p className="text-[10px] text-muted-foreground">{batch.packageName}</p>
                  </TableCell>
                  <TableCell className="text-xs font-bold">{batch.quantity.toLocaleString()}</TableCell>
                  <TableCell className="text-xs font-bold">UGX {batch.totalValue.toLocaleString()}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {batch.active > 0 && <Badge className="bg-emerald-500/10 text-emerald-600 border-none text-[9px]">{batch.active} active</Badge>}
                      {batch.unactivated > 0 && <Badge className="bg-amber-500/10 text-amber-600 border-none text-[9px]">{batch.unactivated} ready</Badge>}
                      {batch.expired > 0 && <Badge className="bg-slate-500/10 text-slate-600 border-none text-[9px]">{batch.expired} expired</Badge>}
                      {batch.syncIssue > 0 && <Badge className="bg-orange-500/10 text-orange-600 border-none text-[9px]">{batch.syncIssue} sync issue</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => onPreviewBatch(batch)} className="h-8 w-8" title="Preview & print this batch">
                        <Printer className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => onDownloadBatch(batch)} className="h-8 w-8" title="Download batch PDF">
                        <Download className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={deletingBatch}
                        onClick={() => onDeleteBatch(batch)}
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        title="Delete batch from router and database"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

interface IndividualVouchersTableProps {
  singles: RegistryVoucher[];
  selected: string[];
  deletingVoucher: boolean;
  onSelectAll: (checked: boolean) => void;
  onSelect: (id: string, checked: boolean) => void;
  onCopy: (code: string) => void;
  onDeleteVoucher: (voucher: RegistryVoucher) => void;
  getStatusClass: (status: RegistryVoucher["status"]) => string;
}

export function IndividualVouchersTable({
  singles,
  selected,
  deletingVoucher,
  onSelectAll,
  onSelect,
  onCopy,
  onDeleteVoucher,
  getStatusClass,
}: IndividualVouchersTableProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between">
        <div>
          <h3 className="text-sm font-bold">Individual Vouchers</h3>
          <p className="text-[11px] text-muted-foreground">Single customer vouchers only. Bulk codes stay inside their bundle above.</p>
        </div>
        <Badge variant="secondary" className="text-[10px]">{singles.length} vouchers</Badge>
      </div>
      <Card className="border border-border/40 shadow-none overflow-hidden rounded">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead className="w-[50px] text-center">
                  <input
                    type="checkbox"
                    checked={singles.length > 0 && singles.every((voucher) => selected.includes(voucher.id))}
                    onChange={(event) => onSelectAll(event.target.checked)}
                    className="rounded border-border text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                  />
                </TableHead>
                <TableHead className="text-xs font-bold">Voucher Code</TableHead>
                <TableHead className="text-xs font-bold">Router / Package</TableHead>
                <TableHead className="text-xs font-bold">Customer</TableHead>
                <TableHead className="text-xs font-bold">Price</TableHead>
                <TableHead className="text-xs font-bold">Created</TableHead>
                <TableHead className="text-xs font-bold">Status</TableHead>
                <TableHead className="text-right text-xs font-bold">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {singles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-xs text-muted-foreground">
                    <Info className="w-5 h-5 mx-auto mb-2 opacity-60" />
                    No individual vouchers match the current filters.
                  </TableCell>
                </TableRow>
              ) : singles.map((voucher) => {
                const isSelected = selected.includes(voucher.id);
                return (
                  <TableRow key={voucher.id} className={cn(isSelected && "bg-primary/5")}>
                    <TableCell className="text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(event) => onSelect(voucher.id, event.target.checked)}
                        className="rounded border-border text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                      />
                    </TableCell>
                    <TableCell className="font-mono text-xs font-bold text-primary">{voucher.id}</TableCell>
                    <TableCell>
                      <p className="text-xs font-semibold">{voucher.routerName}</p>
                      <p className="text-[10px] text-muted-foreground">{voucher.packageName}</p>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{voucher.phone || "Not linked"}</TableCell>
                    <TableCell className="text-xs font-bold">UGX {voucher.pricePaid.toLocaleString()}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{voucher.purchaseTime}</TableCell>
                    <TableCell>
                      <Badge className={cn("text-[10px] px-2 py-0 border-none", getStatusClass(voucher.status))}>{voucher.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => onCopy(voucher.id)} className="h-8 px-2 text-xs">Copy</Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={deletingVoucher}
                          onClick={() => onDeleteVoucher(voucher)}
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          title="Delete voucher from router and database"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

import { useState, useMemo, useEffect } from "react";
import { useBranchTransactions } from "@/hooks/useWallet";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  CreditCard,
  CheckCircle2,
  Calendar as CalendarIcon,
  Download,
  X,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
} from "lucide-react";
import { format, isToday, isThisWeek, isThisMonth, startOfDay, endOfDay } from "date-fns";
import { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";
import SettingsLayout from "./SettingsLayout";

interface Transaction {
  id: string;
  date: string; // ISO string
  description: string;
  amount: number;
  status: "Paid" | "Pending" | "Failed";
}


export default function BillingPage() {
  const [filter, setFilter] = useState<"all" | "today" | "week" | "month" | "custom">("all");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  // Fetch real transactions from wallet API
  const branchId = localStorage.getItem("selected-workspace") || "biltra";
  const { data: rawTransactions = [] } = useBranchTransactions(branchId, { limit: 100 });

  // Map API response to local Transaction interface
  const transactions: Transaction[] = useMemo(() => {
    return rawTransactions.map((tx) => ({
      id: tx.id.slice(0, 8).toUpperCase(),
      date: tx.created_at,
      description: tx.transaction_type === "deposit"
        ? `Deposit${tx.reference ? " " + tx.reference : ""}`
        : `Withdrawal${tx.reference ? " " + tx.reference : ""}`,
      amount: tx.transaction_type === "withdrawal" ? -tx.net_amount : tx.net_amount,
      status: "Paid" as const,
    }));
  }, [rawTransactions]);

  // Sorting Table State
  const [sortField, setSortField] = useState<keyof Transaction | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Pagination Table State
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 5;

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filter, dateRange]);

  // Handle Sort Change
  const handleSort = (field: keyof Transaction) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    setCurrentPage(1); // Reset page on sort
  };

  const filteredAndSortedTransactions = useMemo(() => {
    let result = transactions.filter((tx) => {
      const txDate = new Date(tx.date);

      if (filter === "today") {
        return isToday(txDate);
      }
      if (filter === "week") {
        return isThisWeek(txDate, { weekStartsOn: 1 });
      }
      if (filter === "month") {
        return isThisMonth(txDate);
      }
      if (filter === "custom" && dateRange?.from) {
        const start = startOfDay(dateRange.from);
        const end = dateRange.to ? endOfDay(dateRange.to) : endOfDay(dateRange.from);
        return txDate >= start && txDate <= end;
      }
      return true; // "all"
    });

    if (sortField) {
      result.sort((a, b) => {
        const valA = a[sortField];
        const valB = b[sortField];

        if (typeof valA === "number" && typeof valB === "number") {
          return sortDirection === 'asc' ? valA - valB : valB - valA;
        }

        const strA = String(valA).toLowerCase();
        const strB = String(valB).toLowerCase();

        if (strA < strB) return sortDirection === 'asc' ? -1 : 1;
        if (strA > strB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [filter, dateRange, sortField, sortDirection, transactions]);

  // Paginated Transactions
  const paginatedTransactions = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredAndSortedTransactions.slice(startIndex, startIndex + pageSize);
  }, [filteredAndSortedTransactions, currentPage]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSortedTransactions.length / pageSize));

  const handleDownloadInvoice = (txnId: string) => {
    alert(`Downloading invoice for transaction ${txnId}`);
  };

  return (
    <SettingsLayout title="Billing">
      <div className="max-w-7xl mx-auto px-6 sm:px-10 py-8">

        {/* Transactions Section */}
        <div className="space-y-4">

          {/* Filters Bar */}
          <div className="flex flex-wrap items-center gap-2 py-2">
            <div className="flex items-center rounded border border-primary p-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFilter("all");
                  setDateRange(undefined);
                }}
                className={cn(
                  "h-9 text-sm px-2.5 font-medium rounded transition-all",
                  filter === "all"
                    ? "bg-primary text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-transparent"
                )}
              >
                All time
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFilter("today");
                  setDateRange(undefined);
                }}
                className={cn(
                  "h-9 text-sm px-2.5 font-medium rounded transition-all",
                  filter === "today"
                    ? "bg-primary text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-transparent"
                )}
              >
                Today
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFilter("week");
                  setDateRange(undefined);
                }}
                className={cn(
                  "h-9 text-sm px-2.5 font-medium rounded transition-all",
                  filter === "week"
                    ? "bg-primary text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-transparent"
                )}
              >
                This week
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFilter("month");
                  setDateRange(undefined);
                }}
                className={cn(
                  "h-9 text-sm px-2.5 font-medium rounded transition-all",
                  filter === "month"
                    ? "bg-primary text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-transparent"
                )}
              >
                This month
              </Button>
            </div>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "h-12 text-sm border-border/50 px-4 flex items-center gap-1.5",
                    filter === "custom" && "border-primary/50 bg-primary/5 text-primary hover:bg-primary/10"
                  )}
                >
                  <CalendarIcon className="w-4 h-4" />
                  {dateRange?.from ? (
                    dateRange.to ? (
                      <>
                        {format(dateRange.from, "MMM dd, yyyy")} -{" "}
                        {format(dateRange.to, "MMM dd, yyyy")}
                      </>
                    ) : (
                      format(dateRange.from, "MMM dd, yyyy")
                    )
                  ) : (
                    <span>Custom range</span>
                  )}
                  {filter === "custom" && (
                    <span
                      className="ml-1 p-1 rounded-full hover:bg-primary/15 text-primary/70 hover:text-primary transition-colors cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFilter("all");
                        setDateRange(undefined);
                      }}
                    >
                      <X className="w-3 h-3" />
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  initialFocus
                  mode="range"
                  defaultMonth={dateRange?.from || new Date(2026, 5, 3)}
                  selected={dateRange}
                  onSelect={(range) => {
                    setDateRange(range);
                    if (range?.from) {
                      setFilter("custom");
                    }
                  }}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto rounded border border-border/10">
            <Table>
              <TableHeader className="bg-muted/40 font-semibold">
                <TableRow className="border-border/10">
                  <TableHead className="w-[120px] cursor-pointer hover:bg-muted/65 transition-colors" onClick={() => handleSort('id')}>
                    <div className="flex items-center gap-1 text-xs">
                      Transaction
                      <ChevronsUpDown className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                  </TableHead>
                  <TableHead className="cursor-pointer hover:bg-muted/65 transition-colors" onClick={() => handleSort('date')}>
                    <div className="flex items-center gap-1 text-xs">
                      Date
                      <ChevronsUpDown className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                  </TableHead>
                  <TableHead className="cursor-pointer hover:bg-muted/65 transition-colors" onClick={() => handleSort('description')}>
                    <div className="flex items-center gap-1 text-xs">
                      Description
                      <ChevronsUpDown className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                  </TableHead>
                  <TableHead className="cursor-pointer hover:bg-muted/65 transition-colors" onClick={() => handleSort('amount')}>
                    <div className="flex items-center gap-1 text-xs">
                      Amount
                      <ChevronsUpDown className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                  </TableHead>
                  <TableHead className="cursor-pointer hover:bg-muted/65 transition-colors" onClick={() => handleSort('status')}>
                    <div className="flex items-center gap-1 text-xs">
                      Status
                      <ChevronsUpDown className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAndSortedTransactions.length > 0 ? (
                  paginatedTransactions.map((tx) => (
                    <TableRow key={tx.id} className="cursor-pointer hover:bg-muted/30 group transition-colors">
                      <TableCell className="font-mono text-xs font-semibold text-primary">{tx.id}</TableCell>
                      <TableCell className="text-xs text-muted-foreground font-medium">
                        {format(new Date(tx.date), "MMM d, yyyy 'at' h:mm a")}
                      </TableCell>
                      <TableCell className="text-foreground font-semibold text-xs">{tx.description}</TableCell>
                      <TableCell className={cn(
                        "font-bold text-xs",
                        tx.amount < 0 ? "text-emerald-600" : "text-foreground"
                      )}>
                        {tx.amount < 0 ? "-" : ""}UGx {Math.abs(tx.amount).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-xs">
                        <Badge
                          variant="outline"
                          className={cn(
                            "px-2 py-0 border-none font-semibold rounded-full text-[10px]",
                            tx.status === "Paid" && "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20",
                            tx.status === "Pending" && "bg-amber-500/10 text-amber-500 hover:bg-amber-500/20",
                            tx.status === "Failed" && "bg-rose-500/10 text-rose-500 hover:bg-rose-500/20"
                          )}
                        >
                          {tx.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12">
                      <div className="flex flex-col items-center justify-center space-y-3">
                        <AlertCircle className="w-8 h-8 text-muted-foreground/60" />
                        <h3 className="text-sm font-bold">No transactions found</h3>
                        <p className="text-xs text-muted-foreground max-w-xs">
                          Try adjusting your date filters or range
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Table Pagination */}
          {filteredAndSortedTransactions.length > 0 && (
            <div className="flex items-center justify-between pt-4 mt-auto border-t border-border/20">
              <span className="text-xs text-muted-foreground">
                Showing <span className="font-semibold text-foreground">{(currentPage - 1) * pageSize + 1}</span> to{" "}
                <span className="font-semibold text-foreground">
                  {Math.min(currentPage * pageSize, filteredAndSortedTransactions.length)}
                </span>{" "}
                of <span className="font-semibold text-foreground">{filteredAndSortedTransactions.length}</span> transactions
              </span>

              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-full"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>

                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }).map((_, idx) => {
                    const pageNum = idx + 1;
                    return (
                      <Button
                        key={pageNum}
                        variant={currentPage === pageNum ? "default" : "outline"}
                        className="h-8 w-8 rounded-full text-xs font-semibold"
                        onClick={() => setCurrentPage(pageNum)}
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                </div>

                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-full"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </SettingsLayout>
  );
}

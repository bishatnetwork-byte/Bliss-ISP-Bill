/* eslint-disable @typescript-eslint/no-explicit-any */
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Bell, CheckCheck, Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

function timeLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

import {
  useDeleteNotification,
  useMarkAllRead,
  useNotifications,
  useUnreadCount,
} from "@/hooks/useNotifications";

export default function NotificationsDialog() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const { data: notificationsData, isLoading } = useNotifications({ limit: 8 });
  const { data: unreadCount = 0 } = useUnreadCount();

  const markAllReadMutation = useMarkAllRead();
  const deleteMutation = useDeleteNotification();

  const items = notificationsData?.notifications || [];

  const markAllRead = async () => {
    try {
      await markAllReadMutation.mutateAsync();
      toast.success("All notifications marked as read");
    } catch (err: any) {
      toast.error(err.message || "Failed to mark notifications read");
    }
  };

  const deleteNotification = async (id: string) => {
    try {
      await deleteMutation.mutateAsync(id);
      toast.success("Notification deleted");
    } catch (err: any) {
      toast.error(err.message || "Failed to delete notification");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          className="relative w-10 h-10 rounded-full flex items-center justify-center transition-colors"
          aria-label="Notifications"
        >
          <Bell className="w-[18px] h-[18px]" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-red-500 text-primary-foreground text-[10px] font-bold leading-4">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl p-0 overflow-hidden bg-white rounded-none">
        <DialogHeader className="px-5 py-4 border-b border-border/40">
          <div className="flex items-center justify-between pr-8">
            <DialogTitle className="text-base">Notifications</DialogTitle>
            <Button variant="ghost" size="sm" onClick={markAllRead} className="h-8 text-xs gap-1.5">
              <CheckCheck className="w-4 h-4" />
              Mark read
            </Button>
          </div>
        </DialogHeader>

        <div className="max-h-[420px] overflow-y-auto">
          {isLoading && items.length === 0 ? (
            <div className="h-28 flex items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Loading notifications...
            </div>
          ) : items.length === 0 ? (
            <div className="h-28 flex items-center justify-center text-sm text-muted-foreground">No notifications yet.</div>
          ) : (
            items.map((item) => (
              <div key={item.id} className="group px-5 py-3 border-b border-border/30 hover:bg-muted/30 transition-colors">
                <div className="flex items-start gap-3">
                  <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${item.is_read ? "bg-muted" : "bg-primary"}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground truncate">{item.title}</p>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase">{item.category}</span>
                    </div>
                    <p className="text-[13px] text-muted-foreground leading-relaxed mt-0.5">{item.body}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">{timeLabel(item.created_at)}</p>
                  </div>
                  <button onClick={() => deleteNotification(item.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all" aria-label="Delete notification">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="px-5 py-3 border-t border-border/40 bg-muted/20">
          <Button variant="outline" className="w-full h-9 text-xs" onClick={() => { setOpen(false); navigate("/notifications"); }}>
            View all notifications
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Eye, EyeOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function AuthInput(props: React.ComponentProps<typeof Input>) {
  return (
    <Input
      {...props}
      className={cn(
        "bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-primary/20",
        props.className,
      )}
    />
  );
}

export function PasswordInput({
  show,
  onToggle,
  className,
  ...props
}: React.ComponentProps<typeof Input> & { show: boolean; onToggle: () => void }) {
  return (
    <div className="relative">
      <AuthInput {...props} type={show ? "text" : "password"} className={cn("pr-10", className)} />
      <button
        type="button"
        onClick={onToggle}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
        aria-label={show ? "Hide password" : "Show password"}
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

export function SubmitButton({ children, isLoading }: { children: React.ReactNode; isLoading: boolean }) {
  return (
    <Button type="submit" disabled={isLoading} className="w-full h-10 mt-2 font-medium">
      {children}
    </Button>
  );
}

export function Divider() {
  return (
    <div className="w-full flex items-center my-6">
      <div className="flex-1 h-px bg-slate-200" />
      <span className="px-3 text-[11px] text-slate-300 font-medium uppercase">or</span>
      <div className="flex-1 h-px bg-slate-200" />
    </div>
  );
}

/** Measures its own width so the Google Identity button can be sized to match. */
export function GoogleButtonContainer({ children }: { children: (width: number) => React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width;
      if (next) setWidth(Math.floor(next));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="w-full flex justify-center">
      {width > 0 ? children(width) : null}
    </div>
  );
}

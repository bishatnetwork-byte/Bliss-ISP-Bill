import { Wifi } from "lucide-react";
import { cn } from "@/lib/utils";
import { VoucherTheme } from "./voucherThemes";
import { QRCodeSVG } from "qrcode.react";

export interface VoucherCardData {
  code: string;
  packageName: string;
  duration: string;
  price: number;
  batchId?: string;
  wifiName?: string;
}

export interface VoucherCardProps {
  voucher: VoucherCardData;
  theme: VoucherTheme;
  layoutDesign?: "classic" | "minimal" | "qrcode-left" | "qrcode-right" | "modern-gradient";
  showQrCode?: boolean;
  qrCodeFormat?: "code" | "gateway" | "custom";
  qrGatewayIp?: string;
  qrCustomUrl?: string;
  showWifiName?: boolean;
  customWifiName?: string;
  showPrice?: boolean;
  showPackage?: boolean;
}

export function getQrCodeText(
  code: string,
  format: "code" | "gateway" | "custom",
  gatewayIp: string,
  customUrl: string
): string {
  if (format === "gateway") {
    const ip = gatewayIp.replace(/https?:\/\//i, "").trim();
    return `http://${ip}/login?username=${code}`;
  }
  if (format === "custom") {
    return customUrl.replace("CODE", code).replace("{code}", code);
  }
  return code;
}

export function VoucherCard({
  voucher,
  theme,
  layoutDesign = "classic",
  showQrCode = false,
  qrCodeFormat = "code",
  qrGatewayIp = "10.0.0.1",
  qrCustomUrl = "",
  showWifiName = true,
  customWifiName = "",
  showPrice = true,
  showPackage = true,
}: VoucherCardProps) {
  const wifiDisplayName = customWifiName.trim() || voucher.wifiName || "TRESA WIFI";
  const qrValue = getQrCodeText(voucher.code, qrCodeFormat, qrGatewayIp, qrCustomUrl);

  const renderQrCode = (size: number = 36) => {
    if (!showQrCode) return null;
    return (
      <div className="flex shrink-0 items-center justify-center bg-white p-0.5 rounded border border-black/5 print-card-qr-container">
        <QRCodeSVG
          value={qrValue}
          size={size}
          marginSize={1}
          level="M"
          className="print-card-qr"
        />
      </div>
    );
  };

  // 1. CLASSIC DESIGN
  if (layoutDesign === "classic") {
    return (
      <div
        className={cn(
          "print-card group relative flex aspect-[368/176] w-full flex-col overflow-hidden rounded border bg-white shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md",
          theme.border
        )}
      >
        {/* Header */}
        <div className={cn("print-card-header flex items-center justify-between gap-1 px-2 py-1 text-white", theme.header)}>
          <div className="flex min-w-0 items-center gap-1">
            <Wifi className="print-card-icon h-3 w-3 shrink-0" />
            {showWifiName && (
              <span className="print-card-wifi truncate text-[8px] font-black uppercase tracking-wider">
                {wifiDisplayName}
              </span>
            )}
          </div>
          <span className="print-card-duration shrink-0 rounded-full bg-white/25 px-1.5 py-0.5 text-[7px] font-bold uppercase leading-none">
            {voucher.duration}
          </span>
        </div>

        {/* Code Section */}
        <div className={cn("print-card-code flex flex-1 items-center justify-between px-3 py-1 gap-2", theme.codeBg)}>
          <span className={cn(
            "print-card-code-text font-mono text-base font-black uppercase tracking-[0.12em]", 
            theme.codeText,
            showQrCode ? "text-sm text-left flex-1" : "text-center w-full"
          )}>
            {voucher.code}
          </span>
          {renderQrCode(34)}
        </div>

        {/* Footer */}
        <div className="print-card-footer flex items-center justify-between gap-1 border-t border-black/5 px-2 py-1 text-[8px] bg-white">
          {showPrice ? (
            <span className="print-card-price font-bold text-foreground/70">UGX {voucher.price.toLocaleString()}</span>
          ) : <span />}
          {showPackage ? (
            <span className={cn("print-card-package truncate font-semibold", theme.accent)}>{voucher.packageName}</span>
          ) : null}
        </div>
      </div>
    );
  }

  // 2. MINIMALIST DESIGN
  if (layoutDesign === "minimal") {
    return (
      <div
        className={cn(
          "print-card group relative flex aspect-[368/176] w-full flex-col overflow-hidden rounded border bg-white p-1.5 shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md",
          theme.border
        )}
      >
        {/* Top details */}
        <div className="flex items-center justify-between gap-1 border-b border-black/5 pb-1 text-[7px] font-semibold text-muted-foreground">
          {showWifiName ? (
            <span className={cn("truncate uppercase tracking-wider", theme.accent)}>
              {wifiDisplayName}
            </span>
          ) : <span />}
          <span className="bg-muted px-1.5 py-0.5 rounded-sm text-foreground/80 font-bold">
            {voucher.duration}
          </span>
        </div>

        {/* Code details */}
        <div className="flex flex-1 items-center justify-between py-1 gap-2">
          <span className={cn(
            "font-mono text-sm font-black uppercase tracking-[0.1em]",
            theme.codeText,
            showQrCode ? "text-left flex-1" : "text-center w-full"
          )}>
            {voucher.code}
          </span>
          {renderQrCode(30)}
        </div>

        {/* Bottom details */}
        <div className="flex items-center justify-between gap-1 border-t border-black/5 pt-1 text-[7px] font-bold">
          {showPrice ? (
            <span className="text-foreground/75">UGX {voucher.price.toLocaleString()}</span>
          ) : <span />}
          {showPackage ? (
            <span className="text-muted-foreground truncate">{voucher.packageName}</span>
          ) : null}
        </div>
      </div>
    );
  }

  // 3. QR-CODE LEFT DESIGN
  if (layoutDesign === "qrcode-left") {
    return (
      <div
        className={cn(
          "print-card group relative flex aspect-[368/176] w-full flex-row overflow-hidden rounded border bg-white p-1.5 shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md gap-2",
          theme.border
        )}
      >
        {/* Left column (QR Code) */}
        <div className="flex w-[35%] shrink-0 items-center justify-center">
          {showQrCode ? renderQrCode(38) : (
            <div className="flex h-10 w-10 items-center justify-center rounded bg-muted">
              <Wifi className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
        </div>

        {/* Right column (Text Info) */}
        <div className="flex flex-1 flex-col justify-between min-w-0">
          <div className="flex items-center justify-between gap-1">
            {showWifiName ? (
              <span className="truncate text-[7px] font-black uppercase tracking-wider text-muted-foreground">
                {wifiDisplayName}
              </span>
            ) : <span />}
            <span className="shrink-0 bg-muted px-1 py-0.5 rounded text-[6px] font-bold text-foreground/80 uppercase">
              {voucher.duration}
            </span>
          </div>

          <div className="my-0.5 min-w-0">
            <span className={cn("block font-mono text-[11px] font-black uppercase tracking-wider truncate", theme.codeText)}>
              {voucher.code}
            </span>
            {showPackage && (
              <span className={cn("block text-[6.5px] font-medium truncate uppercase", theme.accent)}>
                {voucher.packageName}
              </span>
            )}
          </div>

          <div className="border-t border-black/5 pt-0.5">
            {showPrice && (
              <span className="text-[7.5px] font-bold text-foreground/80">
                UGX {voucher.price.toLocaleString()}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 4. QR-CODE RIGHT DESIGN
  if (layoutDesign === "qrcode-right") {
    return (
      <div
        className={cn(
          "print-card group relative flex aspect-[368/176] w-full flex-row overflow-hidden rounded border bg-white p-1.5 shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md gap-2",
          theme.border
        )}
      >
        {/* Left column (Text Info) */}
        <div className="flex flex-1 flex-col justify-between min-w-0">
          <div className="flex items-center justify-between gap-1">
            {showWifiName ? (
              <span className="truncate text-[7px] font-black uppercase tracking-wider text-muted-foreground">
                {wifiDisplayName}
              </span>
            ) : <span />}
            <span className="shrink-0 bg-muted px-1 py-0.5 rounded text-[6px] font-bold text-foreground/80 uppercase">
              {voucher.duration}
            </span>
          </div>

          <div className="my-0.5 min-w-0">
            <span className={cn("block font-mono text-[11px] font-black uppercase tracking-wider truncate", theme.codeText)}>
              {voucher.code}
            </span>
            {showPackage && (
              <span className={cn("block text-[6.5px] font-medium truncate uppercase", theme.accent)}>
                {voucher.packageName}
              </span>
            )}
          </div>

          <div className="border-t border-black/5 pt-0.5">
            {showPrice && (
              <span className="text-[7.5px] font-bold text-foreground/80">
                UGX {voucher.price.toLocaleString()}
              </span>
            )}
          </div>
        </div>

        {/* Right column (QR Code) */}
        <div className="flex w-[35%] shrink-0 items-center justify-center">
          {showQrCode ? renderQrCode(38) : (
            <div className="flex h-10 w-10 items-center justify-center rounded bg-muted">
              <Wifi className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
        </div>
      </div>
    );
  }

  // 5. MODERN GRADIENT DESIGN
  return (
    <div
      className={cn(
        "print-card group relative flex aspect-[368/176] w-full flex-col overflow-hidden rounded border shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md p-1.5 text-white",
        theme.header,
        theme.border
      )}
    >
      {/* Top row */}
      <div className="flex items-center justify-between gap-1 text-[7px] font-bold text-white/80">
        <div className="flex items-center gap-1 min-w-0">
          <Wifi className="h-2 w-2 shrink-0" />
          {showWifiName && <span className="truncate uppercase tracking-wider">{wifiDisplayName}</span>}
        </div>
        <span className="bg-white/20 px-1.5 py-0.5 rounded text-[6.5px] font-black uppercase">
          {voucher.duration}
        </span>
      </div>

      {/* Middle Code */}
      <div className="flex flex-1 items-center justify-between gap-2 my-1">
        <div className="bg-white/15 backdrop-blur-sm border border-white/10 rounded px-2 py-1 flex-1 flex items-center justify-center h-8">
          <span className="font-mono text-sm font-black uppercase tracking-[0.1em] text-white">
            {voucher.code}
          </span>
        </div>
        {renderQrCode(32)}
      </div>

      {/* Bottom details */}
      <div className="flex items-center justify-between gap-1 text-[7px] border-t border-white/10 pt-1 text-white/85">
        {showPrice ? (
          <span className="font-extrabold">UGX {voucher.price.toLocaleString()}</span>
        ) : <span />}
        {showPackage ? (
          <span className="truncate font-medium italic">{voucher.packageName}</span>
        ) : null}
      </div>
    </div>
  );
}

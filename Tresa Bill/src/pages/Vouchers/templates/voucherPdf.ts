import QRCode from "qrcode";
import { DEFAULT_VOUCHER_THEME_ID, getVoucherTheme, VoucherThemePdfColors } from "./voucherThemes";
import { getQrCodeText } from "./VoucherCard";

export interface VoucherPdfRow {
  code: string;
  packageName: string;
  duration: string;
  price: number;
  status: string;
  batchId?: string;
  wifiName?: string;
}

export interface DownloadVoucherPdfOptions {
  themeId?: string;
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

// A4 page in points, 5 columns x 15 rows -> 75 cards/page.
const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 18;
const COLS = 5;
const ROWS = 15;
const GAP = 4;
const CARD_W = (PAGE_W - 2 * MARGIN - (COLS - 1) * GAP) / COLS;
const CARD_H = (PAGE_H - 2 * MARGIN - (ROWS - 1) * GAP) / ROWS;
const PER_PAGE = COLS * ROWS;

const HEADER_H = 13;
const FOOTER_H = 11;

function pdfText(value: string) {
  return value
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function num(value: number) {
  return value.toFixed(2);
}

function rgb(color: [number, number, number]) {
  return `${color[0].toFixed(3)} ${color[1].toFixed(3)} ${color[2].toFixed(3)}`;
}

function textAt(x: number, y: number, font: "F1" | "F2", size: number, color: [number, number, number], text: string) {
  return [
    "BT",
    `/${font} ${size} Tf`,
    `${rgb(color)} rg`,
    `1 0 0 1 ${num(x)} ${num(y)} Tm`,
    `(${pdfText(text)}) Tj`,
    "ET",
  ].join("\n");
}

// Helvetica/Helvetica-Bold average glyph width as a fraction of font size.
const CHAR_WIDTH_FACTOR = 0.58;

function estimateWidth(text: string, size: number) {
  return text.length * size * CHAR_WIDTH_FACTOR;
}

function drawQrCodePDF(
  qrText: string,
  qrX: number,
  qrY: number,
  qrW: number,
  qrH: number
): string {
  try {
    const qrData = QRCode.create(qrText, { errorCorrectionLevel: "M" });
    const modules = qrData.modules;
    const size = modules.size;
    const modW = qrW / size;
    const modH = qrH / size;
    const commands: string[] = [];

    // Draw a white background square first
    commands.push("1.0 1.0 1.0 rg", `${num(qrX)} ${num(qrY)} ${num(qrW)} ${num(qrH)} re f`);

    // Draw the black modules
    commands.push("0.0 0.0 0.0 rg");
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (modules.get(r, c)) {
          // PDF coordinate system starts bottom-left, so flip row
          const px = qrX + c * modW;
          const py = qrY + (size - 1 - r) * modH;
          commands.push(`${num(px)} ${num(py)} ${num(modW)} ${num(modH)} re f`);
        }
      }
    }
    return commands.join("\n");
  } catch (err) {
    console.error("Failed to generate QR code in PDF", err);
    return "";
  }
}

function cardCommands(
  row: VoucherPdfRow,
  x: number,
  yTop: number,
  theme: VoucherThemePdfColors,
  options: DownloadVoucherPdfOptions
) {
  const layoutDesign = options.layoutDesign || "classic";
  const showQrCode = options.showQrCode ?? false;
  const qrCodeFormat = options.qrCodeFormat || "code";
  const qrGatewayIp = options.qrGatewayIp || "10.0.0.1";
  const qrCustomUrl = options.qrCustomUrl || "";
  const showWifiName = options.showWifiName ?? true;
  const customWifiName = options.customWifiName || "";
  const showPrice = options.showPrice ?? true;
  const showPackage = options.showPackage ?? true;

  const yBottom = yTop - CARD_H;
  const codeH = CARD_H - HEADER_H - FOOTER_H;
  const commands: string[] = [];

  const wifiDisplayName = (customWifiName.trim() || row.wifiName || "TRESA WIFI").toUpperCase();
  const durationText = row.duration.toUpperCase();
  const priceText = `UGX ${row.price.toLocaleString()}`;
  let pkgText = row.packageName.toUpperCase();
  if (pkgText.length > 14) pkgText = `${pkgText.slice(0, 13)}...`;

  const qrText = getQrCodeText(row.code, qrCodeFormat, qrGatewayIp, qrCustomUrl);

  // ── 1. CLASSIC DESIGN ──
  if (layoutDesign === "classic") {
    // Card border
    commands.push(`${rgb(theme.border)} RG`, "0.6 w", `${num(x)} ${num(yBottom)} ${num(CARD_W)} ${num(CARD_H)} re S`);

    // Header band
    commands.push(`${rgb(theme.header)} rg`, `${num(x)} ${num(yTop - HEADER_H)} ${num(CARD_W)} ${num(HEADER_H)} re f`);

    // Header Wifi Name
    if (showWifiName) {
      commands.push(textAt(x + 4, yTop - 9.0, "F2", 6, [1, 1, 1], wifiDisplayName));
    }
    // Header Duration
    const durationWidth = estimateWidth(durationText, 6);
    commands.push(textAt(x + CARD_W - durationWidth - 4, yTop - 9.0, "F2", 6, [1, 1, 1], durationText));

    // Code section background
    commands.push(`${rgb(theme.codeBg)} rg`, `${num(x)} ${num(yBottom + FOOTER_H)} ${num(CARD_W)} ${num(codeH)} re f`);

    // Code text + QR
    if (showQrCode) {
      const qrSize = 26;
      const qrX = x + CARD_W - qrSize - 4;
      const qrY = yBottom + FOOTER_H + (codeH - qrSize) / 2;
      commands.push(drawQrCodePDF(qrText, qrX, qrY, qrSize, qrSize));

      // Code text shifted left
      const codeFontSize = 11;
      const codeText = row.code;
      const codeWidth = estimateWidth(codeText, codeFontSize);
      const codeX = x + Math.max(3, (CARD_W - qrSize - 8 - codeWidth) / 2);
      const codeY = yBottom + FOOTER_H + codeH / 2 - codeFontSize * 0.35;
      commands.push(textAt(codeX, codeY, "F2", codeFontSize, theme.codeText, codeText));
    } else {
      // Centered code text
      const codeFontSize = 13;
      const codeText = row.code;
      const codeWidth = estimateWidth(codeText, codeFontSize);
      const codeX = x + Math.max(2, (CARD_W - codeWidth) / 2);
      const codeY = yBottom + FOOTER_H + codeH / 2 - codeFontSize * 0.35;
      commands.push(textAt(codeX, codeY, "F2", codeFontSize, theme.codeText, codeText));
    }

    // Footer divider
    commands.push(`${rgb(theme.border)} RG`, "0.4 w", `${num(x)} ${num(yBottom + FOOTER_H)} m ${num(x + CARD_W)} ${num(yBottom + FOOTER_H)} l S`);

    // Footer details
    if (showPrice) {
      commands.push(textAt(x + 3.5, yBottom + 3.6, "F1", 5.5, theme.footerText, priceText));
    }
    if (showPackage) {
      const pkgWidth = estimateWidth(pkgText, 5.5);
      commands.push(textAt(x + CARD_W - pkgWidth - 3.5, yBottom + 3.6, "F1", 5.5, theme.codeText, pkgText));
    }
  }

  // ── 2. MINIMALIST DESIGN ──
  else if (layoutDesign === "minimal") {
    // Card border
    commands.push(`${rgb(theme.border)} RG`, "0.6 w", `${num(x)} ${num(yBottom)} ${num(CARD_W)} ${num(CARD_H)} re S`);

    // Top Details (No colored band)
    if (showWifiName) {
      commands.push(textAt(x + 4, yTop - 9.0, "F2", 5.5, theme.codeText, wifiDisplayName));
    }
    const durationWidth = estimateWidth(durationText, 5.5);
    commands.push(textAt(x + CARD_W - durationWidth - 4, yTop - 9.0, "F2", 5.5, theme.codeText, durationText));

    // Divider line below top details
    commands.push(`${rgb(theme.border)} RG`, "0.4 w", `${num(x + 3)} ${num(yTop - 11)} m ${num(x + CARD_W - 3)} ${num(yTop - 11)} l S`);

    // Code area (white bg)
    if (showQrCode) {
      const qrSize = 25;
      const qrX = x + CARD_W - qrSize - 4;
      const qrY = yBottom + FOOTER_H + (codeH - qrSize) / 2 - 2;
      commands.push(drawQrCodePDF(qrText, qrX, qrY, qrSize, qrSize));

      const codeFontSize = 10;
      const codeText = row.code;
      const codeWidth = estimateWidth(codeText, codeFontSize);
      const codeX = x + Math.max(3, (CARD_W - qrSize - 8 - codeWidth) / 2);
      const codeY = yBottom + FOOTER_H + codeH / 2 - codeFontSize * 0.35 - 2;
      commands.push(textAt(codeX, codeY, "F2", codeFontSize, theme.codeText, codeText));
    } else {
      const codeFontSize = 12;
      const codeText = row.code;
      const codeWidth = estimateWidth(codeText, codeFontSize);
      const codeX = x + Math.max(2, (CARD_W - codeWidth) / 2);
      const codeY = yBottom + FOOTER_H + codeH / 2 - codeFontSize * 0.35 - 2;
      commands.push(textAt(codeX, codeY, "F2", codeFontSize, theme.codeText, codeText));
    }

    // Divider line above footer
    commands.push(`${rgb(theme.border)} RG`, "0.4 w", `${num(x + 3)} ${num(yBottom + FOOTER_H)} m ${num(x + CARD_W - 3)} ${num(yBottom + FOOTER_H)} l S`);

    // Footer details
    if (showPrice) {
      commands.push(textAt(x + 4, yBottom + 3.6, "F1", 5.5, theme.footerText, priceText));
    }
    if (showPackage) {
      const pkgWidth = estimateWidth(pkgText, 5.5);
      commands.push(textAt(x + CARD_W - pkgWidth - 4, yBottom + 3.6, "F1", 5.5, theme.footerText, pkgText));
    }
  }

  // ── 3. QR-CODE LEFT DESIGN ──
  else if (layoutDesign === "qrcode-left") {
    // Card border
    commands.push(`${rgb(theme.border)} RG`, "0.6 w", `${num(x)} ${num(yBottom)} ${num(CARD_W)} ${num(CARD_H)} re S`);

    // Draw QR Code on the Left
    const qrSize = 31;
    const qrX = x + 4.5;
    const qrY = yBottom + (CARD_H - qrSize) / 2;
    commands.push(drawQrCodePDF(qrText, qrX, qrY, qrSize, qrSize));

    // Text details on the Right
    const xRight = x + qrSize + 9;

    // WiFi Name
    if (showWifiName) {
      commands.push(textAt(xRight, yTop - 9.0, "F2", 5.5, theme.codeText, wifiDisplayName));
    }
    // Duration
    const durationWidth = estimateWidth(durationText, 5.5);
    commands.push(textAt(x + CARD_W - durationWidth - 4, yTop - 9.0, "F2", 5.5, theme.footerText, durationText));

    // Code
    const codeFontSize = 9.5;
    const codeText = row.code;
    commands.push(textAt(xRight, yBottom + 21, "F2", codeFontSize, theme.codeText, codeText));

    // Package Name
    if (showPackage) {
      commands.push(textAt(xRight, yBottom + 13, "F1", 5.0, theme.accent, pkgText));
    }

    // Price
    if (showPrice) {
      commands.push(textAt(xRight, yBottom + 5, "F2", 5.5, theme.footerText, priceText));
    }
  }

  // ── 4. QR-CODE RIGHT DESIGN ──
  else if (layoutDesign === "qrcode-right") {
    // Card border
    commands.push(`${rgb(theme.border)} RG`, "0.6 w", `${num(x)} ${num(yBottom)} ${num(CARD_W)} ${num(CARD_H)} re S`);

    // Draw QR Code on the Right
    const qrSize = 31;
    const qrX = x + CARD_W - qrSize - 4.5;
    const qrY = yBottom + (CARD_H - qrSize) / 2;
    commands.push(drawQrCodePDF(qrText, qrX, qrY, qrSize, qrSize));

    // Text details on the Left
    const xLeft = x + 4.5;

    // WiFi Name
    if (showWifiName) {
      commands.push(textAt(xLeft, yTop - 9.0, "F2", 5.5, theme.codeText, wifiDisplayName));
    }
    // Duration
    const durationWidth = estimateWidth(durationText, 5.5);
    commands.push(textAt(x + CARD_W - qrSize - 8 - durationWidth, yTop - 9.0, "F2", 5.5, theme.footerText, durationText));

    // Code
    const codeFontSize = 9.5;
    const codeText = row.code;
    commands.push(textAt(xLeft, yBottom + 21, "F2", codeFontSize, theme.codeText, codeText));

    // Package Name
    if (showPackage) {
      commands.push(textAt(xLeft, yBottom + 13, "F1", 5.0, theme.accent, pkgText));
    }

    // Price
    if (showPrice) {
      commands.push(textAt(xLeft, yBottom + 5, "F2", 5.5, theme.footerText, priceText));
    }
  }

  // ── 5. MODERN GRADIENT DESIGN ──
  else if (layoutDesign === "modern-gradient") {
    // Background (Fill entire card with theme header color)
    commands.push(`${rgb(theme.header)} rg`, `${num(x)} ${num(yBottom)} ${num(CARD_W)} ${num(CARD_H)} re f`);
    commands.push(`${rgb(theme.border)} RG`, "0.6 w", `${num(x)} ${num(yBottom)} ${num(CARD_W)} ${num(CARD_H)} re S`);

    // Top Wifi Name
    if (showWifiName) {
      commands.push(textAt(x + 4.5, yTop - 9.0, "F2", 5.5, [1, 1, 1], wifiDisplayName));
    }
    // Duration
    const durationWidth = estimateWidth(durationText, 5.5);
    commands.push(textAt(x + CARD_W - durationWidth - 4.5, yTop - 9.0, "F2", 5.5, [1, 1, 1], durationText));

    // Code box / QR
    if (showQrCode) {
      const qrSize = 25;
      const qrX = x + CARD_W - qrSize - 4.5;
      const qrY = yBottom + FOOTER_H + (codeH - qrSize) / 2;
      commands.push(drawQrCodePDF(qrText, qrX, qrY, qrSize, qrSize));

      // Translucent Code box (using white in PDF, but offset from background)
      const boxW = CARD_W - qrSize - 12;
      const boxH = 14;
      const boxX = x + 4.5;
      const boxY = yBottom + FOOTER_H + (codeH - boxH) / 2;
      commands.push("1.0 1.0 1.0 rg", `${num(boxX)} ${num(boxY)} ${num(boxW)} ${num(boxH)} re f`);

      const codeFontSize = 9.5;
      const codeText = row.code;
      const codeWidth = estimateWidth(codeText, codeFontSize);
      const codeX = boxX + (boxW - codeWidth) / 2;
      const codeY = boxY + boxH / 2 - codeFontSize * 0.35;
      commands.push(textAt(codeX, codeY, "F2", codeFontSize, theme.codeText, codeText));
    } else {
      // Centered Code box
      const boxW = CARD_W - 9;
      const boxH = 16;
      const boxX = x + 4.5;
      const boxY = yBottom + FOOTER_H + (codeH - boxH) / 2;
      commands.push("1.0 1.0 1.0 rg", `${num(boxX)} ${num(boxY)} ${num(boxW)} ${num(boxH)} re f`);

      const codeFontSize = 11.5;
      const codeText = row.code;
      const codeWidth = estimateWidth(codeText, codeFontSize);
      const codeX = boxX + (boxW - codeWidth) / 2;
      const codeY = boxY + boxH / 2 - codeFontSize * 0.35;
      commands.push(textAt(codeX, codeY, "F2", codeFontSize, theme.codeText, codeText));
    }

    // Divider
    commands.push("0.9 0.9 0.9 RG", "0.4 w", `${num(x + 4.5)} ${num(yBottom + FOOTER_H)} m ${num(x + CARD_W - 4.5)} ${num(yBottom + FOOTER_H)} l S`);

    // Bottom details
    if (showPrice) {
      commands.push(textAt(x + 4.5, yBottom + 3.6, "F1", 5.5, [0.95, 0.95, 0.95], priceText));
    }
    if (showPackage) {
      const pkgWidth = estimateWidth(pkgText, 5.5);
      commands.push(textAt(x + CARD_W - pkgWidth - 4.5, yBottom + 3.6, "F1", 5.5, [0.95, 0.95, 0.95], pkgText));
    }
  }

  return commands.join("\n");
}

function makePageContent(
  rows: VoucherPdfRow[],
  theme: VoucherThemePdfColors,
  options: DownloadVoucherPdfOptions
) {
  const commands: string[] = [];
  rows.forEach((row, index) => {
    const col = index % COLS;
    const line = Math.floor(index / COLS);
    const x = MARGIN + col * (CARD_W + GAP);
    const yTop = PAGE_H - MARGIN - line * (CARD_H + GAP);
    commands.push(cardCommands(row, x, yTop, theme, options));
  });
  return commands.join("\n");
}

/**
 * Generates and downloads a customized, colorful voucher PDF.
 */
export function downloadVoucherPdf(
  rows: VoucherPdfRow[],
  filename: string,
  optionsOrThemeId?: string | DownloadVoucherPdfOptions
) {
  if (rows.length === 0) return;

  let options: DownloadVoucherPdfOptions = {};
  if (typeof optionsOrThemeId === "string") {
    options = { themeId: optionsOrThemeId };
  } else if (optionsOrThemeId) {
    options = optionsOrThemeId;
  }

  const themeId = options.themeId || DEFAULT_VOUCHER_THEME_ID;
  const theme = getVoucherTheme(themeId).pdf;

  const chunks: string[] = [];
  for (let index = 0; index < rows.length; index += PER_PAGE) {
    chunks.push(makePageContent(rows.slice(index, index + PER_PAGE), theme, options));
  }

  const objects: string[] = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  const pageObjectIds = chunks.map((_, index) => 5 + index * 2);
  objects[2] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${chunks.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";

  chunks.forEach((content, index) => {
    const pageId = 5 + index * 2;
    const contentId = pageId + 1;
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  });

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = pdf.length;
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) {
    pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  const blob = new Blob([pdf], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

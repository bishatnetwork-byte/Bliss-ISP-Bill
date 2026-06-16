// Color themes for voucher print/PDF templates.
// `pdf` values are 0-1 RGB triples used directly by the PDF content stream `rg`/`RG` operators.
export interface VoucherThemePdfColors {
  header: [number, number, number];
  codeBg: [number, number, number];
  codeText: [number, number, number];
  footerText: [number, number, number];
  border: [number, number, number];
}

export interface VoucherTheme {
  id: string;
  name: string;
  /** Small gradient swatch shown in the theme picker */
  swatch: string;
  /** Card header band */
  header: string;
  /** Code section background */
  codeBg: string;
  /** Code text color */
  codeText: string;
  /** Card border color */
  border: string;
  /** Footer package-name accent color */
  accent: string;
  pdf: VoucherThemePdfColors;
}

export const VOUCHER_THEMES: VoucherTheme[] = [
  {
    id: "violet",
    name: "Violet Pulse",
    swatch: "bg-gradient-to-br from-violet-500 to-indigo-600",
    header: "bg-gradient-to-r from-violet-600 to-indigo-600",
    codeBg: "bg-violet-50/50",
    codeText: "text-violet-700",
    border: "border-violet-200",
    accent: "text-violet-600",
    pdf: {
      header: [0.42, 0.32, 0.85],
      codeBg: [0.96, 0.94, 1],
      codeText: [0.35, 0.22, 0.62],
      footerText: [0.42, 0.42, 0.48],
      border: [0.85, 0.82, 0.96],
    },
  },
  {
    id: "ocean",
    name: "Ocean Blue",
    swatch: "bg-gradient-to-br from-sky-400 to-blue-600",
    header: "bg-gradient-to-r from-sky-500 to-blue-600",
    codeBg: "bg-sky-50/50",
    codeText: "text-blue-700",
    border: "border-sky-200",
    accent: "text-blue-600",
    pdf: {
      header: [0.06, 0.58, 0.89],
      codeBg: [0.91, 0.96, 1],
      codeText: [0.06, 0.34, 0.6],
      footerText: [0.42, 0.42, 0.48],
      border: [0.8, 0.92, 1],
    },
  },
  {
    id: "sunset",
    name: "Sunset Amber",
    swatch: "bg-gradient-to-br from-amber-400 to-orange-600",
    header: "bg-gradient-to-r from-amber-500 to-orange-600",
    codeBg: "bg-amber-50/50",
    codeText: "text-orange-700",
    border: "border-amber-200",
    accent: "text-orange-600",
    pdf: {
      header: [0.96, 0.62, 0.07],
      codeBg: [1, 0.96, 0.87],
      codeText: [0.7, 0.35, 0.02],
      footerText: [0.42, 0.42, 0.48],
      border: [1, 0.92, 0.78],
    },
  },
  {
    id: "forest",
    name: "Forest Green",
    swatch: "bg-gradient-to-br from-emerald-400 to-teal-600",
    header: "bg-gradient-to-r from-emerald-500 to-teal-600",
    codeBg: "bg-emerald-50/50",
    codeText: "text-emerald-700",
    border: "border-emerald-200",
    accent: "text-emerald-600",
    pdf: {
      header: [0.02, 0.59, 0.41],
      codeBg: [0.89, 0.98, 0.93],
      codeText: [0.02, 0.4, 0.28],
      footerText: [0.42, 0.42, 0.48],
      border: [0.8, 0.94, 0.87],
    },
  },
  {
    id: "rose",
    name: "Pink Rose",
    swatch: "bg-gradient-to-br from-rose-400 to-pink-600",
    header: "bg-gradient-to-r from-rose-500 to-pink-600",
    codeBg: "bg-rose-50/50",
    codeText: "text-rose-700",
    border: "border-rose-200",
    accent: "text-rose-600",
    pdf: {
      header: [0.88, 0.28, 0.44],
      codeBg: [1.0, 0.94, 0.96],
      codeText: [0.72, 0.16, 0.32],
      footerText: [0.42, 0.42, 0.48],
      border: [0.96, 0.82, 0.86],
    },
  },
  {
    id: "luxury",
    name: "Luxury Gold",
    swatch: "bg-gradient-to-br from-slate-900 via-amber-950 to-slate-900",
    header: "bg-gradient-to-r from-slate-900 to-amber-950",
    codeBg: "bg-amber-50/10",
    codeText: "text-amber-600 font-bold",
    border: "border-amber-400/40",
    accent: "text-amber-500",
    pdf: {
      header: [0.08, 0.09, 0.12],
      codeBg: [0.98, 0.97, 0.94],
      codeText: [0.74, 0.54, 0.15],
      footerText: [0.42, 0.42, 0.48],
      border: [0.85, 0.72, 0.45],
    },
  },
  {
    id: "mono",
    name: "Classic Mono",
    swatch: "bg-gradient-to-br from-slate-500 to-slate-800",
    header: "bg-gradient-to-r from-slate-700 to-slate-900",
    codeBg: "bg-slate-50/50",
    codeText: "text-slate-800",
    border: "border-slate-200",
    accent: "text-slate-600",
    pdf: {
      header: [0.2, 0.23, 0.29],
      codeBg: [0.96, 0.97, 0.98],
      codeText: [0.12, 0.14, 0.18],
      footerText: [0.42, 0.42, 0.48],
      border: [0.85, 0.87, 0.9],
    },
  },
];

export const DEFAULT_VOUCHER_THEME_ID = VOUCHER_THEMES[0].id;

export function getVoucherTheme(id: string): VoucherTheme {
  return VOUCHER_THEMES.find((theme) => theme.id === id) || VOUCHER_THEMES[0];
}

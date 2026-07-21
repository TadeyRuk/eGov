export type Benefit = {
  id: string;
  agency: string;
  agencyColor: string;
  tileBg: string;
  initial: string;
  title: string;
  amount: string;
  reason: string;
};

export const BENEFITS: Benefit[] = [
  {
    id: "sss",
    agency: "SSS",
    agencyColor: "#2563EB",
    tileBg: "#DBEAFE",
    initial: "S",
    title: "Senior Citizen Pension",
    amount: "₱1,000 / buwan",
    reason: "Ikaw ay 60 taong gulang pataas ayon sa iyong PhilSys record.",
  },
  {
    id: "philhealth",
    agency: "PhilHealth",
    agencyColor: "#16A34A",
    tileBg: "#DCFCE7",
    initial: "+",
    title: "Senior Citizen Premium Subsidy",
    amount: "Libreng premium",
    reason: "Awtomatikong sakop bilang rehistradong senior citizen.",
  },
  {
    id: "dswd",
    agency: "DSWD",
    agencyColor: "#B45309",
    tileBg: "#FEF3C7",
    initial: "D",
    title: "Tulong Pinansyal para sa Balo",
    amount: "₱3,000 (one-time)",
    reason: "Naitala bilang balo batay sa civil status mula PSA.",
  },
];

export type Project = {
  id: string;
  title: string;
  agency: string;
  location: string;
  utilization: number;
  status: string;
  statusColor: string;
};

export type ReportCategory = { value: string; label: string };

export const REPORT_CATS: ReportCategory[] = [
  { value: "delayed", label: "Naantalang Proyekto" },
  { value: "amount", label: "Maling Halaga" },
  { value: "corruption", label: "Hinihinalang Katiwalian" },
  { value: "other", label: "Iba pa" },
];

export const SCREEN_LABELS = [
  "Onboarding",
  "SSO Login",
  "Face Scan",
  "eVerify",
  "Benepisyo",
  "Detalye & Bayad",
  "Transparency",
  "Search",
  "Bayad",
];
export const DISBURSE_LABELS = [
  "Na-verify ang pagiging kwalipikado",
  "Ipoproseso sa eGovPay",
  "Ipinadala sa iyong account",
  "Naka-anchor sa eGovChain",
];

export type HomeFeature = { kind: "scan" | "id" | "list" | "wallet" | "flag"; bg: string; iconColor: string; label: string; badge?: boolean };

/** Home shortcut → screen id */
export const FEATURE_SCREENS: Record<HomeFeature["kind"], number> = {
  scan: 1,
  id: 3,
  list: 4,
  wallet: 8,
  flag: 6,
};

export const HOME_FEATURES: HomeFeature[] = [
  { kind: "scan", bg: "#DBEAFE", iconColor: "#2563EB", label: "Mag-scan" },
  { kind: "id", bg: "#DCFCE7", iconColor: "#16A34A", label: "ID Verify" },
  { kind: "list", bg: "#FEF3C7", iconColor: "#D97706", label: "Benepisyo" },
  { kind: "wallet", bg: "#FCE7F3", iconColor: "#DB2777", label: "Bayad" },
  { kind: "flag", bg: "#EDE4FE", iconColor: "#7C3AED", label: "Ulat", badge: true },
];

export type MockId = { name: string; id: string };

export const MOCK_IDS: MockId[] = [
  { name: "Juan Dela Cruz", id: "4827-1093-5561-2204" },
  { name: "Maria Santos", id: "7710-2284-9013-6650" },
  { name: "Ricardo Bautista", id: "3391-8847-1025-4478" },
];

export type AiQuestion = { q: string; a: string };

export const AI_QUESTIONS: AiQuestion[] = [
  { q: "Bakit ako kwalipikado?", a: "Batay sa iyong PhilSys record, ikaw ay 60 taong gulang pataas — kaya kwalipikado ka sa Senior Citizen Pension ng SSS." },
  { q: "Kailan ako babayaran?", a: "Karaniwang 3-5 araw pagkatapos ma-verify ang iyong pagiging kwalipikado, ipoproseso ang bayad sa pamamagitan ng eGovPay." },
  { q: "Paano kung may problema?", a: "Maaari kang mag-report gamit ang eReport mula sa Ulat tab — awtomatikong makakatanggap ka ng Case ID." },
];

export type Tab = { key: string; kind: "home" | "scan" | "id" | "list" | "flag"; screens: number[] };

export const TABS: Tab[] = [
  { key: "home", kind: "home", screens: [0, 7, 8] },
  { key: "scan", kind: "scan", screens: [1, 2] },
  { key: "id", kind: "id", screens: [3] },
  { key: "benepisyo", kind: "list", screens: [4, 5] },
  { key: "ulat", kind: "flag", screens: [6] },
];

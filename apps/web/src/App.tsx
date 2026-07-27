import { useEffect, useRef, useState, type ReactNode } from "react";
import bangonLogo from "./assets/bangon-logo-cropped.png";
import { api, ApiError } from "./api";
import {
  AI_QUESTIONS,
  BENEFITS,
  DISBURSE_LABELS,
  FEATURE_SCREENS,
  HOME_FEATURES,
  REPORT_CATS,
  TABS,
  type Benefit,
  type HomeFeature,
  type Project,
} from "./data";
import {
  FlagIcon,
  IdIcon,
  ListIcon,
  ScanIcon,
  TabFlagIcon,
  TabHomeIcon,
  TabIdIcon,
  TabListIcon,
  TabScanIcon,
  WalletIcon,
} from "./icons";

type AiMessage = { role: "ai" | "user"; text: string };
type NavDirection = "forward" | "back";

type CitizenProfile = {
  firstName: string;
  lastName: string;
  birthDate: string;
  civilStatus: string;
  vitalStatus: string;
  email?: string;
  contactNumber?: string;
};

// Live eGov integrations are the default. Enable the local seeded shell only
// when explicitly requested with VITE_DEMO_MODE=true.
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";

/** Local demo session — skips SSO minting so the shell opens already signed in. */
const DEMO_SESSION: {
  accessToken: string;
  citizenId: string;
  profile: CitizenProfile;
} = {
  accessToken: "demo-session",
  citizenId: "demo-citizen",
  profile: {
    firstName: "Juan",
    lastName: "Dela Cruz",
    birthDate: "1958-03-14",
    // Seed rules use English PSA tokens; UI may still show Filipino labels.
    civilStatus: "WIDOWED",
    vitalStatus: "ALIVE",
  },
};

function isDemoSession(token: string): boolean {
  return token === DEMO_SESSION.accessToken;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadScriptOnce(id: string, src: string): Promise<void> {
  const existing = document.getElementById(id) as HTMLScriptElement | null;
  if (existing?.dataset.loaded === "true") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = existing ?? document.createElement("script");
    script.id = id;
    script.src = src;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", () => {
      script.dataset.loaded = "true";
      resolve();
    }, { once: true });
    script.addEventListener("error", () => reject(new Error(`Unable to load ${src}`)), {
      once: true,
    });
    if (!existing) document.body.append(script);
  });
}

/** Local fallback matches when API/DBM are unavailable in the demo shell. */
function demoFallbackMatches(): Array<{ id: string; benefitId: string }> {
  return BENEFITS.map((b) => ({ id: `demo-match-${b.id}`, benefitId: b.id }));
}

function demoTransparencyProjects(): Project[] {
  return [
    { id: "demo-project-1", title: "Senior Citizen Assistance", agency: "DSWD", location: "Quezon City", utilization: 82, status: "Ongoing", statusColor: "#D97706" },
    { id: "demo-project-2", title: "PhilHealth Premium Subsidy", agency: "PhilHealth", location: "Cebu City", utilization: 100, status: "Completed", statusColor: "#16A34A" },
  ];
}

function useDeferredOpen(open: boolean, durationMs = 280) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
      return () => cancelAnimationFrame(id);
    }
    setVisible(false);
    const timer = setTimeout(() => setMounted(false), durationMs);
    return () => clearTimeout(timer);
  }, [open, durationMs]);

  return { mounted, visible };
}

function AnimatedSheet({
  open,
  onClose,
  children,
  sheetClassName = "sheet-panel",
  backdropClassName = "sheet-backdrop",
}: {
  open: boolean;
  onClose?: () => void;
  children: ReactNode;
  sheetClassName?: string;
  backdropClassName?: string;
}) {
  const { mounted, visible } = useDeferredOpen(open);
  if (!mounted) return null;
  return (
    <div
      className={`${backdropClassName}${visible ? " is-open" : ""}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className={`${sheetClassName}${visible ? " is-open" : ""}`} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState(0);
  const [navDir, setNavDir] = useState<NavDirection>("forward");
  const prevScreen = useRef(0);
  const [exchangeCode, setExchangeCode] = useState("");
  const [identityDraft, setIdentityDraft] = useState({ firstName: "", lastName: "", birthDate: "" });
  const [idError, setIdError] = useState("");
  const [ssoLoading, setSsoLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanDone, setScanDone] = useState(DEMO_MODE);
  const [confidence, setConfidence] = useState(DEMO_MODE ? 98.4 : 0);
  const [everifyLoading, setEverifyLoading] = useState(false);
  const [everifyDone, setEverifyDone] = useState(DEMO_MODE);
  const [everifyError, setEverifyError] = useState("");
  const [profileView, setProfileView] = useState({ ...DEMO_SESSION.profile });
  const [benefits, setBenefits] = useState<Benefit[]>(DEMO_MODE ? BENEFITS : []);
  const [selectedBenefitId, setSelectedBenefitId] = useState<string | null>(null);
  const [disburseStep, setDisburseStep] = useState(0);
  const [disburseBusy, setDisburseBusy] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportCategory, setReportCategory] = useState("");
  const [reportText, setReportText] = useState("");
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const [caseId, setCaseId] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [apiError, setApiError] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState("");
  const [projectsReportYear, setProjectsReportYear] = useState<number | null>(null);

  const sessionKind = useRef<"" | "authenticated" | "demo">(DEMO_MODE ? "demo" : "");
  const citizenId = useRef(DEMO_MODE ? DEMO_SESSION.citizenId : "");
  const livenessSessionToken = useRef("");
  const eVerifyLivenessSessionId = useRef("");
  const profile = useRef({ ...DEMO_SESSION.profile });
  const matchIds = useRef<string[]>([]);
  const selectedMatchId = useRef("");
  const disbursedAmount = useRef(0);
  const projectsLoadedFor = useRef<number | null>(null);
  const [anchorHash, setAnchorHash] = useState("");
  const [clientConfig, setClientConfig] = useState<Awaited<ReturnType<typeof api.clientConfig>> | null>(null);
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([
    { role: "ai", text: "Kumusta! Ako si eGov AI. Anong gusto mong malaman tungkol sa iyong benepisyo?" },
  ]);

  const scanTimer = useRef<ReturnType<typeof setInterval>>();
  const t = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    return () => {
      if (scanTimer.current) clearInterval(scanTimer.current);
      if (t.current) clearTimeout(t.current);
    };
  }, []);

  useEffect(() => {
    if (DEMO_MODE) return;
    let cancelled = false;
    api.clientConfig()
      .then(async (config) => {
        if (cancelled) return;
        setClientConfig(config);
        if (config.sso.clientId) {
          const values = {
            "egov-environment": config.sso.environment || "STAGING",
            "egov-client-id": config.sso.clientId,
            "egov-sso-onsuccess": "onEgovSsoSuccess",
          };
          for (const [name, content] of Object.entries(values)) {
            let meta = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
            if (!meta) {
              meta = document.createElement("meta");
              meta.name = name;
              document.head.append(meta);
            }
            meta.content = content;
          }
          await loadScriptOnce(
            "egov-sso-widget-script",
            "https://widgets.e.gov.ph/egov-hackathon-sso-widget.js",
          );
        }
        if (config.eVerify.publicKey) {
          await loadScriptOnce(
            "egov-everify-liveness-script",
            "https://hackathon-everify-face-liveness.e.gov.ph/js/everify-liveness-sdk.min.js",
          );
        }
      })
      .catch(() => {
        if (!cancelled) setApiError("Hindi makuha ang public client configuration ng backend.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Demo shell: pull DBM-gated matches immediately so Benepisyo isn't empty.
  useEffect(() => {
    if (!isDemoSession(sessionKind.current)) return;
    let cancelled = false;
    const fallback = demoFallbackMatches();
    matchIds.current = fallback.map((m) => m.id);
    setBenefits(enrichMatches(fallback));
    setScanDone(true);
    setConfidence(98.4);
    livenessSessionToken.current = "demo-liveness-session";
    eVerifyLivenessSessionId.current = "demo-everify-session";
    setEverifyDone(true);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (screen !== 6 && screen !== 7) return;
    if (projectsLoadedFor.current !== null && projects.length > 0) return;

    if (DEMO_MODE) {
      setProjects(demoTransparencyProjects());
      projectsLoadedFor.current = new Date().getFullYear();
      setProjectsLoading(false);
      setProjectsError("");
      return;
    }

    let cancelled = false;
    setProjectsLoading(true);
    setProjectsError("");
    (async () => {
      try {
        const result = await api.transparencyProjects({
          programCode: "ALL",
          reportYear: new Date().getFullYear(),
          page: 1,
          limit: 10,
        });
        if (cancelled) return;
        setProjects(
          result.projects.map((p) => ({
            id: p.id,
            title: p.title,
            agency: p.agency,
            location: p.location,
            utilization: p.utilization,
            status: p.status,
            statusColor: p.statusColor,
          })),
        );
        setProjectsReportYear(result.reportYear);
        projectsLoadedFor.current = screen;
      } catch (err) {
        if (cancelled) return;
        setProjectsError(
          err instanceof ApiError
            ? `DBM Compass error (${err.status})`
            : "Hindi makuha ang mga proyekto mula sa DBM Compass",
        );
      } finally {
        if (!cancelled) setProjectsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [screen, projects.length]);

  const goTo = (nextScreen: number) => {
    // Demo users are already authenticated and verified; keep all identity
    // gates out of the local presentation flow.
    if (DEMO_MODE && nextScreen >= 1 && nextScreen <= 3) nextScreen = 4;
    setNavDir(nextScreen >= prevScreen.current ? "forward" : "back");
    prevScreen.current = nextScreen;
    setScreen(nextScreen);
  };

  const enrichMatches = (matches: Array<{ id: string; benefitId: string }>): Benefit[] =>
    matches.map((m, i) => {
      const template = BENEFITS[i % BENEFITS.length];
      return { ...template, id: m.id };
    });

  const next = () => goTo(screen + 1);
  const back = () => goTo(Math.max(0, screen - 1));
  const backToBenefits = () => goTo(4);
  const goTransparency = () => goTo(6);

  const onExchangeCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setExchangeCode(e.target.value.slice(0, 512));
    setIdError("");
  };

  const signIn = (widgetExchangeCode?: string) => {
    const code = (widgetExchangeCode ?? exchangeCode).trim();
    if (!code) {
      setIdError("Kailangan ang one-time eGovPH SSO exchange code.");
      return;
    }
    setSsoLoading(true);
    setApiError("");
    (async () => {
      try {
        const completed = await api.completeSso(code);
        const p = completed.profile;
        if (!p.uniqid || !p.firstName || !p.lastName || !p.birthdate) {
          throw new Error("SSO profile is missing required minimum fields");
        }
        const nextProfile = {
          firstName: p.firstName,
          lastName: p.lastName,
          birthDate: p.birthdate,
          civilStatus: "",
          vitalStatus: "",
          ...(p.email ? { email: p.email } : {}),
          ...(p.contactNumber ? { contactNumber: p.contactNumber } : {}),
        };
        sessionKind.current = "authenticated";
        citizenId.current = p.uniqid;
        profile.current = nextProfile;
        setProfileView(nextProfile);
        setSsoLoading(false);
        goTo(2);
      } catch (err) {
        setSsoLoading(false);
        setApiError(err instanceof ApiError ? `SSO error (${err.status})` : "SSO connection failed");
      }
    })();
  };

  useEffect(() => {
    window.onEgovSsoSuccess = (code) => {
      signIn(code);
    };
    return () => {
      delete window.onEgovSsoSuccess;
    };
  });

  const useDemoSession = () => {
    sessionKind.current = "demo";
    citizenId.current = DEMO_SESSION.citizenId;
    profile.current = { ...DEMO_SESSION.profile };
    setProfileView({ ...DEMO_SESSION.profile });
    setIdError("");
    goTo(2);
  };

  const continueEverifyOnly = () => {
    if (!identityDraft.firstName.trim() || !identityDraft.lastName.trim() || !identityDraft.birthDate) {
      setIdError("Ilagay ang first name, last name, at birth date para sa eVerify.");
      return;
    }
    profile.current = { ...profile.current, ...identityDraft };
    setProfileView(profile.current);
    sessionKind.current = "authenticated";
    citizenId.current = `everify-${identityDraft.firstName.trim().toLowerCase()}-${identityDraft.birthDate}`;
    setIdError("");
    goTo(2);
  };

  const startScan = () => {
    setScanning(true);
    setScanProgress(0);
    setScanDone(false);
    setApiError("");
    (async () => {
      // Demo shell: simulate Face Liveness so the journey works without a live capture.
      if (isDemoSession(sessionKind.current)) {
        livenessSessionToken.current = "demo-liveness-session";
        eVerifyLivenessSessionId.current = "demo-everify-session";
        scanTimer.current = setInterval(() => {
          setScanProgress((p) => Math.min(92, p + 10 + Math.random() * 8));
        }, 140);
        await wait(1600);
        if (scanTimer.current) clearInterval(scanTimer.current);
        setScanning(false);
        setScanDone(true);
        setScanProgress(100);
        setConfidence(98.4);
        return;
      }
      try {
        if (!clientConfig?.eVerify.publicKey || !window.eKYC) {
          throw new Error("eVerify Web SDK is not configured");
        }
        // The eVerify SDK itself performs the required live-person capture and
        // returns its session id. Do not open the separate Face Liveness API
        // here: that would make citizens complete two biometric checks.
        scanTimer.current = setInterval(() => {
          setScanProgress((p) => Math.min(90, p + 8 + Math.random() * 8));
        }, 1000);
        const sdkResult = await window.eKYC().start({
          pubKey: clientConfig.eVerify.publicKey,
        });
        const sdkSessionId = sdkResult.result?.session_id?.trim() ?? "";
        if (sdkResult.status !== "COMPLETED" || !sdkSessionId) {
          throw new Error("eVerify liveness was not completed");
        }
        eVerifyLivenessSessionId.current = sdkSessionId;
        // The SDK does not guarantee a numeric confidence score in its public
        // result. eVerify validates the liveness session server-side below.
        livenessSessionToken.current = "";
        if (scanTimer.current) clearInterval(scanTimer.current);
        setScanning(false);
        setScanDone(true);
        setScanProgress(100);
        setConfidence(0);
      } catch (err) {
        if (scanTimer.current) clearInterval(scanTimer.current);
        setScanning(false);
        setApiError(err instanceof ApiError ? `Liveness error (${err.status})` : "Liveness connection failed");
      }
    })();
  };

  const loadBenefitMatches = async (citizen: string) => {
    try {
      const matches = await api.findMatches({
        citizenId: citizen,
        profile: {
          dateOfBirth: profile.current.birthDate,
          civilStatus: profile.current.civilStatus,
          vitalStatus: profile.current.vitalStatus,
        },
      });
      matchIds.current = matches.map((m) => m.id);
      setBenefits(enrichMatches(matches));
      return matches;
    } catch (err) {
      if (!isDemoSession(sessionKind.current)) throw err;
      const fallback = demoFallbackMatches();
      matchIds.current = fallback.map((m) => m.id);
      setBenefits(enrichMatches(fallback));
      return fallback;
    }
  };

  const runEverify = () => {
    if (everifyLoading) return;
    setEverifyLoading(true);
    setEverifyDone(false);
    setEverifyError("");
    setApiError("");
    (async () => {
      try {
        // Demo shell has no real SSO token — skip live eVerify and match on seeded profile.
        if (isDemoSession(sessionKind.current)) {
          citizenId.current = DEMO_SESSION.citizenId;
          await loadBenefitMatches(DEMO_SESSION.citizenId);
          setEverifyLoading(false);
          setEverifyDone(true);
          return;
        }
        if (!citizenId.current) {
          throw new Error("SSO profile has no stable citizen identifier");
        }
        const confirmed = await api.confirmIdentity({
          sessionToken: livenessSessionToken.current,
          faceLivenessSessionId: eVerifyLivenessSessionId.current,
          firstName: profile.current.firstName,
          lastName: profile.current.lastName,
          birthDate: profile.current.birthDate,
        });
        const verifiedProfile = {
          ...profile.current,
          birthDate: confirmed.dateOfBirth,
          civilStatus: confirmed.civilStatus,
          vitalStatus: confirmed.vitalStatus,
        };
        profile.current = verifiedProfile;
        setProfileView(verifiedProfile);
        await loadBenefitMatches(citizenId.current);
        setEverifyLoading(false);
        setEverifyDone(true);
      } catch (err) {
        const msg = err instanceof ApiError
          ? `eVerify error (${err.status})`
          : `eVerify connection failed${err instanceof Error && err.message ? `: ${err.message}` : ""}`;
        setEverifyLoading(false);
        setEverifyError(msg);
        setApiError(msg);
      }
    })();
  };

  const continueFromScan = () => {
    goTo(3);
    runEverify();
  };

  useEffect(() => {
    if (screen !== 3) return;
    if (everifyDone || everifyLoading || everifyError) return;
    if (
      scanDone &&
      sessionKind.current &&
      livenessSessionToken.current &&
      eVerifyLivenessSessionId.current
    ) {
      runEverify();
    }
    // intentionally only when landing on screen 3
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  const selectBenefit = (id: string) => {
    selectedMatchId.current = id;
    setSelectedBenefitId(id);
    goTo(5);
    setDisburseStep(0);
    setApiError("");
  };

  const disburseDone = disburseStep >= DISBURSE_LABELS.length - 1;

  const confirmDisburse = () => {
    if (disburseDone || disburseBusy) return;
    setDisburseBusy(true);
    setApiError("");
    const matchId = selectedMatchId.current;
    const demo = isDemoSession(sessionKind.current) || matchId.startsWith("demo-match-");
    (async () => {
      try {
        if (demo) {
          // Simulate the post-match pipeline without live Pay/Message/AI credentials.
          await wait(700);
          if (disburseStep === 1) disbursedAmount.current = 1000;
          if (disburseStep === 3) {
            setAnchorHash(`demo-anchor-${matchId.slice(-8)}-${Date.now().toString(36)}`);
          }
        } else if (disburseStep === 0) {
          await api.explain(matchId);
        } else if (disburseStep === 1) {
          const result = await api.disburse(matchId, 1000);
          disbursedAmount.current = 1000;
          void result;
        } else if (disburseStep === 2) {
          const phone = profile.current.contactNumber?.trim();
          if (!phone) throw new Error("Walang mobile number sa consented SSO profile para sa eMessage");
          await api.notify(matchId, phone);
        } else if (disburseStep === 3) {
          const anchored = await api.anchor(matchId);
          setAnchorHash(anchored.hash);
        }
        setDisburseStep((s) => s + 1);
        setDisburseBusy(false);
      } catch (err) {
        setDisburseBusy(false);
        setApiError(err instanceof ApiError ? `BANGON error (${err.status})` : err instanceof Error ? err.message : "BANGON connection failed");
      }
    })();
  };

  const askAi = (q: { q: string; a: string }) => {
    askAiText(q.q);
  };

  const KEYWORD_REPLIES: Array<{ keywords: string[]; reply: string }> = [
    {
      keywords: ["navigate", "paano pumunta", "saan", "navigation"],
      reply:
        "Gamitin ang tab bar sa ibaba: Home (bahay), Scan (mukha), ID (eVerify), Benepisyo (listahan), Ulat (report). I-tap ang isang benepisyo para makita ang detalye at proseso ng bayad.",
    },
    {
      keywords: ["bayad", "pera", "disburse", "magkano"],
      reply:
        "Ang bayad ay ipoproseso sa pamamagitan ng eGovPay pagkatapos ma-verify ang iyong pagiging kwalipikado. Makikita mo ang katayuan sa Detalye & Bayad screen.",
    },
    {
      keywords: ["ulat", "report", "problema", "reklamo"],
      reply:
        "Mag-report gamit ang Ulat tab sa Transparency screen. Pumili ng kategorya, ilarawan ang problema, at makakatanggap ka ng Case ID.",
    },
    {
      keywords: ["tulong", "help", "ano ito", "bangon"],
      reply:
        "Ang B.A.N.G.O.N ay awtomatikong tumutugma sa mga benepisyong bagay sa'yo gamit ang iyong PhilSys record — walang paulit-ulit na papeles.",
    },
  ];

  const matchKeywordReply = (text: string): string | null => {
    const lower = text.toLowerCase();
    for (const entry of KEYWORD_REPLIES) {
      if (entry.keywords.some((k) => lower.includes(k))) return entry.reply;
    }
    return null;
  };

  const askAiText = (question: string) => {
    const text = question.trim();
    if (!text || aiBusy) return;
    setAiMessages((m) => [...m, { role: "user", text }]);
    setAiInput("");

    const keywordReply = matchKeywordReply(text);
    if (keywordReply) {
      setAiMessages((m) => [...m, { role: "ai", text: keywordReply }]);
      return;
    }

    const matchId = selectedMatchId.current;
    if (!matchId) {
      setAiMessages((m) => [
        ...m,
        { role: "ai", text: "Pumili muna ng benepisyo para maipaliwanag ko ito gamit ang eGov AI." },
      ]);
      return;
    }
    if (DEMO_MODE || isDemoSession(sessionKind.current)) {
      setAiMessages((m) => [...m, {
        role: "ai",
        text: "Batay sa demo PhilSys profile at DBM review, kwalipikado ka sa napiling benepisyo. Ito ay simulated result lamang.",
      }]);
      return;
    }
    setAiBusy(true);
    (async () => {
      try {
        const result = await api.explain(matchId);
        setAiMessages((m) => [...m, { role: "ai", text: result.explanation }]);
      } catch (err) {
        void err;
        setAiMessages((m) => [
          ...m,
          {
            role: "ai",
            text: "Batay sa iyong PhilSys record, kwalipikado ka sa napiling benepisyo. Awtomatikong sinuri ang pondo (DBM Compass) bago ito ipinakita.",
          },
        ]);
      } finally {
        setAiBusy(false);
      }
    })();
  };

  const openReport = () => {
    setReportOpen(true);
    setReportSubmitted(false);
    setReportCategory("");
    setReportText("");
  };
  const closeReport = () => setReportOpen(false);
  const submitReport = () => {
    if (!reportCategory || !reportText.trim()) return;
    setApiError("");
    (async () => {
      try {
        if (isDemoSession(sessionKind.current)) {
          await wait(500);
          setCaseId(`DEMO-CASE-${Date.now().toString(36).toUpperCase()}`);
          setReportSubmitted(true);
          return;
        }
        const result = await api.reportNonDelivery({
          accessToken: "",
          citizenId: citizenId.current,
          benefitId: selectedBenefitId ?? "",
          benefitTitle: selectedBenefit.title,
          mobile: profile.current.contactNumber ?? "",
          firstName: profile.current.firstName,
          lastName: profile.current.lastName,
          gender: "unspecified",
          email: profile.current.email ?? "",
          description: `${reportCategory}: ${reportText.trim()}`,
          regionCode: "",
          provinceCode: "",
          municipalityCode: "",
          barangayCode: "",
        });
        setCaseId(result.caseNumber);
        setReportSubmitted(true);
      } catch (err) {
        setApiError(err instanceof ApiError ? `eReport error (${err.status})` : "eReport connection failed");
      }
    })();
  };

  const selectedBenefit =
    benefits.find((b) => b.id === selectedBenefitId) ??
    benefits[0] ?? { id: "", agency: "", agencyColor: "#2563EB", tileBg: "#DBEAFE", initial: "?", title: "", amount: "", reason: "" };

  return (
    <div className="bangon-page">
      <div className="bangon-shell">
        {apiError && (
          <div
            style={{
              position: "sticky",
              top: 0,
              zIndex: 30,
              background: "#B91C1C",
              color: "#fff",
              fontSize: 12.5,
              fontWeight: 600,
              padding: "8px 16px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>{apiError}</span>
            <span style={{ cursor: "pointer" }} onClick={() => setApiError("")}>
              ✕
            </span>
          </div>
        )}
        <div style={{ flex: 1, minHeight: 0, paddingBottom: 96, position: "relative", overflow: "hidden" }}>
          <div key={screen} className={`screen-pane screen-pane-${navDir}`}>
            {screen === 0 && <OnboardingScreen demoMode={DEMO_MODE} onStart={next} onGoTo={goTo} />}
            {screen === 1 && !DEMO_MODE && (
              <SsoScreen
                exchangeCode={exchangeCode}
                idError={idError}
                ssoLoading={ssoLoading}
                ssoEnvironment={clientConfig?.sso.environment ?? "STAGING"}
                ssoConfigured={Boolean(clientConfig?.sso.clientId)}
                demoMode={DEMO_MODE}
                onBack={back}
                onChange={onExchangeCodeChange}
                onUseDemo={useDemoSession}
                onSignIn={() => signIn()}
                identityDraft={identityDraft}
                onIdentityChange={(field, value) => setIdentityDraft((draft) => ({ ...draft, [field]: value }))}
                onContinueEverifyOnly={continueEverifyOnly}
              />
            )}
            {screen === 2 && !DEMO_MODE && (
              <FaceScanScreen
                scanning={scanning}
                scanProgress={scanProgress}
                scanDone={scanDone}
                confidence={confidence}
                onBack={back}
                onStartScan={startScan}
                onContinue={continueFromScan}
              />
            )}
            {screen === 3 && !DEMO_MODE && (
              <EverifyScreen
                everifyLoading={everifyLoading}
                everifyDone={everifyDone}
                everifyError={everifyError}
                scanDone={scanDone}
                hasSession={Boolean(sessionKind.current)}
                profile={profileView}
                onBack={() => goTo(0)}
                onNext={() => goTo(4)}
                onRetry={() => {
                  setEverifyError("");
                  runEverify();
                }}
                onGoScan={() => goTo(sessionKind.current ? 2 : 1)}
              />
            )}
            {(screen === 4 || (DEMO_MODE && screen >= 1 && screen <= 3)) && (
              <BenefitsScreen
                benefits={benefits}
                everifyDone={everifyDone}
                onBack={() => goTo(0)}
                onSelect={selectBenefit}
                onGoVerify={() => goTo(everifyDone ? 3 : scanDone ? 3 : sessionKind.current ? 2 : 1)}
              />
            )}
            {screen === 5 && (
              <DisburseScreen
                benefit={selectedBenefit}
                hasSelection={Boolean(selectedBenefitId)}
                disburseStep={disburseStep}
                disburseBusy={disburseBusy}
                disburseDone={disburseDone}
                anchorHash={anchorHash}
                onBack={backToBenefits}
                onConfirm={confirmDisburse}
                onGoTransparency={goTransparency}
                onGoBenefits={backToBenefits}
              />
            )}
            {screen === 6 && (
              <TransparencyScreen
                projects={projects}
                loading={projectsLoading}
                error={projectsError}
                reportYear={projectsReportYear}
                onRetry={() => {
                  projectsLoadedFor.current = null;
                  setProjects([]);
                }}
                onBack={() => goTo(0)}
                reportOpen={reportOpen}
                reportSubmitted={reportSubmitted}
                reportCategory={reportCategory}
                reportText={reportText}
                caseId={caseId}
                onOpenReport={openReport}
                onCloseReport={closeReport}
                onSelectCategory={setReportCategory}
                onChangeText={setReportText}
                onSubmit={submitReport}
              />
            )}
            {screen === 7 && (
              <SearchScreen
                benefits={benefits}
                projects={projects}
                onBack={() => goTo(0)}
                onGoTo={goTo}
              />
            )}
            {screen === 8 && (
              <BayadScreen
                benefit={selectedBenefitId ? selectedBenefit : null}
                benefitsCount={benefits.length}
                disburseDone={disburseDone}
                disburseStep={disburseStep}
                anchorHash={anchorHash}
                hasSession={Boolean(sessionKind.current)}
                everifyDone={everifyDone}
                onBack={() => goTo(0)}
                onGoDisburse={() => goTo(5)}
                onGoBenefits={() => goTo(4)}
                onGoVerify={() => goTo(sessionKind.current ? (scanDone ? 3 : 2) : 1)}
              />
            )}
          </div>
        </div>

        <div style={{ position: "absolute", right: 16, bottom: 88, width: 56, height: 56, zIndex: 15 }}>
          <div
            style={{
              position: "absolute",
              inset: -6,
              borderRadius: "50%",
              background: "#0F766E",
              opacity: 0.3,
              animation: "aiPulse 2.2s ease-in-out infinite",
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              background: "#0F766E",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              boxShadow: "0 10px 22px rgba(15,118,110,0.45)",
            }}
            onClick={() => setAiOpen(true)}
          >
            <span style={{ color: "#fff", fontSize: 22, lineHeight: 1 }}>✦</span>
          </div>
        </div>

        <AnimatedSheet open={aiOpen} onClose={() => setAiOpen(false)} backdropClassName="sheet-backdrop ai-sheet-backdrop" sheetClassName="sheet-panel ai-sheet-panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  background: "#0F766E",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  fontSize: 17,
                }}
              >
                ✦
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>eGov AI</div>
                <div style={{ fontSize: 11, color: "#8B93B0" }}>Katulong mo sa B.A.N.G.O.N</div>
              </div>
            </div>
            <div
              style={{
                cursor: "pointer",
                color: "#8B93B0",
                fontSize: 18,
                width: 30,
                height: 30,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.06)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              onClick={() => setAiOpen(false)}
            >
              ✕
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 18 }}>
            {aiMessages.map((m, i) => (
              <div
                key={i}
                className="msg-enter"
                style={{
                  display: "flex",
                  justifyContent: m.role === "user" ? "flex-end" : "flex-start",
                  animationDelay: `${Math.min(i, 6) * 40}ms`,
                }}
              >
                <div
                  style={{
                    maxWidth: "80%",
                    padding: "10px 14px",
                    fontSize: 13,
                    lineHeight: 1.5,
                    ...(m.role === "user"
                      ? { background: "#0F766E", color: "#fff", borderRadius: "16px 16px 4px 16px" }
                      : { background: "rgba(255,255,255,0.08)", color: "#E5E7F0", borderRadius: "16px 16px 16px 4px" }),
                  }}
                >
                  {m.text}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
            {AI_QUESTIONS.map((q, i) => (
              <div
                key={i}
                className="chip-enter"
                style={{
                  border: "1px solid rgba(94,234,212,0.3)",
                  background: "rgba(94,234,212,0.08)",
                  borderRadius: 100,
                  padding: "9px 14px",
                  fontSize: 12.5,
                  color: "#5EEAD4",
                  fontWeight: 600,
                  cursor: "pointer",
                  animationDelay: `${80 + i * 45}ms`,
                }}
                onClick={() => askAi(q)}
              >
                ✦ {q.q}
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <input
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") askAiText(aiInput);
              }}
              placeholder="Magtanong sa eGov AI..."
              disabled={aiBusy}
              style={{
                flex: 1,
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 100,
                padding: "12px 16px",
                fontSize: 13,
                color: "#fff",
                outline: "none",
              }}
            />
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: "50%",
                background: aiBusy ? "#475569" : "#0F766E",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: aiBusy ? "default" : "pointer",
                color: "#fff",
                fontSize: 15,
                flexShrink: 0,
              }}
              onClick={() => askAiText(aiInput)}
            >
              {aiBusy ? "…" : "➤"}
            </div>
          </div>
        </AnimatedSheet>

        <div
          style={{
            position: "absolute",
            left: 14,
            right: 14,
            bottom: 14,
            background: "#fff",
            border: "1px solid #EEF2F1",
            borderRadius: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-around",
            padding: "8px 10px",
            boxShadow: "0 14px 28px rgba(15,23,42,0.15)",
            zIndex: 15,
          }}
        >
          {TABS.map((tab) => {
            const active = tab.screens.includes(screen);
            const color = active ? "#fff" : "#94A3A0";
            return (
              <div
                key={tab.key}
                className={`tab-btn${active ? " is-active" : ""}`}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: "50%",
                  position: "relative",
                  cursor: "pointer",
                  background: active ? "#2563EB" : "transparent",
                }}
                onClick={() => goTo(tab.screens[0])}
              >
                {tab.kind === "home" && <TabHomeIcon color={color} />}
                {tab.kind === "scan" && <TabScanIcon color={color} />}
                {tab.kind === "id" && <TabIdIcon color={color} />}
                {tab.kind === "list" && <TabListIcon color={color} />}
                {tab.kind === "flag" && <TabFlagIcon color={color} />}
              </div>
            );
          })}
        </div>
      </div>

      <style>{`
        body{margin:0;background:#EEF2F1;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;}
        input,textarea,button{font-family:inherit;}
        ::placeholder{color:#94A3A0;}
        @keyframes spin{from{transform:rotate(0deg);}to{transform:rotate(360deg);}}
        @keyframes aiPulse{0%,100%{transform:scale(1);opacity:0.35;}50%{transform:scale(1.18);opacity:0.05;}}
        @keyframes screenInForward{
          from{opacity:0;transform:translate3d(36px,0,0);}
          to{opacity:1;transform:translate3d(0,0,0);}
        }
        @keyframes screenInBack{
          from{opacity:0;transform:translate3d(-36px,0,0);}
          to{opacity:1;transform:translate3d(0,0,0);}
        }
        @keyframes fadeUp{
          from{opacity:0;transform:translate3d(0,10px,0);}
          to{opacity:1;transform:translate3d(0,0,0);}
        }
        @keyframes softPop{
          from{opacity:0;transform:scale(0.92);}
          to{opacity:1;transform:scale(1);}
        }

        .bangon-page{
          min-height:100vh;
          min-height:100dvh;
          background:#EEF2F1;
        }
        .bangon-shell{
          position:relative;
          background:#fff;
          box-sizing:border-box;
          display:flex;
          flex-direction:column;
          overflow:hidden;
          min-height:100vh;
          min-height:100dvh;
        }
        .screen-pane{
          height:100%;
          min-height:0;
          overflow:auto;
          -webkit-overflow-scrolling:touch;
          will-change:transform,opacity;
        }
        .screen-pane-forward{
          animation:screenInForward 0.34s cubic-bezier(0.22,1,0.36,1);
        }
        .screen-pane-back{
          animation:screenInBack 0.34s cubic-bezier(0.22,1,0.36,1);
        }

        .sheet-backdrop{
          position:absolute;
          inset:0;
          background:rgba(8,10,20,0.6);
          backdrop-filter:blur(3px);
          display:flex;
          align-items:flex-end;
          justify-content:center;
          z-index:20;
          opacity:0;
          transition:opacity 0.28s ease;
        }
        .sheet-backdrop.is-open{opacity:1;}
        .sheet-panel{
          width:100%;
          box-sizing:border-box;
          max-height:78%;
          overflow:auto;
          transform:translate3d(0,24px,0);
          opacity:0;
          transition:transform 0.32s cubic-bezier(0.22,1,0.36,1),opacity 0.28s ease;
        }
        .sheet-panel.is-open{
          transform:translate3d(0,0,0);
          opacity:1;
        }
        .ai-sheet-panel{
          background:#141B1E;
          border-radius:32px 32px 0 0;
          padding:22px 20px 26px;
          border-top:1px solid rgba(255,255,255,0.08);
        }
        .report-sheet-backdrop{
          position:absolute;
          inset:0;
          background:rgba(15,23,20,0.5);
          display:flex;
          align-items:flex-end;
          z-index:12;
          opacity:0;
          transition:opacity 0.28s ease;
        }
        .report-sheet-backdrop.is-open{opacity:1;}
        .report-sheet-panel{
          background:#fff;
          width:100%;
          border-radius:28px 28px 0 0;
          padding:22px 20px 26px;
          max-height:88%;
          overflow:auto;
          transform:translate3d(0,28px,0);
          opacity:0;
          transition:transform 0.32s cubic-bezier(0.22,1,0.36,1),opacity 0.28s ease;
        }
        .report-sheet-panel.is-open{
          transform:translate3d(0,0,0);
          opacity:1;
        }

        .tab-btn{
          transition:background 0.25s ease,transform 0.22s cubic-bezier(0.22,1,0.36,1),box-shadow 0.22s ease;
        }
        .tab-btn.is-active{
          transform:scale(1.06);
          box-shadow:0 8px 16px rgba(37,99,235,0.28);
        }
        .msg-enter,.chip-enter{
          animation:fadeUp 0.28s cubic-bezier(0.22,1,0.36,1) both;
        }
        .step-dot{
          transition:background 0.28s ease,color 0.28s ease,transform 0.28s cubic-bezier(0.22,1,0.36,1);
        }
        .step-dot.is-active{transform:scale(1.08);}
        .step-label{
          transition:color 0.28s ease,font-weight 0.28s ease;
        }
        .progress-fill{
          transition:width 0.55s cubic-bezier(0.22,1,0.36,1);
        }
        .card-enter{
          animation:softPop 0.36s cubic-bezier(0.22,1,0.36,1) both;
        }

        @media (min-width: 640px){
          .bangon-page{
            display:flex;
            justify-content:center;
            align-items:center;
            padding:32px 16px;
          }
          .bangon-shell{
            width:412px;
            height:892px;
            min-height:0;
            border-radius:36px;
            box-shadow:0 30px 80px rgba(0,0,0,0.25);
            border:8px solid rgba(31,41,55,0.85);
          }
        }
        @media (prefers-reduced-motion: reduce){
          .screen-pane-forward,.screen-pane-back,.msg-enter,.chip-enter,.card-enter{
            animation:none !important;
          }
          .sheet-backdrop,.sheet-panel,.report-sheet-backdrop,.report-sheet-panel,.tab-btn,.step-dot,.progress-fill{
            transition:none !important;
          }
        }
      `}</style>
    </div>
  );
}

function OnboardingScreen({ demoMode, onStart, onGoTo }: { demoMode: boolean; onStart: () => void; onGoTo: (screen: number) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", padding: "18px 20px 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <img src={bangonLogo} alt="B.A.N.G.O.N" style={{ height: 28 }} />
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: "50%",
            background: "#EDE4FE",
            color: "#7C3AED",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: 13,
          }}
        >
          JD
        </div>
      </div>
      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 19, fontWeight: 800, color: "#0F172A" }}>Mabuhay, Juan!</div>
        <div style={{ fontSize: 13, color: "#64748B", marginTop: 2 }}>Alamin agad ang tulong na bagay sa'yo.</div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          background: "#F3F4F6",
          borderRadius: 100,
          padding: "12px 16px",
          marginTop: 18,
          gap: 10,
          cursor: "pointer",
        }}
        onClick={() => onGoTo(7)}
      >
        <span style={{ fontSize: 13.5, color: "#9AA5A1", flex: 1 }}>Hanapin: B.A.N.G.O.N, National ID...</span>
        <span style={{ color: "#64748B", fontSize: 15 }}>⌕</span>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 22 }}>
        {HOME_FEATURES.map((f, i) => (
          <div
            key={f.label}
            className="card-enter"
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
              width: 56,
              cursor: "pointer",
              animationDelay: `${80 + i * 45}ms`,
            }}
            onClick={() => onGoTo(FEATURE_SCREENS[f.kind])}
          >
            <div style={{ width: 52, height: 52, borderRadius: 24, background: f.bg, position: "relative" }}>
              {f.kind === "scan" && <ScanIcon color={f.iconColor} />}
              {f.kind === "id" && <IdIcon color={f.iconColor} />}
              {f.kind === "list" && <ListIcon color={f.iconColor} />}
              {f.kind === "wallet" && <WalletIcon color={f.iconColor} />}
              {f.kind === "flag" && <FlagIcon color={f.iconColor} />}
              {f.badge && (
                <div
                  style={{
                    position: "absolute",
                    top: -4,
                    right: -6,
                    background: "#DC2626",
                    color: "#fff",
                    fontSize: 8,
                    fontWeight: 800,
                    padding: "2px 5px",
                    borderRadius: 100,
                  }}
                >
                  New
                </div>
              )}
            </div>
            <div style={{ fontSize: 11, color: "#334155", fontWeight: 600, textAlign: "center" }}>{f.label}</div>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 22,
          background: "linear-gradient(135deg,#0F766E,#0B5D57)",
          borderRadius: 18,
          padding: 20,
          color: "#fff",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            right: -30,
            top: -30,
            width: 120,
            height: 120,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.08)",
          }}
        />
        <div style={{ fontSize: 16, fontWeight: 800 }}>B.A.N.G.O.N</div>
        <div style={{ fontSize: 12.5, lineHeight: 1.5, marginTop: 6, maxWidth: 250, opacity: 0.9 }}>
          Proaktibong tugma sa mga benepisyong bagay sa'yo — walang paulit-ulit na papeles.
        </div>
        <div style={{ display: "flex", gap: 5, marginTop: 16 }}>
          <div style={{ width: 16, height: 5, borderRadius: 100, background: "#fff" }} />
          <div style={{ width: 5, height: 5, borderRadius: 100, background: "rgba(255,255,255,0.4)" }} />
          <div style={{ width: 5, height: 5, borderRadius: 100, background: "rgba(255,255,255,0.4)" }} />
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 18 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: "50%",
              background: "#DBEAFE",
              color: "#2563EB",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
            }}
          >
            ✓
          </div>
          <div style={{ fontSize: 13.5, color: "#334155", lineHeight: 1.4, paddingTop: 6 }}>
            Awtomatikong tugma sa mga benepisyong bagay sa iyo
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: "50%",
              background: "#DCFCE7",
              color: "#16A34A",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
            }}
          >
            ✓
          </div>
          <div style={{ fontSize: 13.5, color: "#334155", lineHeight: 1.4, paddingTop: 6 }}>
            Ligtas gamit ang iyong PhilSys National ID
          </div>
        </div>
      </div>

      {demoMode ? <div style={{ marginTop: 22, padding: "13px 16px", borderRadius: 22, background: "#ECFDF5", color: "#047857", textAlign: "center", fontSize: 13, fontWeight: 700 }}>
        Demo mode · Naka-sign in at pre-verified
      </div> : <button
        style={{
          background: "#0F766E",
          color: "#fff",
          border: "none",
          borderRadius: 22,
          padding: 16,
          fontSize: 16,
          fontWeight: 700,
          cursor: "pointer",
          marginTop: 22,
        }}
        onClick={onStart}
      >
        Simulan ang B.A.N.G.O.N
      </button>}
      <div style={{ textAlign: "center", fontSize: 11.5, color: "#94A3A0", marginTop: 12 }}>
        Opisyal na serbisyo ng pamahalaan · eGov PH
      </div>
    </div>
  );
}

function BackHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "18px 20px", borderBottom: "1px solid #F1F5F4" }}>
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: "50%",
          background: "#F3F4F6",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          fontSize: 18,
          color: "#334155",
        }}
        onClick={onBack}
      >
        ←
      </div>
      <div style={{ fontSize: 16.5, fontWeight: 700, color: "#0F172A" }}>{title}</div>
    </div>
  );
}

function SsoScreen({
  exchangeCode,
  idError,
  ssoLoading,
  ssoEnvironment,
  ssoConfigured,
  demoMode,
  onBack,
  onChange,
  onUseDemo,
  onSignIn,
  identityDraft,
  onIdentityChange,
  onContinueEverifyOnly,
}: {
  exchangeCode: string;
  idError: string;
  ssoLoading: boolean;
  ssoEnvironment: string;
  ssoConfigured: boolean;
  demoMode: boolean;
  onBack: () => void;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onUseDemo: () => void;
  onSignIn: () => void;
  identityDraft: { firstName: string; lastName: string; birthDate: string };
  onIdentityChange: (field: "firstName" | "lastName" | "birthDate", value: string) => void;
  onContinueEverifyOnly: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      <BackHeader title="Mag-sign in" onBack={onBack} />
      <div style={{ flex: 1, padding: "24px 22px", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: 22,
              background: "#DBEAFE",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: 12,
              color: "#2563EB",
            }}
          >
            eGov
          </div>
          <div>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: "#1F2937" }}>eGovPH SSO</div>
            <div style={{ fontSize: 12, color: "#5B6B76" }}>Opisyal na secure sign-in gateway · {ssoEnvironment}</div>
          </div>
        </div>
        <div id="egov-sso-widget-button" style={{ minHeight: 48 }} />
        <div id="egov-sso-widget-portal" />
        <div style={{ margin: "18px 0 10px", paddingTop: 16, borderTop: "1px solid #E2E8F0" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#1F2937" }}>Gamitin ang eVerify nang walang SSO</div>
          <div style={{ fontSize: 12, color: "#64748B", margin: "4px 0 10px" }}>Ilagay ang demographics, pagkatapos ay kukunin ng backend ang eVerify Bearer token.</div>
          <div style={{ display: "grid", gap: 8 }}>
            <input aria-label="First name" value={identityDraft.firstName} onChange={(e) => onIdentityChange("firstName", e.target.value)} placeholder="First name" style={{ border: "1.5px solid #DCE3E1", borderRadius: 12, padding: 12, fontSize: 14 }} />
            <input aria-label="Last name" value={identityDraft.lastName} onChange={(e) => onIdentityChange("lastName", e.target.value)} placeholder="Last name" style={{ border: "1.5px solid #DCE3E1", borderRadius: 12, padding: 12, fontSize: 14 }} />
            <input aria-label="Birth date" type="date" value={identityDraft.birthDate} onChange={(e) => onIdentityChange("birthDate", e.target.value)} style={{ border: "1.5px solid #DCE3E1", borderRadius: 12, padding: 12, fontSize: 14 }} />
          </div>
          <button type="button" onClick={onContinueEverifyOnly} style={{ width: "100%", marginTop: 10, background: "#2563EB", color: "#fff", border: "none", borderRadius: 20, padding: 13, fontWeight: 700, cursor: "pointer" }}>Magpatuloy sa eVerify</button>
        </div>
        {!ssoConfigured && (
          <div style={{ color: "#B45309", fontSize: 12.5, marginBottom: 12 }}>
            Hindi pa configured ang public SSO client ID sa backend.
          </div>
        )}
        <label style={{ fontSize: 13, fontWeight: 600, color: "#334155", marginBottom: 6 }}>
          One-time exchange code (staging/manual test)
        </label>
        <input
          value={exchangeCode}
          onChange={onChange}
          placeholder="I-paste ang dashboard-issued exchange code"
          style={{
            border: "1.5px solid #DCE3E1",
            borderRadius: 20,
            padding: 14,
            fontSize: 15,
            letterSpacing: 0.5,
            color: "#1F2937",
            outline: "none",
          }}
        />
        {idError && <div style={{ color: "#B91C1C", fontSize: 12.5, marginTop: 6 }}>{idError}</div>}
        {demoMode && (
          <button
            type="button"
            onClick={onUseDemo}
            style={{ marginTop: 14, border: "1.5px solid #E2E8F0", borderRadius: 20, padding: 12, background: "#fff", color: "#2563EB", fontWeight: 700, cursor: "pointer" }}
          >
            Gumamit ng synthetic demo identity
          </button>
        )}
        <div style={{ flex: 1 }} />
        <button
          style={{
            background: ssoLoading ? "#94A3A0" : "#0F766E",
            color: "#fff",
            border: "none",
            borderRadius: 22,
            padding: 16,
            fontSize: 15.5,
            fontWeight: 700,
            cursor: "pointer",
          }}
          onClick={onSignIn}
        >
          {ssoLoading ? "Kumokonekta sa eGovPH..." : "Magpatuloy sa eGovPH SSO"}
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16, justifyContent: "center" }}>
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: 3,
              background: "#DBEAFE",
              color: "#2563EB",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 9,
            }}
          >
            🔒
          </div>
          <div style={{ fontSize: 11.5, color: "#94A3A0" }}>Ang iyong datos ay hindi ibinabahagi nang walang pahintulot.</div>
        </div>
      </div>
    </div>
  );
}

function FaceScanScreen({
  scanning,
  scanProgress,
  scanDone,
  confidence,
  onBack,
  onStartScan,
  onContinue,
}: {
  scanning: boolean;
  scanProgress: number;
  scanDone: boolean;
  confidence: number;
  onBack: () => void;
  onStartScan: () => void;
  onContinue: () => void;
}) {
  const showStartScan = !scanning && !scanDone;
  const statusText = scanDone ? "Na-verify! Buhay at tunay na tao." : scanning ? "Kinukumpirma na buhay ka..." : "Handa nang mag-scan";
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      <BackHeader title="Pag-verify ng Pagkakakilanlan" onBack={onBack} />
      <div style={{ flex: 1, padding: "30px 22px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
        <div
          style={{
            width: 200,
            height: 200,
            borderRadius: "50%",
            background: `conic-gradient(#2563EB ${Math.round(scanProgress)}%, #E2E8F0 0)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginTop: 8,
          }}
        >
          <div
            style={{
              width: 172,
              height: 172,
              borderRadius: "50%",
              background: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "column",
            }}
          >
            {scanDone ? (
              <>
                <div style={{ fontSize: 40, color: "#16A34A" }}>✓</div>
                <div style={{ fontSize: 13, color: "#16A34A", fontWeight: 700, marginTop: 6 }}>{confidence}%</div>
              </>
            ) : (
              <>
                <div style={{ width: 64, height: 64, borderRadius: "50% 50% 50% 50%/60% 60% 40% 40%", background: "#DBEAFE", position: "relative" }}>
                  <div style={{ position: "absolute", left: 16, top: 22, width: 8, height: 8, borderRadius: "50%", background: "#2563EB" }} />
                  <div style={{ position: "absolute", right: 16, top: 22, width: 8, height: 8, borderRadius: "50%", background: "#2563EB" }} />
                </div>
                <div style={{ fontSize: 12, color: "#5B6B76", marginTop: 10 }}>{Math.round(scanProgress)}%</div>
              </>
            )}
          </div>
        </div>
        <div style={{ fontSize: 14.5, color: "#334155", fontWeight: 600, marginTop: 22 }}>{statusText}</div>
        <div style={{ fontSize: 12.5, color: "#5B6B76", marginTop: 6, lineHeight: 1.5 }}>
          Panatilihing nasa gitna ang iyong mukha. Huwag kumurap ng matagal.
        </div>
        <div style={{ flex: 1, minHeight: 24 }} />
        {showStartScan && (
          <button
            style={{ width: "100%", background: "#2563EB", color: "#fff", border: "none", borderRadius: 22, padding: 16, fontSize: 15.5, fontWeight: 700, cursor: "pointer" }}
            onClick={onStartScan}
          >
            Simulan ang pag-scan
          </button>
        )}
        {scanDone && (
          <button
            style={{ width: "100%", background: "#16A34A", color: "#fff", border: "none", borderRadius: 22, padding: 16, fontSize: 15.5, fontWeight: 700, cursor: "pointer" }}
            onClick={onContinue}
          >
            Magpatuloy
          </button>
        )}
      </div>
    </div>
  );
}

function EverifyScreen({
  everifyLoading,
  everifyDone,
  everifyError,
  scanDone,
  hasSession,
  profile,
  onBack,
  onNext,
  onRetry,
  onGoScan,
}: {
  everifyLoading: boolean;
  everifyDone: boolean;
  everifyError: string;
  scanDone: boolean;
  hasSession: boolean;
  profile: { firstName: string; lastName: string; birthDate: string; civilStatus: string; vitalStatus: string };
  onBack: () => void;
  onNext: () => void;
  onRetry: () => void;
  onGoScan: () => void;
}) {
  const displayName = formatProfileName(profile.firstName, profile.lastName);
  const birthLabel = formatBirthDate(profile.birthDate);
  const civilLabel = formatCivilStatus(profile.civilStatus);
  const vitalLabel = formatVitalStatus(profile.vitalStatus);
  const idle = !everifyLoading && !everifyDone && !everifyError;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      <BackHeader title="Kumpirmasyon ng Datos" onBack={onBack} />
      <div style={{ flex: 1, padding: "24px 22px", display: "flex", flexDirection: "column" }}>
        {everifyLoading && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, gap: 16, padding: "60px 0" }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: "50%",
                border: "4px solid #DBEAFE",
                borderTopColor: "#2563EB",
                animation: "spin 0.9s linear infinite",
              }}
            />
            <div style={{ fontSize: 13.5, color: "#5B6B76", textAlign: "center" }}>Kinukuha ang iyong impormasyon mula sa PSA PhilSys...</div>
          </div>
        )}
        {everifyError && !everifyLoading && (
          <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 14, paddingTop: 24 }}>
            <div style={{ background: "#FEF2F2", color: "#B91C1C", fontSize: 13, lineHeight: 1.5, padding: "14px 16px", borderRadius: 18 }}>
              {everifyError}
            </div>
            <div style={{ fontSize: 13, color: "#5B6B76", lineHeight: 1.5 }}>
              Hindi namin makumpirma ang iyong datos sa ngayon. Subukan ulit o kumpletuhin muna ang face scan.
            </div>
            <div style={{ flex: 1, minHeight: 16 }} />
            <button
              style={{ background: "#0F766E", color: "#fff", border: "none", borderRadius: 22, padding: 16, fontSize: 15.5, fontWeight: 700, cursor: "pointer" }}
              onClick={onRetry}
            >
              Subukan ulit
            </button>
            <button
              style={{ background: "#F3F4F6", color: "#334155", border: "none", borderRadius: 22, padding: 16, fontSize: 15, fontWeight: 700, cursor: "pointer", marginTop: 8 }}
              onClick={onGoScan}
            >
              Bumalik sa Face Scan
            </button>
          </div>
        )}
        {idle && (
          <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 14, paddingTop: 24 }}>
            <div style={{ background: "#EFF6FF", color: "#1D4ED8", fontSize: 13, lineHeight: 1.5, padding: "14px 16px", borderRadius: 18 }}>
              {scanDone && hasSession
                ? "Handa na ang face scan. Sinisimulan ang kumpirmasyon..."
                : "Kumpletuhin muna ang face scan bago makita ang iyong PSA PhilSys datos."}
            </div>
            <div style={{ fontSize: 13, color: "#5B6B76", lineHeight: 1.5 }}>
              Kailangan ang SSO login at liveness check para makuha ang iyong National ID record.
            </div>
            <div style={{ flex: 1, minHeight: 16 }} />
            <button
              style={{ background: "#2563EB", color: "#fff", border: "none", borderRadius: 22, padding: 16, fontSize: 15.5, fontWeight: 700, cursor: "pointer" }}
              onClick={onGoScan}
            >
              {hasSession ? "Pumunta sa Face Scan" : "Mag-sign in muna"}
            </button>
          </div>
        )}
        {everifyDone && (
          <>
            <div
              style={{
                background: "#DCFCE7",
                color: "#16A34A",
                fontSize: 12,
                fontWeight: 700,
                padding: "8px 12px",
                borderRadius: 18,
                display: "inline-block",
                width: "fit-content",
                marginBottom: 16,
              }}
            >
              PSA-verified ✓
            </div>
            <div style={{ display: "flex", flexDirection: "column", border: "1.5px solid #E2E8F0", borderRadius: 22, overflow: "hidden" }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid #EEF2F1" }}>
                <span style={{ fontSize: 13, color: "#5B6B76" }}>Pangalan</span>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: "#1F2937" }}>{displayName}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid #EEF2F1" }}>
                <span style={{ fontSize: 13, color: "#5B6B76" }}>Kaarawan</span>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: "#1F2937" }}>{birthLabel}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid #EEF2F1" }}>
                <span style={{ fontSize: 13, color: "#5B6B76" }}>Katayuang Sibil</span>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: "#1F2937" }}>{civilLabel}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "14px 16px" }}>
                <span style={{ fontSize: 13, color: "#5B6B76" }}>Katayuan</span>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: "#16A34A" }}>{vitalLabel}</span>
              </div>
            </div>
            <div style={{ fontSize: 12, color: "#94A3A0", marginTop: 14, lineHeight: 1.5 }}>
              Direkta mula sa iyong PhilSys National ID — walang paulit-ulit na porma.
            </div>
            <div style={{ flex: 1, minHeight: 16 }} />
            <button
              style={{ background: "#0F766E", color: "#fff", border: "none", borderRadius: 22, padding: 16, fontSize: 15.5, fontWeight: 700, cursor: "pointer", marginTop: 16 }}
              onClick={onNext}
            >
              Tingnan ang mga Benepisyo
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function BenefitsScreen({
  benefits,
  everifyDone,
  onBack,
  onSelect,
  onGoVerify,
}: {
  benefits: Benefit[];
  everifyDone: boolean;
  onBack: () => void;
  onSelect: (id: string) => void;
  onGoVerify: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      <BackHeader title="Mga Benepisyong Tugma" onBack={onBack} />
      <div style={{ padding: "20px 20px" }}>
        <div style={{ background: "#FEF3C7", color: "#92400E", fontSize: 12.5, lineHeight: 1.5, padding: "12px 14px", borderRadius: 20, marginBottom: 16 }}>
          Sinuri muna namin ang pondo (DBM Compass) bago ipinakita ang mga sumusunod.
        </div>
        {benefits.length === 0 && (
          <div style={{ textAlign: "center", padding: "28px 8px" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#334155" }}>
              {everifyDone ? "Walang tugmang benepisyo sa ngayon." : "Wala pang na-verify na datos."}
            </div>
            <div style={{ fontSize: 13, color: "#94A3A0", marginTop: 8, lineHeight: 1.5 }}>
              {everifyDone
                ? "Awtomatikong susuriin ulit kapag may bagong pondo."
                : "Kumpletuhin ang ID verify para makita ang mga benepisyong tugma sa'yo."}
            </div>
            {!everifyDone && (
              <button
                style={{
                  marginTop: 18,
                  background: "#0F766E",
                  color: "#fff",
                  border: "none",
                  borderRadius: 22,
                  padding: "14px 20px",
                  fontSize: 14.5,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
                onClick={onGoVerify}
              >
                Simulan ang pag-verify
              </button>
            )}
          </div>
        )}
        {benefits.map((b, i) => (
          <div
            key={b.id}
            className="card-enter"
            style={{
              background: "#fff",
              border: "1.5px solid #E2E8F0",
              borderRadius: 22,
              padding: 16,
              marginBottom: 12,
              cursor: "pointer",
              animationDelay: `${i * 55}ms`,
            }}
            onClick={() => onSelect(b.id)}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 20,
                    background: b.tileBg,
                    color: b.agencyColor,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 800,
                    fontSize: 14,
                  }}
                >
                  {b.initial}
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: b.agencyColor, padding: "3px 9px", borderRadius: 100 }}>
                  {b.agency}
                </span>
              </div>
              <span style={{ fontSize: 17, color: "#94A3A0" }}>›</span>
            </div>
            <div style={{ fontSize: 15.5, fontWeight: 700, color: "#1F2937", marginTop: 10 }}>{b.title}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0F766E", marginTop: 2 }}>{b.amount}</div>
            <div style={{ fontSize: 12.5, color: "#5B6B76", marginTop: 6, lineHeight: 1.4 }}>{b.reason}</div>
          </div>
        ))}
        {benefits.length > 0 && (
          <div style={{ fontSize: 12, color: "#94A3A0", textAlign: "center", marginTop: 6, lineHeight: 1.5 }}>
            Iyan lang ang tugma sa ngayon. Awtomatikong susuriin ulit kapag may bagong pondo.
          </div>
        )}
      </div>
    </div>
  );
}

function DisburseScreen({
  benefit,
  hasSelection,
  disburseStep,
  disburseBusy,
  disburseDone,
  anchorHash,
  onBack,
  onConfirm,
  onGoTransparency,
  onGoBenefits,
}: {
  benefit: Benefit;
  hasSelection: boolean;
  disburseStep: number;
  disburseBusy: boolean;
  disburseDone: boolean;
  anchorHash: string;
  onBack: () => void;
  onConfirm: () => void;
  onGoTransparency: () => void;
  onGoBenefits: () => void;
}) {
  const buttonLabel = disburseBusy ? "Nagpoproseso..." : disburseDone ? "Tapos na ✓" : "Ipagpatuloy ang Proseso";
  const buttonBg = disburseDone ? "#16A34A" : disburseBusy ? "#94A3A0" : "#0F766E";

  if (!hasSelection || !benefit.id) {
    return (
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
        <BackHeader title="Detalye at Bayad" onBack={onBack} />
        <div style={{ padding: "28px 22px", textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#334155" }}>Walang napiling benepisyo</div>
          <div style={{ fontSize: 13, color: "#94A3A0", marginTop: 8, lineHeight: 1.5 }}>
            Pumili muna ng benepisyo para makita ang detalye at proseso ng bayad.
          </div>
          <button
            style={{
              marginTop: 20,
              width: "100%",
              background: "#0F766E",
              color: "#fff",
              border: "none",
              borderRadius: 22,
              padding: 16,
              fontSize: 15.5,
              fontWeight: 700,
              cursor: "pointer",
            }}
            onClick={onGoBenefits}
          >
            Pumunta sa Benepisyo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      <BackHeader title={benefit.title} onBack={onBack} />
      <div style={{ padding: "22px 20px" }}>
        <div style={{ background: "#fff", border: "1.5px solid #E2E8F0", borderRadius: 22, padding: 16 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: benefit.agencyColor, padding: "3px 9px", borderRadius: 100 }}>
            {benefit.agency}
          </span>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#0F766E", marginTop: 10 }}>{benefit.amount}</div>
          <div style={{ fontSize: 12.5, color: "#5B6B76", marginTop: 4 }}>{benefit.reason}</div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "#DCFCE7",
              color: "#166534",
              fontSize: 12,
              fontWeight: 700,
              padding: "6px 10px",
              borderRadius: 16,
              marginTop: 12,
            }}
          >
            May sapat na pondo ✓ · DBM Compass
          </div>
        </div>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: "#334155", marginTop: 22, marginBottom: 12 }}>Katayuan ng Proseso</div>
        {DISBURSE_LABELS.map((label, i) => {
          const done = i < disburseStep;
          const active = i === disburseStep;
          return (
            <div key={label} className="card-enter" style={{ display: "flex", gap: 12, alignItems: "flex-start", paddingBottom: 18, animationDelay: `${i * 40}ms` }}>
              <div
                className={`step-dot${active ? " is-active" : ""}`}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 13,
                  fontWeight: 700,
                  background: done ? "#16A34A" : active ? "#0F766E" : "#EEF2F1",
                  color: done || active ? "#fff" : "#94A3A0",
                }}
              >
                {done ? "✓" : i + 1}
              </div>
              <div
                className="step-label"
                style={{
                  fontSize: 13.5,
                  color: done || active ? "#1F2937" : "#94A3A0",
                  fontWeight: active ? 700 : 600,
                  paddingTop: 3,
                }}
              >
                {label}
              </div>
            </div>
          );
        })}
        {disburseDone && (
          <div className="card-enter" style={{ background: "#F7FAF9", borderRadius: 18, padding: "12px 14px", fontSize: 11.5, color: "#5B6B76", marginTop: 4, lineHeight: 1.6 }}>
            Ref: <span style={{ color: "#1F2937", fontWeight: 600 }}>EGP-4471-8823</span>
            <br />
            eGovChain anchor: <span style={{ color: "#1F2937", fontWeight: 600 }}>{anchorHash || "—"}</span>
          </div>
        )}
        <div style={{ height: 16 }} />
        <button
          style={{ width: "100%", background: buttonBg, color: "#fff", border: "none", borderRadius: 22, padding: 16, fontSize: 15.5, fontWeight: 700, cursor: "pointer" }}
          onClick={onConfirm}
        >
          {buttonLabel}
        </button>
        <div style={{ textAlign: "center", marginTop: 16, fontSize: 13, color: "#0F766E", fontWeight: 600, cursor: "pointer" }} onClick={onGoTransparency}>
          → Tingnan ang mga proyekto ng gobyerno sa lugar mo
        </div>
      </div>
    </div>
  );
}

function TransparencyScreen({
  projects,
  loading,
  error,
  reportYear,
  onRetry,
  onBack,
  reportOpen,
  reportSubmitted,
  reportCategory,
  reportText,
  caseId,
  onOpenReport,
  onCloseReport,
  onSelectCategory,
  onChangeText,
  onSubmit,
}: {
  projects: Project[];
  loading: boolean;
  error: string;
  reportYear: number | null;
  onRetry: () => void;
  onBack: () => void;
  reportOpen: boolean;
  reportSubmitted: boolean;
  reportCategory: string;
  reportText: string;
  caseId: string;
  onOpenReport: () => void;
  onCloseReport: () => void;
  onSelectCategory: (v: string) => void;
  onChangeText: (v: string) => void;
  onSubmit: () => void;
}) {
  const submitBg = reportCategory && reportText.trim() ? "#0F766E" : "#B7C2BE";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <BackHeader title="Transparency sa Proyekto" onBack={onBack} />
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          padding: "18px 18px 96px",
        }}
      >
        <div style={{ fontSize: 12, color: "#64748B", marginBottom: 12, lineHeight: 1.45 }}>
          Live mula sa DBM Compass LGSF
          {reportYear ? ` · FY ${reportYear}` : ""}.
        </div>
        {loading && (
          <div style={{ fontSize: 13, color: "#94A3A0", textAlign: "center", padding: "28px 0" }}>
            Kinukuha ang kasalukuyang status ng mga proyekto...
          </div>
        )}
        {!loading && error && (
          <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 18, padding: "14px 16px", marginBottom: 12 }}>
            <div style={{ fontSize: 13, color: "#B91C1C", fontWeight: 600 }}>{error}</div>
            <button
              style={{
                marginTop: 10,
                background: "#B91C1C",
                color: "#fff",
                border: "none",
                borderRadius: 100,
                padding: "8px 14px",
                fontSize: 12.5,
                fontWeight: 700,
                cursor: "pointer",
              }}
              onClick={onRetry}
            >
              Subukan ulit
            </button>
          </div>
        )}
        {!loading && !error && projects.length === 0 && (
          <div style={{ fontSize: 13, color: "#94A3A0", textAlign: "center", padding: "28px 0" }}>
            Walang proyekto sa DBM Compass sa ngayon.
          </div>
        )}
        {!loading &&
          projects.map((p, i) => (
          <div
            key={p.id}
            className="card-enter"
            style={{
              background: "#fff",
              border: "1.5px solid #E2E8F0",
              borderRadius: 22,
              padding: 15,
              marginBottom: 12,
              animationDelay: `${i * 55}ms`,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ fontSize: 14.5, fontWeight: 700, color: "#1F2937", maxWidth: 230 }}>{p.title}</div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#fff",
                  background: p.statusColor,
                  padding: "3px 9px",
                  borderRadius: 100,
                  whiteSpace: "nowrap",
                }}
              >
                {p.status}
              </span>
            </div>
            <div style={{ fontSize: 12, color: "#5B6B76", marginTop: 4 }}>
              {p.agency} · {p.location}
            </div>
            <div style={{ height: 7, background: "#EEF2F1", borderRadius: 100, marginTop: 10, overflow: "hidden" }}>
              <div className="progress-fill" style={{ height: "100%", borderRadius: 100, background: p.statusColor, width: `${p.utilization}%` }} />
            </div>
            <div style={{ fontSize: 11.5, color: "#94A3A0", marginTop: 5 }}>{p.utilization}% nagamit sa badyet</div>
          </div>
        ))}
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 18,
          left: 18,
          right: 18,
          zIndex: 5,
          pointerEvents: "none",
        }}
      >
        <button
          style={{
            width: "100%",
            background: "#DC2626",
            color: "#fff",
            border: "none",
            borderRadius: 100,
            padding: 15,
            fontSize: 14.5,
            fontWeight: 700,
            cursor: "pointer",
            boxShadow: "0 8px 20px rgba(220,38,38,0.3)",
            pointerEvents: "auto",
          }}
          onClick={onOpenReport}
        >
          ⚑ Mag-report ng Problema
        </button>
      </div>

      <AnimatedSheet
        open={reportOpen}
        onClose={onCloseReport}
        backdropClassName="report-sheet-backdrop"
        sheetClassName="report-sheet-panel"
      >
        {reportSubmitted ? (
          <div className="card-enter" style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 40, color: "#16A34A" }}>✓</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#1F2937", marginTop: 10 }}>Naisumite na ang ulat!</div>
            <div style={{ fontSize: 13, color: "#5B6B76", marginTop: 6 }}>
              Case ID: <span style={{ fontWeight: 700, color: "#1F2937" }}>{caseId}</span>
            </div>
            <button
              style={{ width: "100%", background: "#0F766E", color: "#fff", border: "none", borderRadius: 22, padding: 15, fontSize: 15, fontWeight: 700, cursor: "pointer", marginTop: 20 }}
              onClick={onCloseReport}
            >
              Isara
            </button>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#1F2937" }}>Mag-report ng Problema</div>
              <div style={{ cursor: "pointer", color: "#94A3A0", fontSize: 18 }} onClick={onCloseReport}>
                ✕
              </div>
            </div>
            <div style={{ fontSize: 12.5, color: "#5B6B76", marginTop: 4 }}>Piliin ang uri ng problema para sa proyektong ito.</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
              {REPORT_CATS.map((cat, i) => {
                const active = reportCategory === cat.value;
                return (
                  <div
                    key={cat.value}
                    className="chip-enter"
                    style={{
                      padding: "9px 14px",
                      borderRadius: 100,
                      fontSize: 12.5,
                      fontWeight: 600,
                      cursor: "pointer",
                      border: `1.5px solid ${active ? "#0F766E" : "#DCE3E1"}`,
                      background: active ? "#E6F4F1" : "#fff",
                      color: active ? "#0B5D57" : "#334155",
                      animationDelay: `${i * 40}ms`,
                      transition: "background 0.2s ease, border-color 0.2s ease, color 0.2s ease",
                    }}
                    onClick={() => onSelectCategory(cat.value)}
                  >
                    {cat.label}
                  </div>
                );
              })}
            </div>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#334155", marginTop: 16, display: "block" }}>Ilarawan ang problema</label>
            <textarea
              value={reportText}
              onChange={(e) => onChangeText(e.target.value)}
              placeholder="Halimbawa: Hindi pa natatapos ang proyekto simula pa noong..."
              style={{
                width: "100%",
                boxSizing: "border-box",
                border: "1.5px solid #DCE3E1",
                borderRadius: 20,
                padding: 12,
                fontSize: 14,
                color: "#1F2937",
                marginTop: 6,
                minHeight: 80,
                resize: "none",
                outline: "none",
              }}
            />
            <button
              style={{ width: "100%", background: submitBg, color: "#fff", border: "none", borderRadius: 22, padding: 15, fontSize: 15, fontWeight: 700, cursor: "pointer", marginTop: 16 }}
              onClick={onSubmit}
            >
              Isumite ang Ulat
            </button>
          </>
        )}
      </AnimatedSheet>
    </div>
  );
}

function formatProfileName(firstName: string, lastName: string) {
  const first = firstName?.trim();
  const last = lastName?.trim();
  if (!first && !last) return "—";
  if (first && last) return `${first.charAt(0)}. ${last}`;
  return first || last;
}

function formatBirthDate(raw: string) {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatCivilStatus(raw: string) {
  if (!raw) return "—";
  const key = raw.toLowerCase();
  const map: Record<string, string> = {
    single: "Walang asawa",
    married: "May asawa",
    widowed: "Balo",
    widow: "Balo",
    separated: "Hiwalay",
    annulled: "Pinawalang-bisa",
  };
  return map[key] ?? raw;
}

function formatVitalStatus(raw: string) {
  if (!raw) return "—";
  const key = raw.toLowerCase();
  if (key === "alive" || key === "living" || key === "buhay") return "Buhay";
  if (key === "deceased" || key === "dead") return "Pumanaw";
  return raw;
}

function SearchScreen({
  benefits,
  projects,
  onBack,
  onGoTo,
}: {
  benefits: Benefit[];
  projects: Project[];
  onBack: () => void;
  onGoTo: (screen: number) => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  type Hit = { key: string; title: string; subtitle: string; screen: number };
  const shortcuts: Hit[] = HOME_FEATURES.map((f: HomeFeature) => ({
    key: `feat-${f.kind}`,
    title: f.label,
    subtitle: "Shortcut",
    screen: FEATURE_SCREENS[f.kind],
  }));

  const benefitHits: Hit[] = benefits.map((b) => ({
    key: `ben-${b.id}`,
    title: b.title,
    subtitle: `${b.agency} · ${b.amount}`,
    screen: 4,
  }));

  const projectHits: Hit[] = projects.map((p) => ({
    key: `proj-${p.id}`,
    title: p.title,
    subtitle: `${p.agency} · ${p.location}`,
    screen: 6,
  }));

  const all = [...shortcuts, ...benefitHits, ...projectHits];
  const results = q
    ? all.filter((h) => `${h.title} ${h.subtitle}`.toLowerCase().includes(q))
    : shortcuts;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      <BackHeader title="Maghanap" onBack={onBack} />
      <div style={{ padding: "16px 18px 24px" }}>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Hanapin: benepisyo, proyekto, shortcut..."
          style={{
            width: "100%",
            boxSizing: "border-box",
            border: "1.5px solid #DCE3E1",
            borderRadius: 100,
            padding: "12px 16px",
            fontSize: 14,
            color: "#1F2937",
            outline: "none",
            background: "#F8FAF9",
          }}
        />
        <div style={{ fontSize: 12, color: "#94A3A0", marginTop: 14, marginBottom: 8, fontWeight: 600 }}>
          {q ? "Mga resulta" : "Mga shortcut"}
        </div>
        {results.length === 0 && (
          <div style={{ textAlign: "center", padding: "36px 12px", color: "#94A3A0", fontSize: 13.5 }}>
            Walang resulta para sa “{query.trim()}”.
          </div>
        )}
        {results.map((h, i) => (
          <div
            key={h.key}
            className="card-enter"
            style={{
              background: "#fff",
              border: "1.5px solid #E2E8F0",
              borderRadius: 18,
              padding: "14px 16px",
              marginBottom: 10,
              cursor: "pointer",
              animationDelay: `${i * 40}ms`,
            }}
            onClick={() => onGoTo(h.screen)}
          >
            <div style={{ fontSize: 14.5, fontWeight: 700, color: "#1F2937" }}>{h.title}</div>
            <div style={{ fontSize: 12.5, color: "#64748B", marginTop: 3 }}>{h.subtitle}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BayadScreen({
  benefit,
  benefitsCount,
  disburseDone,
  disburseStep,
  anchorHash,
  hasSession,
  everifyDone,
  onBack,
  onGoDisburse,
  onGoBenefits,
  onGoVerify,
}: {
  benefit: Benefit | null;
  benefitsCount: number;
  disburseDone: boolean;
  disburseStep: number;
  anchorHash: string;
  hasSession: boolean;
  everifyDone: boolean;
  onBack: () => void;
  onGoDisburse: () => void;
  onGoBenefits: () => void;
  onGoVerify: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      <BackHeader title="Bayad" onBack={onBack} />
      <div style={{ padding: "22px 20px" }}>
        {benefit && (disburseDone || disburseStep > 0) ? (
          <>
            <div style={{ background: "#fff", border: "1.5px solid #E2E8F0", borderRadius: 22, padding: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#0F766E" }}>Huling bayad</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#0F172A", marginTop: 8 }}>{benefit.title}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#0F766E", marginTop: 6 }}>{benefit.amount || "—"}</div>
              <div style={{ fontSize: 12.5, color: "#5B6B76", marginTop: 8 }}>
                Hakbang: {Math.min(disburseStep + (disburseDone ? 1 : 0), DISBURSE_LABELS.length)} / {DISBURSE_LABELS.length}
                {disburseDone ? " · Tapos na" : " · Nagpapatuloy"}
              </div>
              {anchorHash && (
                <div style={{ fontSize: 11.5, color: "#64748B", marginTop: 10, lineHeight: 1.5 }}>
                  eGovChain: <span style={{ color: "#1F2937", fontWeight: 600 }}>{anchorHash}</span>
                </div>
              )}
            </div>
            <button
              style={{
                width: "100%",
                marginTop: 18,
                background: "#0F766E",
                color: "#fff",
                border: "none",
                borderRadius: 22,
                padding: 16,
                fontSize: 15.5,
                fontWeight: 700,
                cursor: "pointer",
              }}
              onClick={onGoDisburse}
            >
              Tingnan ang detalye
            </button>
          </>
        ) : benefitsCount > 0 ? (
          <>
            <div style={{ background: "#FDF2F8", color: "#9D174D", fontSize: 13, lineHeight: 1.5, padding: "14px 16px", borderRadius: 18 }}>
              May {benefitsCount} na benepisyong tugma. Pumili para simulan ang bayad.
            </div>
            <button
              style={{
                width: "100%",
                marginTop: 18,
                background: "#DB2777",
                color: "#fff",
                border: "none",
                borderRadius: 22,
                padding: 16,
                fontSize: 15.5,
                fontWeight: 700,
                cursor: "pointer",
              }}
              onClick={onGoBenefits}
            >
              Pumili ng benepisyo
            </button>
          </>
        ) : (
          <>
            <div style={{ background: "#EFF6FF", color: "#1D4ED8", fontSize: 13, lineHeight: 1.5, padding: "14px 16px", borderRadius: 18 }}>
              {everifyDone
                ? "Wala pang bayad. Tingnan muna kung may tugmang benepisyo."
                : hasSession
                  ? "Kumpletuhin ang pag-verify para makita ang mga bayad."
                  : "Mag-sign in at mag-verify muna bago makakita ng bayad."}
            </div>
            <button
              style={{
                width: "100%",
                marginTop: 18,
                background: "#2563EB",
                color: "#fff",
                border: "none",
                borderRadius: 22,
                padding: 16,
                fontSize: 15.5,
                fontWeight: 700,
                cursor: "pointer",
              }}
              onClick={everifyDone ? onGoBenefits : onGoVerify}
            >
              {everifyDone ? "Tingnan ang Benepisyo" : hasSession ? "Ituloy ang verify" : "Mag-sign in"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

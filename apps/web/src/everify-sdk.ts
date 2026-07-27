/**
 * eVerify Face Liveness Web SDK (Tier) — separate from Face Liveness API.
 * @see docs/platform-apis.md §2
 */

const SDK_SRC =
  "https://hackathon-everify-face-liveness.e.gov.ph/js/everify-liveness-sdk.min.js";

export type EverifySdkResult = {
  status?: string;
  result?: {
    session_id?: string;
    photo?: string;
    photo_url?: string;
  };
  session_id?: string;
};

declare global {
  interface Window {
    eKYC?: () => {
      start: (opts: { pubKey: string }) => Promise<EverifySdkResult> | EverifySdkResult;
    };
  }
}

let loadPromise: Promise<void> | null = null;

export function loadEverifyLivenessSdk(): Promise<void> {
  if (typeof window.eKYC === "function") return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${SDK_SRC}"]`,
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Failed to load eVerify Face Liveness SDK")),
        { once: true },
      );
      return;
    }
    const script = document.createElement("script");
    script.src = SDK_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loadPromise = null;
      reject(new Error("Failed to load eVerify Face Liveness SDK"));
    };
    document.head.appendChild(script);
  });
  return loadPromise;
}

function extractSessionId(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const p = payload as EverifySdkResult;
  const fromResult = p.result?.session_id;
  if (fromResult != null && String(fromResult).trim()) return String(fromResult).trim();
  if (p.session_id != null && String(p.session_id).trim()) return String(p.session_id).trim();
  return "";
}

/**
 * Opens the official eVerify Web SDK capture UI and returns `result.session_id`
 * for `face_liveness_session_id` on confirm-identity / `/api/query`.
 */
export async function captureEverifyLivenessSession(pubKey: string): Promise<string> {
  const key = pubKey.trim();
  if (!key) throw new Error("EVERIFY_PUBLIC_KEY / pubKey is empty");

  await loadEverifyLivenessSdk();
  if (typeof window.eKYC !== "function") {
    throw new Error("eVerify SDK loaded but window.eKYC is missing");
  }

  const started = window.eKYC().start({ pubKey: key });
  const payload =
    started != null && typeof (started as Promise<EverifySdkResult>).then === "function"
      ? await (started as Promise<EverifySdkResult>)
      : (started as EverifySdkResult);

  const sessionId = extractSessionId(payload);
  if (!sessionId) {
    throw new Error(
      "eVerify SDK did not return result.session_id (complete the Tier face capture)",
    );
  }
  return sessionId;
}

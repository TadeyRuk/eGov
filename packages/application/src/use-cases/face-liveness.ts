import { appError, err, ok, type Result } from "@egov/shared";
import type {
  FaceLivenessCreateSessionInput,
  FaceLivenessPort,
  FaceLivenessResult,
  FaceLivenessSession,
  FaceLivenessSessionAction,
} from "../ports/index.js";

export type StartFaceLivenessSessionDeps = {
  readonly faceLiveness: FaceLivenessPort;
};

export type StartFaceLivenessSessionInput = {
  readonly action: FaceLivenessSessionAction;
  readonly callbackUrl?: string;
  readonly delay?: number;
};

/** Start a platform Face Liveness capture session (API key stays server-side). */
export async function startFaceLivenessSession(
  deps: StartFaceLivenessSessionDeps,
  input: StartFaceLivenessSessionInput,
): Promise<Result<FaceLivenessSession>> {
  if (input.action === "redirect" && !input.callbackUrl) {
    return err(
      appError(
        "VALIDATION",
        'callbackUrl is required when action is "redirect"',
      ),
    );
  }

  const createInput: FaceLivenessCreateSessionInput = {
    action: input.action,
    ...(input.callbackUrl !== undefined
      ? { callbackUrl: input.callbackUrl }
      : {}),
    ...(input.delay !== undefined ? { delay: input.delay } : {}),
  };
  return deps.faceLiveness.createSession(createInput);
}

export type GetFaceLivenessResultDeps = {
  readonly faceLiveness: FaceLivenessPort;
};

export type GetFaceLivenessResultInput = {
  /** Session token returned by startFaceLivenessSession / createSession. */
  readonly sessionToken: string;
};

export async function getFaceLivenessResult(
  deps: GetFaceLivenessResultDeps,
  input: GetFaceLivenessResultInput,
): Promise<Result<FaceLivenessResult>> {
  const token = input.sessionToken.trim();
  if (token.length === 0) {
    return err(appError("VALIDATION", "sessionToken is required"));
  }
  // Debug shell placeholders must never be proxied to the platform API.
  if (token.startsWith("skip-")) {
    return err(
      appError(
        "VALIDATION",
        "sessionToken looks like a debug skip placeholder; create a real Face Liveness session and complete capture first",
      ),
    );
  }
  return deps.faceLiveness.getResult(token);
}

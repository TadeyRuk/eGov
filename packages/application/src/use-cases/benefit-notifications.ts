import { appError, err, newId, ok, type Result } from "@egov/shared";
import type {
  BenefitNotificationCategory,
  BenefitNotificationRepository,
  Clock,
  EMessagePort,
  HashPort,
} from "../ports/index.js";

export const BENEFIT_NOTIFICATION_CATEGORIES: readonly BenefitNotificationCategory[] = [
  "BENEFIT_ANNOUNCEMENT",
  "QUALIFICATION_RESULT",
  "REQUIREMENTS_NEEDED",
  "APPLICATION_STATUS",
  "ACTION_REMINDER",
];

export const MAX_BENEFIT_SMS_PER_RECIPIENT_PER_DAY = 5;
export const SAME_CATEGORY_COOLDOWN_MS = 6 * 60 * 60 * 1000;

export type SendBenefitNotificationInput = {
  readonly citizenPhone: string;
  /** Opaque citizen/match owner identifier used for rate policy; never the phone number. */
  readonly recipientKey: string;
  readonly category: BenefitNotificationCategory;
  /** Stable business-event identifier, e.g. match ID + requirements version. */
  readonly contextKey: string;
  readonly benefitTitle: string;
  readonly requirements?: readonly string[];
  readonly statusText?: string;
  readonly actionText?: string;
  readonly deadlineText?: string;
};

export type BenefitNotificationOutcome = {
  readonly status: "SENT" | "SUPPRESSED_DUPLICATE" | "SUPPRESSED_CATEGORY_COOLDOWN" | "SUPPRESSED_DAILY_LIMIT";
  readonly category: BenefitNotificationCategory;
  readonly deliveryId?: string;
};

export type SendBenefitNotificationDeps = {
  readonly eMessage: EMessagePort;
  readonly notifications: BenefitNotificationRepository;
  readonly hash: HashPort;
  readonly clock: Clock;
};

function clean(value: unknown, max = 160): string {
  return (typeof value === "string" ? value : "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function buildMessage(input: SendBenefitNotificationInput): Result<string> {
  const title = clean(input.benefitTitle, 100);
  if (!title) return err(appError("VALIDATION", "benefitTitle is required"));

  switch (input.category) {
    case "BENEFIT_ANNOUNCEMENT":
      return ok(`eGov PH BANGON: Available ang ${title}. Tingnan ang official BANGON service para sa detalye.`);
    case "QUALIFICATION_RESULT":
      return ok(`eGov PH BANGON: Maaaring kwalipikado ka para sa ${title}. Kumpirmahin ang detalye sa official BANGON service.`);
    case "REQUIREMENTS_NEEDED": {
      const requirements = (Array.isArray(input.requirements) ? input.requirements : []).map((item) => clean(item, 80)).filter(Boolean).slice(0, 5);
      if (requirements.length === 0) return err(appError("VALIDATION", "requirements are required for REQUIREMENTS_NEEDED"));
      return ok(`eGov PH BANGON: Kailangan para sa ${title}: ${requirements.join(", ")}. Ihanda ang mga ito bago magpatuloy.`);
    }
    case "APPLICATION_STATUS": {
      const status = clean(input.statusText);
      if (!status) return err(appError("VALIDATION", "statusText is required for APPLICATION_STATUS"));
      return ok(`eGov PH BANGON: Update sa ${title}: ${status}.`);
    }
    case "ACTION_REMINDER": {
      const action = clean(input.actionText);
      const deadline = clean(input.deadlineText, 80);
      if (!action) return err(appError("VALIDATION", "actionText is required for ACTION_REMINDER"));
      return ok(`eGov PH BANGON: Paalala para sa ${title}: ${action}.${deadline ? ` Deadline: ${deadline}.` : ""}`);
    }
  }
}

export async function sendBenefitNotification(
  deps: SendBenefitNotificationDeps,
  input: SendBenefitNotificationInput,
): Promise<Result<BenefitNotificationOutcome>> {
  const phone = clean(input.citizenPhone, 32).replace(/[\s()-]/g, "");
  const recipientKey = clean(input.recipientKey, 200);
  const contextKey = clean(input.contextKey, 200);
  if (!/^\+?\d{10,15}$/.test(phone)) return err(appError("VALIDATION", "citizenPhone must contain 10 to 15 digits"));
  if (!recipientKey) return err(appError("VALIDATION", "recipientKey is required"));
  if (!contextKey) return err(appError("VALIDATION", "contextKey is required"));
  if (!(BENEFIT_NOTIFICATION_CATEGORIES as readonly string[]).includes(input.category)) {
    return err(appError("VALIDATION", "notification category is not supported"));
  }

  const message = buildMessage(input);
  if (!message.ok) return message;

  const recipientDigest = await deps.hash.sha256Hex(`EMESSAGE|RECIPIENT|${recipientKey}`);
  const contextDigest = await deps.hash.sha256Hex(`EMESSAGE|CONTEXT|${input.category}|${contextKey}`);
  const duplicate = await deps.notifications.hasContext(recipientDigest, contextDigest);
  if (!duplicate.ok) return duplicate;
  if (duplicate.value) return ok({ status: "SUPPRESSED_DUPLICATE", category: input.category });

  const now = deps.clock.now();
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const recent = await deps.notifications.listSince(recipientDigest, since);
  if (!recent.ok) return recent;
  if (recent.value.length >= MAX_BENEFIT_SMS_PER_RECIPIENT_PER_DAY) {
    return ok({ status: "SUPPRESSED_DAILY_LIMIT", category: input.category });
  }
  const sameCategory = recent.value.some(
    (record) => record.category === input.category && now.getTime() - record.sentAt.getTime() < SAME_CATEGORY_COOLDOWN_MS,
  );
  if (sameCategory) return ok({ status: "SUPPRESSED_CATEGORY_COOLDOWN", category: input.category });

  const sent = await deps.eMessage.pushSms({ number: phone, message: message.value });
  if (!sent.ok) return sent;

  const deliveryId = newId("notification");
  const saved = await deps.notifications.save({
    id: deliveryId,
    recipientDigest,
    contextDigest,
    category: input.category,
    sentAt: now,
  });
  if (!saved.ok) return saved;
  return ok({ status: "SENT", category: input.category, deliveryId });
}

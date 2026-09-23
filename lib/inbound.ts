import "server-only";

// Everything the inbound-email feature needs in one place, so the address is
// spelled the same way on the settings screen, in the API route and in the
// Worker's error messages.

// The domain the MX records point at. A subdomain is used rather than the bare
// domain so that mail routing stays separable from whatever else the domain is
// asked to do later.
export function inboundDomain() {
  return process.env.INBOUND_EMAIL_DOMAIN ?? "";
}

export function inboundConfigured() {
  return Boolean(process.env.INBOUND_EMAIL_DOMAIN && process.env.INBOUND_SECRET);
}

export function inboundAddress(localPart: string | null | undefined) {
  const domain = inboundDomain();
  if (!localPart || !domain) return null;
  return `${localPart}@${domain}`;
}

// Mirrors the check constraint in migration 0022. The database is what enforces
// this - a routable address matters too much to leave to a form - and this copy
// exists only to say why in Bulgarian instead of showing a constraint name.
const ADDRESS_PATTERN = /^[a-z0-9][a-z0-9._-]{2,63}$/;

export function validateInboxAddress(value: string): string | null {
  if (!value) return "Адресът не може да е празен.";
  if (value !== value.toLowerCase()) return "Само малки букви.";
  if (value.includes("@")) return "Въведи само частта преди @.";
  if (value.length < 3) return "Поне 3 символа.";
  if (value.length > 64) return "Най-много 64 символа.";
  if (!ADDRESS_PATTERN.test(value)) {
    return "Позволени са малки латински букви, цифри, точка, тире и долно тире.";
  }
  return null;
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

// Deliberately permissive: the job here is to catch a typo, not to adjudicate
// RFC 5322. A sender that does not match is simply never treated as known.
export function validateSenderEmail(value: string): string | null {
  if (!value) return "Въведи имейл адрес.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "Това не изглежда като имейл адрес.";
  if (value.length > 254) return "Адресът е твърде дълъг.";
  return null;
}

export const INBOUND_STATUS_LABELS: Record<string, string> = {
  accepted: "Приет",
  rejected: "Отказан",
  ignored: "Без фактура",
};

// The cap that compensates for the address being readable rather than secret:
// anyone who guesses it can create documents, so the volume is bounded.
export const MAX_INBOUND_PER_DAY = 50;

// Anywhere a redirect target comes from the request, it has to be proven local
// before use. Without this, /login?redirectTo=https://evil.example sends the
// landlord to another origin the moment they sign in successfully - a
// convincing place to ask them for their password a second time.
//
// Only a single-slash-prefixed path is accepted. That rejects absolute URLs
// (https://host), protocol-relative ones (//host), the backslash variant
// browsers normalise to a host (\\host), and anything with whitespace in it.
export function safeRedirect(target: string | undefined | null, fallback = "/dashboard") {
  if (!target) return fallback;
  return /^\/(?![/\\])[^\s]*$/.test(target) ? target : fallback;
}

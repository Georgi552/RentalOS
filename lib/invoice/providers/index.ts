import { electrohold } from "./electrohold";
import { sofiyskaVoda } from "./sofiyska-voda";
import { toplofikaciaSofia } from "./toplofikacia-sofia";
import type { ProviderAdapter } from "../types";

// Provider-specific knowledge lives here and nowhere else. The rest of the app
// only ever sees a normalized bill (context doc section 36).
export const PROVIDERS: ProviderAdapter[] = [
  electrohold,
  sofiyskaVoda,
  toplofikaciaSofia,
];

export function findProvider(text: string) {
  return PROVIDERS.find((provider) => provider.matches(text)) ?? null;
}

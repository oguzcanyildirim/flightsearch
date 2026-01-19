// config.ts

export type Category = "europe" | "longhaul";

export interface RouteConfig {
  destination: string;
  destinationName: string;
  maxStopoversPerLeg: number;
  stopoverCountry?: string; // ISO country code, e.g. "DE"
  priceThresholdEUR: number;
  category: Category;
  // If you want "must be direct", set maxStopoversPerLeg=0 and nonStopPreferred=true
  nonStopPreferred?: boolean;
}

export interface OpenJawConfig {
  outboundTo: string;
  outboundToName: string;
  inboundFrom: string;
  inboundFromName: string;
  maxStopoversPerLeg: number;
  stopoverCountry?: string;
  priceThresholdEUR: number;
  category: Category;
}

export const ORIGIN = "ESB";
export const CURRENCY = "EUR";

// Search horizon
export const SEARCH_FROM_DAYS = 7;
export const SEARCH_TO_MONTHS = 4;

// Stay length constraints (open jaw nights check)
export const MIN_NIGHTS = 3;
export const MAX_NIGHTS = 14;

// Two-stage: we pick a duration value per route per run (rotates by weekday)
export const DURATIONS_EUROPE = [3, 4, 5];
export const DURATIONS_LONGHAUL = [7, 10, 14];

// Dedupe
export const SEEN_DEALS_FILE = "./seen_deals.json";
export const SEEN_DEALS_TTL_MS = 48 * 60 * 60 * 1000;

// Throttling
export const MIN_REQUEST_GAP_MS = 350; // minimum gap between Amadeus calls
export const BETWEEN_ROUTE_SLEEP_MS = 450; // polite delay between routes
export const TELEGRAM_BETWEEN_MSG_MS = 350;

// Routes
export const ROUND_TRIP_ROUTES: RouteConfig[] = [
  // Europe direct (or enforce direct)
  { destination: "LHR", destinationName: "Londra", maxStopoversPerLeg: 0, priceThresholdEUR: 120, category: "europe", nonStopPreferred: true },
  { destination: "CDG", destinationName: "Paris",  maxStopoversPerLeg: 0, priceThresholdEUR: 120, category: "europe", nonStopPreferred: true },
  { destination: "AMS", destinationName: "Amsterdam", maxStopoversPerLeg: 0, priceThresholdEUR: 120, category: "europe", nonStopPreferred: true },
  { destination: "BCN", destinationName: "Barcelona", maxStopoversPerLeg: 0, priceThresholdEUR: 120, category: "europe", nonStopPreferred: true },
  { destination: "FCO", destinationName: "Roma", maxStopoversPerLeg: 0, priceThresholdEUR: 100, category: "europe", nonStopPreferred: true },
  { destination: "VIE", destinationName: "Viyana", maxStopoversPerLeg: 0, priceThresholdEUR: 100, category: "europe", nonStopPreferred: true },
  { destination: "PRG", destinationName: "Prag", maxStopoversPerLeg: 0, priceThresholdEUR: 100, category: "europe", nonStopPreferred: true },
  { destination: "BRU", destinationName: "Brüksel", maxStopoversPerLeg: 0, priceThresholdEUR: 100, category: "europe", nonStopPreferred: true },
  { destination: "ATH", destinationName: "Atina", maxStopoversPerLeg: 0, priceThresholdEUR: 90, category: "europe", nonStopPreferred: true },
  { destination: "BUD", destinationName: "Budapeşte", maxStopoversPerLeg: 0, priceThresholdEUR: 90, category: "europe", nonStopPreferred: true },

  // Balkans visa-free
  { destination: "SKP", destinationName: "Üsküp", maxStopoversPerLeg: 0, priceThresholdEUR: 80, category: "europe", nonStopPreferred: true },
  { destination: "PRN", destinationName: "Priştine", maxStopoversPerLeg: 0, priceThresholdEUR: 80, category: "europe", nonStopPreferred: true },

  // Via Germany only (allow 1 stop, and if a stop exists it must be DE only)
  { destination: "KEF", destinationName: "Reykjavik", maxStopoversPerLeg: 1, stopoverCountry: "DE", priceThresholdEUR: 250, category: "europe" },
  { destination: "DUB", destinationName: "Dublin", maxStopoversPerLeg: 1, stopoverCountry: "DE", priceThresholdEUR: 150, category: "europe" },

  // Longhaul max 2 per leg
  { destination: "JFK", destinationName: "New York", maxStopoversPerLeg: 2, priceThresholdEUR: 500, category: "longhaul" },
  { destination: "MIA", destinationName: "Miami", maxStopoversPerLeg: 2, priceThresholdEUR: 550, category: "longhaul" },
  { destination: "DFW", destinationName: "Dallas", maxStopoversPerLeg: 2, priceThresholdEUR: 550, category: "longhaul" },
  { destination: "IAH", destinationName: "Houston", maxStopoversPerLeg: 2, priceThresholdEUR: 550, category: "longhaul" },
  { destination: "LAX", destinationName: "Los Angeles", maxStopoversPerLeg: 2, priceThresholdEUR: 550, category: "longhaul" },
  { destination: "SFO", destinationName: "San Francisco", maxStopoversPerLeg: 2, priceThresholdEUR: 550, category: "longhaul" },
  { destination: "SEA", destinationName: "Seattle", maxStopoversPerLeg: 2, priceThresholdEUR: 550, category: "longhaul" },
  { destination: "HNL", destinationName: "Hawaii", maxStopoversPerLeg: 2, priceThresholdEUR: 800, category: "longhaul" },

  // Asia Pacific
  { destination: "SIN", destinationName: "Singapur", maxStopoversPerLeg: 2, priceThresholdEUR: 500, category: "longhaul" },
  { destination: "KUL", destinationName: "Kuala Lumpur", maxStopoversPerLeg: 2, priceThresholdEUR: 450, category: "longhaul" },
  { destination: "BKK", destinationName: "Bangkok", maxStopoversPerLeg: 2, priceThresholdEUR: 400, category: "longhaul" },
  { destination: "NRT", destinationName: "Tokyo", maxStopoversPerLeg: 2, priceThresholdEUR: 550, category: "longhaul" },
  { destination: "SYD", destinationName: "Sydney", maxStopoversPerLeg: 2, priceThresholdEUR: 700, category: "longhaul" },
  { destination: "AKL", destinationName: "Auckland", maxStopoversPerLeg: 2, priceThresholdEUR: 900, category: "longhaul" },
  { destination: "PER", destinationName: "Perth", maxStopoversPerLeg: 2, priceThresholdEUR: 700, category: "longhaul" },
];

export const OPEN_JAW_ROUTES: OpenJawConfig[] = [
  { outboundTo: "GVA", outboundToName: "Cenevre", inboundFrom: "BSL", inboundFromName: "Basel", maxStopoversPerLeg: 1, priceThresholdEUR: 150, category: "europe" },
  { outboundTo: "MXP", outboundToName: "Milano",  inboundFrom: "FCO", inboundFromName: "Roma",  maxStopoversPerLeg: 1, priceThresholdEUR: 150, category: "europe" },
  { outboundTo: "BCN", outboundToName: "Barcelona", inboundFrom: "MAD", inboundFromName: "Madrid", maxStopoversPerLeg: 1, priceThresholdEUR: 150, category: "europe" },
];

// Airport -> Country mapping (extend anytime)
export const AIRPORT_COUNTRY: Record<string, string> = {
  // Germany
  FRA: "DE", MUC: "DE", DUS: "DE", BER: "DE", HAM: "DE", STR: "DE", CGN: "DE",
  HAJ: "DE", NUE: "DE", LEJ: "DE", DTM: "DE", FMO: "DE", PAD: "DE", SCN: "DE",
  // Turkey
  ESB: "TR", IST: "TR", SAW: "TR", AYT: "TR", ADB: "TR", DLM: "TR", BJV: "TR",
  // UK
  LHR: "GB", LGW: "GB", STN: "GB", LTN: "GB", MAN: "GB", EDI: "GB", BHX: "GB",
  // France
  CDG: "FR", ORY: "FR", NCE: "FR", LYS: "FR", MRS: "FR", TLS: "FR",
  // Netherlands
  AMS: "NL", EIN: "NL", RTM: "NL",
  // Spain
  MAD: "ES", BCN: "ES", PMI: "ES", AGP: "ES", ALC: "ES", VLC: "ES",
  // Italy
  FCO: "IT", MXP: "IT", LIN: "IT", VCE: "IT", NAP: "IT", BGY: "IT",
  // Switzerland
  ZRH: "CH", GVA: "CH", BSL: "CH",
  // Austria
  VIE: "AT", SZG: "AT", INN: "AT",
  // Belgium
  BRU: "BE", CRL: "BE",
  // Portugal
  LIS: "PT", OPO: "PT", FAO: "PT",
  // Greece
  ATH: "GR", SKG: "GR", HER: "GR",
  // Czech
  PRG: "CZ",
  // Hungary
  BUD: "HU",
  // Ireland
  DUB: "IE", SNN: "IE", ORK: "IE",
  // Iceland
  KEF: "IS",
  // Balkans
  SKP: "MK", PRN: "XK",
  // USA
  JFK: "US", EWR: "US", LGA: "US", LAX: "US", SFO: "US", ORD: "US",
  MIA: "US", DFW: "US", IAH: "US", ATL: "US", SEA: "US", BOS: "US",
  DEN: "US", PHX: "US", LAS: "US", HNL: "US",
  // Asia
  SIN: "SG", KUL: "MY", BKK: "TH", NRT: "JP", HND: "JP",
  // Oceania
  SYD: "AU", MEL: "AU", BNE: "AU", PER: "AU", AKL: "NZ", CHC: "NZ",
  // Middle East transit
  DXB: "AE", DOH: "QA", AUH: "AE",
};

export function getAirportCountry(iata: string): string | undefined {
  return AIRPORT_COUNTRY[iata];
}

export function getSearchDateRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() + SEARCH_FROM_DAYS);

  const to = new Date(now);
  to.setMonth(to.getMonth() + SEARCH_TO_MONTHS);

  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export function pickDurationDays(category: Category, seed: number): number {
  const list = category === "europe" ? DURATIONS_EUROPE : DURATIONS_LONGHAUL;
  return list[seed % list.length];
}

// scanner.ts

import {
  BETWEEN_ROUTE_SLEEP_MS,
  CURRENCY,
  getAirportCountry,
  getSearchDateRange,
  MIN_NIGHTS,
  MAX_NIGHTS,
  OPEN_JAW_ROUTES,
  ORIGIN,
  pickDurationDays,
  ROUND_TRIP_ROUTES,
  SEEN_DEALS_FILE,
  SEEN_DEALS_TTL_MS,
  TELEGRAM_BETWEEN_MSG_MS,
} from "./config.ts";

import { AmadeusClient, sleep, HttpError } from "./amadeus.ts";
import type { AmadeusOffer, AmadeusSegment } from "./amadeus.ts";
import { SeenDealStore } from "./dedupe.ts";
import type { Deal } from "./types.ts";
import { buildDealMessage, sendTelegram } from "./telegram.ts";
import type { RouteConfig, OpenJawConfig } from "./config.ts";

function env(name: string): string {
  return Deno.env.get(name) ?? "";
}

function requireEnv(names: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  const missing: string[] = [];
  for (const n of names) {
    const v = env(n);
    if (!v) missing.push(n);
    else out[n] = v;
  }
  if (missing.length) {
    console.error(`Missing env: ${missing.join(", ")}`);
    Deno.exit(1);
  }
  return out;
}

function stopoverCountries(segments: AmadeusSegment[]): (string | undefined)[] {
  const countries: (string | undefined)[] = [];
  for (let i = 0; i < segments.length - 1; i++) {
    const airport = segments[i].arrival.iataCode;
    countries.push(getAirportCountry(airport));
  }
  return countries;
}

function validateLegStopovers(args: {
  segments: AmadeusSegment[];
  maxStopovers: number;
  requiredCountry?: string;
}): { ok: boolean; stops: number } {
  const stops = Math.max(0, args.segments.length - 1);
  if (stops > args.maxStopovers) return { ok: false, stops };

  if (!args.requiredCountry || stops === 0) return { ok: true, stops };

  // Strict rule: if stopoverCountry is set and there is at least 1 stop,
  // every stopover must be in that country. Unknown country fails.
  const countries = stopoverCountries(args.segments);
  const allMatch = countries.length > 0 && countries.every((c) => c === args.requiredCountry);
  return { ok: allMatch, stops };
}

function dealHash(parts: string[]): string {
  const key = parts.join("|");
  let h = 5381;
  for (let i = 0; i < key.length; i++) h = ((h << 5) + h) ^ key.charCodeAt(i);
  return (h >>> 0).toString(16);
}

function offerChain(segments: AmadeusSegment[]): string {
  if (!segments.length) return "";
  const dep = segments.map((s) => s.departure.iataCode).join("-");
  const arr = segments[segments.length - 1].arrival.iataCode;
  return `${dep}-${arr}`;
}

type RoundTripSearchMode = {
  label: string;
  nonStop: boolean;
  maxStopoversPerLeg: number;
  requiredStopoverCountry?: string;
  isFallback?: boolean;
};

function buildRoundTripModes(route: RouteConfig): RoundTripSearchMode[] {
  const prefersDirect = route.nonStopPreferred === true && route.maxStopoversPerLeg === 0;
  if (route.category === "europe" && prefersDirect) {
    return [
      { label: "direct", nonStop: true, maxStopoversPerLeg: 0 },
      {
        label: "DE stopover",
        nonStop: false,
        maxStopoversPerLeg: 1,
        requiredStopoverCountry: "DE",
        isFallback: true,
      },
    ];
  }

  return [
    {
      label: "default",
      nonStop: route.nonStopPreferred === true || route.maxStopoversPerLeg === 0,
      maxStopoversPerLeg: route.maxStopoversPerLeg,
      requiredStopoverCountry: route.stopoverCountry,
    },
  ];
}

function buildRoundTripDeal(args: {
  offer: AmadeusOffer;
  destination: string;
  destinationName: string;
  maxStopoversPerLeg: number;
  requiredStopoverCountry?: string;
  priceThresholdEUR: number;
  category: Deal["category"];
}): Deal | null {
  const { offer } = args;

  const price = Number(offer.price.total);
  if (!Number.isFinite(price)) return null;
  if (offer.price.currency !== CURRENCY) return null;
  if (price > args.priceThresholdEUR) return null;

  const out = offer.itineraries[0];
  const inn = offer.itineraries[1];
  if (!out || !inn) return null;

  const outVal = validateLegStopovers({
    segments: out.segments,
    maxStopovers: args.maxStopoversPerLeg,
    requiredCountry: args.requiredStopoverCountry,
  });
  if (!outVal.ok) return null;

  const inVal = validateLegStopovers({
    segments: inn.segments,
    maxStopovers: args.maxStopoversPerLeg,
    requiredCountry: args.requiredStopoverCountry,
  });
  if (!inVal.ok) return null;

  const outboundDate = out.segments[0]?.departure.at?.slice(0, 10);
  const inboundDate = inn.segments[0]?.departure.at?.slice(0, 10);
  if (!outboundDate || !inboundDate) return null;

  const hash = dealHash([
    "RT",
    ORIGIN,
    args.destination,
    outboundDate,
    inboundDate,
    price.toFixed(2),
    offerChain(out.segments),
    offerChain(inn.segments),
  ]);

  return {
    type: "roundtrip",
    destination: args.destination,
    destinationName: args.destinationName,
    price,
    currency: offer.price.currency,
    outboundDate,
    inboundDate,
    outboundSegments: out.segments,
    inboundSegments: inn.segments,
    outboundStops: outVal.stops,
    inboundStops: inVal.stops,
    airlines: offer.validatingAirlineCodes ?? [],
    category: args.category,
    priceThresholdEUR: args.priceThresholdEUR,
    hash,
  };
}

function buildOpenJawDeal(args: {
  outboundOffer: AmadeusOffer;
  inboundOffer: AmadeusOffer;
  outboundTo: string;
  outboundToName: string;
  inboundFrom: string;
  inboundFromName: string;
  maxStopoversPerLeg: number;
  requiredStopoverCountry?: string;
  priceThresholdEUR: number;
  category: Deal["category"];
}): Deal | null {
  const outPrice = Number(args.outboundOffer.price.total);
  const inPrice = Number(args.inboundOffer.price.total);
  if (!Number.isFinite(outPrice) || !Number.isFinite(inPrice)) return null;

  if (args.outboundOffer.price.currency !== CURRENCY) return null;
  if (args.inboundOffer.price.currency !== CURRENCY) return null;

  const total = outPrice + inPrice;
  if (total > args.priceThresholdEUR) return null;

  const outIt = args.outboundOffer.itineraries[0];
  const inIt = args.inboundOffer.itineraries[0];
  if (!outIt || !inIt) return null;

  const outVal = validateLegStopovers({
    segments: outIt.segments,
    maxStopovers: args.maxStopoversPerLeg,
    requiredCountry: args.requiredStopoverCountry,
  });
  if (!outVal.ok) return null;

  const inVal = validateLegStopovers({
    segments: inIt.segments,
    maxStopovers: args.maxStopoversPerLeg,
    requiredCountry: args.requiredStopoverCountry,
  });
  if (!inVal.ok) return null;

  const outboundDate = outIt.segments[0]?.departure.at?.slice(0, 10);
  const inboundDate = inIt.segments[0]?.departure.at?.slice(0, 10);
  if (!outboundDate || !inboundDate) return null;

  // nights check (based on arrival to destination and departure back)
  const arrive = new Date(outIt.segments[outIt.segments.length - 1].arrival.at);
  const departBack = new Date(inIt.segments[0].departure.at);
  const nights = Math.floor((departBack.getTime() - arrive.getTime()) / (24 * 60 * 60 * 1000));
  if (nights < MIN_NIGHTS || nights > MAX_NIGHTS) return null;

  const airlines = [...(args.outboundOffer.validatingAirlineCodes ?? []), ...(args.inboundOffer.validatingAirlineCodes ?? [])]
    .filter((v, i, a) => a.indexOf(v) === i);

  const hash = dealHash([
    "OJ",
    ORIGIN,
    args.outboundTo,
    args.inboundFrom,
    outboundDate,
    inboundDate,
    total.toFixed(2),
    offerChain(outIt.segments),
    offerChain(inIt.segments),
  ]);

  return {
    type: "openjaw",
    destination: args.outboundTo,
    destinationName: args.outboundToName,
    returnFrom: args.inboundFrom,
    returnFromName: args.inboundFromName,
    price: total,
    currency: CURRENCY,
    outboundDate,
    inboundDate,
    outboundSegments: outIt.segments,
    inboundSegments: inIt.segments,
    outboundStops: outVal.stops,
    inboundStops: inVal.stops,
    airlines,
    category: args.category,
    priceThresholdEUR: args.priceThresholdEUR,
    hash,
  };
}

async function pickDatePairs(args: {
  amadeus: AmadeusClient;
  origin: string;
  destination: string;
  dateRange: { from: string; to: string };
  durationDays: number;
  nonStop: boolean;
  maxPriceEUR: number;
  pairCount: number;
}): Promise<Array<{ dep: string; ret: string }>> {
  let cheapest: { departureDate: string; returnDate: string; price: number }[] = [];
  try {
    const rows = await args.amadeus.fetchCheapestDates({
      origin: args.origin,
      destination: args.destination,
      dateRange: args.dateRange,
      durationDays: args.durationDays,
      nonStop: args.nonStop,
      maxPriceEUR: args.maxPriceEUR,
      limit: 5,
    });

    cheapest = rows
      .map((x) => ({
        departureDate: x.departureDate,
        returnDate: x.returnDate,
        price: Number(x.price?.total),
      }))
      .filter((x) => Number.isFinite(x.price))
      .sort((a, b) => a.price - b.price)
      .slice(0, 3);
  } catch (e) {
    if (e instanceof HttpError) {
      // unsupported route in flight-dates, fall back
    } else {
      console.log(`  flight-dates error`);
    }
  }

  return cheapest.length
    ? cheapest.map((c) => ({ dep: c.departureDate, ret: c.returnDate }))
    : fallbackPairs(args.dateRange, args.durationDays, args.pairCount);
}

async function scanRoundTripMode(args: {
  route: RouteConfig;
  mode: RoundTripSearchMode;
  durationDays: number;
  dateRange: { from: string; to: string };
  amadeus: AmadeusClient;
  store: SeenDealStore;
}): Promise<Deal[]> {
  const pairs = await pickDatePairs({
    amadeus: args.amadeus,
    origin: ORIGIN,
    destination: args.route.destination,
    dateRange: args.dateRange,
    durationDays: args.durationDays,
    nonStop: args.mode.nonStop,
    maxPriceEUR: args.route.priceThresholdEUR,
    pairCount: 2,
  });

  const deals: Deal[] = [];
  for (const p of pairs) {
    const offers = await args.amadeus.fetchFlightOffers({
      origin: ORIGIN,
      destination: args.route.destination,
      departureDate: p.dep,
      returnDate: p.ret,
      maxOffers: 4,
      nonStop: args.mode.nonStop,
    });

    for (const offer of offers) {
      const deal = buildRoundTripDeal({
        offer,
        destination: args.route.destination,
        destinationName: args.route.destinationName,
        maxStopoversPerLeg: args.mode.maxStopoversPerLeg,
        requiredStopoverCountry: args.mode.requiredStopoverCountry,
        priceThresholdEUR: args.route.priceThresholdEUR,
        category: args.route.category,
      });

      if (!deal) continue;
      if (args.store.has(deal.hash)) continue;

      args.store.mark(deal.hash);
      deals.push(deal);
      console.log(`  deal: ${deal.price.toFixed(0)}  ${deal.outboundDate}  stops ${deal.outboundStops}/${deal.inboundStops}`);
    }
  }

  return deals;
}

async function scanOpenJawRoute(args: {
  route: OpenJawConfig;
  durationDays: number;
  dateRange: { from: string; to: string };
  amadeus: AmadeusClient;
  store: SeenDealStore;
}): Promise<Deal[]> {
  const pairs = fallbackPairs(args.dateRange, args.durationDays, 3);
  const deals: Deal[] = [];

  for (const p of pairs) {
    const [outOffers, inOffers] = await Promise.all([
      args.amadeus.fetchFlightOffers({
        origin: ORIGIN,
        destination: args.route.outboundTo,
        departureDate: p.dep,
        maxOffers: 3,
      }),
      args.amadeus.fetchFlightOffers({
        origin: args.route.inboundFrom,
        destination: ORIGIN,
        departureDate: p.ret,
        maxOffers: 3,
      }),
    ]);

    for (const outOffer of outOffers.slice(0, 2)) {
      for (const inOffer of inOffers.slice(0, 2)) {
        const deal = buildOpenJawDeal({
          outboundOffer: outOffer,
          inboundOffer: inOffer,
          outboundTo: args.route.outboundTo,
          outboundToName: args.route.outboundToName,
          inboundFrom: args.route.inboundFrom,
          inboundFromName: args.route.inboundFromName,
          maxStopoversPerLeg: args.route.maxStopoversPerLeg,
          requiredStopoverCountry: args.route.stopoverCountry,
          priceThresholdEUR: args.route.priceThresholdEUR,
          category: args.route.category,
        });

        if (!deal) continue;
        if (args.store.has(deal.hash)) continue;

        args.store.mark(deal.hash);
        deals.push(deal);
        console.log(`  deal: ${deal.price.toFixed(0)}  ${deal.outboundDate}  stops ${deal.outboundStops}/${deal.inboundStops}`);
      }
    }
  }

  return deals;
}

async function main(): Promise<void> {
  const {
    AMADEUS_API_KEY,
    AMADEUS_API_SECRET,
    AMADEUS_BASE_URL,
    TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID,
  } = requireEnv([
    "AMADEUS_API_KEY",
    "AMADEUS_API_SECRET",
    "AMADEUS_BASE_URL",
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_CHAT_ID",
  ]);

  const amadeus = new AmadeusClient({
    apiKey: AMADEUS_API_KEY,
    apiSecret: AMADEUS_API_SECRET,
    baseUrl: AMADEUS_BASE_URL,
  });

  const store = new SeenDealStore({ filePath: SEEN_DEALS_FILE, ttlMs: SEEN_DEALS_TTL_MS });
  await store.load();

  const dateRange = getSearchDateRange();
  const seed = new Date().getDay();

  console.log(`Origin: ${ORIGIN}`);
  console.log(`Range: ${dateRange.from} to ${dateRange.to}`);
  console.log(`Cache: ${store.size()} seen deals`);

  const newDeals: Deal[] = [];

  // Roundtrip
  for (const r of ROUND_TRIP_ROUTES) {
    const durationDays = pickDurationDays(r.category, seed);
    console.log(`Route: ${r.destinationName} (${r.destination})  dur=${durationDays}  threshold=${r.priceThresholdEUR}`);

    const modes = buildRoundTripModes(r);
    let routeDeals = 0;
    for (const mode of modes) {
      console.log(`  mode: ${mode.label}  maxStops=${mode.maxStopoversPerLeg}`);
      const deals = await scanRoundTripMode({
        route: r,
        mode,
        durationDays,
        dateRange,
        amadeus,
        store,
      });
      if (deals.length) {
        newDeals.push(...deals);
        routeDeals += deals.length;
      }
      if (deals.length > 0 && !mode.isFallback) break;
    }
    if (!routeDeals) console.log(`  no deals`);

    await sleep(BETWEEN_ROUTE_SLEEP_MS);
  }

  // Open Jaw routes
  for (const oj of OPEN_JAW_ROUTES) {
    const durationDays = pickDurationDays(oj.category, seed);

    console.log(`OpenJaw: ${oj.outboundToName} → ${oj.inboundFromName}  threshold=${oj.priceThresholdEUR}`);
    const deals = await scanOpenJawRoute({
      route: oj,
      durationDays,
      dateRange,
      amadeus,
      store,
    });
    if (deals.length) newDeals.push(...deals);

    await sleep(BETWEEN_ROUTE_SLEEP_MS);
  }

  // Save seen deals
  await store.save();

  // Summary
  console.log(`\nTotal new deals: ${newDeals.length}`);

  // Send to Telegram
  if (newDeals.length > 0) {
    // Sort by value ratio (lower = better deal)
    newDeals.sort((a, b) => (a.price / a.priceThresholdEUR) - (b.price / b.priceThresholdEUR));

    const europeDeals = newDeals.filter((d) => d.category === "europe");
    const longhaulDeals = newDeals.filter((d) => d.category === "longhaul");
    const openJawDeals = newDeals.filter((d) => d.type === "openjaw");

    const summary = [
      `🔔 <b>UCUZ BİLET ALARMI!</b>`,
      ``,
      `📍 Ankara (${ORIGIN}) çıkışlı ${newDeals.length} yeni fırsat:`,
      `🇪🇺 Avrupa: ${europeDeals.length}`,
      `🌏 Uzak Mesafe: ${longhaulDeals.length}`,
      `✈️ Open Jaw: ${openJawDeals.length}`,
      ``,
      `⏰ ${new Date().toLocaleString("tr-TR")}`,
    ].join("\n");

    await sendTelegram({
      botToken: TELEGRAM_BOT_TOKEN,
      chatId: TELEGRAM_CHAT_ID,
      html: summary,
    });
    await sleep(TELEGRAM_BETWEEN_MSG_MS);

    // Send top 10 deals
    for (const deal of newDeals.slice(0, 10)) {
      const msg = buildDealMessage(deal);
      await sendTelegram({
        botToken: TELEGRAM_BOT_TOKEN,
        chatId: TELEGRAM_CHAT_ID,
        html: msg,
      });
      await sleep(TELEGRAM_BETWEEN_MSG_MS);
    }
  }

  console.log("Done");
}

// Fallback date pairs when flight-dates endpoint doesn't work
function fallbackPairs(
  range: { from: string; to: string },
  durationDays: number,
  count: number
): Array<{ dep: string; ret: string }> {
  const pairs: Array<{ dep: string; ret: string }> = [];
  const start = new Date(range.from);
  const end = new Date(range.to);

  // Try weekends (Friday departures)
  for (let w = 0; w < 12 && pairs.length < count; w++) {
    const dep = new Date(start);
    dep.setDate(start.getDate() + w * 7);

    // Find next Friday
    while (dep.getDay() !== 5 && dep < end) {
      dep.setDate(dep.getDate() + 1);
    }

    if (dep >= end) break;

    const ret = new Date(dep);
    ret.setDate(dep.getDate() + durationDays);

    if (ret <= end) {
      pairs.push({
        dep: dep.toISOString().slice(0, 10),
        ret: ret.toISOString().slice(0, 10),
      });
    }
  }

  return pairs;
}

main().catch((e) => {
  console.error(e);
  Deno.exit(1);
});

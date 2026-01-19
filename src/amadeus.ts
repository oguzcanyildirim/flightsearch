// amadeus.ts

import { CURRENCY, MIN_REQUEST_GAP_MS } from "./config.ts";

export interface AmadeusSegment {
  departure: { iataCode: string; at: string };
  arrival: { iataCode: string; at: string };
  carrierCode: string;
  number: string;
}

export interface AmadeusItinerary {
  duration: string; // ISO duration, e.g. PT10H25M
  segments: AmadeusSegment[];
}

export interface AmadeusOffer {
  id: string;
  price: { total: string; currency: string };
  itineraries: AmadeusItinerary[];
  validatingAirlineCodes: string[];
}

export interface CheapestDateResult {
  departureDate: string;
  returnDate: string;
  price: { total: string; currency?: string };
}

type TokenCache = { token: string; expiresAtMs: number };

export class AmadeusClient {
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly baseUrl: string;

  private tokenCache: TokenCache | null = null;
  private lastRequestAt = 0;

  constructor(args: { apiKey: string; apiSecret: string; baseUrl: string }) {
    this.apiKey = args.apiKey;
    this.apiSecret = args.apiSecret;
    this.baseUrl = args.baseUrl.replace(/\/+$/, "");
  }

  async fetchCheapestDates(args: {
    origin: string;
    destination: string;
    dateRange: { from: string; to: string };
    durationDays: number;
    nonStop?: boolean;
    maxPriceEUR?: number;
    limit?: number;
  }): Promise<CheapestDateResult[]> {
    const params = new URLSearchParams({
      origin: args.origin,
      destination: args.destination,
      // Amadeus allows a range: YYYY-MM-DD,YYYY-MM-DD
      departureDate: `${args.dateRange.from},${args.dateRange.to}`,
      oneWay: "false",
      duration: String(args.durationDays),
      nonStop: args.nonStop ? "true" : "false",
      viewBy: "DATE",
    });

    if (args.maxPriceEUR != null) params.set("maxPrice", String(Math.floor(args.maxPriceEUR)));
    const url = `${this.baseUrl}/v1/shopping/flight-dates?${params.toString()}`;

    const data = await this.getJson<{ data?: CheapestDateResult[] }>(url);
    let rows = data?.data ?? [];
    if (args.limit != null) rows = rows.slice(0, args.limit);
    return rows;
  }

  async fetchFlightOffers(args: {
    origin: string;
    destination: string;
    departureDate: string;
    returnDate?: string;
    adults?: number;
    maxOffers?: number;
    nonStop?: boolean;
  }): Promise<AmadeusOffer[]> {
    const params = new URLSearchParams({
      originLocationCode: args.origin,
      destinationLocationCode: args.destination,
      departureDate: args.departureDate,
      adults: String(args.adults ?? 1),
      currencyCode: CURRENCY,
      max: String(args.maxOffers ?? 3),
    });
    if (args.returnDate) params.set("returnDate", args.returnDate);
    if (args.nonStop) params.set("nonStop", "true");

    const url = `${this.baseUrl}/v2/shopping/flight-offers?${params.toString()}`;
    const data = await this.getJson<{ data?: AmadeusOffer[] }>(url);
    return data?.data ?? [];
  }

  private async getAccessToken(): Promise<string> {
    if (this.tokenCache && Date.now() < this.tokenCache.expiresAtMs - 60_000) {
      return this.tokenCache.token;
    }

    const url = `${this.baseUrl}/v1/security/oauth2/token`;
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.apiKey,
      client_secret: this.apiSecret,
    });

    await this.throttle();

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    if (!res.ok) {
      throw new Error(`Amadeus auth failed: ${res.status}`);
    }

    const json = await res.json();
    const expiresInSec = Number(json.expires_in ?? 0);
    const token = String(json.access_token ?? "");

    if (!token) throw new Error("Amadeus auth response missing access_token");

    this.tokenCache = {
      token,
      expiresAtMs: Date.now() + expiresInSec * 1000,
    };
    return token;
  }

  private async getJson<T>(url: string): Promise<T> {
    return await this.withBackoff(async () => {
      const token = await this.getAccessToken();

      await this.throttle();

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });

      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("retry-after") ?? "30");
        throw new RateLimitError(Math.max(5, retryAfter) * 1000);
      }

      if (!res.ok) {
        // Some endpoints return 400/404 for routes not supported
        // We treat as "no data" for scanner purposes
        throw new HttpError(res.status);
      }

      return (await res.json()) as T;
    });
  }

  private async throttle(): Promise<void> {
    const now = Date.now();
    const wait = this.lastRequestAt + MIN_REQUEST_GAP_MS - now;
    if (wait > 0) await sleep(wait);
    this.lastRequestAt = Date.now();
  }

  private async withBackoff<T>(fn: () => Promise<T>): Promise<T> {
    const maxRetries = 4;
    let delay = 800;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fn();
      } catch (e) {
        if (e instanceof RateLimitError) {
          await sleep(e.waitMs);
          continue;
        }

        // Treat non-200 as non-fatal (skip route) except on last attempt
        if (e instanceof HttpError) {
          // 4xx other than 429 usually won't recover; don't spam retries
          if (e.status >= 400 && e.status < 500) throw e;
        }

        if (attempt === maxRetries - 1) throw e;
        await sleep(delay);
        delay *= 2;
      }
    }

    // unreachable
    throw new Error("Backoff exhausted");
  }
}

export class RateLimitError extends Error {
  waitMs: number;
  constructor(waitMs: number) {
    super("Rate limited");
    this.waitMs = waitMs;
  }
}

export class HttpError extends Error {
  status: number;
  constructor(status: number) {
    super(`HTTP ${status}`);
    this.status = status;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
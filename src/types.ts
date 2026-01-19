// types.ts

import type { Category } from "./config.ts";
import type { AmadeusSegment } from "./amadeus.ts";

export interface Deal {
  type: "roundtrip" | "openjaw";
  destination: string;
  destinationName: string;
  returnFrom?: string;
  returnFromName?: string;

  price: number;
  currency: string;

  outboundDate: string;
  inboundDate: string;

  outboundSegments: AmadeusSegment[];
  inboundSegments: AmadeusSegment[];
  outboundStops: number;
  inboundStops: number;

  airlines: string[];
  category: Category;

  priceThresholdEUR: number;
  hash: string;
}
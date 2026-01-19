// telegram.ts

import { ORIGIN } from "./config.ts";
import type { Deal } from "./types.ts";

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function sendTelegram(args: {
  botToken: string;
  chatId: string;
  html: string;
  disablePreview?: boolean;
}): Promise<void> {
  const url = `https://api.telegram.org/bot${args.botToken}/sendMessage`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: args.chatId,
      text: args.html,
      parse_mode: "HTML",
      disable_web_page_preview: args.disablePreview ?? false,
    }),
  });
}

export function buildGoogleFlightsLink(deal: Deal): string {
  const dep = deal.outboundDate;
  const ret = deal.inboundDate;

  // Simple Google Flights query link (robust across variations)
  // If you want a stricter deep-link path format, you can add later.
  const to = deal.destination;
  const from = ORIGIN;

  const q = deal.type === "openjaw" && deal.returnFrom
    ? `Flights from ${from} to ${to} on ${dep} and from ${deal.returnFrom} to ${from} on ${ret}`
    : `Flights from ${from} to ${to} on ${dep} through ${ret}`;

  return `https://www.google.com/travel/flights?q=${encodeURIComponent(q)}`;
}

export function buildDealMessage(deal: Deal): string {
  const ratio = deal.price / deal.priceThresholdEUR;
  const fire = ratio < 0.6 ? "🔥🔥🔥" : ratio < 0.8 ? "🔥🔥" : "🔥";
  const emoji = deal.category === "europe" ? "🇪🇺" : "🌏";

  const title = deal.type === "openjaw" && deal.returnFromName
    ? `${deal.destinationName.toUpperCase()} → ${deal.returnFromName.toUpperCase()}`
    : deal.destinationName.toUpperCase();

  const outChain = chain(deal.outboundSegments);
  const inChain = chain(deal.inboundSegments);

  const outStops = deal.outboundStops === 0 ? "Direkt" : `${deal.outboundStops} aktarma`;
  const inStops = deal.inboundStops === 0 ? "Direkt" : `${deal.inboundStops} aktarma`;

  const gf = buildGoogleFlightsLink(deal);

  return [
    `${emoji} <b>${escapeHtml(title)}</b> ${fire}`,
    ``,
    `💰 <b>${deal.price.toFixed(0)} ${escapeHtml(deal.currency)}</b>`,
    deal.type === "openjaw" ? `✈️ OPEN JAW` : `✈️`,
    ``,
    `📅 <b>Gidiş:</b> ${escapeHtml(deal.outboundDate)}  (${escapeHtml(outStops)})`,
    `🛫 ${escapeHtml(outChain)}`,
    ``,
    `📅 <b>Dönüş:</b> ${escapeHtml(deal.inboundDate)}  (${escapeHtml(inStops)})`,
    `🛬 ${escapeHtml(inChain)}`,
    ``,
    `✈️ ${escapeHtml(deal.airlines.join(", "))}`,
    ``,
    `🔗 <a href="${gf}">Google Flights'ta Ara</a>`,
  ].join("\n");
}

function chain(segments: Deal["outboundSegments"]): string {
  if (segments.length === 0) return "";
  const dep = segments.map((s) => s.departure.iataCode);
  const arr = segments[segments.length - 1].arrival.iataCode;
  return `${dep.join(" → ")} → ${arr}`;
}
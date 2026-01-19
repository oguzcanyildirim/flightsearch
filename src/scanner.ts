// Flight Deal Scanner - Ankara (ESB) Departures
// Uses Kiwi Tequila API + Telegram Notifications

interface FlightConfig {
  destination: string;
  destinationName: string;
  maxStopovers: number;
  stopoverVia?: string; // For Germany-only stopovers
  priceThreshold: number; // TRY
  category: "europe" | "longhaul";
}

interface Flight {
  price: number;
  currency: string;
  deep_link: string;
  route: RouteSegment[];
  duration: { total: number };
  airlines: string[];
}

interface RouteSegment {
  flyFrom: string;
  flyTo: string;
  cityFrom: string;
  cityTo: string;
  local_departure: string;
  local_arrival: string;
  airline: string;
}

interface SearchResult {
  data: Flight[];
  currency: string;
}

// ===========================================
// CONFIGURATION - Customize your searches here
// ===========================================

const ROUTES: FlightConfig[] = [
  // ========== EUROPE - Direct or 1 stop via Germany ==========
  // Popular direct destinations from Ankara
  { destination: "LON", destinationName: "Londra", maxStopovers: 0, priceThreshold: 4000, category: "europe" },
  { destination: "PAR", destinationName: "Paris", maxStopovers: 0, priceThreshold: 4000, category: "europe" },
  { destination: "AMS", destinationName: "Amsterdam", maxStopovers: 0, priceThreshold: 4000, category: "europe" },
  { destination: "BCN", destinationName: "Barcelona", maxStopovers: 0, priceThreshold: 4000, category: "europe" },
  { destination: "ROM", destinationName: "Roma", maxStopovers: 0, priceThreshold: 3500, category: "europe" },
  { destination: "VIE", destinationName: "Viyana", maxStopovers: 0, priceThreshold: 3500, category: "europe" },
  { destination: "PRG", destinationName: "Prag", maxStopovers: 0, priceThreshold: 3500, category: "europe" },
  { destination: "CPH", destinationName: "Kopenhag", maxStopovers: 0, priceThreshold: 4500, category: "europe" },
  { destination: "LIS", destinationName: "Lizbon", maxStopovers: 0, priceThreshold: 4500, category: "europe" },
  { destination: "ATH", destinationName: "Atina", maxStopovers: 0, priceThreshold: 3000, category: "europe" },
  { destination: "BUD", destinationName: "Budapeşte", maxStopovers: 0, priceThreshold: 3000, category: "europe" },
  
  // Germany connections (1 stop allowed via Germany)
  { destination: "REK", destinationName: "Reykjavik", maxStopovers: 1, stopoverVia: "DE", priceThreshold: 8000, category: "europe" },
  { destination: "OSL", destinationName: "Oslo", maxStopovers: 1, stopoverVia: "DE", priceThreshold: 5000, category: "europe" },
  { destination: "HEL", destinationName: "Helsinki", maxStopovers: 1, stopoverVia: "DE", priceThreshold: 5000, category: "europe" },
  { destination: "DUB", destinationName: "Dublin", maxStopovers: 1, stopoverVia: "DE", priceThreshold: 5000, category: "europe" },
  { destination: "EDI", destinationName: "Edinburgh", maxStopovers: 1, stopoverVia: "DE", priceThreshold: 5000, category: "europe" },
  
  // ========== LONG HAUL - Max 2 stopovers ==========
  // USA - Solo travel friendly
  { destination: "MIA", destinationName: "Miami", maxStopovers: 2, priceThreshold: 20000, category: "longhaul" },
  { destination: "DFW", destinationName: "Dallas/Texas", maxStopovers: 2, priceThreshold: 20000, category: "longhaul" },
  { destination: "IAH", destinationName: "Houston/Texas", maxStopovers: 2, priceThreshold: 20000, category: "longhaul" },
  { destination: "HNL", destinationName: "Hawaii", maxStopovers: 2, priceThreshold: 30000, category: "longhaul" },
  { destination: "LAX", destinationName: "Los Angeles", maxStopovers: 2, priceThreshold: 20000, category: "longhaul" },
  { destination: "SFO", destinationName: "San Francisco", maxStopovers: 2, priceThreshold: 20000, category: "longhaul" },
  
  // Asia Pacific - Solo travel friendly
  { destination: "SIN", destinationName: "Singapur", maxStopovers: 2, priceThreshold: 18000, category: "longhaul" },
  { destination: "KUL", destinationName: "Kuala Lumpur", maxStopovers: 2, priceThreshold: 16000, category: "longhaul" },
  { destination: "PER", destinationName: "Perth", maxStopovers: 2, priceThreshold: 25000, category: "longhaul" },
  { destination: "AKL", destinationName: "Auckland/Yeni Zelanda", maxStopovers: 2, priceThreshold: 35000, category: "longhaul" },
  { destination: "SYD", destinationName: "Sydney", maxStopovers: 2, priceThreshold: 25000, category: "longhaul" },
  { destination: "MEL", destinationName: "Melbourne", maxStopovers: 2, priceThreshold: 25000, category: "longhaul" },
  { destination: "BKK", destinationName: "Bangkok", maxStopovers: 2, priceThreshold: 15000, category: "longhaul" },
  { destination: "TYO", destinationName: "Tokyo", maxStopovers: 2, priceThreshold: 20000, category: "longhaul" },
];

// ===========================================
// API & TELEGRAM SETUP
// ===========================================

const KIWI_API_KEY = Deno.env.get("KIWI_API_KEY") || "";
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
const TELEGRAM_CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID") || "";
const ORIGIN = "ESB"; // Ankara Esenboğa

// ===========================================
// HELPER FUNCTIONS
// ===========================================

function getDateRange(): { dateFrom: string; dateTo: string } {
  const today = new Date();
  const dateFrom = new Date(today);
  dateFrom.setDate(today.getDate() + 14); // Start searching 2 weeks from now
  
  const dateTo = new Date(today);
  dateTo.setMonth(today.getMonth() + 6); // Search up to 6 months ahead
  
  const format = (d: Date) => `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
  
  return {
    dateFrom: format(dateFrom),
    dateTo: format(dateTo),
  };
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}s ${mins}dk`;
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat('tr-TR').format(Math.round(price));
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const options: Intl.DateTimeFormatOptions = { 
    day: 'numeric', 
    month: 'short', 
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit'
  };
  return date.toLocaleDateString('tr-TR', options);
}

// ===========================================
// KIWI API SEARCH
// ===========================================

async function searchFlights(config: FlightConfig): Promise<Flight[]> {
  const { dateFrom, dateTo } = getDateRange();
  
  const params = new URLSearchParams({
    fly_from: ORIGIN,
    fly_to: config.destination,
    date_from: dateFrom,
    date_to: dateTo,
    nights_in_dst_from: "3",  // Min 3 nights
    nights_in_dst_to: "14",   // Max 14 nights
    flight_type: "round",
    curr: "TRY",
    locale: "tr",
    max_stopovers: config.maxStopovers.toString(),
    limit: "5",
    sort: "price",
    asc: "1",
  });
  
  // Add stopover filter for Germany-only routes
  if (config.stopoverVia) {
    params.set("stopover_from", config.stopoverVia);
    params.set("stopover_to", config.stopoverVia);
  }
  
  const url = `https://api.tequila.kiwi.com/v2/search?${params}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        "apikey": KIWI_API_KEY,
        "accept": "application/json",
      },
    });
    
    if (!response.ok) {
      console.error(`API error for ${config.destinationName}: ${response.status}`);
      return [];
    }
    
    const data: SearchResult = await response.json();
    return data.data || [];
  } catch (error) {
    console.error(`Error searching ${config.destinationName}:`, error);
    return [];
  }
}

// ===========================================
// TELEGRAM NOTIFICATION
// ===========================================

async function sendTelegramMessage(message: string): Promise<void> {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: "HTML",
        disable_web_page_preview: false,
      }),
    });
  } catch (error) {
    console.error("Telegram error:", error);
  }
}

function buildDealMessage(config: FlightConfig, flight: Flight): string {
  const stopovers = flight.route.length / 2 - 1; // Round trip, so divide by 2
  const stopoverText = stopovers === 0 ? "✈️ AKTARMASIZ" : `🔄 ${stopovers} aktarma`;
  
  const outbound = flight.route.slice(0, flight.route.length / 2);
  const inbound = flight.route.slice(flight.route.length / 2);
  
  const routeDetails = outbound.map(r => `${r.cityFrom} → ${r.cityTo}`).join(" → ");
  const airlines = [...new Set(flight.airlines)].join(", ");
  
  const emoji = config.category === "europe" ? "🇪🇺" : "🌏";
  const fireEmoji = flight.price < config.priceThreshold * 0.7 ? "🔥🔥🔥" : 
                    flight.price < config.priceThreshold * 0.85 ? "🔥🔥" : "🔥";
  
  return `
${emoji} <b>${config.destinationName.toUpperCase()}</b> ${fireEmoji}

💰 <b>${formatPrice(flight.price)} ₺</b>
${stopoverText}
⏱️ Toplam: ${formatDuration(flight.duration.total)}

📅 <b>Gidiş:</b> ${formatDate(outbound[0].local_departure)}
📅 <b>Dönüş:</b> ${formatDate(inbound[0].local_departure)}

🛫 Rota: ${routeDetails}
✈️ Havayolu: ${airlines}

🔗 <a href="${flight.deep_link}">Bileti Gör</a>
`.trim();
}

// ===========================================
// MAIN SCANNER
// ===========================================

interface Deal {
  config: FlightConfig;
  flight: Flight;
}

async function runScanner(): Promise<void> {
  console.log(`🛫 Flight Scanner Started - ${new Date().toISOString()}`);
  console.log(`📍 Origin: Ankara (ESB)`);
  console.log(`🔍 Scanning ${ROUTES.length} routes...\n`);
  
  const deals: Deal[] = [];
  
  // Add delay between requests to be nice to the API
  for (const config of ROUTES) {
    console.log(`Checking ${config.destinationName}...`);
    
    const flights = await searchFlights(config);
    
    for (const flight of flights) {
      if (flight.price <= config.priceThreshold) {
        deals.push({ config, flight });
        console.log(`  ✅ DEAL FOUND: ${formatPrice(flight.price)} ₺`);
      }
    }
    
    // Rate limiting: 500ms between requests
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log(`\n📊 Found ${deals.length} deals below threshold`);
  
  // Send deals to Telegram
  if (deals.length > 0) {
    // Sort by price
    deals.sort((a, b) => a.flight.price - b.flight.price);
    
    // Send summary first
    const europeDeals = deals.filter(d => d.config.category === "europe");
    const longhaulDeals = deals.filter(d => d.config.category === "longhaul");
    
    const summaryMessage = `
🔔 <b>UCUZ BİLET ALARMI!</b>

📍 Ankara (ESB) çıkışlı ${deals.length} fırsat bulundu:
🇪🇺 Avrupa: ${europeDeals.length} fırsat
🌏 Uzak Mesafe: ${longhaulDeals.length} fırsat

⏰ ${new Date().toLocaleString('tr-TR')}
`.trim();
    
    await sendTelegramMessage(summaryMessage);
    
    // Send top deals (max 10 to avoid spam)
    const topDeals = deals.slice(0, 10);
    for (const deal of topDeals) {
      const message = buildDealMessage(deal.config, deal.flight);
      await sendTelegramMessage(message);
      await new Promise(resolve => setTimeout(resolve, 300)); // Rate limit Telegram
    }
  } else {
    // Optional: Send "no deals" notification (comment out if too noisy)
    // await sendTelegramMessage(`😴 Şu an threshold altında fırsat yok. Tarama: ${new Date().toLocaleString('tr-TR')}`);
  }
  
  console.log("✅ Scanner completed");
}

// Run the scanner
runScanner();

# ✈️ Ankara Flight Deal Scanner

Ankara (ESB) çıkışlı ucuz uçak biletlerini otomatik tarayan ve Telegram'a bildirim gönderen sistem.

## 🎯 Özellikler

- **2 Aşamalı Arama** - Önce Flight Cheapest Dates ile ucuz tarihleri bul, sonra Flight Offers ile detay al
- **Open Jaw Desteği** - İki ayrı one-way arama ile farklı şehirden dönüş (Cenevre→Basel gibi)
- **IATA→Ülke Mapping** - Gerçek havalimanı-ülke eşleşmesi ile aktarma doğrulama
- **Google Flights Linki** - Her deal için direkt arama linki
- **Akıllı Dedupe** - Segment chain + exact price ile hash, aynı fırsatı tekrar göndermez
- **Rate Limiting** - API limitlerini aşmamak için otomatik yavaşlama
- **GitHub Actions** - Ücretsiz, günde 2-3 kez otomatik tarama

## 🚀 Kurulum

### 1. Amadeus API Hesabı (Ücretsiz)

1. [Amadeus for Developers](https://developers.amadeus.com/) sitesine git
2. **Sign Up** → hesap oluştur
3. **My Self-Service Workspace** → **Create new app**
4. App oluşturduktan sonra **API Key** ve **API Secret** görünecek
5. İkisini de kaydet

> 💡 Self-Service tier: **Ayda 2000 ücretsiz istek**

### 2. Amadeus Base URL (Prod)

Amadeus prod için base URL ayarla:

```
AMADEUS_BASE_URL=https://api.amadeus.com
```

> Test için: `https://test.api.amadeus.com`

### 3. Telegram Bot Oluştur

1. Telegram'da [@BotFather](https://t.me/BotFather) ile konuş
2. `/newbot` komutu gönder
3. Bot için isim ve username belirle
4. Sana verilen **Bot Token**'ı kaydet

### 4. Chat ID Bul

1. Oluşturduğun bota bir mesaj gönder
2. Şu URL'yi ziyaret et (TOKEN yerine kendi token'ını yaz):
   ```
   https://api.telegram.org/bot<TOKEN>/getUpdates
   ```
3. JSON içinde `"chat":{"id":123456789}` şeklinde **Chat ID**'ni bul

### 5. GitHub Repository Ayarla

1. Bu klasörü yeni bir GitHub repo'suna push'la:
   ```bash
   git add .
   git commit -m "Initial commit"
   git push -u origin main
   ```

2. Repo **Settings** → **Secrets and Variables** → **Actions**

3. Şu secret'ları ekle:

   | Secret Name | Değer |
   |-------------|-------|
   | `AMADEUS_API_KEY` | Amadeus API Key |
   | `AMADEUS_API_SECRET` | Amadeus API Secret |
   | `AMADEUS_BASE_URL` | `https://api.amadeus.com` |
   | `TELEGRAM_BOT_TOKEN` | Telegram bot token |
   | `TELEGRAM_CHAT_ID` | Senin chat ID |

### 6. Actions'ı Aktif Et

1. Repo'nun **Actions** sekmesine git
2. "I understand my workflows, go ahead and enable them" tıkla
3. **Flight Scanner** → **Run workflow** ile test et

## ⚙️ Konfigürasyon

### Rotaları Düzenle

`src/scanner.ts` dosyasındaki `ROUTES` array'ini düzenle:

```typescript
// Basit rota
{
  destination: "MIA",           // IATA kodu
  destinationName: "Miami",     // Telegram'da görünecek isim
  maxStopovers: 2,              // Max aktarma sayısı
  priceThreshold: 550,          // Bu fiyatın altındakiler bildirilir (EUR)
  category: "longhaul"          // "europe" veya "longhaul"
}

// Almanya üzerinden aktarmalı
{
  destination: "KEF",
  destinationName: "Reykjavik",
  maxStopovers: 1,
  stopoverVia: "DE",            // Aktarma sadece Almanya'da olmalı
  priceThreshold: 250,
  category: "europe"
}

// Open jaw (farklı şehirden dönüş)
{
  destination: "GVA",
  destinationName: "Cenevre",
  returnFrom: "BSL",            // Basel'den dön
  returnFromName: "Basel",
  maxStopovers: 1,
  priceThreshold: 150,
  category: "europe"
}
```

### Threshold Önerileri (EUR)

| Rota Tipi | Normal | İyi Fırsat | Kaçırma! |
|-----------|--------|------------|----------|
| Avrupa (direkt) | 120€ | 90€ | 70€ |
| İzlanda/Kuzey | 250€ | 180€ | 150€ |
| ABD | 550€ | 450€ | 400€ |
| Asya | 450€ | 350€ | 300€ |
| Avustralya/NZ | 700€ | 600€ | 500€ |

## 📊 API Limitleri

**Amadeus Self-Service:**
- 2000 istek/ay ücretsiz
- Rate limit: 10 istek/saniye

**Mevcut ayar:**
- 39 rota × günde 2 tarama = 78 istek/gün
- Aylık: ~2340 istek (limit üstü olabilir)

**Limit aşımını önlemek için:**
1. Rota sayısını azalt
2. `scan.yml`'de tarama sıklığını günde 1'e düşür: `cron: '0 8 * * *'`

## 🧪 Lokal Test

```bash
# Environment variables ayarla
export AMADEUS_API_KEY="your_key"
export AMADEUS_API_SECRET="your_secret"
export AMADEUS_BASE_URL="https://api.amadeus.com"
export TELEGRAM_BOT_TOKEN="your_token"
export TELEGRAM_CHAT_ID="your_chat_id"

# Çalıştır
deno run --allow-net --allow-env --allow-read --allow-write src/scanner.ts
```

## 📝 Örnek Telegram Bildirimi

```
🇪🇺 AMSTERDAM 🔥🔥

💰 89 EUR

📅 Gidiş: Cum, 15 Mar 08:30
   └ Direkt • 3s 15dk
📅 Dönüş: Pzr, 23 Mar 14:45
   └ Direkt • 3s 20dk

🛫 ESB → AMS
✈️ TK
```

## 🔧 Özellikler

### Dedupe Sistemi
- Her deal için benzersiz hash oluşturulur
- Aynı deal 24 saat içinde tekrar gönderilmez
- `seen_deals.json` GitHub Actions cache'inde saklanır

### Post-filtering
- Almanya aktarması gerektiren rotalar için API sonucu doğrulanır
- FRA, MUC, DUS, BER, HAM, STR, CGN havalimanları tanınır

### Tarih Penceresi Rotasyonu
- Her gün farklı tarih aralığı taranır
- Kısa (7-30 gün), orta (1-3 ay), uzun (3-6 ay)
- API limitlerini korur

## 📄 Lisans

MIT

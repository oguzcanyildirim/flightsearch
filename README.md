# ✈️ Ankara Flight Deal Scanner

Ankara (ESB) çıkışlı ucuz uçak biletlerini otomatik tarayan ve Telegram'a bildirim gönderen sistem.

## 🎯 Özellikler

- **Avrupa Rotaları:** Direkt veya Almanya üzerinden max 1 aktarmalı
- **Uzak Mesafe:** Miami, Hawaii, Singapur, Perth, Yeni Zelanda vs. - max 2 aktarma
- **Akıllı Threshold:** Her rota için özel fiyat limitleri
- **Telegram Bildirimleri:** Anlık fırsat bildirimleri
- **GitHub Actions:** Ücretsiz, günde 4 kez otomatik tarama

## 🚀 Kurulum

### 1. Kiwi Tequila API Key Al

1. [Kiwi Tequila Partners](https://tequila.kiwi.com/portal/login) sitesine git
2. Ücretsiz hesap oluştur
3. Dashboard'dan API key'ini kopyala

### 2. Telegram Bot Oluştur

1. Telegram'da [@BotFather](https://t.me/BotFather) ile konuş
2. `/newbot` komutu gönder
3. Bot için isim ve username belirle
4. Sana verilen **Bot Token**'ı kaydet

### 3. Chat ID Bul

1. Oluşturduğun bota bir mesaj gönder
2. Şu URL'yi ziyaret et (TOKEN yerine kendi token'ını yaz):
   ```
   https://api.telegram.org/bot<TOKEN>/getUpdates
   ```
3. JSON içinde `"chat":{"id":123456789}` şeklinde **Chat ID**'ni bul

### 4. GitHub Repository Oluştur

1. Bu klasörü yeni bir GitHub repo'suna push'la
2. Repo Settings → Secrets and Variables → Actions
3. Şu secret'ları ekle:
   - `KIWI_API_KEY` - Kiwi API anahtarın
   - `TELEGRAM_BOT_TOKEN` - Telegram bot token'ın
   - `TELEGRAM_CHAT_ID` - Senin chat ID'n

### 5. Actions'ı Aktif Et

1. Repo'nun Actions sekmesine git
2. "I understand my workflows, go ahead and enable them" butonuna tıkla
3. İstersen "Run workflow" ile manuel test et

## ⚙️ Konfigürasyon

### Rotaları Düzenle

`src/scanner.ts` dosyasındaki `ROUTES` array'ini düzenle:

```typescript
{
  destination: "MIA",           // IATA kodu
  destinationName: "Miami",     // Telegram'da görünecek isim
  maxStopovers: 2,              // Max aktarma sayısı
  priceThreshold: 20000,        // Bu fiyatın altındakiler bildirilir (TRY)
  category: "longhaul"          // "europe" veya "longhaul"
}
```

### Aktarma Kuralları

- `maxStopovers: 0` → Sadece direkt uçuşlar
- `maxStopovers: 1` + `stopoverVia: "DE"` → Sadece Almanya aktarmalı
- `maxStopovers: 2` → Max 2 aktarmalı herhangi bir rota

### Threshold Önerileri

| Rota Tipi | Uygun Fiyat | İyi Fırsat | Kaçırma! |
|-----------|-------------|------------|----------|
| Avrupa (direkt) | 4.000₺ | 3.000₺ | 2.500₺ |
| İzlanda/Kuzey | 8.000₺ | 6.000₺ | 5.000₺ |
| ABD | 20.000₺ | 17.000₺ | 15.000₺ |
| Asya | 15.000₺ | 12.000₺ | 10.000₺ |
| Avustralya/NZ | 25.000₺ | 22.000₺ | 20.000₺ |

## 📊 API Limitleri

- **Kiwi Free Tier:** 3.000 request/ay
- **Günde 4 tarama × 30 rota = 120 request/gün**
- **Aylık: ~3.600 request** (biraz üstünde ama genelde sorun çıkmaz)

Eğer limit aşımı olursa:
1. Rota sayısını azalt
2. Tarama sıklığını 8 saate çıkar: `cron: '0 */8 * * *'`

## 🧪 Lokal Test

```bash
# Environment variables ayarla
export KIWI_API_KEY="your_key"
export TELEGRAM_BOT_TOKEN="your_token"
export TELEGRAM_CHAT_ID="your_chat_id"

# Çalıştır
deno run --allow-net --allow-env src/scanner.ts
```

## 📝 Örnek Telegram Bildirimi

```
🇪🇺 AMSTERDAM 🔥🔥

💰 2.850 ₺
✈️ AKTARMASIZ
⏱️ Toplam: 3s 15dk

📅 Gidiş: Cum, 15 Mar 08:30
📅 Dönüş: Pzr, 23 Mar 14:45

🛫 Rota: Ankara → Amsterdam
✈️ Havayolu: Pegasus

🔗 Bileti Gör
```

## 🔧 Geliştirme Fikirleri

- [ ] Fiyat geçmişi takibi (hangi fiyatlar gerçekten iyi?)
- [ ] Birden fazla çıkış havalimanı (İstanbul backup)
- [ ] Hafta sonu özel taramaları
- [ ] Web dashboard

## 📄 Lisans

MIT - İstediğin gibi kullan!

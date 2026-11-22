# Makine Bakım Görevleri (telefona kurulan web uygulaması)

Yönetici telefondan görev yazar → personele anında bildirim gider. Yapılmamış görevi olan herkese
**08:00, 11:00 ve 15:00**'te hatırlatma gider. Personel "Yapıldı" der (açıklama zorunlu) → o görev bildirimden çıkar.

## 1) Firebase (ücretsiz, tek seferlik)
1. https://console.firebase.google.com → **Proje ekle**.
2. **Build > Firestore Database > Create database** → konum **eur3 (Europe)**.
3. **Proje ayarları (⚙) > Genel > Uygulamalarınız > Web (</>)** → uygulama ekle → çıkan `apiKey, authDomain, projectId, messagingSenderId, appId` değerlerini `config.js` içine yapıştır.
4. **Proje ayarları > Cloud Messaging > Web Push sertifikaları > Anahtar çifti oluştur** → anahtarı `config.js` içindeki `vapidKey` alanına yapıştır.
5. `config.js` içinde `managerPin` değerini değiştir.
6. Zamanlanmış bildirim için planı **Blaze**'e geçir (kredi kartı ister; bu kullanım ücretsiz kotanın çok altındadır, yine de bütçe uyarısı koyabilirsin).

## 2) Sunucu kodunu yükle (bilgisayarda, Node.js 20 kurulu olmalı)
```
npm i -g firebase-tools
firebase login
firebase use --add        # projeni seç
cd functions && npm i && cd ..
firebase deploy --only functions,firestore:rules
```

## 3) GitHub'da yayınla
1. Yeni (public) repo aç, bu klasörün içindekileri yükle (`config.js` dahil).
2. **Settings > Pages > Branch: main / (root) > Save**.
3. Adres: `https://KULLANICI.github.io/REPO/`

## 4) Telefonlara kur
- **Android (Chrome):** adresi aç → ⋮ menü → **Uygulamayı yükle / Ana ekrana ekle**.
- **iPhone (Safari, iOS 16.4+):** adresi aç → **Paylaş → Ana Ekrana Ekle** → uygulamayı ana ekrandan aç.
- Açılışta adını yaz, **Personel** seç → **🔔 Bildirimleri aç** → İzin ver.
- Sen **Yönetici** seç + PIN gir. Personel en az bir kez giriş yaptıktan sonra görev atayabilirsin (adı listede görünür).

## Notlar
- Saatleri değiştirmek: `functions/index.js` içindeki `"0 8,11,15 * * *"` (yeniden `firebase deploy --only functions`).
- Güvenlik basit tutuldu: PIN uygulama içinde kontrol edilir, veritabanı kuralları açıktır. Küçük iç ekip için uygundur; adresi paylaşmayın.
- Bildirimler uygulama kapalıyken de gelir; telefonda pil tasarrufu uygulamayı kısıtlıyorsa uygulamayı "kısıtlama yok" yapın.

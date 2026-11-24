# Makine Bakım Görevleri

Telefona kurulan bakım takip uygulaması. Yönetici görev yazar, personele bildirim gider. Personel işi bitirince
açıklama (ve isterse fotoğraf) yazarak kapatır, yapamazsa sebebini bildirir.

## Neler var
- **Görevler:** Açık / Sorunlu / Biten sekmeleri, kişiye göre filtre, kendine görev atama.
- **Kırmızı görevler:** Tarihi geçen ve yapılmayan görev otomatik kırmızı olur. Yönetici istediği görevi
  "Kırmızı yap" ile veya görev yazarken "Acil" seçerek kırmızıya çevirir. Kırmızılar listenin en üstünde durur.
- **Yapıldı:** Açıklama zorunlu, fotoğraf isteğe bağlı. **Yapamadım:** Sebep yazılır, yöneticiye bildirim gider.
- **Yönetici işlemleri:** Düzenle (kişi, tarih, makine, öncelik), Kapat, Tekrar aç, Sil.
- **Makineler:** Makine listesi ve her makinenin tüm bakım geçmişi.
- **Ekip:** Kayıtlı kişiler, bildirim durumu, kişi silme, adres paylaşma.
- **Rapor:** Bu ay, geçen ay, son 7 gün veya seçilen tarih aralığı; kişi bazında özet; **Excel’e aktar**.
- İnternet yokken de açılır; yapılan işlemler internet gelince gönderilir.

## Dosyalar
```
index.html                 uygulama
config.js                  SENİN Firebase bilgilerin (GitHub'dakini SİLME/DEĞİŞTİRME)
config.ornek.js            boş örnek (sadece ilk kurulumda gerekir)
firebase-messaging-sw.js   bildirim + çevrimdışı çalışma
manifest.json              telefona kurulum bilgisi
icons/icon-192.png, icons/icon-512.png
firestore.rules            veritabanı kuralları
firebase.json, functions/  sunucu kodu (bildirimler, hatırlatma)
```

## 1) GitHub’ı güncelle
GitHub reposuna şu dosyaları yükle ve eskilerin üzerine yaz: `index.html`, `firebase-messaging-sw.js`,
`manifest.json`, `icons/` klasörü. **`config.js`’e dokunma**, içinde senin Firebase bilgilerin var.
1–2 dakika sonra uygulamayı telefonda kapatıp yeniden aç.

## 2) Veritabanı kurallarını yayınla (zorunlu)
Firebase konsolu → **Firestore** → **Rules** → içindekileri sil → `firestore.rules` dosyasının içeriğini
yapıştır → **Publish**.

## 3) Bildirimler ve hatırlatmalar (sunucu kodu)
Bunlar için proje **Blaze** planında olmalı (konsolda sol alttaki **Upgrade**). Kredi kartı ister;
bu kullanım ücretsiz kotanın çok altında kalır. Yine de **Bütçe uyarısı** (ör. 1 $) kurman önerilir.

Bilgisayarda **Node.js 22** kurulu olmalı (nodejs.org). Sonra bu klasörde:
```
npm i -g firebase-tools
firebase login
firebase use --add          # BakimGorev projesini seç
cd functions && npm i && cd ..
firebase deploy --only functions,firestore:rules
```
> Konum notu: `functions/index.js` içindeki `REGION`, Firestore veritabanının konumuyla uyumlu olmalı.
> Konum `europe-west1` veya `eur3` ise dokunma. `nam5` ise `us-central1` yaz. Başka bir tek bölgeyse
> (ör. `europe-west3`) aynısını yaz. Konum, Firestore sayfasında veritabanı adının yanında görünür.

Blaze olmadan da uygulama çalışır: görevler, kırmızı işaretler, fotoğraflar, makineler ve rapor
kullanılabilir. Sadece telefona bildirim gelmez.

## Zamanlama
- Hatırlatma: her gün **08:00, 11:00, 15:00** (bugünkü, gecikmiş ve acil görevler). 08:00’de yöneticilere
  gecikmiş/sorunlu özeti gider. Değiştirmek için `functions/index.js` → `"0 8,11,15 * * *"`.
Değişiklikten sonra: `firebase deploy --only functions`.

## Telefona kurulum
- **Android (Chrome):** adresi aç → ⋮ → **Uygulamayı yükle**.
- **iPhone (Safari, iOS 16.4+):** **Paylaş → Ana Ekrana Ekle** → uygulamayı ana ekrandan aç
  (iPhone’da bildirim sadece böyle çalışır).
- Adını yaz, rolünü seç, **Bildirimleri aç**.

## Bilinmesi gerekenler
- Yönetici PIN’i `config.js` içindedir. Repo herkese açıksa PIN, adresi bilen biri tarafından görülebilir;
  adresi ekip dışına paylaşma.
- Kişiler isimleriyle tanınır: aynı kişi adını her girişte aynı yazmalı.
- Silinen kişi tekrar giriş yaparsa listeye geri gelir.
- Fotoğraflar küçültülerek saklanır (yaklaşık 100–500 KB).

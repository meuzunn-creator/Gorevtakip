/**
 * Makine Bakım Görevleri – bildirim gönderici
 * GitHub Actions ile her 5 dakikada bir çalışır (Firebase Blaze planı gerekmez).
 *  1) Uygulamanın "notify" kutusuna yazdığı bildirimleri telefonlara gönderir.
 *  2) Yöneticinin şifre sıfırlama / hesap silme isteklerini uygular.
 *  3) Belirlenen saatlerde açık görev hatırlatması gönderir.
 */

/* ================= AYARLAR (istersen değiştir) ================= */
const HATIRLATMA_SAATLERI = [8, 11, 15]; // İstanbul saati, tam saat olarak
const PAZAR_GUNU_HATIRLAT = true;        // false yaparsan pazar günü hatırlatma gitmez
const OZET_SAATI = 8;                    // Yöneticilere günlük özet saati (yukarıdaki listede olmalı)
/* =============================================================== */

const admin = require("firebase-admin");
const TZ = "Europe/Istanbul";

const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!raw) { console.error("HATA: FIREBASE_SERVICE_ACCOUNT gizli anahtarı tanımlı değil. README'deki 'Bildirimler' bölümüne bakın."); process.exit(1); }
let sa;
try { sa = JSON.parse(raw); } catch { console.error("HATA: FIREBASE_SERVICE_ACCOUNT geçerli değil. İndirdiğin JSON dosyasının TAMAMINI yapıştır."); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

/* ---------- Yardımcılar ---------- */
function nowTR() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", hour12: false, weekday: "short" }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24, sunday: p.weekday === "Sun" };
}
const trDate = (s) => (s || "").split("-").reverse().join(".");
const cut = (s, n) => { s = String(s || ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
const line = (t) => `${cut(t.title, 120)}${t.machineName ? " · " + t.machineName : ""} (${trDate(t.date)})`;

const DEAD = /registration-token-not-registered|invalid-registration-token/;
let sent = 0;
async function sendTo(ref, tokens, title, body, tag, skip) {
  tokens = (Array.isArray(tokens) ? tokens : []).filter((t) => t && t !== skip);
  if (!tokens.length) return;
  const res = await admin.messaging().sendEachForMulticast({
    tokens,
    data: { title: cut(title, 120), body: cut(body, 900), tag: String(tag || "gorev") },
    webpush: { headers: { TTL: "21600", Urgency: "high" } },
  });
  sent += res.successCount;
  const dead = tokens.filter((t, i) => !res.responses[i].success && DEAD.test(res.responses[i].error?.code || ""));
  if (dead.length) await ref.update({ tokens: admin.firestore.FieldValue.arrayRemove(...dead) }).catch(() => {});
}
let managersCache = null;
async function managers() {
  if (!managersCache) managersCache = (await db.collection("users").where("role", "==", "manager").get()).docs.map((d) => ({ id: d.id, ref: d.ref, ...d.data() }));
  return managersCache;
}
async function isManager(uid) { return (await managers()).some((m) => m.id === uid); }

/* ---------- 1) Bildirim kutusu ---------- */
async function processNotify() {
  const snap = await db.collection("notify").limit(300).get();
  const docs = snap.docs.sort((a, b) => (a.data().createdAt?.toMillis?.() || 0) - (b.data().createdAt?.toMillis?.() || 0));
  for (const d of docs) {
    const n = d.data();
    try {
      const age = Date.now() - (n.createdAt?.toMillis?.() || Date.now());
      if (age < 6 * 3600e3) { // 6 saatten eski bildirimler artık anlamsız: gönderilmeden silinir
        if (n.to === "managers") {
          for (const m of await managers()) await sendTo(m.ref, m.tokens, n.title, n.body, n.tag, n.skip);
        } else if (typeof n.to === "string" && n.to) {
          const u = await db.doc(`users/${n.to}`).get();
          if (u.exists) await sendTo(u.ref, u.data().tokens, n.title, n.body, n.tag, n.skip);
        }
      }
      await d.ref.delete();
    } catch (e) { console.error("Bildirim gönderilemedi:", d.id, e.message); }
  }
  return docs.length;
}

/* ---------- 2) Yönetici işlemleri ---------- */
async function processAdminOps() {
  const snap = await db.collection("adminOps").get();
  let n = 0;
  for (const d of snap.docs) {
    const op = d.data();
    if (op.error) continue; // hata yönetici ekranında gösterilir, yönetici "Tamam" deyince silinir
    try {
      if (!(await isManager(op.by))) throw new Error("İsteği yapan kişi yönetici değil.");
      if (op.uid === op.by) throw new Error("Kişi kendi hesabında bu işlemi yapamaz.");
      if (op.type === "reset") {
        if (typeof op.password !== "string" || op.password.length < 6) throw new Error("Şifre en az 6 karakter olmalı.");
        await admin.auth().updateUser(op.uid, { password: op.password });
        await admin.auth().revokeRefreshTokens(op.uid); // eski şifreyle açık kalan telefonlar çıkış yapar
        await db.doc(`users/${op.uid}`).update({ tokens: [] }).catch(() => {});
      } else if (op.type === "deleteAuth") {
        await admin.auth().deleteUser(op.uid).catch((e) => { if (e.code !== "auth/user-not-found") throw e; });
      } else throw new Error("Bilinmeyen işlem.");
      await d.ref.delete(); n++;
    } catch (e) {
      const msg = e.code === "auth/user-not-found" ? "Bu kişinin şifreli hesabı yok; yeniden kayıt olmalı." : e.message;
      await d.ref.update({ error: cut(msg, 200), password: admin.firestore.FieldValue.delete() }).catch(() => {});
      console.error("Yönetici işlemi başarısız:", d.id, msg);
    }
  }
  return n;
}

/* ---------- 3) Hatırlatmalar ---------- */
async function reminders() {
  const now = nowTR();
  if (now.sunday && !PAZAR_GUNU_HATIRLAT) return "pazar, atlandı";
  // GitHub gecikirse diye: saat geldiyse ve 2 saat geçmediyse, o saatin hatırlatması bir kez gönderilir
  const slot = [...HATIRLATMA_SAATLERI].sort((a, b) => b - a).find((h) => now.hour >= h && now.hour < h + 2);
  if (slot === undefined) return "saati değil";
  const key = `${now.date}-${String(slot).padStart(2, "0")}`;
  const stateRef = db.doc("system/state");
  const claimed = await db.runTransaction(async (tx) => {
    const st = (await tx.get(stateRef)).data() || {};
    if ((st.lastReminder || "") >= key) return false;
    tx.set(stateRef, { lastReminder: key }, { merge: true });
    return true;
  });
  if (!claimed) return "zaten gönderildi";

  const [openSnap, blockedSnap] = await Promise.all([
    db.collection("tasks").where("status", "==", "open").get(),
    db.collection("tasks").where("status", "==", "blocked").get(),
  ]);
  const by = {};
  let lateAll = 0;
  openSnap.forEach((d) => {
    const t = d.data();
    if (t.date < now.date) lateAll++;
    if (t.date <= now.date || t.priority === "high") (by[t.assigneeId] ||= []).push(t);
  });
  for (const [uid, list] of Object.entries(by)) {
    list.sort((x, y) => (x.priority === "high" ? -1 : 0) - (y.priority === "high" ? -1 : 0) || x.date.localeCompare(y.date));
    const late = list.filter((t) => t.date < now.date).length;
    const body = list.slice(0, 4).map((t) => "• " + (t.priority === "high" ? "🔴 " : "") + line(t)).join("\n") +
      (list.length > 4 ? `\n+${list.length - 4} görev daha` : "");
    try {
      const u = await db.doc(`users/${uid}`).get();
      if (u.exists) await sendTo(u.ref, u.data().tokens, `Yapılacak ${list.length} görev${late ? ` · ${late} gecikmiş` : ""}`, body, "hatirlat");
    } catch (e) { console.error("Hatırlatma gönderilemedi:", uid, e.message); }
  }
  if (slot === OZET_SAATI && (lateAll || blockedSnap.size)) {
    for (const m of await managers()) {
      await sendTo(m.ref, m.tokens, "Günlük bakım özeti", `Gecikmiş görev: ${lateAll}\nYapılamayan (sorunlu) görev: ${blockedSnap.size}`, "ozet").catch(() => {});
    }
  }
  return `${slot}:00 hatırlatması gönderildi`;
}

/* ---------- Çalıştır ---------- */
(async () => {
  const n1 = await processNotify();
  const n2 = await processAdminOps();
  const r = await reminders();
  console.log(`Bildirim kutusu: ${n1} · Yönetici işlemi: ${n2} · Hatırlatma: ${r} · Telefona giden: ${sent}`);
})().catch((e) => { console.error("Çalışma hatası:", e.message); process.exit(1); });

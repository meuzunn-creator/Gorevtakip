/**
 * Makine Bakım Görevleri – sunucu kodu (Cloud Functions 2. nesil, Node.js 22)
 * - Yeni görev / değişiklik → ilgili kişiye bildirim
 * - Tamamlandı / Yapılamadı → yöneticilere bildirim
 * - 08:00, 11:00, 15:00 → bugünkü ve gecikmiş görev hatırlatması (08:00'de yöneticilere özet)
 */
const { setGlobalOptions } = require("firebase-functions/v2");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onDocumentCreated, onDocumentUpdated, onDocumentDeleted } = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

// Firestore veritabanınızın konumu: Firebase konsolu > Firestore > (default) yanında yazar.
// europe-west1 veya eur3 ise "europe-west1" kalsın. Başka bir konumsa README'ye bakın.
const REGION = "europe-west1";
const TZ = "Europe/Istanbul";

setGlobalOptions({ region: REGION, maxInstances: 3 });
admin.initializeApp();
const db = admin.firestore();
const { FieldValue } = admin.firestore;

/* ---------- Yardımcılar ---------- */
const todayTR = () => new Date().toLocaleDateString("sv-SE", { timeZone: TZ });
const hourTR = () => Number(new Date().toLocaleString("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }));
const trDate = (s) => (s || "").split("-").reverse().join(".");
const cut = (s, n) => { s = String(s || ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
const line = (t) => `${cut(t.title, 120)}${t.machineName ? " · " + t.machineName : ""} (${trDate(t.date)})`;

/* ---------- Bildirim gönderme ---------- */
const DEAD = /registration-token-not-registered|invalid-registration-token/;
async function sendTo(ref, tokens, title, body, tag) {
  if (!Array.isArray(tokens) || !tokens.length) return;
  const res = await admin.messaging().sendEachForMulticast({
    tokens,
    data: { title: cut(title, 120), body: cut(body, 900), tag: tag || "gorev" },
    webpush: { headers: { TTL: "21600", Urgency: "high" } },
  });
  const dead = tokens.filter((t, i) => !res.responses[i].success && DEAD.test(res.responses[i].error?.code || ""));
  if (dead.length) await ref.update({ tokens: FieldValue.arrayRemove(...dead) }).catch(() => {});
}
async function push(userId, title, body, tag) {
  if (!userId) return;
  const ref = db.doc(`users/${userId}`), snap = await ref.get();
  if (snap.exists) await sendTo(ref, snap.data().tokens, title, body, tag);
}
async function pushManagers(exceptId, title, body, tag) {
  const snap = await db.collection("users").where("role", "==", "manager").get();
  await Promise.all(snap.docs.filter((d) => d.id !== exceptId).map((d) => sendTo(d.ref, d.data().tokens, title, body, tag)));
}

/* ---------- Tetikleyiciler ---------- */
exports.yeniGorev = onDocumentCreated("tasks/{id}", async (e) => {
  const t = e.data?.data(); if (!t || t.status !== "open") return;
  if (t.createdBy && t.createdBy === t.assigneeId) return; // kendine yazdıysa bildirim yok
  try {
    await push(t.assigneeId, t.priority === "high" ? "🔴 Acil yeni görev" : "Yeni görev", line(t), e.params.id);
  } catch (err) { logger.error("yeniGorev", err); }
});

exports.gorevDegisti = onDocumentUpdated("tasks/{id}", async (e) => {
  const b = e.data.before.data(), a = e.data.after.data(), id = e.params.id;
  try {
    if (b.status !== "done" && a.status === "done") {
      await pushManagers(a.doneById, `✔ ${a.doneByName || "Personel"} görevi tamamladı`, `${cut(a.title, 120)}\n${cut(a.doneNote, 300)}`, "bitti-" + id);
      return;
    }
    if (b.status !== "blocked" && a.status === "blocked") {
      await pushManagers(a.blockedById, `⚠ ${a.blockedByName || "Personel"}: görev yapılamadı`, `${cut(a.title, 120)}\nSebep: ${cut(a.blockedReason, 300)}`, "sorun-" + id);
      return;
    }
    if (a.status !== "open" || a.updatedBy === a.assigneeId) return;
    let title = null;
    if (b.assigneeId !== a.assigneeId) title = a.priority === "high" ? "🔴 Acil yeni görev" : "Yeni görev";
    else if (b.status !== "open") title = "Görev tekrar açıldı";
    else if (b.date !== a.date) title = "Görev tarihi değişti";
    else if (b.priority !== "high" && a.priority === "high") title = "🔴 Görev acil olarak işaretlendi";
    if (title) await push(a.assigneeId, title, line(a), id);
  } catch (err) { logger.error("gorevDegisti", err); }
});

exports.gorevSilindi = onDocumentDeleted("tasks/{id}", async (e) => {
  await db.doc(`photos/${e.params.id}`).delete().catch(() => {});
});

/* ---------- Zamanlanmış işler ---------- */
exports.hatirlat = onSchedule({ schedule: "0 8,11,15 * * *", timeZone: TZ }, async () => {
  const today = todayTR();
  const [openSnap, blockedSnap] = await Promise.all([
    db.collection("tasks").where("status", "==", "open").get(),
    db.collection("tasks").where("status", "==", "blocked").get(),
  ]);
  const by = {};
  let lateAll = 0;
  openSnap.forEach((d) => {
    const t = d.data();
    if (t.date < today) lateAll++;
    if (t.date <= today || t.priority === "high") (by[t.assigneeId] ||= []).push(t);
  });
  await Promise.all(Object.entries(by).map(([uid, list]) => {
    list.sort((x, y) => (x.priority === "high" ? -1 : 0) - (y.priority === "high" ? -1 : 0) || x.date.localeCompare(y.date));
    const late = list.filter((t) => t.date < today).length;
    const body = list.slice(0, 4).map((t) => "• " + (t.priority === "high" ? "🔴 " : "") + line(t)).join("\n") +
      (list.length > 4 ? `\n+${list.length - 4} görev daha` : "");
    return push(uid, `Yapılacak ${list.length} görev${late ? ` · ${late} gecikmiş` : ""}`, body, "hatirlat")
      .catch((err) => logger.error("hatirlat", uid, err));
  }));
  if (hourTR() === 8 && (lateAll || blockedSnap.size)) {
    await pushManagers(null, "Günlük bakım özeti",
      `Gecikmiş görev: ${lateAll}\nYapılamayan (sorunlu) görev: ${blockedSnap.size}`, "ozet").catch((err) => logger.error("ozet", err));
  }
});

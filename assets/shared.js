/* Wspólne dane i reguły — używane przez stronę (przeglądarka) i backend (Google Apps Script). */

var PK = {
  SITE_URL: 'https://adask0oo.github.io/pookie21/',
  PAID_FROM: '2026-11-10',        // od kiedy można rezerwować płatne talony
  SMALL_PER_MONTH: 2,             // limit mniejszych płatnych w miesiącu
  LEAD_SMALL: 3,                  // płatne: min. dni wyprzedzenia
  LEAD_BIG: 14,                   // duży talon: min. dni wyprzedzenia
  SEASON_MONTHS: [5, 6, 7, 8, 9], // talony sezonowe: maj–wrzesień
  WEATHER: { lat: 52.058, lon: 20.093, place: 'okolice Skierniewic' },
  STATUS: { WAIT: 'czeka', OK: 'zatwierdzony', NO: 'odrzucony', DONE: 'zrealizowany', CANCEL: 'odwołany' },
  MONTHS: ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'],
  MONTHS_GEN: ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'],
  MONTHS_LOC: ['styczniu', 'lutym', 'marcu', 'kwietniu', 'maju', 'czerwcu', 'lipcu', 'sierpniu', 'wrześniu', 'październiku', 'listopadzie', 'grudniu'],

  /* type: paid | free
     mode: book (wybór terminu) | instant (od ręki) | unlimited (bez limitu) | wish (joker: tekst + termin)
     size: big (miesiąc tylko dla siebie) | small */
  COUPONS: []   // treść talonów przychodzi z serwera po zalogowaniu
};

/* ---------- daty ---------- */
function pkPad(n) { return (n < 10 ? '0' : '') + n; }
function pkParse(s) { var p = String(s).split('-'); return { y: +p[0], m: +p[1], d: +p[2] }; }
function pkStr(y, m, d) { return y + '-' + pkPad(m) + '-' + pkPad(d); }
function pkAddDays(s, n) {
  var p = pkParse(s); var dt = new Date(Date.UTC(p.y, p.m - 1, p.d + n));
  return pkStr(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}
function pkDiffDays(a, b) { // b - a w dniach
  var A = pkParse(a), B = pkParse(b);
  return Math.round((Date.UTC(B.y, B.m - 1, B.d) - Date.UTC(A.y, A.m - 1, A.d)) / 86400000);
}
function pkMonthKey(s) { return String(s).slice(0, 7); }
function pkHuman(s, withYear) {
  var p = pkParse(s);
  return p.d + ' ' + PK.MONTHS_GEN[p.m - 1] + (withYear ? ' ' + p.y : '');
}

/* ---------- talony ---------- */
function pkCoupon(id) {
  for (var i = 0; i < PK.COUPONS.length; i++) if (PK.COUPONS[i].id === id) return PK.COUPONS[i];
  return null;
}
function pkIsActive(b) { return b && (b.status === PK.STATUS.WAIT || b.status === PK.STATUS.OK || b.status === PK.STATUS.DONE); }
function pkEndDate(b) { var c = pkCoupon(b.coupon); return pkAddDays(b.date, ((c && c.days) || 1) - 1); }

/* Talon wielokrotny (np. 10 kolacji): uses > 1 */
function pkMulti(c) { return !!(c && c.uses > 1); }
function pkDoneList(bookings, couponId) {
  var out = [];
  for (var i = 0; i < bookings.length; i++) if (bookings[i].coupon === couponId && bookings[i].status === PK.STATUS.DONE) out.push(bookings[i]);
  return out;
}

/* Aktualny wpis talonu (ostatni nieodwołany i nieodrzucony; przy wielokrotnym – bez zrealizowanych) */
function pkCurrent(bookings, couponId) {
  var cur = null, multi = pkMulti(pkCoupon(couponId));
  for (var i = 0; i < bookings.length; i++) {
    var b = bookings[i];
    if (b.coupon === couponId && pkIsActive(b) && !(multi && b.status === PK.STATUS.DONE)) cur = b;
  }
  return cur;
}
function pkLastRejected(bookings, couponId) {
  var r = null;
  for (var i = 0; i < bookings.length; i++) {
    var b = bookings[i];
    if (b.coupon === couponId && b.status === PK.STATUS.NO) r = b;
    if (b.coupon === couponId && pkIsActive(b)) r = null;
  }
  return r;
}

/* Stan widoczny dla Pookie: dostępny | czeka | zaplanowany | zrealizowany */
function pkCouponState(bookings, couponId, today) {
  var c = pkCoupon(couponId), b = pkCurrent(bookings, couponId);
  if (pkMulti(c)) {
    var done = pkDoneList(bookings, couponId), used = done.length, last = used ? done[used - 1] : null;
    if (b) return { state: b.status === PK.STATUS.WAIT ? 'wait' : 'planned', booking: b, used: used, last: last };
    if (used >= c.uses) return { state: 'done', booking: last, used: used, last: last };
    return { state: 'free', booking: null, used: used, last: last };
  }
  if (!b) return { state: 'free', booking: null };
  if (b.status === PK.STATUS.DONE) return { state: 'done', booking: b };
  if (b.status === PK.STATUS.WAIT) return { state: 'wait', booking: b };
  // zatwierdzony: płatny po terminie liczy się jako zrealizowany
  if (c.type === 'paid' && pkEndDate(b) < today) return { state: 'done', booking: b };
  return { state: 'planned', booking: b };
}

function pkBigName() {
  for (var i = 0; i < PK.COUPONS.length; i++) if (PK.COUPONS[i].size === 'big') return PK.COUPONS[i].name.toLowerCase().replace(/ we dwoje$/, '');
  return 'duży talon';
}

/* Podsumowanie płatnych w miesiącu (bez wpisu o podanym id) */
function pkMonthPaid(bookings, monthKey, excludeCoupon) {
  var small = 0, big = false;
  for (var i = 0; i < bookings.length; i++) {
    var b = bookings[i];
    if (!pkIsActive(b) || b.coupon === excludeCoupon) continue;
    var c = pkCoupon(b.coupon);
    if (!c || c.type !== 'paid' || pkMonthKey(b.date) !== monthKey) continue;
    if (c.size === 'big') big = true; else small++;
  }
  return { small: small, big: big };
}

/* Czy dany dzień można wybrać dla talonu. Zwraca { ok, reason } */
function pkValidate(couponId, date, bookings, today) {
  var c = pkCoupon(couponId);
  if (!c) return { ok: false, reason: 'Nie ma takiego talonu.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return { ok: false, reason: 'Wybierz dzień w kalendarzu.' };
  if (date < today) return { ok: false, reason: 'Ten dzień już minął.' };
  if (c.mode === 'instant' || c.mode === 'unlimited') return { ok: true };
  var p = pkParse(date), mName = PK.MONTHS_LOC[p.m - 1];

  if (c.type === 'paid') {
    if (date < PK.PAID_FROM) return { ok: false, reason: 'Talony na mój koszt można realizować od ' + pkHuman(PK.PAID_FROM) + '.' };
    var lead = c.size === 'big' ? PK.LEAD_BIG : PK.LEAD_SMALL;
    if (pkDiffDays(today, date) < lead) return { ok: false, reason: c.size === 'big'
      ? 'Ten talon trzeba zaplanować co najmniej ' + PK.LEAD_BIG + ' dni wcześniej, żeby wszystko ogarnąć.'
      : 'Talony na mój koszt planujemy co najmniej ' + PK.LEAD_SMALL + ' dni wcześniej.' };
    if (c.season && PK.SEASON_MONTHS.indexOf(p.m) < 0) return { ok: false, reason: 'Ten talon tylko przy ładnej pogodzie, czyli od maja do września.' };
    var mp = pkMonthPaid(bookings, pkMonthKey(date), c.id);
    if (c.size === 'big') {
      if (mp.big) return { ok: false, reason: 'W ' + mName + ' jest już zaplanowany ten talon.' };
      if (mp.small > 0) return { ok: false, reason: 'W ' + mName + ' są już zaplanowane talony na mój koszt, a ten potrzebuje miesiąca tylko dla siebie.' };
    } else {
      if (mp.big) return { ok: false, reason: 'W ' + mName + ' jest ' + pkBigName() + ', to miesiąc tylko dla niego.' };
      if (mp.small >= PK.SMALL_PER_MONTH) return { ok: false, reason: 'Limit ' + PK.SMALL_PER_MONTH + ' talonów na mój koszt w ' + mName + ' jest już wykorzystany.' };
    }
  }
  return { ok: true };
}

/* ---------- silnik akcji: ta sama logika w podglądzie i w backendzie ----------
   db = { bookings: [...], opened: [...], hugs: n }
   a  = { a: 'open'|'book'|'cancel'|'decide'|'redeem'|'hug', coupon, date, note, option, d }
   ctx = { today, now, authorized }  (authorized = poprawny PIN Adama albo link z maila)
   Zwraca { error, code, events: [{ type, booking, prevEventId }] } */
function pkId() { return 'b' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36); }
function pkClean(s, max) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max || 300); }

function pkOptionOk(c, option) {
  if (!c.options) return true;
  if (option && option !== c.optionOther && c.options.indexOf(option) >= 0) return true;
  return !!(c.optionOther && option && option !== c.optionOther);
}

function pkApply(db, a, ctx) {
  var today = ctx.today, now = ctx.now || new Date().toISOString();
  var ev = [];
  var fail = function (msg, code) { return { error: msg, code: code || 'bad', events: [] }; };
  var c = a.coupon ? pkCoupon(a.coupon) : null;

  if (a.a === 'open') {
    if (!c) return fail('Nie ma takiego talonu.');
    if (db.opened.indexOf(c.id) < 0) db.opened.push(c.id);
    return { events: ev };
  }

  if (a.a === 'hug') {
    db.hugs = (+db.hugs || 0) + 1;
    ev.push({ type: 'hug', count: db.hugs });
    return { events: ev };
  }

  if (a.a === 'book') {
    if (!c || (c.mode !== 'book' && c.mode !== 'wish')) return fail('Tego talonu nie planuje się w kalendarzu.');
    var st = pkCouponState(db.bookings, c.id, today);
    if (st.state === 'done') return fail('Ten talon jest już zrealizowany.');
    var v = pkValidate(c.id, a.date, db.bookings, today);
    if (!v.ok) return fail(v.reason, 'rule');
    var note = pkClean(a.note), option = pkClean(a.option, 60);
    if (c.mode === 'wish' && !note) return fail('Wpisz, czego sobie życzysz.');
    if (!pkOptionOk(c, option)) return fail('Wybierz: ' + c.optionLabel.toLowerCase());
    var cur = pkCurrent(db.bookings, c.id);
    if (cur) {
      var prevEventId = cur.eventId || '';
      var prevDate = cur.date;
      cur.date = a.date; cur.note = note; cur.option = option; cur.status = PK.STATUS.WAIT; cur.updated = now; cur.eventId = '';
      ev.push({ type: 'rescheduled', booking: cur, prevEventId: prevEventId, prevDate: prevDate });
    } else {
      var b = { id: pkId(), coupon: c.id, status: PK.STATUS.WAIT, date: a.date, note: note, option: option, created: now, updated: now, eventId: '' };
      db.bookings.push(b);
      ev.push({ type: 'proposed', booking: b });
    }
    return { events: ev };
  }

  if (a.a === 'cancel') {
    if (!c) return fail('Nie ma takiego talonu.');
    var s2 = pkCouponState(db.bookings, c.id, today);
    if (s2.state !== 'wait' && s2.state !== 'planned') return fail('Nie ma czego odwoływać.');
    var pe = s2.booking.eventId || '';
    s2.booking.status = PK.STATUS.CANCEL; s2.booking.updated = now; s2.booking.eventId = '';
    ev.push({ type: 'cancelled', booking: s2.booking, prevEventId: pe });
    return { events: ev };
  }

  if (a.a === 'decide') {
    if (!ctx.authorized) return fail('Zły PIN.', 'pin');
    var bk = null;
    for (var i = 0; i < db.bookings.length; i++) {
      var x = db.bookings[i];
      if ((a.id && x.id === a.id) || (!a.id && c && x.coupon === c.id && x.status === PK.STATUS.WAIT)) bk = x;
    }
    if (!bk) return fail('Nie znalazłem tej propozycji.');
    if (bk.status !== PK.STATUS.WAIT) return fail('Ta propozycja jest już rozpatrzona (' + bk.status + ').', 'stale');
    bk.status = a.d === 'no' ? PK.STATUS.NO : PK.STATUS.OK;
    bk.updated = now; bk.decided = now;
    ev.push({ type: a.d === 'no' ? 'rejected' : 'approved', booking: bk });
    return { events: ev };
  }

  if (a.a === 'redeem') {
    if (!ctx.authorized) return fail('Zły PIN.', 'pin');
    if (!c || c.type !== 'free' || c.mode === 'unlimited') return fail('Tego talonu nie realizuje się PIN-em.');
    var s3 = pkCouponState(db.bookings, c.id, today);
    if (s3.state === 'done') return fail('Ten talon jest już zrealizowany.');
    var bb = s3.booking;
    if (bb) {
      var pe3 = bb.eventId || '', pd3 = bb.date;
      bb.status = PK.STATUS.DONE; bb.date = today; bb.updated = now; bb.done = now;
      ev.push({ type: 'done', booking: bb, prevEventId: pe3, prevDate: pd3 });
    } else {
      var n3 = pkClean(a.note), o3 = pkClean(a.option, 60);
      if (c.mode === 'wish' && !n3) return fail('Wpisz, czego sobie życzysz.');
      if (!pkOptionOk(c, o3)) return fail('Wybierz: ' + c.optionLabel.toLowerCase());
      bb = { id: pkId(), coupon: c.id, status: PK.STATUS.DONE, date: today, note: n3, option: o3, created: now, updated: now, done: now, eventId: '' };
      db.bookings.push(bb);
      ev.push({ type: 'done', booking: bb });
    }
    return { events: ev };
  }

  return fail('Nieznana akcja.');
}

if (typeof module !== 'undefined') module.exports = { PK: PK, pkValidate: pkValidate, pkCouponState: pkCouponState, pkMonthPaid: pkMonthPaid, pkAddDays: pkAddDays, pkCurrent: pkCurrent, pkApply: pkApply, pkLastRejected: pkLastRejected };

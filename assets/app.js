/* 21 urodziny Pookie — logika strony */
(function () {
  'use strict';

  var CFG = PK_CONFIG, S = PK.STATUS;
  var DEMO = !CFG.API_URL;
  var DEMO_PIN = '0000';
  var app = document.getElementById('app');
  var MON_SHORT = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
  var DOW = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'];

  var st = { bookings: [], opened: [], hugs: 0, today: localToday(), loaded: false, error: null };
  var ui = resetUi();
  var busy = false;

  function resetUi() {
    return { calMonth: null, sel: null, opt: '', note: '', editing: false, pin: null, hint: '', hintWarn: false, wx: ui ? ui.wx : null, homeMonth: ui ? ui.homeMonth : null, filter: ui ? ui.filter : 'all', homeSel: null };
  }

  /* ---------- narzędzia ---------- */
  function localToday() { var d = new Date(); return pkStr(d.getFullYear(), d.getMonth() + 1, d.getDate()); }
  function ic(n) { return PK_ICONS[n] || ''; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function shortDate(s) { var p = pkParse(s); return p.d + ' ' + MON_SHORT[p.m - 1]; }
  function weekday(s) {
    var p = pkParse(s); var d = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
    return ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'][d];
  }
  function monthTitle(key) { var y = +key.slice(0, 4), m = +key.slice(5, 7); return PK.MONTHS[m - 1] + ' ' + y; }
  function addMonths(key, n) {
    var y = +key.slice(0, 4), m = +key.slice(5, 7) - 1 + n;
    y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    return y + '-' + pkPad(m + 1);
  }
  function couponUrl(c) { return '#t/' + c.id; }

  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('is-on');
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('is-on'); }, 3200);
  }

  function petals() {
    var box = document.getElementById('petals');
    var cols = ['#C6A8DB', '#B391CC', '#E2D2EF', '#FFFFFF', '#D7C1E8'];
    for (var i = 0; i < 28; i++) {
      var p = document.createElement('div');
      p.className = 'petal';
      var col = cols[i % cols.length];
      p.innerHTML = '<svg viewBox="-6 -6 12 12" width="100%" height="100%">' +
        [0, 90, 180, 270].map(function (r) { return '<ellipse cx="0" cy="-2.6" rx="1.8" ry="2.6" fill="' + col + '" stroke="#CDBEDB" stroke-width=".3" transform="rotate(' + r + ')"/>'; }).join('') +
        '<circle r=".8" fill="#F6EEFA"/></svg>';
      var size = 10 + Math.random() * 12;
      p.style.width = p.style.height = size + 'px';
      p.style.left = (Math.random() * 100) + 'vw';
      p.style.setProperty('--dx', (Math.random() * 120 - 60) + 'px');
      p.style.setProperty('--rot', (Math.random() * 540 - 270) + 'deg');
      p.style.animationDuration = (3 + Math.random() * 3) + 's';
      p.style.animationDelay = (Math.random() * .8) + 's';
      box.appendChild(p);
      setTimeout(function (el) { el.remove(); }.bind(null, p), 7500);
    }
  }

  /* ---------- tryb podglądu (bez backendu) ---------- */
  var demo = {
    key: 'pk_demo_v1',
    mem: null,
    db: function () {
      try { var d = JSON.parse(localStorage.getItem(this.key)); if (d && d.bookings) return d; } catch (e) {}
      return this.mem ? JSON.parse(JSON.stringify(this.mem)) : { bookings: [], opened: [], hugs: 0 };
    },
    save: function (d) { this.mem = JSON.parse(JSON.stringify(d)); try { localStorage.setItem(this.key, JSON.stringify(d)); } catch (e) {} },
    withContent: function (d) {
      var C = window.PK_CONTENT || { coupons: [], letter: null };
      d.coupons = C.coupons; d.letter = C.letter; d.today = localToday(); return d;
    },
    state: function () { return this.withContent(this.db()); },
    act: function (body) {
      if (body.a === 'state') return this.state();
      var d = this.db();
      var res = pkApply(d, body, { today: localToday(), authorized: String(body.pin || '') === DEMO_PIN });
      if (res.error) { var e = new Error(res.error); e.code = res.code; throw e; }
      this.save(d);
      return this.withContent(d);
    }
  };

  /* ---------- API ---------- */
  function unwrap(res) {
    if (!res || !res.ok) { var e = new Error((res && res.error) || 'Coś nie pykło, spróbuj jeszcze raz.'); e.code = res && res.code; throw e; }
    return res.state;
  }
  /* sesja: token z serwera po zalogowaniu (e-mail + hasło) */
  var tokenMem = null;
  function getToken() { if (tokenMem) return tokenMem; try { return localStorage.getItem('pk_token'); } catch (e) { return null; } }
  function setToken(t) { tokenMem = t; try { if (t) localStorage.setItem('pk_token', t); else localStorage.removeItem('pk_token'); } catch (e) {} }
  function raw(body) {
    if (DEMO) return new Promise(function (ok) { setTimeout(ok, 250); }).then(function () {
      if (body.a === 'login') {
        if (String(body.password).trim() !== ((window.PK_CONTENT && window.PK_CONTENT.demoPassword) || '\u0000') || !(body.key || /@/.test(body.email || ''))) return { ok: false, code: 'login', error: 'Coś się nie zgadza 😏' };
        return { ok: true, token: 'demo', state: demo.state() };
      }
      try { return { ok: true, state: demo.act(body) }; } catch (e) { return { ok: false, code: e.code, error: e.message }; }
    });
    return fetch(CFG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); });
  }
  var api = {
    load: function () { return api.post({ a: 'state' }); },
    post: function (body) {
      body.token = getToken();
      return raw(body).then(function (res) {
        if (res && res.code === 'auth') { setToken(null); st.loaded = false; render(); }
        return unwrap(res);
      });
    },
    login: function (payload) {
      payload.a = 'login';
      return raw(payload).then(function (res) {
        if (!res || !res.ok) { var e = new Error((res && res.error) || 'Coś nie pykło.'); e.code = res && res.code; throw e; }
        setToken(res.token); return res.state;
      });
    }
  };
  function setState(s) {
    if (s.coupons && s.coupons.length) PK.COUPONS = s.coupons;
    if (s.letter) st.letter = s.letter;
    st.bookings = s.bookings || []; st.opened = s.opened || []; st.hugs = +s.hugs || 0;
    st.today = s.today || localToday(); st.loaded = true; st.error = null;
  }
  function act(body, okMsg, celebrate) {
    if (busy) return Promise.resolve(false);
    busy = true; render();
    return api.post(body).then(function (s) {
      setState(s); busy = false;
      if (okMsg) toast(okMsg);
      if (celebrate) petals();
      return true;
    }).catch(function (e) {
      busy = false;
      if (e.code === 'pin') { ui.pinErr = 'To nie ten PIN. Spróbuj jeszcze raz.'; }
      else toast(e.message || 'Coś nie pykło, spróbuj jeszcze raz.');
      render();
      return false;
    });
  }

  /* ---------- pogoda (Open-Meteo, bez klucza) ---------- */
  var WX = {
    0: ['☀️', 'Słonecznie'], 1: ['🌤️', 'Prawie bezchmurnie'], 2: ['⛅', 'Częściowe zachmurzenie'], 3: ['☁️', 'Pochmurno'],
    45: ['🌫️', 'Mgła'], 48: ['🌫️', 'Mgła'], 51: ['🌦️', 'Mżawka'], 53: ['🌦️', 'Mżawka'], 55: ['🌧️', 'Mżawka'],
    61: ['🌧️', 'Słaby deszcz'], 63: ['🌧️', 'Deszcz'], 65: ['🌧️', 'Ulewa'], 66: ['🌧️', 'Marznący deszcz'], 67: ['🌧️', 'Marznący deszcz'],
    71: ['🌨️', 'Śnieg'], 73: ['🌨️', 'Śnieg'], 75: ['❄️', 'Śnieżyca'], 77: ['🌨️', 'Śnieg'],
    80: ['🌦️', 'Przelotny deszcz'], 81: ['🌧️', 'Przelotny deszcz'], 82: ['⛈️', 'Ulewa'], 85: ['🌨️', 'Śnieg'], 86: ['🌨️', 'Śnieg'],
    95: ['⛈️', 'Burza'], 96: ['⛈️', 'Burza'], 99: ['⛈️', 'Burza']
  };
  function loadWeather() {
    if (ui.wx || loadWeather.busy) return;
    loadWeather.busy = true;
    var u = 'https://api.open-meteo.com/v1/forecast?latitude=' + PK.WEATHER.lat + '&longitude=' + PK.WEATHER.lon +
      '&daily=weather_code,temperature_2m_max,precipitation_probability_max&timezone=Europe%2FWarsaw&forecast_days=16';
    fetch(u).then(function (r) { return r.json(); }).then(function (j) {
      var out = {};
      (j.daily.time || []).forEach(function (d, i) {
        out[d] = { code: j.daily.weather_code[i], t: Math.round(j.daily.temperature_2m_max[i]), p: j.daily.precipitation_probability_max[i] };
      });
      ui.wx = out; render();
    }).catch(function () { ui.wx = {}; });
  }
  function wxNice(w) { return w && w.code <= 3 && w.t >= 15 && (w.p == null || w.p < 40); }

  /* ---------- kalendarz ---------- */
  function markersFor(dates) {
    var m = {};
    st.bookings.forEach(function (b) {
      if (!pkIsActive(b)) return;
      var s = pkCouponState(st.bookings, b.coupon, st.today);
      if (!s.booking || s.booking.id !== b.id) return;
      var cls = s.state === 'wait' ? 'w' : s.state === 'done' ? 'd' : '';
      var c = pkCoupon(b.coupon), days = (c && c.days) || 1;
      for (var i = 0; i < days; i++) {
        var d = pkAddDays(b.date, i);
        (m[d] = m[d] || []).push({ cls: cls, b: b, c: c });
      }
    });
    return m;
  }

  function calendarHTML(o) {
    var key = o.month, y = +key.slice(0, 4), mo = +key.slice(5, 7);
    var first = new Date(Date.UTC(y, mo - 1, 1)).getUTCDay(); first = (first + 6) % 7;
    var dim = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    var marks = markersFor();
    var h = '<div class="cal"><div class="cal__head">' +
      '<button class="cal__nav" data-act="' + o.navAct + '" data-dir="-1" ' + (key <= o.minMonth ? 'disabled' : '') + ' aria-label="Poprzedni miesiąc">' + ic('caret-left') + '</button>' +
      '<div class="cal__title">' + monthTitle(key) + '</div>' +
      '<button class="cal__nav" data-act="' + o.navAct + '" data-dir="1" ' + (key >= o.maxMonth ? 'disabled' : '') + ' aria-label="Następny miesiąc">' + ic('caret-right') + '</button></div>';
    h += '<div class="cal__grid">' + DOW.map(function (d) { return '<div class="cal__dow">' + d + '</div>'; }).join('');
    for (var i = 0; i < first; i++) h += '<span class="cal__day is-empty"></span>';
    for (var d = 1; d <= dim; d++) {
      var ds = pkStr(y, mo, d), cls = ['cal__day'];
      var v = o.validate ? o.validate(ds) : { ok: ds >= st.today };
      if (!v.ok && o.validate) cls.push('is-off');
      if (!o.validate && ds < st.today) cls.push('is-past');
      if (ds === st.today) cls.push('is-today');
      if (ds === o.sel) cls.push('is-sel');
      var mk = marks[ds] || [];
      if (mk.length) cls.push('has-booking');
      var wx = o.wx && ui.wx && ui.wx[ds] ? '<span class="cal__wx">' + (WX[ui.wx[ds].code] || ['·'])[0] + '</span>' : '';
      h += '<button class="' + cls.join(' ') + '" data-act="' + o.dayAct + '" data-date="' + ds + '" aria-label="' + pkHuman(ds, true) + '">' + wx +
        '<span>' + d + '</span><span class="cal__dots">' + mk.slice(0, 3).map(function (x) { return '<i class="' + x.cls + '"></i>'; }).join('') + '</span></button>';
    }
    h += '</div>';
    h += '<div class="cal__hint' + (o.hintWarn ? ' is-warn' : '') + '">' + (o.hint || '') + '</div>';
    if (o.legend) h += '<div class="cal__legend"><span><i></i>zaplanowane</span><span><i class="w"></i>czeka na Adama</span><span><i class="d"></i>zrealizowane</span></div>';
    return h + '</div>';
  }

  function slotsHTML(key) {
    var mp = pkMonthPaid(st.bookings, key, null), mName = PK.MONTHS_LOC[+key.slice(5, 7) - 1];
    if (mp.big) return '<div class="slots">' + ic('suitcase-rolling') + '<span><b>' + capital(mName) + ' to miesiąc talonu „' + esc(pkBigName()) + '”</b></span></div>';
    var dots = '';
    for (var i = 0; i < PK.SMALL_PER_MONTH; i++) dots += '<span class="slot' + (i < mp.small ? ' on' : '') + '"></span>';
    return '<div class="slots"><span>Na mój koszt w ' + mName + ':</span>' + dots + '<b>' + mp.small + '/' + PK.SMALL_PER_MONTH + '</b></div>';
  }
  function capital(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  /* ---------- bramka ---------- */
  function gateOpen() { return !!getToken(); }
  function renderGate() {
    var cardKey = routeKey(), cardId = route();
    app.innerHTML =
      '<section class="gate fade-in">' +
      '<img class="gate__img" src="assets/deco/bouquet.svg" alt="">' +
      '<h1>21 urodziny</h1>' +
      '<div class="gate__name">Pookie</div>' +
      '<form id="gateForm" class="gate__form" autocomplete="on">' +
      (cardKey ? '' : '<input id="gateEmail" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" aria-label="Twój e-mail" placeholder="Twój e-mail">') +
      '<div class="gate__row"><input id="gatePw" type="password" inputmode="numeric" maxlength="20" autocomplete="current-password" aria-label="Hasło" placeholder="Hasło">' +
      '<button class="btn btn--round" aria-label="Wejdź">' + ic('heart') + '</button></div></form>' +
      '<p class="gate__hint">Hasło? Twoje ulubione 😏</p>' +
      '</section>';
    var f = document.getElementById('gateForm'), em = document.getElementById('gateEmail'), inp = document.getElementById('gatePw');
    setTimeout(function () { (em || inp).focus(); }, 300);
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      if (busy) return;
      if (em && !em.value.trim()) { em.focus(); return; }
      busy = true;
      var payload = cardKey ? { coupon: cardId, key: cardKey, password: inp.value.trim() } : { email: em.value.trim(), password: inp.value.trim() };
      api.login(payload).then(function (state) {
        busy = false; stripKey(); setState(state); petals(); afterLoad();
      }).catch(function (er) {
        busy = false;
        inp.value = ''; f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake');
        toast(er.message || 'Coś się nie zgadza 😏');
      });
    });
  }

  /* ---------- strona główna ---------- */
  function statePill(c) {
    if (c.mode === 'unlimited') return '<span class="pill">' + ic('heart') + (st.hugs ? 'Użyty ' + st.hugs + '× · bez limitu' : 'Bez limitu') + '</span>';
    var s = pkCouponState(st.bookings, c.id, st.today);
    if (s.state === 'wait') return '<span class="pill pill--wait">' + ic('clock') + 'Czeka na Adama</span>';
    if (s.state === 'planned') return '<span class="pill pill--planned">' + ic('calendar-heart') + shortDate(s.booking.date) + '</span>';
    if (s.state === 'done') return '<span class="pill pill--done">' + ic('check') + 'Zrealizowany</span>';
    return '<span class="pill">Do wykorzystania</span>';
  }

  function envelopeHTML(c) {
    var no = 'Nº ' + pkPad(c.no);
    if (st.opened.indexOf(c.id) < 0) {
      return '<button class="env env--sealed" data-act="sealed">' +
        '<span class="env__no">' + no + '</span>' +
        '<span class="seal">' + ic('heart') + '</span>' +
        '<span class="env__teaser">' + esc(c.teaser) + '</span>' +
        '<span class="env__scan">zeskanuj kartę</span></button>';
    }
    return '<a class="env" href="' + couponUrl(c) + '" style="text-decoration:none;color:inherit">' +
      '<span class="env__no">' + no + '</span>' +
      '<span class="env__icon">' + ic(c.icon) + '</span>' +
      '<span class="env__name">' + esc(c.name) + '</span>' +
      '<span class="env__state">' + statePill(c) + '</span></a>';
  }

  function renderHome() {
    var opened = st.opened.length, total = PK.COUPONS.length;
    var list = PK.COUPONS.filter(function (c) { return ui.filter === 'all' || c.type === ui.filter; });
    var h = '<div class="fade-in">';
    h += '<header class="hero"><img class="hero__img" src="assets/deco/bouquet.svg" alt="">' +
      '<span class="eyebrow">21 urodziny · 17 października 2026</span>' +
      '<div class="hero__name">Pookie</div>' +
      '<p class="hero__sub">21 talonów na rzeczy, które zrobimy razem. Każda karta ma swój kod, a za każdym kodem jest coś dla ciebie.</p></header>';

    var L = st.letter;
    if (L && L.paragraphs && L.paragraphs.length) {
      h += '<section class="section"><div class="panel letter"><div class="letter__hi">' + esc(L.hi || 'Kochana Pookie,') + '</div>' +
        L.paragraphs.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') +
        '<div class="letter__sign">' + esc(L.sign || 'Adam') + '</div></div></section>';
    }

    h += '<section class="section"><div class="section__head"><img class="divider" src="assets/deco/divider.svg" alt=""><span class="eyebrow">Twoje talony</span><h2>21 kopert</h2></div>' +
      '<div class="progress"><span>Otwarte ' + opened + ' z ' + total + '</span><span class="progress__bar"><i style="width:' + Math.round(opened / total * 100) + '%"></i></span></div>' +
      '<div class="filter">' +
      [['all', 'Wszystkie'], ['paid', 'Na mój koszt'], ['free', 'Od serca']].map(function (f) {
        return '<button class="chip" data-act="filter" data-v="' + f[0] + '" aria-pressed="' + (ui.filter === f[0]) + '">' + f[1] + '</button>';
      }).join('') + '</div>' +
      '<div class="grid">' + list.map(envelopeHTML).join('') + '</div></section>';

    // kalendarz
    var hm = ui.homeMonth || st.today.slice(0, 7);
    h += '<section class="section"><div class="section__head"><span class="eyebrow">Plany</span><h2>Nasz kalendarz</h2></div><div class="panel">';
    h += slotsHTML(hm);
    var hint = '';
    if (ui.homeSel) {
      var items = (markersFor()[ui.homeSel] || []);
      hint = items.length ? items.map(function (x) { return esc(x.c.name); }).join(' · ') : pkHuman(ui.homeSel) + ': nic jeszcze nie ma';
    } else hint = 'Dotknij dnia, żeby zobaczyć, co zaplanowane';
    h += calendarHTML({ month: hm, minMonth: st.today.slice(0, 7), maxMonth: addMonths(st.today.slice(0, 7), 18), navAct: 'homeNav', dayAct: 'homeDay', sel: ui.homeSel, hint: hint, legend: true });
    var upcoming = st.bookings.filter(function (b) {
      var s = pkCouponState(st.bookings, b.coupon, st.today);
      return s.booking && s.booking.id === b.id && (s.state === 'wait' || s.state === 'planned');
    }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    if (upcoming.length) {
      h += '<div class="agenda">' + upcoming.slice(0, 8).map(function (b) {
        var c = pkCoupon(b.coupon), p = pkParse(b.date);
        var s = pkCouponState(st.bookings, b.coupon, st.today);
        return '<a class="agenda__item" href="' + couponUrl(c) + '"><span class="agenda__date"><b>' + p.d + '</b><span>' + MON_SHORT[p.m - 1] + '</span></span>' +
          '<span><span class="agenda__name">' + esc(c.name) + '</span><br><span class="agenda__meta">' + (s.state === 'wait' ? 'czeka na Adama' : 'zatwierdzone') + (b.option ? ' · ' + esc(b.option) : '') + '</span></span></a>';
      }).join('') + '</div>';
    }
    h += '</div></section>';

    // zasady
    h += '<section class="section"><div class="section__head"><span class="eyebrow">Drobny druk</span><h2>Zasady gry</h2></div><div class="panel rules">' +
      rule('calendar-heart', '<b>Na mój koszt</b> – maksymalnie 2 w miesiącu, od ' + pkHuman(PK.PAID_FROM) + '. Planujemy je co najmniej ' + PK.LEAD_SMALL + ' dni wcześniej.') +
      rule('heart', '<b>Od serca</b> – możesz je wykorzystać nawet dziś. Mówisz mi hasło z talonu, a ja potwierdzam swoim PIN‑em.') +
      rule('envelope-simple', 'Termin wybierasz <b>ty</b>, a ja go zatwierdzam. Zawsze możesz go zmienić albo odwołać.') +
      rule('sparkle', 'Niektóre talony mają <b>swoje dodatkowe zasady</b>. Przeczytasz je po otwarciu koperty.') +
      '</div></section>';
    h += '<footer class="footer"><img src="assets/deco/gyp.svg" alt=""><div class="script">Kocham Cię, Adam</div><div class="small">Talony ważne bez terminu.</div></footer>';
    h += '</div>';
    app.innerHTML = h + demoBar();
  }
  function rule(icon, text) { return '<div class="rule"><span class="rule__ic">' + ic(icon) + '</span><p>' + text + '</p></div>'; }
  function demoBar() { return DEMO ? '<div class="demo-bar">Podgląd · dane tylko w tej przeglądarce · PIN 0000</div>' : ''; }

  /* ---------- karta powitalna (Nº 00) ---------- */
  function renderWelcome() {
    var L = st.letter, h = '<div class="fade-in">';
    h += '<header class="hero"><img class="hero__img" src="assets/deco/bouquet.svg" alt="">' +
      '<span class="eyebrow">Wszystkiego najlepszego</span>' +
      '<div class="hero__name">Pookie</div>' +
      '<p class="hero__sub">Dziś kończysz 21 lat, więc mam dla ciebie 21 rzeczy, które zrobimy razem.</p></header>';
    if (L && L.paragraphs && L.paragraphs.length) {
      h += '<section class="section"><div class="panel letter"><div class="letter__hi">' + esc(L.hi || 'Kochana Pookie,') + '</div>' +
        L.paragraphs.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') +
        '<div class="letter__sign">' + esc(L.sign || 'Adam') + '</div></div></section>';
    }
    h += '<section class="section"><div class="section__head"><img class="divider" src="assets/deco/divider.svg" alt=""><span class="eyebrow">Zanim zaczniesz</span><h2>Jak to działa</h2></div><div class="panel rules">' +
      rule('envelope-simple', 'Masz <b>21 kart</b>. Każda to talon na coś, co zrobimy razem. Zeskanuj kartę, a jej koperta otworzy się na stronie.') +
      rule('calendar-heart', 'Przy każdym talonie <b>wybierasz termin</b> w kalendarzu, a ja go zatwierdzam. Zaplanowane dodasz do swojego kalendarza jednym kliknięciem.') +
      rule('heart', 'Talony <b>od serca</b> realizujesz kiedy chcesz, nawet dziś. Mówisz mi hasło, które pokaże ci strona, a ja potwierdzam swoim PIN‑em.') +
      rule('sparkle', 'Talony <b>na mój koszt</b> ruszają od ' + pkHuman(PK.PAID_FROM) + ', maksymalnie 2 w miesiącu. Nie musisz niczego wykorzystywać od razu, talony są ważne bez terminu.') +
      '</div></section>';
    h += '<div style="margin-top:28px"><a class="btn btn--block" href="#">' + ic('heart') + 'Do moich kopert</a></div>';
    h += '<footer class="footer"><img src="assets/deco/gyp.svg" alt=""><div class="script">Kocham Cię, Adam</div></footer></div>';
    app.innerHTML = h + demoBar();
  }

  /* ---------- strona talonu ---------- */
  function firstAllowedMonth(c) {
    var start = st.today;
    if (c.type === 'paid') {
      var lead = c.size === 'big' ? PK.LEAD_BIG : PK.LEAD_SMALL;
      var e = pkAddDays(st.today, lead);
      start = e > PK.PAID_FROM ? e : PK.PAID_FROM;
      if (c.season) {
        var p = pkParse(start);
        if (PK.SEASON_MONTHS.indexOf(p.m) < 0) start = (p.m > 9 ? p.y + 1 : p.y) + '-05-01';
      }
    }
    return start.slice(0, 7);
  }

  function couponRules(c) {
    if (c.type === 'free') {
      if (c.mode === 'unlimited') return 'Bez limitu i bez PIN‑u. Używaj, ile chcesz.';
      if (c.mode === 'instant') return 'Działa od ręki, bez rezerwacji. Jednorazowy, więc użyj go mądrze.';
      return 'Możesz go wykorzystać nawet dziś. W dniu realizacji mówisz mi hasło, a ja potwierdzam PIN‑em.';
    }
    if (c.size === 'big') return 'Ten talon ma miesiąc tylko dla siebie. Planujemy go co najmniej 2 tygodnie wcześniej, najwcześniej od ' + pkHuman(PK.PAID_FROM) + '.';
    if (c.season) return 'Tylko od maja do września, maksymalnie 2 talony na mój koszt w miesiącu i co najmniej ' + PK.LEAD_SMALL + ' dni wcześniej.';
    return 'Maksymalnie 2 talony na mój koszt w miesiącu, co najmniej ' + PK.LEAD_SMALL + ' dni wcześniej, najwcześniej od ' + pkHuman(PK.PAID_FROM) + '.';
  }

  function secretHTML(c, locked, lockedText) {
    if (locked) {
      return '<div class="secret secret--locked"><div class="secret__label">Hasło do powiedzenia</div><div class="secret__phrase">• • • • •</div>' +
        '<div class="secret__reply">' + lockedText + '</div></div>';
    }
    return '<div class="secret"><div class="secret__label">Powiedz Adamowi na głos</div>' +
      '<div class="secret__phrase">„' + esc(c.password) + '”</div>' +
      (c.reply ? '<div class="secret__reply">On musi odpowiedzieć:<br><b>„' + esc(c.reply) + '”</b></div>' : '') + '</div>';
  }

  function pinHTML(label, action) {
    return '<div class="pin"><div class="pin__label">' + ic('lock-simple') + esc(label) + '</div>' +
      '<input id="pinInput" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" data-pin-act="' + action + '" placeholder="····" ' + (busy ? 'disabled' : '') + '>' +
      '<div class="pin__err">' + esc(ui.pinErr || '') + '</div></div>';
  }

  function calLinks(c, b) {
    var end = pkAddDays(pkEndDate(b), 1);
    var title = c.name + ' 💜';
    var det = 'Talon z 21 urodzin. ' + (b.option ? 'Kierunek: ' + b.option + '. ' : '') + (b.note ? b.note : '');
    var g = 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(title) +
      '&dates=' + b.date.replace(/-/g, '') + '/' + end.replace(/-/g, '') + '&details=' + encodeURIComponent(det);
    return '<div class="muted small" style="text-align:center;margin-top:18px">Dodaj do swojego kalendarza</div><div class="btn-row" style="margin-top:8px">' +
      '<a class="btn btn--soft btn--sm" href="' + g + '" target="_blank" rel="noopener">' + ic('google-logo') + 'Google</a>' +
      (DEMO ? '<button class="btn btn--soft btn--sm" data-act="ics">' + ic('apple-logo') + 'iPhone</button>'
        : '<a class="btn btn--soft btn--sm" href="' + CFG.API_URL + '?a=ics&id=' + encodeURIComponent(b.id) + '">' + ic('apple-logo') + 'iPhone</a>') + '</div>';
  }

  function downloadIcs(c, b) {
    var end = pkAddDays(pkEndDate(b), 1);
    var ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//pookie21//PL', 'BEGIN:VEVENT',
      'UID:' + b.id + '@pookie21', 'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z',
      'DTSTART;VALUE=DATE:' + b.date.replace(/-/g, ''), 'DTEND;VALUE=DATE:' + end.replace(/-/g, ''),
      'SUMMARY:' + c.name + ' 💜', 'DESCRIPTION:Talon z 21 urodzin' + (b.option ? ' – ' + b.option : ''),
      'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    var blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = c.id + '.ics';
    document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 500);
  }

  function weatherHTML(date) {
    if (!ui.wx) return '<div class="wx"><span class="wx__emoji">🌤️</span><div class="small">Sprawdzam prognozę…</div></div>';
    var w = ui.wx[date];
    if (!w) {
      var days = pkDiffDays(st.today, date);
      return '<div class="wx"><span class="wx__emoji">🌤️</span><div><b>Prognoza pojawi się na 2 tygodnie przed terminem</b><div class="small">Jeszcze ' + days + ' dni. Trzymam kciuki za słońce.</div></div></div>';
    }
    var x = WX[w.code] || ['🌤️', 'Pogoda'];
    return '<div class="wx"><span class="wx__emoji">' + x[0] + '</span><div><b>' + x[1] + ', ' + w.t + '°C</b><div class="small">Szansa opadów: ' + (w.p == null ? '–' : w.p + '%') + ' · ' + PK.WEATHER.place + '</div>' +
      '<div class="small">' + (wxNice(w) ? 'Wygląda na idealny dzień 🌞' : 'Może nie być idealnie. Jeśli chcesz, zmień termin.') + '</div></div></div>';
  }

  function renderCoupon(id) {
    var c = pkCoupon(id);
    if (!c) { location.hash = ''; return; }
    if (c.weather) loadWeather();
    var s = pkCouponState(st.bookings, c.id, st.today), b = s.booking;
    var h = '<div class="fade-in">';
    h += '<div class="topbar"><a class="linkbtn" href="#">' + ic('arrow-left') + 'Wszystkie talony</a><span class="eyebrow">Nº ' + pkPad(c.no) + ' / 21</span></div>';
    h += '<section class="panel coupon-hero"><img class="coupon-hero__deco" src="assets/deco/corner.svg" alt=""><img class="coupon-hero__deco coupon-hero__deco--l" src="assets/deco/corner.svg" alt="">' +
      '<div class="coupon-hero__icon">' + ic(c.icon) + '</div>' +
      '<span class="eyebrow">' + (c.type === 'paid' ? 'Na mój koszt' : 'Od serca') + '</span>' +
      '<h1>' + esc(c.name) + '</h1><p>' + esc(c.desc) + '</p>' + statePill(c) + '</section>';

    h += '<section class="panel block">';
    if (c.mode === 'unlimited') {
      h += secretHTML(c) +
        '<div style="text-align:center;margin-top:18px"><button class="btn btn--block" data-act="hug" ' + (busy ? 'disabled' : '') + '>' + ic('hand-heart') + 'Powiedziałam to na głos</button>' +
        '<div style="margin-top:20px" class="muted small">Przytulasy wykorzystane do tej pory</div><div class="hug-count">' + st.hugs + '</div></div>';
    } else if (c.mode === 'instant') {
      if (s.state === 'done') h += doneHTML(c, b);
      else h += secretHTML(c) + pinHTML('Adam wpisuje PIN i kłótnia jest twoja', 'redeem');
    } else {
      h += bookingBlock(c, s);
    }
    h += '</section>';
    h += '<div class="note">' + ic('info') + '<span>' + couponRules(c) + '</span></div>';
    h += '</div>';
    app.innerHTML = h + demoBar();
    var pin = document.getElementById('pinInput');
    if (pin && ui.focusPin) { pin.focus(); ui.focusPin = false; }
  }

  function doneHTML(c, b) {
    return '<div class="status-card"><span class="pill pill--done">' + ic('check') + 'Zrealizowany</span>' +
      '<div class="status-card__date">' + pkHuman(b.date, true) + '</div>' +
      (b.option ? '<div class="muted">' + esc(b.option) + '</div>' : '') +
      (b.note ? '<div class="status-card__note">„' + esc(b.note) + '”</div>' : '') +
      '<p class="muted" style="margin-top:14px">Dziękuję, że to było z tobą 💜</p></div>';
  }

  function bookingBlock(c, s) {
    var b = s.booking, h = '';
    if (s.state === 'done') return doneHTML(c, b);

    if ((s.state === 'wait' || s.state === 'planned') && !ui.editing) {
      var dueToday = b.date <= st.today;
      h += '<div class="status-card">' + (s.state === 'wait'
        ? '<span class="pill pill--wait">' + ic('clock') + 'Czeka na decyzję Adama</span>'
        : '<span class="pill pill--planned">' + ic('calendar-heart') + 'Zaplanowane</span>') +
        '<div class="status-card__date">' + pkHuman(b.date) + (c.days > 1 ? '–' + pkHuman(pkEndDate(b)) : '') + '</div>' +
        '<div class="muted">' + weekday(b.date) + (b.option ? ' · ' + esc(b.option) : '') + '</div>' +
        (b.note ? '<div class="status-card__note">„' + esc(b.note) + '”</div>' : '') + '</div>';
      if (c.weather) h += weatherHTML(b.date);
      if (s.state === 'planned') h += calLinks(c, b);

      if (c.type === 'free') {
        h += '<div style="margin-top:22px">';
        if (dueToday) h += secretHTML(c) + pinHTML('Adam wpisuje PIN i talon jest zrealizowany', 'redeem');
        else h += secretHTML(c, true, 'Hasło pokaże się ' + pkHuman(b.date) + ', w dniu realizacji.');
        h += '</div>';
      }
      if (s.state === 'wait' && !(c.type === 'free' && dueToday)) {
        h += ui.pin === 'approve'
          ? pinHTML('Adam wpisuje PIN, żeby zatwierdzić termin', 'approve')
          : '<button class="btn btn--soft btn--block" style="margin-top:16px" data-act="showPin" data-v="approve">' + ic('lock-simple') + 'Adam jest obok? Zatwierdź PIN‑em</button>';
      }
      h += '<div class="btn-row" style="margin-top:18px"><button class="btn btn--ghost btn--sm" data-act="edit">' + ic('arrows-clockwise') + 'Zmień termin</button>' +
        '<button class="btn btn--ghost btn--sm" data-act="cancel">' + ic('x') + 'Odwołaj</button></div>';
      return h;
    }

    // wybór terminu
    var rej = pkLastRejected(st.bookings, c.id);
    if (rej && !ui.editing) h += '<div class="summary" style="margin:0 0 16px">' + ic('info') + '<span>Adam poprosił o inny termin niż ' + pkHuman(rej.date) + '. Wybierz nowy 💜</span></div>';
    h += '<div class="block__title">' + (ui.editing ? 'Nowy termin' : 'Kiedy?') + '</div>' +
      '<div class="block__sub">' + (c.type === 'paid' ? 'Wybierz dzień, a ja dostanę propozycję do zatwierdzenia.' : 'Może być nawet dziś.') + '</div>';
    var minM = firstAllowedMonth(c);
    var month = ui.calMonth || minM;
    var validate = function (d) { return pkValidate(c.id, d, st.bookings, st.today); };
    h += calendarHTML({ month: month, minMonth: st.today.slice(0, 7), maxMonth: addMonths(st.today.slice(0, 7), 18), navAct: 'nav', dayAct: 'day', sel: ui.sel, validate: validate, hint: ui.hint, hintWarn: ui.hintWarn, wx: !!c.weather });
    if (c.weather && ui.sel) h += weatherHTML(ui.sel);

    if (c.options) {
      h += '<div class="field"><label>' + esc(c.optionLabel) + '</label><div class="opts">' + c.options.map(function (o) {
        return '<button class="chip" data-act="opt" data-v="' + esc(o) + '" aria-pressed="' + (ui.opt === o) + '">' + esc(o) + '</button>';
      }).join('') + '</div></div>';
    }
    if (c.mode === 'wish' || c.noteLabel) {
      h += '<div class="field"><label for="noteInput">' + esc(c.noteLabel || 'Coś jeszcze?') + (c.mode === 'wish' ? '' : ' <span class="muted small">(opcjonalnie)</span>') + '</label>' +
        '<textarea id="noteInput" rows="' + (c.mode === 'wish' ? 3 : 2) + '" maxlength="300" placeholder="' + (c.mode === 'wish' ? 'np. śniadanie na mieście i długi spacer' : '') + '">' + esc(ui.note) + '</textarea></div>';
    }

    var ready = !!ui.sel && (!c.options || !!ui.opt) && (c.mode !== 'wish' || !!ui.note.trim());
    if (ui.sel) h += '<div class="summary">' + ic('calendar-heart') + '<span><b>' + capital(weekday(ui.sel)) + ', ' + pkHuman(ui.sel, true) + '</b>' + (c.days > 1 ? ' – ' + pkHuman(pkAddDays(ui.sel, c.days - 1)) : '') + (ui.opt ? '<br>' + esc(ui.opt) : '') + '</span></div>';

    h += '<div style="margin-top:18px;display:grid;gap:10px">';
    if (c.type === 'free' && ui.sel === st.today) {
      if (ui.pin === 'now') {
        h += secretHTML(c) + pinHTML('Adam wpisuje PIN i realizujemy', 'redeemNow');
      } else {
        h += '<button class="btn btn--block" data-act="showPin" data-v="now" ' + (ready && !busy ? '' : 'disabled') + '>' + ic('heart') + 'Realizujemy teraz</button>';
        h += '<button class="btn btn--ghost btn--block" data-act="book" ' + (ready && !busy ? '' : 'disabled') + '>' + ic('envelope-simple') + 'Wyślij propozycję Adamowi</button>';
      }
    } else {
      h += '<button class="btn btn--block" data-act="book" ' + (ready && !busy ? '' : 'disabled') + '>' + ic('envelope-simple') + (ui.editing ? 'Wyślij nowy termin' : 'Wyślij propozycję Adamowi') + '</button>';
    }
    if (ui.editing) h += '<button class="btn btn--ghost btn--block" data-act="stopEdit">Zostaw jak było</button>';
    h += '</div>';
    return h;
  }

  /* ---------- obsługa kliknięć ---------- */
  function route() { var m = location.hash.match(/^#t\/([a-z0-9-]+)/); return m ? m[1] : null; }
  function routeKey() { var m = location.hash.match(/^#t\/[a-z0-9-]+\/([A-Za-z0-9_-]+)/); return m ? m[1] : null; }
  function stripKey() { var id = route(); if (id && routeKey()) { try { history.replaceState(null, '', location.pathname + location.search + '#t/' + id); } catch (e) {} } }

  app.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act]');
    if (!t || t.disabled) return;
    var a = t.getAttribute('data-act'), id = route(), c = id && pkCoupon(id);
    switch (a) {
      case 'sealed': toast('Ta koperta otworzy się, kiedy zeskanujesz jej kartę 💌'); break;
      case 'filter': ui.filter = t.getAttribute('data-v'); render(); break;
      case 'homeNav': ui.homeMonth = addMonths(ui.homeMonth || st.today.slice(0, 7), +t.getAttribute('data-dir')); ui.homeSel = null; render(); break;
      case 'homeDay': ui.homeSel = t.getAttribute('data-date'); render(); break;
      case 'nav': ui.calMonth = addMonths(ui.calMonth || firstAllowedMonth(c), +t.getAttribute('data-dir')); render(); break;
      case 'day':
        var d = t.getAttribute('data-date'), v = pkValidate(c.id, d, st.bookings, st.today);
        if (v.ok) { ui.sel = d; ui.hint = ''; ui.hintWarn = false; ui.pin = null; }
        else { ui.hint = v.reason; ui.hintWarn = true; }
        render(); break;
      case 'opt': ui.opt = t.getAttribute('data-v'); render(); break;
      case 'edit':
        var cb = pkCurrent(st.bookings, c.id);
        ui.editing = true; ui.sel = null; ui.opt = (cb && cb.option) || ''; ui.note = (cb && cb.note) || ''; ui.calMonth = cb ? cb.date.slice(0, 7) : null; ui.hint = ''; render(); break;
      case 'stopEdit': ui.editing = false; ui.sel = null; render(); break;
      case 'showPin': ui.pin = t.getAttribute('data-v'); ui.pinErr = ''; ui.focusPin = true; render(); break;
      case 'book':
        act({ a: 'book', coupon: c.id, date: ui.sel, note: ui.note, option: ui.opt }, ui.editing ? 'Nowy termin poleciał do Adama 💌' : 'Propozycja poleciała do Adama 💌', true)
          .then(function (ok) { if (ok) { var keep = ui; ui = resetUi(); ui.wx = keep.wx; render(); } });
        break;
      case 'cancel':
        if (!confirm('Na pewno odwołać ten termin? Talon wróci do wykorzystania.')) return;
        act({ a: 'cancel', coupon: c.id }, 'Odwołane. Talon czeka na nowy termin.').then(function (ok) { if (ok) { var keep = ui; ui = resetUi(); ui.wx = keep.wx; render(); } });
        break;
      case 'hug':
        act({ a: 'hug' }, 'Przytulas w drodze 🫶', true).then(render);
        break;
      case 'ics': var cur = pkCurrent(st.bookings, c.id); if (cur) downloadIcs(c, cur); break;
    }
  });

  app.addEventListener('input', function (e) {
    if (e.target.id === 'noteInput') {
      var had = !!ui.note.trim(); ui.note = e.target.value;
      var c = pkCoupon(route());
      if (c && c.mode === 'wish' && had !== !!ui.note.trim()) { var pos = e.target.selectionStart; render(); var n = document.getElementById('noteInput'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }
    }
    if (e.target.id === 'pinInput') {
      var v = e.target.value.replace(/\D/g, '').slice(0, 4);
      e.target.value = v; ui.pinErr = '';
      if (v.length === 4) {
        var c2 = pkCoupon(route()), what = e.target.getAttribute('data-pin-act');
        var body = what === 'approve' ? { a: 'decide', coupon: c2.id, d: 'ok', pin: v }
          : what === 'redeemNow' ? { a: 'redeem', coupon: c2.id, note: ui.note, pin: v }
          : { a: 'redeem', coupon: c2.id, pin: v };
        var msg = what === 'approve' ? 'Zatwierdzone! Widzimy się ' + pkHuman((pkCurrent(st.bookings, c2.id) || {}).date || st.today) + ' 💜' : 'Zrealizowane! 💜';
        act(body, msg, true).then(function (ok) {
          if (ok) { var keep = ui; ui = resetUi(); ui.wx = keep.wx; render(); }
          else { ui.focusPin = true; render(); }
        });
      }
    }
  });

  /* ---------- render / start ---------- */
  function render() {
    if (!gateOpen()) return renderGate();
    if (!st.loaded) {
      app.innerHTML = st.error
        ? '<div class="panel" style="margin-top:60px;text-align:center"><h3>Ups, nie mogę się połączyć</h3><p class="muted">' + esc(st.error) + '</p><button class="btn" onclick="location.reload()">Spróbuj jeszcze raz</button></div>'
        : '<div class="spinner"></div>';
      return;
    }
    var id = route();
    if (id === 'start') renderWelcome(); else if (id) renderCoupon(id); else renderHome();
  }

  function onRoute() {
    var keep = ui; ui = resetUi(); ui.wx = keep.wx; ui.homeMonth = keep.homeMonth; ui.filter = keep.filter;
    window.scrollTo(0, 0);
    var id = route();
    if (id && st.loaded && pkCoupon(id) && st.opened.indexOf(id) < 0) {
      st.opened.push(id);
      api.post({ a: 'open', coupon: id }).then(setState).catch(function () {});
    }
    render();
  }

  function afterLoad() {
    var id = route();
    if (id && pkCoupon(id) && st.opened.indexOf(id) < 0) {
      st.opened.push(id);
      api.post({ a: 'open', coupon: id }).then(function (s2) { setState(s2); render(); }).catch(function () {});
    }
    render();
  }

  function boot() {
    if (!gateOpen()) return render();
    stripKey();
    render();
    api.load().then(function (s) { setState(s); afterLoad(); })
      .catch(function (e) { if (gateOpen()) { st.error = e.message || 'Brak połączenia.'; render(); } });
  }

  window.addEventListener('hashchange', onRoute);
  // odświeżanie stanu po powrocie do karty (np. Adam zatwierdził z maila)
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && st.loaded && !busy) api.load().then(function (s) { setState(s); if (!document.getElementById('pinInput') && !document.getElementById('noteInput')) render(); }).catch(function () {});
  });
  boot();
})();

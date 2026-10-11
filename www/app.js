// YWAM - TRICHY phone app. Runs inside the Android app (WebView) and also in any phone browser
// at  http://<server>:4000/m/ . It talks to the office server's /api/mobile API.
(function () {
  'use strict';
  var VERSION = '1.0';
  var LS_KEY = 'ywamMobileCfg';

  // ---------- helpers ----------
  function $(s, el) { return (el || document).querySelector(s); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function randId() {
    var a = new Uint8Array(12);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return 'P-' + Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('').toUpperCase();
  }
  var toastTimer;
  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.className = 'on';
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.className = ''; }, 2600);
  }
  function loadCfg() { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (e) { return {}; } }
  function saveCfg() { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); }

  var cfg = loadCfg();            // { server, key, machineId, label }
  var boot = null;                // categories, themes, header lines
  var people = [];                // lite list
  var stack = [];                 // screens: { name, params }
  var ui = { q: '', cat: '', month: '', att: {}, attQ: '' };

  var SAME_ORIGIN_APP = /^https?:$/.test(location.protocol);
  function base() { return cfg.server || ''; }

  // ---------- server calls ----------
  function api(path, opt) {
    opt = opt || {};
    var headers = { 'X-License-Key': cfg.key || '', 'X-Machine-Id': cfg.machineId || '' };
    var body;
    if (opt.raw) { body = opt.raw; headers['Content-Type'] = 'application/octet-stream'; }
    else if (opt.body) { body = JSON.stringify(opt.body); headers['Content-Type'] = 'application/json'; }
    return fetch(base() + path, { method: opt.method || 'GET', headers: headers, body: body }).then(
      function (res) {
        return res.json().catch(function () { return {}; }).then(function (j) {
          if (!res.ok) {
            if (j.code === 'LICENSE') lockOut(j.error);
            throw new Error(j.error || ('Server error ' + res.status));
          }
          return j;
        });
      },
      function () { throw new Error('Cannot reach the server. Check Wi-Fi and the server address.'); }
    );
  }
  function photoUrl(b) {
    if (!b || !b.photo) return '';
    return base() + '/api/mobile/photo/' + encodeURIComponent(b.photo) + '?k=' + encodeURIComponent(cfg.key) + '&m=' + encodeURIComponent(cfg.machineId) + '&v=' + encodeURIComponent(b.updated_at || '');
  }
  function lockOut(msg) {
    cfg.key = ''; saveCfg();
    stack = [{ name: 'activate', params: { error: msg || 'Please activate again.' } }];
    render();
  }

  // ---------- navigation ----------
  var ROOTS = ['people', 'attendance', 'events', 'more'];
  function go(name, params) {
    stack.push({ name: name, params: params || {} });
    try { history.pushState({ n: stack.length }, ''); } catch (e) { /* ignore */ }
    render();
  }
  function replace(name, params) { stack[stack.length - 1] = { name: name, params: params || {} }; render(); }
  function root(name) { stack = [{ name: name, params: {} }]; render(); }
  function back() { if (stack.length > 1) { stack.pop(); render(); return true; } return false; }
  window.ywamBack = function () { return back(); };      // used by the Android back button
  window.addEventListener('popstate', function () { if (stack.length > 1) { stack.pop(); render(); } });

  // ---------- screen frame ----------
  function frame(title, body, opts) {
    opts = opts || {};
    var isRoot = ROOTS.indexOf(stack[stack.length - 1].name) >= 0;
    var h = '<header class="bar">' + (isRoot ? '' : '<button data-act="back" aria-label="Back">&#8592;</button>') +
      '<h1>' + esc(title) + '</h1>' + (opts.right || '') + '</header><main id="main">' + body + '</main>';
    if (isRoot) {
      var cur = stack[stack.length - 1].name;
      var tab = function (n, ic, label) { return '<button data-act="tab" data-n="' + n + '" class="' + (cur === n ? 'on' : '') + '"><span class="ic">' + ic + '</span>' + label + '</button>'; };
      h += '<nav class="tabs">' + tab('people', '&#128101;', 'People') + tab('attendance', '&#9989;', 'Attendance') + tab('events', '&#127881;', 'Events') + tab('more', '&#9776;', 'More') + '</nav>';
    }
    $('#app').innerHTML = h;
  }

  function render() {
    var s = stack[stack.length - 1];
    var fn = SCREENS[s.name];
    if (!cfg.key && s.name !== 'activate') { stack = [{ name: 'activate', params: {} }]; fn = SCREENS.activate; s = stack[0]; }
    fn(s.params || {});
  }

  // ---------- activation ----------
  function normalizeUrl(u) {
    u = String(u || '').trim().replace(/\/+$/, '');
    if (u && !/^https?:\/\//i.test(u)) u = 'http://' + u;
    return u;
  }
  function screenActivate(p) {
    var defServer = cfg.server || (SAME_ORIGIN_APP ? location.origin : '');
    $('#app').innerHTML = '<main id="main"><div class="center"><img class="logo" src="logo.png" alt="" />' +
      '<h2 class="c">YWAM - TRICHY</h2><div class="muted" style="text-align:center">Phone app &ndash; enter the details the administrator gave you</div>' +
      '<div class="card" style="margin-top:14px"><label>Server address</label><input id="srv" placeholder="http://192.168.1.20:4000" autocapitalize="off" autocorrect="off" value="' + esc(defServer) + '" />' +
      '<label>License key</label><input id="lic" placeholder="YWAM-XXXXX-XXXXX-XXXXX-XXXXX" autocapitalize="characters" autocorrect="off" style="text-transform:uppercase" />' +
      '<button class="btn" id="goBtn">Activate</button><div class="err" id="err">' + esc(p.error || '') + '</div>' +
      '<p class="muted">A license key works on one phone only. You must be on the office network (or connected to it) for this step.</p></div></div></main>';
    $('#goBtn').onclick = function () {
      var server = normalizeUrl($('#srv').value), key = $('#lic').value.trim().toUpperCase();
      if (!server || !key) { $('#err').textContent = 'Enter the server address and the license key.'; return; }
      var machineId = cfg.machineId || randId();
      $('#goBtn').disabled = true; $('#err').textContent = '';
      fetch(server + '/api/license/activate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: key, machineId: machineId, machineName: 'Phone ' + machineId.slice(2, 8), edition: 'mobile' })
      }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (r) {
          if (!r.ok) throw new Error(r.j.error || 'Activation failed');
          cfg = { server: server, key: r.j.key || key, machineId: machineId, label: r.j.label || '' };
          saveCfg();
          return start();
        })
        .catch(function (e) {
          $('#goBtn').disabled = false;
          $('#err').textContent = (e instanceof TypeError || /fetch/i.test(e.message)) ? 'Cannot reach the server. Check the address and your Wi-Fi.' : e.message;
        });
    };
  }

  function start() {
    return api('/api/mobile/bootstrap').then(function (b) {
      boot = b;
      return api('/api/mobile/people');
    }).then(function (r) { people = r.people; root('people'); });
  }

  // ---------- people ----------
  function chip(cat) {
    var c = boot && boot.categoryColors && boot.categoryColors[cat];
    return '<span class="chip"' + (c ? ' style="background:' + esc(c) + '33;color:#1f2937;border:1px solid ' + esc(c) + '"' : '') + '>' + esc(cat) + '</span>';
  }
  function avatar(b) {
    var u = photoUrl(b);
    var ini = ((b.name || '?')[0] + (b.surname ? b.surname[0] : '')).toUpperCase();
    return '<div class="av">' + (u ? '<img src="' + esc(u) + '" alt="" onerror="this.parentNode.textContent=\'' + esc(ini) + '\'" />' : esc(ini)) + '</div>';
  }
  function fullName(b) { return (b.name + ' ' + (b.surname || '')).trim(); }

  function screenPeople() {
    var cats = (boot && boot.categories) || [];
    frame('People', '<input id="q" type="search" placeholder="Search name, village, number, mobile" value="' + esc(ui.q) + '" />' +
      '<select id="cat" style="margin:8px 0 10px"><option value="">All categories</option>' + cats.map(function (c) { return '<option' + (ui.cat === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select>' +
      '<div class="sum" id="cnt"></div><div id="plist"></div><button class="fab" data-act="addp" aria-label="Add">+</button>',
      { right: '<button data-act="reload" aria-label="Refresh">&#8635;</button>' });
    $('#q').oninput = function () { ui.q = this.value; fillPeople(); };
    $('#cat').onchange = function () { ui.cat = this.value; fillPeople(); };
    fillPeople();
  }
  function matches(b, q) {
    if (!q) return true;
    q = q.toLowerCase();
    return [b.name, b.surname, b.village, b.beneficiary_no, b.mobile, b.category].join(' ').toLowerCase().indexOf(q) >= 0;
  }
  function fillPeople() {
    var list = people.filter(function (b) { return (!ui.cat || b.category === ui.cat) && matches(b, ui.q); });
    $('#cnt').textContent = list.length + ' of ' + people.length + ' people';
    $('#plist').innerHTML = list.length ? list.slice(0, 400).map(function (b) {
      return '<div class="item" data-act="person" data-id="' + esc(b.id) + '">' + avatar(b) + '<div class="t"><div class="n">' + esc(fullName(b)) + '</div>' +
        '<div class="s">' + esc([b.beneficiary_no, b.village].filter(Boolean).join(' \u00b7 ') || '-') + '</div></div>' + chip(b.category) + '</div>';
    }).join('') + (list.length > 400 ? '<div class="sum">Showing the first 400 &ndash; type in the search box to narrow down.</div>' : '') : '<div class="empty">No people found.</div>';
  }

  function screenPerson(p) {
    frame('Loading\u2026', '<div class="empty">Loading\u2026</div>');
    api('/api/mobile/people/' + encodeURIComponent(p.id)).then(function (r) {
      var b = r.person;
      var rows = [['Beneficiary No', b.beneficiary_no], ['Village', b.village], ['Gender', b.gender], ['Age', b.age], ['Date of birth', b.dob], ['Date of death', b.dod],
        ['Mobile', b.mobile ? '<a href="tel:' + esc(b.mobile) + '">' + esc(b.mobile) + '</a>' : ''], ['Alt. mobile', b.alt_mobile ? '<a href="tel:' + esc(b.alt_mobile) + '">' + esc(b.alt_mobile) + '</a>' : ''],
        ['Email', esc(b.email)], ['Address', esc(b.address)], ['Notes', esc(b.notes)], ['Aadhar', b.aadhar ? '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022' + esc(b.aadhar.slice(-4)) : '']]
        .filter(function (r2) { return r2[1]; });
      rows = rows.map(function (r2) { return [r2[0], r2[0] === 'Mobile' || r2[0] === 'Alt. mobile' || r2[0] === 'Aadhar' || r2[0] === 'Email' || r2[0] === 'Address' || r2[0] === 'Notes' ? r2[1] : esc(r2[1])]; });
      var u = photoUrl(b);
      frame(fullName(b), '<div class="card hero"><div class="photo">' + (u ? '<img src="' + esc(u) + '" alt="" />' : esc((b.name || '?')[0].toUpperCase())) + '</div>' +
        '<div style="font-size:20px;font-weight:800">' + esc(fullName(b)) + '</div>' + chip(b.category) + '</div>' +
        '<div class="card">' + rows.map(function (r2) { return '<div class="kv"><div class="k">' + esc(r2[0]) + '</div><div class="v">' + r2[1] + '</div></div>'; }).join('') + '</div>' +
        '<div class="row"><button class="btn" data-act="card" data-id="' + esc(b.id) + '">ID Card</button><button class="btn sec" data-act="editp" data-id="' + esc(b.id) + '">Edit</button></div>');
    }).catch(function (e) { toast(e.message); back(); });
  }

  // ---------- add / edit person ----------
  var pendingPhoto = null;
  function resizePhoto(file) {
    return new Promise(function (resolve, reject) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var max = 900, w = img.width, h = img.height, s = Math.min(1, max / Math.max(w, h));
        var c = document.createElement('canvas'); c.width = Math.round(w * s); c.height = Math.round(h * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(function (blob) { URL.revokeObjectURL(url); blob ? resolve(blob) : reject(new Error('Could not read that photo')); }, 'image/jpeg', 0.85);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Could not read that photo')); };
      img.src = url;
    });
  }
  function field(id, label, val, type, extra) {
    return '<label for="f_' + id + '">' + label + '</label><input id="f_' + id + '" type="' + (type || 'text') + '" value="' + esc(val) + '" ' + (extra || '') + ' />';
  }
  function screenForm(p) {
    pendingPhoto = null;
    var load = p.id ? api('/api/mobile/people/' + encodeURIComponent(p.id)).then(function (r) { return r.person; }) : Promise.resolve({});
    load.then(function (b) {
      var cats = (boot && boot.categories) || [];
      var u = photoUrl(b);
      frame(p.id ? 'Edit person' : 'New person',
        '<div class="card"><div class="hero"><div class="photo" id="prev">' + (u ? '<img src="' + esc(u) + '" alt="" />' : '\ud83d\udcf7') + '</div>' +
        '<label class="btn sec sm" style="margin:0">Take / choose photo<input id="photo" type="file" accept="image/*" style="display:none" /></label></div>' +
        field('name', 'Name *', b.name) + field('surname', 'Surname', b.surname) +
        '<label for="f_category">Category *</label><select id="f_category"><option value="">Select\u2026</option>' + cats.map(function (c) { return '<option' + (b.category === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select>' +
        field('beneficiary_no', 'Beneficiary ID number', b.beneficiary_no) + field('village', 'Village name', b.village) +
        '<label for="f_gender">Gender</label><select id="f_gender"><option value=""></option>' + ['Male', 'Female', 'Other'].map(function (g) { return '<option' + (b.gender === g ? ' selected' : '') + '>' + g + '</option>'; }).join('') + '</select>' +
        field('age', 'Age', b.age, 'number', 'inputmode="numeric"') + field('dob', 'Date of birth', b.dob, 'date') +
        field('mobile', 'Mobile', b.mobile, 'tel') + field('alt_mobile', 'Alternate mobile', b.alt_mobile, 'tel') + field('email', 'Email', b.email, 'email') +
        field('aadhar', 'Aadhar (12 digits)', b.aadhar, 'text', 'inputmode="numeric" maxlength="14"') +
        '<label for="f_address">Address</label><textarea id="f_address">' + esc(b.address) + '</textarea>' +
        '<label for="f_notes">Notes</label><textarea id="f_notes">' + esc(b.notes) + '</textarea>' +
        '<button class="btn" id="saveBtn">Save</button><div class="err" id="err"></div></div>');
      $('#photo').onchange = function () {
        var f = this.files && this.files[0]; if (!f) return;
        resizePhoto(f).then(function (blob) {
          pendingPhoto = blob;
          $('#prev').innerHTML = '<img src="' + URL.createObjectURL(blob) + '" alt="" />';
        }).catch(function (e) { toast(e.message); });
      };
      $('#saveBtn').onclick = function () {
        var body = {};
        ['name', 'surname', 'category', 'beneficiary_no', 'village', 'gender', 'age', 'dob', 'mobile', 'alt_mobile', 'email', 'aadhar', 'address', 'notes'].forEach(function (k) { body[k] = $('#f_' + k).value; });
        if (!body.name.trim() || !body.category) { $('#err').textContent = 'Name and category are required.'; return; }
        var btn = this; btn.disabled = true; $('#err').textContent = '';
        var save = p.id ? api('/api/mobile/people/' + encodeURIComponent(p.id), { method: 'PUT', body: body }) : api('/api/mobile/people', { method: 'POST', body: body });
        save.then(function (r) {
          if (!pendingPhoto) return r;
          return api('/api/mobile/people/' + encodeURIComponent(r.person.id) + '/photo', { method: 'PUT', raw: pendingPhoto });
        }).then(function (r) {
          return api('/api/mobile/people').then(function (l) { people = l.people; return r; });
        }).then(function (r) {
          toast('Saved');
          stack.pop();                                  // leave the form
          if (p.id) { stack.pop(); }                    // editing: re-open the person fresh
          go('person', { id: r.person.id });
        }).catch(function (e) { btn.disabled = false; $('#err').textContent = e.message; });
      };
    }).catch(function (e) { toast(e.message); back(); });
  }

  // ---------- ID card ----------
  var measure;
  function fit(text, maxW, size) {
    if (!measure) measure = document.createElement('canvas').getContext('2d');
    measure.font = 'bold ' + size + 'px Helvetica, Arial, sans-serif';
    var v = text || '-';
    if (measure.measureText(v).width > maxW) { while (v.length > 1 && measure.measureText(v + '\u2026').width > maxW) v = v.slice(0, -1); v += '\u2026'; }
    return v;
  }
  function cardSvg(b, theme) {
    var W = 243, H = 172, asc = 0.718, F = 'font-family="Helvetica, Arial, sans-serif"';
    var st = theme.stops, fy = 36, head = '';
    boot.headerLines.forEach(function (l) { head += '<text x="' + W / 2 + '" y="' + (fy + asc * 6.8) + '" ' + F + ' font-weight="700" font-size="6.8" fill="#fff" text-anchor="middle">' + esc(l) + '</text>'; fy += 7.5; });
    var panelTop = fy + 6, px = 8, pw = W - 16, ph = H - panelTop - 8, phW = 48, phH = 52, phX = px + pw - 10 - phW, phY = panelTop + 9, dfx = px + 10, dfw = phX - dfx - 8, dfy = panelTop + 8, det = '';
    function line(label, value, size) {
      size = size || 8;
      det += '<text x="' + dfx + '" y="' + (dfy + asc * 5.8) + '" ' + F + ' font-weight="700" font-size="5.8" fill="#8a8f98">' + esc(label.toUpperCase()) + '</text>'; dfy += 6;
      det += '<text x="' + dfx + '" y="' + (dfy + asc * size) + '" ' + F + ' font-weight="700" font-size="' + size + '" fill="#1a1a1a">' + esc(fit(value, dfw, size)) + '</text>'; dfy += size + 1.5;
    }
    line('Beneficiary Name', fullName(b) || '-', 8.8); line('Date of Birth', b.dob || '-'); line('Beneficiary Number', b.beneficiary_no || '-'); line('Village Name', b.village || '-');
    var sigY = panelTop + ph - 12, sigX = px + 16, sigW = pw - 32, u = photoUrl(b);
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '"><defs>' +
      '<linearGradient id="g" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="' + W + '" y2="' + H + '"><stop offset="0" stop-color="' + st[0] + '"/><stop offset="0.35" stop-color="' + st[1] + '"/><stop offset="0.65" stop-color="' + st[2] + '"/><stop offset="1" stop-color="' + st[3] + '"/></linearGradient>' +
      '<clipPath id="pc"><rect x="' + phX + '" y="' + phY + '" width="' + phW + '" height="' + phH + '" rx="5"/></clipPath></defs>' +
      '<rect width="' + W + '" height="' + H + '" rx="10" fill="url(#g)"/><image href="logo.png" x="' + (W - 22) / 2 + '" y="10" width="22" height="22"/>' + head +
      '<rect x="' + px + '" y="' + panelTop + '" width="' + pw + '" height="' + ph + '" rx="8" fill="#fff"/>' + det +
      '<rect x="' + phX + '" y="' + phY + '" width="' + phW + '" height="' + phH + '" rx="5" fill="#f2f4f7"/>' +
      (u ? '<image href="' + esc(u) + '" x="' + phX + '" y="' + phY + '" width="' + phW + '" height="' + phH + '" preserveAspectRatio="xMidYMid slice" clip-path="url(#pc)"/>' : '') +
      '<rect x="' + phX + '" y="' + phY + '" width="' + phW + '" height="' + phH + '" rx="5" fill="none" stroke="' + theme.accent + '" stroke-width="1"/>' +
      '<line x1="' + sigX + '" y1="' + sigY + '" x2="' + (sigX + sigW) + '" y2="' + sigY + '" stroke="#999" stroke-width="0.75"/>' +
      '<text x="' + (sigX + sigW / 2) + '" y="' + (sigY + 3 + asc * 5.8) + '" ' + F + ' font-size="5.8" fill="#666" text-anchor="middle">Authorized Signature</text></svg>';
  }
  function screenCard(p) {
    frame('ID Card', '<div class="empty">Loading\u2026</div>');
    api('/api/mobile/people/' + encodeURIComponent(p.id)).then(function (r) {
      var b = r.person, keys = Object.keys(boot.themes), cur = ui.theme && boot.themes[ui.theme] ? ui.theme : boot.defaultTheme;
      frame('ID Card', '<div class="card cardwrap">' + cardSvg(b, boot.themes[cur]) + '</div>' +
        '<label>Card colour</label><select id="theme">' + keys.map(function (k) { return '<option value="' + k + '"' + (k === cur ? ' selected' : '') + '>' + esc(boot.themes[k].label) + '</option>'; }).join('') + '</select>' +
        '<p class="muted">To print cards (8 per A4 page), use the computer program.</p>');
      $('#theme').onchange = function () { ui.theme = this.value; $('.cardwrap').innerHTML = cardSvg(b, boot.themes[ui.theme]); };
    }).catch(function (e) { toast(e.message); back(); });
  }

  // ---------- attendance ----------
  function thisMonth() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2); }
  function screenAttendance() {
    if (!ui.month) ui.month = thisMonth();
    frame('Attendance', '<input id="mon" type="month" value="' + esc(ui.month) + '" /><input id="aq" type="search" placeholder="Search" style="margin-top:8px" value="' + esc(ui.attQ) + '" />' +
      '<div class="sum" id="asum" style="margin-top:10px">Loading\u2026</div><button class="btn sec sm" id="allP" style="margin-bottom:10px">Mark all Present</button><div id="alist"></div>');
    $('#mon').onchange = function () { ui.month = this.value || thisMonth(); screenAttendance(); };
    $('#aq').oninput = function () { ui.attQ = this.value; fillAtt(); };
    $('#allP').onclick = function () {
      var recs = people.filter(function (b) { return !ui.att[b.id]; }).map(function (b) { return { beneficiaryId: b.id, status: 'Present' }; });
      if (!recs.length) { toast('Everyone is already marked'); return; }
      api('/api/mobile/attendance', { method: 'POST', body: { month: ui.month, records: recs } }).then(function () { recs.forEach(function (r) { ui.att[r.beneficiaryId] = r.status; }); fillAtt(); toast('Marked ' + recs.length + ' present'); }).catch(function (e) { toast(e.message); });
    };
    api('/api/mobile/attendance?month=' + encodeURIComponent(ui.month)).then(function (r) {
      ui.att = {}; r.records.forEach(function (x) { ui.att[x.beneficiaryId] = x.status; }); fillAtt();
    }).catch(function (e) { $('#asum').textContent = e.message; });
  }
  function fillAtt() {
    var list = people.filter(function (b) { return matches(b, ui.attQ); }), p = 0, a = 0;
    people.forEach(function (b) { if (ui.att[b.id] === 'Present') p++; else if (ui.att[b.id] === 'Absent') a++; });
    $('#asum').textContent = 'Present ' + p + ' \u00b7 Absent ' + a + ' \u00b7 Not marked ' + (people.length - p - a);
    $('#alist').innerHTML = list.length ? list.slice(0, 400).map(function (b) {
      var s = ui.att[b.id];
      return '<div class="item">' + avatar(b) + '<div class="t"><div class="n">' + esc(fullName(b)) + '</div><div class="s">' + esc(b.beneficiary_no || b.village || '') + '</div></div>' +
        '<div class="seg" style="width:128px"><button class="p' + (s === 'Present' ? ' on' : '') + '" data-act="mark" data-id="' + esc(b.id) + '" data-s="Present">P</button>' +
        '<button class="a' + (s === 'Absent' ? ' on' : '') + '" data-act="mark" data-id="' + esc(b.id) + '" data-s="Absent">A</button></div></div>';
    }).join('') : '<div class="empty">No people found.</div>';
  }
  function mark(id, status) {
    var before = ui.att[id]; ui.att[id] = status; fillAtt();
    api('/api/mobile/attendance', { method: 'POST', body: { month: ui.month, records: [{ beneficiaryId: id, status: status }] } })
      .catch(function (e) { ui.att[id] = before; if (!before) delete ui.att[id]; fillAtt(); toast(e.message); });
  }

  // ---------- events ----------
  function screenEvents() {
    frame('Events', '<button class="btn sm" data-act="newevent" style="margin-bottom:12px">+ New event</button><div id="elist"><div class="empty">Loading\u2026</div></div>',
      { right: '<button data-act="reloadev" aria-label="Refresh">&#8635;</button>' });
    api('/api/mobile/events').then(function (r) {
      $('#elist').innerHTML = r.events.length ? r.events.map(function (e) {
        return '<div class="item" data-act="event" data-id="' + esc(e.id) + '"><div class="t"><div class="n">' + esc(e.name) + '</div><div class="s">' + esc([e.date, e.venue].filter(Boolean).join(' \u00b7 ') || '-') + '</div></div><span class="chip">' + e.participantCount + ' people</span></div>';
      }).join('') : '<div class="empty">No events yet.</div>';
    }).catch(function (e) { $('#elist').innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; });
  }
  function screenEvent(p) {
    frame('Event', '<div class="empty">Loading\u2026</div>');
    api('/api/mobile/events/' + encodeURIComponent(p.id)).then(function (r) {
      var e = r.event, ps = e.participants || [];
      frame(e.name, '<div class="card"><div class="kv"><div class="k">Date</div><div class="v">' + esc(e.date || '-') + '</div></div><div class="kv"><div class="k">Venue</div><div class="v">' + esc(e.venue || '-') + '</div></div>' +
        (e.description ? '<div class="kv"><div class="k">About</div><div class="v">' + esc(e.description) + '</div></div>' : '') + '</div>' +
        '<button class="btn sm" data-act="addpart" data-id="' + esc(e.id) + '" style="margin-bottom:10px">+ Add participant</button><div class="sum">' + ps.length + ' participants</div>' +
        (ps.length ? ps.map(function (x) {
          return '<div class="item"><div class="t"><div class="n">' + esc(x.name) + '</div><div class="s">' + esc([x.beneficiary_no, x.village, x.mobile].filter(Boolean).join(' \u00b7 ') || '-') + '</div></div><button class="x" data-act="delpart" data-id="' + esc(e.id) + '" data-pid="' + esc(x.id) + '" aria-label="Remove">&#10005;</button></div>';
        }).join('') : '<div class="empty">No participants yet.</div>'));
    }).catch(function (e) { toast(e.message); back(); });
  }
  function screenEventForm() {
    frame('New event', '<div class="card">' + field('name', 'Event name *', '') + field('date', 'Date', '', 'date') + field('venue', 'Venue', '') +
      '<label for="f_description">Description</label><textarea id="f_description"></textarea><button class="btn" id="saveBtn">Save</button><div class="err" id="err"></div></div>');
    $('#saveBtn').onclick = function () {
      var body = { name: $('#f_name').value, date: $('#f_date').value, venue: $('#f_venue').value, description: $('#f_description').value };
      if (!body.name.trim()) { $('#err').textContent = 'Event name is required.'; return; }
      this.disabled = true;
      api('/api/mobile/events', { method: 'POST', body: body }).then(function (r) { stack.pop(); go('event', { id: r.event.id }); }).catch(function (e) { $('#saveBtn').disabled = false; $('#err').textContent = e.message; });
    };
  }
  function screenParticipantForm(p) {
    frame('Add participant', '<div class="card"><label>Pick a registered person (optional)</label><input id="pq" type="search" placeholder="Search registered people" /><div id="pres" style="margin-top:8px"></div>' +
      field('name', 'Name *', '') + field('beneficiary_no', 'Beneficiary ID number', '') + field('village', 'Village', '') + field('mobile', 'Mobile', '', 'tel') +
      '<button class="btn" id="saveBtn">Add</button><div class="err" id="err"></div></div>');
    $('#pq').oninput = function () {
      var q = this.value.trim(); if (!q) { $('#pres').innerHTML = ''; return; }
      var hits = people.filter(function (b) { return matches(b, q); }).slice(0, 6);
      $('#pres').innerHTML = hits.map(function (b) { return '<div class="item" data-act="pick" data-id="' + esc(b.id) + '"><div class="t"><div class="n">' + esc(fullName(b)) + '</div><div class="s">' + esc([b.beneficiary_no, b.village].filter(Boolean).join(' \u00b7 ')) + '</div></div></div>'; }).join('');
    };
    $('#saveBtn').onclick = function () {
      var body = { name: $('#f_name').value, beneficiary_no: $('#f_beneficiary_no').value, village: $('#f_village').value, mobile: $('#f_mobile').value };
      if (!body.name.trim()) { $('#err').textContent = 'Name is required.'; return; }
      this.disabled = true;
      api('/api/mobile/events/' + encodeURIComponent(p.eventId) + '/participants', { method: 'POST', body: body }).then(function () { toast('Added'); back(); }).catch(function (e) { $('#saveBtn').disabled = false; $('#err').textContent = e.message; });
    };
  }

  // ---------- more ----------
  function screenMore() {
    var masked = cfg.key ? cfg.key.replace(/^(YWAM-\w{5})-\w{5}-\w{5}-(\w{5})$/, '$1-\u2022\u2022\u2022\u2022\u2022-\u2022\u2022\u2022\u2022\u2022-$2') : '-';
    frame('More', '<div class="card"><div class="kv"><div class="k">License</div><div class="v">' + esc(masked) + '</div></div><div class="kv"><div class="k">For</div><div class="v">' + esc(cfg.label || '-') + '</div></div>' +
      '<div class="kv"><div class="k">Server</div><div class="v">' + esc(cfg.server || location.origin) + '</div></div><div class="kv"><div class="k">This phone</div><div class="v">' + esc(cfg.machineId) + '</div></div>' +
      '<div class="kv"><div class="k">People on server</div><div class="v">' + people.length + '</div></div><div class="kv"><div class="k">App version</div><div class="v">' + VERSION + '</div></div></div>' +
      '<button class="btn sec" data-act="reload">Refresh data</button><button class="btn red" data-act="logout">Log out and free this key</button>' +
      '<p class="muted">Logging out lets you use the same key on another phone. Everything stays safely on the office server.</p>');
  }

  var SCREENS = {
    activate: screenActivate, people: screenPeople, person: screenPerson, form: screenForm, card: screenCard,
    attendance: screenAttendance, events: screenEvents, event: screenEvent, eventForm: screenEventForm, partForm: screenParticipantForm, more: screenMore
  };

  // ---------- one click handler for everything ----------
  document.addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-act]'); if (!el) return;
    var act = el.getAttribute('data-act'), id = el.getAttribute('data-id');
    if (act === 'back') back();
    else if (act === 'tab') root(el.getAttribute('data-n'));
    else if (act === 'person') go('person', { id: id });
    else if (act === 'addp') go('form', {});
    else if (act === 'editp') go('form', { id: id });
    else if (act === 'card') go('card', { id: id });
    else if (act === 'mark') mark(id, el.getAttribute('data-s'));
    else if (act === 'newevent') go('eventForm');
    else if (act === 'event') go('event', { id: id });
    else if (act === 'addpart') go('partForm', { eventId: id });
    else if (act === 'pick') {
      var b = people.filter(function (x) { return x.id === id; })[0];
      if (b) { $('#f_name').value = fullName(b); $('#f_beneficiary_no').value = b.beneficiary_no || ''; $('#f_village').value = b.village || ''; $('#f_mobile').value = b.mobile || ''; $('#pres').innerHTML = ''; $('#pq').value = ''; }
    }
    else if (act === 'delpart') {
      if (!confirm('Remove this participant?')) return;
      api('/api/mobile/events/' + encodeURIComponent(id) + '/participants/' + encodeURIComponent(el.getAttribute('data-pid')), { method: 'DELETE' }).then(function () { render(); }).catch(function (e) { toast(e.message); });
    }
    else if (act === 'reloadev') render();
    else if (act === 'reload') {
      api('/api/mobile/bootstrap').then(function (b) { boot = b; return api('/api/mobile/people'); }).then(function (r) { people = r.people; render(); toast('Updated'); }).catch(function (e) { toast(e.message); });
    }
    else if (act === 'logout') {
      if (!confirm('Log out of this phone and free the license key?')) return;
      api('/api/license/release', { method: 'POST', body: { key: cfg.key, machineId: cfg.machineId } }).catch(function () { /* still log out */ }).then(function () {
        cfg = { server: cfg.server, machineId: '' }; saveCfg(); stack = [{ name: 'activate', params: {} }]; render();
      });
    }
  });

  // release uses /api/license/release which expects JSON; api() adds the license headers harmlessly

  // ---------- go ----------
  if (cfg.key) { stack = [{ name: 'people', params: {} }]; start().catch(function (e) { if (cfg.key) { stack = [{ name: 'activate', params: { error: e.message } }]; render(); } }); render(); }
  else { stack = [{ name: 'activate', params: {} }]; render(); }
})();

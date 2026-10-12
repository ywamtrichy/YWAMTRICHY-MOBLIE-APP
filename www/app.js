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

  // ---------- CSV & PDF helpers ----------
  function downloadFile(filename, content, mimeType) {
    try {
      var blob = new Blob([content], { type: mimeType });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 500);
    } catch (e) {
      var encoded = encodeURIComponent(content);
      var a = document.createElement('a');
      a.href = 'data:' + mimeType + ';charset=utf-8,' + encoded;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { document.body.removeChild(a); }, 500);
    }
  }

  function csvEscape(val) {
    if (val == null) return '""';
    var s = String(val);
    if (s.indexOf('"') >= 0 || s.indexOf(',') >= 0 || s.indexOf('\n') >= 0 || s.indexOf('\r') >= 0) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return '"' + s + '"';
  }

  function parseCSV(text) {
    var lines = [];
    var row = [];
    var inQuotes = false;
    var currentField = '';
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    if (text.charCodeAt(0) === 0xFEFF) { text = text.slice(1); }
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      var next = text[i + 1];
      if (inQuotes) {
        if (c === '"') {
          if (next === '"') {
            currentField += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          currentField += c;
        }
      } else {
        if (c === '"') {
          inQuotes = true;
        } else if (c === ',') {
          row.push(currentField.trim());
          currentField = '';
        } else if (c === '\n') {
          row.push(currentField.trim());
          currentField = '';
          if (row.length > 1 || (row.length === 1 && row[0] !== '')) {
            lines.push(row);
          }
          row = [];
        } else {
          currentField += c;
        }
      }
    }
    if (currentField || row.length > 0) {
      row.push(currentField.trim());
      if (row.length > 1 || (row.length === 1 && row[0] !== '')) {
        lines.push(row);
      }
    }
    return lines;
  }

  var FIELD_MAP = {
    'name': 'name', 'beneficiary name': 'name', 'full name': 'name',
    'surname': 'surname', 'last name': 'surname',
    'category': 'category',
    'beneficiary no': 'beneficiary_no', 'beneficiary_no': 'beneficiary_no', 'beneficiary id': 'beneficiary_no', 'id': 'beneficiary_no',
    'village': 'village', 'village name': 'village',
    'gender': 'gender', 'sex': 'gender',
    'age': 'age',
    'dob': 'dob', 'date of birth': 'dob', 'birth date': 'dob',
    'dod': 'dod', 'date of death': 'dod',
    'mobile': 'mobile', 'phone': 'mobile', 'contact': 'mobile', 'mobile no': 'mobile', 'phone number': 'mobile',
    'alt mobile': 'alt_mobile', 'alt_mobile': 'alt_mobile', 'alternate mobile': 'alt_mobile',
    'email': 'email', 'email address': 'email',
    'aadhar': 'aadhar', 'aadhaar': 'aadhar', 'aadhar no': 'aadhar',
    'address': 'address',
    'notes': 'notes', 'note': 'notes'
  };

  function showImportModal(data) {
    var existing = $('#importModal');
    if (existing) existing.remove();
    if (!data) return;
    var overlay = document.createElement('div');
    overlay.id = 'importModal';
    overlay.className = 'modal-overlay';
    if (data.loading) {
      overlay.innerHTML = '<div class="modal-box">' +
        '<div class="modal-head"><h3>Importing CSV Data</h3></div>' +
        '<div class="modal-body">' +
        '<div class="import-badge loading">&#8987; Processing record <span id="impProg">' + data.current + '</span> of ' + data.total + '&hellip;</div>' +
        '<div class="muted">Please wait while beneficiaries are being imported and synced to the server.</div>' +
        '</div></div>';
    } else if (data.done) {
      var errsHtml = '';
      if (data.errors && data.errors.length) {
        errsHtml = '<div class="import-errors"><strong>Issues encountered (' + data.errors.length + '):</strong><ul>' +
          data.errors.slice(0, 50).map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') +
          '</ul></div>';
      }
      overlay.innerHTML = '<div class="modal-box">' +
        '<div class="modal-head"><h3>CSV Import Result</h3><button class="modal-close" data-act="close-modal">&times;</button></div>' +
        '<div class="modal-body">' +
        '<div class="import-badge success">&#10004; Successfully imported ' + data.imported + ' of ' + data.total + ' beneficiaries</div>' +
        errsHtml +
        '</div>' +
        '<div class="modal-foot"><button class="btn sm" data-act="close-modal">Done</button></div>' +
        '</div>';
    }
    document.body.appendChild(overlay);
  }

  function updateImportProgress(curr, tot) {
    var p = $('#impProg');
    if (p) p.textContent = curr;
  }

  function exportPeopleCSV() {
    var list = people.filter(function (b) { return (!ui.cat || b.category === ui.cat) && matches(b, ui.q); });
    if (!list.length) { toast('No people to export'); return; }
    var headers = ['S.No', 'Beneficiary ID', 'Name', 'Surname', 'Category', 'Village', 'Gender', 'Age', 'Date of Birth', 'Date of Death', 'Mobile', 'Alt Mobile', 'Email', 'Aadhar', 'Address', 'Notes'];
    var rows = [headers.map(csvEscape).join(',')];
    list.forEach(function (b, idx) {
      rows.push([
        csvEscape(idx + 1),
        csvEscape(b.beneficiary_no || ''),
        csvEscape(b.name || ''),
        csvEscape(b.surname || ''),
        csvEscape(b.category || ''),
        csvEscape(b.village || ''),
        csvEscape(b.gender || ''),
        csvEscape(b.age || ''),
        csvEscape(b.dob || ''),
        csvEscape(b.dod || ''),
        csvEscape(b.mobile || ''),
        csvEscape(b.alt_mobile || ''),
        csvEscape(b.email || ''),
        csvEscape(b.aadhar || ''),
        csvEscape(b.address || ''),
        csvEscape(b.notes || '')
      ].join(','));
    });
    var csv = '\uFEFF' + rows.join('\r\n');
    var fname = (ui.cat ? ('beneficiaries_' + ui.cat.replace(/[^a-zA-Z0-9_-]/g, '_')) : 'beneficiaries') + '.csv';
    downloadFile(fname, csv, 'text/csv;charset=utf-8;');
    toast('Exported ' + list.length + ' beneficiaries to CSV');
  }

  function exportPeoplePDF() {
    var list = people.filter(function (b) { return (!ui.cat || b.category === ui.cat) && matches(b, ui.q); });
    if (!list.length) { toast('No people to export'); return; }
    var org = (boot && boot.headerLines && boot.headerLines[0]) || 'YWAM - TRICHY';
    var sub = (boot && boot.headerLines && boot.headerLines[1]) || 'Beneficiary Management';
    var catLabel = ui.cat ? ('Category: ' + ui.cat) : 'All Categories';
    var now = new Date().toLocaleDateString();
    var h = '<div class="print-header">' +
      '<h2>' + esc(org) + '</h2>' +
      '<div class="subtitle">' + esc(sub) + ' &ndash; Beneficiary Report</div>' +
      '<div class="meta"><span>' + esc(catLabel) + '</span><span>Total: ' + list.length + ' people</span><span>Date: ' + esc(now) + '</span></div>' +
      '</div>' +
      '<table class="print-table">' +
      '<thead><tr><th>#</th><th>Beneficiary ID</th><th>Name</th><th>Category</th><th>Village</th><th>Gender</th><th>Age</th><th>Mobile</th></tr></thead>' +
      '<tbody>' +
      list.map(function (b, i) {
        return '<tr><td>' + (i + 1) + '</td><td>' + esc(b.beneficiary_no || '-') + '</td><td><strong>' + esc(fullName(b)) + '</strong></td>' +
          '<td>' + esc(b.category || '-') + '</td><td>' + esc(b.village || '-') + '</td><td>' + esc(b.gender || '-') + '</td>' +
          '<td>' + esc(b.age || '-') + '</td><td>' + esc(b.mobile || '-') + '</td></tr>';
      }).join('') +
      '</tbody></table>' +
      '<div class="print-sig">' +
      '<div class="sig-box">Prepared By</div>' +
      '<div class="sig-box">Authorized Signature</div>' +
      '</div>';
    go('print', { title: 'Beneficiary List PDF', content: h });
  }

  function importPeopleCSV(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (evt) {
      try {
        var text = evt.target.result;
        var grid = parseCSV(text);
        if (!grid.length) { toast('CSV file is empty'); return; }
        var headerRow = grid[0];
        var colMap = {};
        headerRow.forEach(function (h, idx) {
          var cleanH = String(h || '').trim().toLowerCase().replace(/[\s_-]+/g, ' ');
          if (FIELD_MAP[cleanH]) colMap[FIELD_MAP[cleanH]] = idx;
        });

        if (colMap['name'] == null) {
          toast('CSV must contain a "Name" column.');
          return;
        }

        var dataRows = grid.slice(1).filter(function (r) {
          return r.some(function (cell) { return String(cell || '').trim() !== ''; });
        });

        if (!dataRows.length) {
          toast('CSV has no data rows.');
          return;
        }

        showImportModal({ loading: true, total: dataRows.length, current: 0 });

        var imported = 0;
        var errors = [];
        var defaultCat = (boot && boot.categories && boot.categories[0]) || 'General';

        function processRow(i) {
          if (i >= dataRows.length) {
            api('/api/mobile/people').then(function (res) {
              people = res.people;
              fillPeople();
              showImportModal({
                done: true,
                total: dataRows.length,
                imported: imported,
                errors: errors
              });
              toast('Imported ' + imported + ' beneficiaries');
            }).catch(function () {
              showImportModal({
                done: true,
                total: dataRows.length,
                imported: imported,
                errors: errors
              });
            });
            return;
          }

          var row = dataRows[i];
          var item = {};
          Object.keys(colMap).forEach(function (fieldKey) {
            var val = row[colMap[fieldKey]];
            item[fieldKey] = val != null ? String(val).trim() : '';
          });

          if (!item.name) {
            errors.push('Row ' + (i + 2) + ': Missing name');
            updateImportProgress(imported + errors.length, dataRows.length);
            processRow(i + 1);
            return;
          }

          if (!item.category) item.category = defaultCat;

          api('/api/mobile/people', { method: 'POST', body: item })
            .then(function () {
              imported++;
              updateImportProgress(imported + errors.length, dataRows.length);
              processRow(i + 1);
            })
            .catch(function (err) {
              errors.push('Row ' + (i + 2) + ' (' + item.name + '): ' + err.message);
              updateImportProgress(imported + errors.length, dataRows.length);
              processRow(i + 1);
            });
        }

        processRow(0);
      } catch (err) {
        toast('Failed to parse CSV: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  function printPersonPDF(id) {
    api('/api/mobile/people/' + encodeURIComponent(id)).then(function (r) {
      var b = r.person;
      var org = (boot && boot.headerLines && boot.headerLines[0]) || 'YWAM - TRICHY';
      var u = photoUrl(b);
      var now = new Date().toLocaleDateString();
      var rows = [
        ['Beneficiary ID', b.beneficiary_no], ['Category', b.category],
        ['Full Name', fullName(b)], ['Village', b.village],
        ['Gender', b.gender], ['Age', b.age],
        ['Date of Birth', b.dob], ['Date of Death', b.dod],
        ['Mobile', b.mobile], ['Alt Mobile', b.alt_mobile],
        ['Email', b.email], ['Aadhar', b.aadhar],
        ['Address', b.address], ['Notes', b.notes]
      ].filter(function (x) { return x[1]; });

      var h = '<div class="print-header">' +
        '<h2>' + esc(org) + '</h2>' +
        '<div class="subtitle">Official Beneficiary Profile</div>' +
        '<div class="meta"><span>ID: ' + esc(b.beneficiary_no || b.id) + '</span><span>Generated: ' + esc(now) + '</span></div>' +
        '</div>' +
        '<div style="display:flex;gap:16px;margin-bottom:14px;align-items:flex-start">' +
        (u ? '<img src="' + esc(u) + '" style="width:110px;height:125px;border-radius:6px;border:1px solid #cbd5e1;object-fit:cover" />' :
             '<div style="width:110px;height:125px;border-radius:6px;border:1px solid #cbd5e1;background:#e2e8f0;display:flex;align-items:center;justify-content:center;font-size:36px;font-weight:700;color:#64748b">' + esc((b.name||'?')[0]) + '</div>') +
        '<div style="flex:1"><h3 style="margin:0 0 6px;font-size:20px;color:#1e293b">' + esc(fullName(b)) + '</h3>' +
        '<div>' + chip(b.category) + '</div>' +
        '<div style="margin-top:8px;font-size:12px;color:#64748b">' + esc([b.village, b.mobile].filter(Boolean).join(' \u00b7 ') || '') + '</div></div>' +
        '</div>' +
        '<table class="print-table">' +
        '<tbody>' +
        rows.map(function (row) {
          return '<tr><td style="width:30%;font-weight:700;background:#f8fafc">' + esc(row[0]) + '</td><td>' + esc(row[1]) + '</td></tr>';
        }).join('') +
        '</tbody></table>' +
        '<div class="print-sig" style="margin-top:48px">' +
        '<div class="sig-box">Beneficiary Signature / Thumb</div>' +
        '<div class="sig-box">Authorized Officer Signature</div>' +
        '</div>';
      go('print', { title: 'Beneficiary Profile PDF', content: h });
    }).catch(function (e) { toast(e.message); });
  }

  function exportAttendanceCSV() {
    if (!people.length) { toast('No data to export'); return; }
    var headers = ['S.No', 'Beneficiary ID', 'Name', 'Category', 'Village', 'Month', 'Status'];
    var rows = [headers.map(csvEscape).join(',')];
    people.forEach(function (b, idx) {
      var status = ui.att[b.id] || 'Not marked';
      rows.push([
        csvEscape(idx + 1),
        csvEscape(b.beneficiary_no || ''),
        csvEscape(fullName(b)),
        csvEscape(b.category || ''),
        csvEscape(b.village || ''),
        csvEscape(ui.month || thisMonth()),
        csvEscape(status)
      ].join(','));
    });
    var csv = '\uFEFF' + rows.join('\r\n');
    downloadFile('attendance_' + (ui.month || thisMonth()) + '.csv', csv, 'text/csv;charset=utf-8;');
    toast('Exported attendance to CSV');
  }

  function exportAttendancePDF() {
    if (!people.length) { toast('No attendance to export'); return; }
    var org = (boot && boot.headerLines && boot.headerLines[0]) || 'YWAM - TRICHY';
    var p = 0, a = 0;
    people.forEach(function (b) { if (ui.att[b.id] === 'Present') p++; else if (ui.att[b.id] === 'Absent') a++; });
    var un = people.length - p - a;
    var now = new Date().toLocaleDateString();
    var h = '<div class="print-header">' +
      '<h2>' + esc(org) + '</h2>' +
      '<div class="subtitle">Monthly Attendance Sheet &ndash; ' + esc(ui.month || thisMonth()) + '</div>' +
      '<div class="meta"><span>Present: ' + p + ' | Absent: ' + a + ' | Not marked: ' + un + '</span><span>Total: ' + people.length + '</span><span>Date: ' + esc(now) + '</span></div>' +
      '</div>' +
      '<table class="print-table">' +
      '<thead><tr><th>#</th><th>Beneficiary ID</th><th>Name</th><th>Category</th><th>Village</th><th>Status</th></tr></thead>' +
      '<tbody>' +
      people.map(function (b, i) {
        var s = ui.att[b.id] || 'Not marked';
        var stCol = s === 'Present' ? 'color:#166534;font-weight:700' : (s === 'Absent' ? 'color:#991b1b;font-weight:700' : 'color:#64748b');
        return '<tr><td>' + (i + 1) + '</td><td>' + esc(b.beneficiary_no || '-') + '</td><td><strong>' + esc(fullName(b)) + '</strong></td>' +
          '<td>' + esc(b.category || '-') + '</td><td>' + esc(b.village || '-') + '</td><td style="' + stCol + '">' + esc(s) + '</td></tr>';
      }).join('') +
      '</tbody></table>' +
      '<div class="print-sig">' +
      '<div class="sig-box">Staff Incharge</div>' +
      '<div class="sig-box">Authorized Signature</div>' +
      '</div>';
    go('print', { title: 'Attendance PDF (' + (ui.month || thisMonth()) + ')', content: h });
  }

  function exportEventCSV(eventId) {
    api('/api/mobile/events/' + encodeURIComponent(eventId)).then(function (r) {
      var e = r.event, ps = e.participants || [];
      if (!ps.length) { toast('No participants to export'); return; }
      var headers = ['S.No', 'Participant Name', 'Beneficiary ID', 'Village', 'Mobile', 'Event Name', 'Event Date', 'Venue'];
      var rows = [headers.map(csvEscape).join(',')];
      ps.forEach(function (x, idx) {
        rows.push([
          csvEscape(idx + 1),
          csvEscape(x.name || ''),
          csvEscape(x.beneficiary_no || ''),
          csvEscape(x.village || ''),
          csvEscape(x.mobile || ''),
          csvEscape(e.name || ''),
          csvEscape(e.date || ''),
          csvEscape(e.venue || '')
        ].join(','));
      });
      var csv = '\uFEFF' + rows.join('\r\n');
      var fname = 'event_' + (e.name || 'participants').replace(/[^a-zA-Z0-9_-]/g, '_') + '.csv';
      downloadFile(fname, csv, 'text/csv;charset=utf-8;');
      toast('Exported ' + ps.length + ' participants to CSV');
    }).catch(function (e) { toast(e.message); });
  }

  function exportEventPDF(eventId) {
    api('/api/mobile/events/' + encodeURIComponent(eventId)).then(function (r) {
      var e = r.event, ps = e.participants || [];
      var org = (boot && boot.headerLines && boot.headerLines[0]) || 'YWAM - TRICHY';
      var now = new Date().toLocaleDateString();
      var h = '<div class="print-header">' +
        '<h2>' + esc(org) + '</h2>' +
        '<div class="subtitle">Event Participant List &ndash; ' + esc(e.name) + '</div>' +
        '<div class="meta"><span>Date: ' + esc(e.date || '-') + ' | Venue: ' + esc(e.venue || '-') + '</span><span>Total: ' + ps.length + ' participants</span><span>Printed: ' + esc(now) + '</span></div>' +
        '</div>' +
        (e.description ? '<div style="margin:8px 0;font-size:11px;color:#475569"><strong>About Event:</strong> ' + esc(e.description) + '</div>' : '') +
        '<table class="print-table">' +
        '<thead><tr><th>#</th><th>Participant Name</th><th>Beneficiary ID</th><th>Village</th><th>Mobile</th><th style="width:120px">Signature</th></tr></thead>' +
        '<tbody>' +
        (ps.length ? ps.map(function (x, i) {
          return '<tr><td>' + (i + 1) + '</td><td><strong>' + esc(x.name) + '</strong></td><td>' + esc(x.beneficiary_no || '-') + '</td><td>' + esc(x.village || '-') + '</td><td>' + esc(x.mobile || '-') + '</td><td></td></tr>';
        }).join('') : '<tr><td colspan="6" style="text-align:center">No participants recorded</td></tr>') +
        '</tbody></table>' +
        '<div class="print-sig">' +
        '<div class="sig-box">Event Coordinator</div>' +
        '<div class="sig-box">Authorized Signature</div>' +
        '</div>';
      go('print', { title: 'Event PDF (' + esc(e.name) + ')', content: h });
    }).catch(function (e) { toast(e.message); });
  }

  function screenPrint(p) {
    frame(p.title || 'Print / Export PDF',
      '<div class="print-wrap">' +
      '<div class="print-sheet" id="printContent">' + p.content + '</div>' +
      '</div>',
      { right: '<button data-act="do-print" aria-label="Print">&#128424; Print</button>' }
    );
  }

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
      '<div class="action-bar">' +
        '<button class="btn-act" data-act="export-people-csv"><span class="ic">&#128229;</span> Export CSV</button>' +
        '<button class="btn-act" data-act="export-people-pdf"><span class="ic">&#128196;</span> Export PDF</button>' +
        '<button class="btn-act" data-act="import-people-csv"><span class="ic">&#128228;</span> Import CSV</button>' +
        '<input type="file" id="importCsvInput" accept=".csv,text/csv" style="display:none;" />' +
      '</div>' +
      '<div class="sum" id="cnt"></div><div id="plist"></div><button class="fab" data-act="addp" aria-label="Add">+</button>',
      { right: '<button data-act="reload" aria-label="Refresh">&#8635;</button>' });
    $('#q').oninput = function () { ui.q = this.value; fillPeople(); };
    $('#cat').onchange = function () { ui.cat = this.value; fillPeople(); };
    var ci = $('#importCsvInput');
    if (ci) ci.onchange = function () { if (this.files && this.files[0]) { importPeopleCSV(this.files[0]); this.value = ''; } };
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
        '<div class="row"><button class="btn" data-act="card" data-id="' + esc(b.id) + '">ID Card</button><button class="btn sec" data-act="editp" data-id="' + esc(b.id) + '">Edit</button></div>' +
        '<button class="btn sec" data-act="print-person-pdf" data-id="' + esc(b.id) + '" style="margin-top:8px"><span class="ic">&#128424;</span> Print Profile PDF</button>');
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
      '<div class="sum" id="asum" style="margin-top:10px">Loading\u2026</div>' +
      '<div class="action-bar">' +
        '<button class="btn sec sm" id="allP" style="flex:1">Mark all Present</button>' +
        '<button class="btn-act" data-act="export-att-csv"><span class="ic">&#128229;</span> Export CSV</button>' +
        '<button class="btn-act" data-act="export-att-pdf"><span class="ic">&#128196;</span> Export PDF</button>' +
      '</div>' +
      '<div id="alist"></div>');
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
        '<div class="action-bar">' +
          '<button class="btn sm" data-act="addpart" data-id="' + esc(e.id) + '" style="flex:1">+ Add participant</button>' +
          '<button class="btn-act" data-act="export-event-csv" data-id="' + esc(e.id) + '"><span class="ic">&#128229;</span> Export CSV</button>' +
          '<button class="btn-act" data-act="export-event-pdf" data-id="' + esc(e.id) + '"><span class="ic">&#128196;</span> Export PDF</button>' +
        '</div>' +
        '<div class="sum">' + ps.length + ' participants</div>' +
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
    attendance: screenAttendance, events: screenEvents, event: screenEvent, eventForm: screenEventForm, partForm: screenParticipantForm, more: screenMore,
    print: screenPrint
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
    else if (act === 'print-person-pdf') printPersonPDF(id);
    else if (act === 'export-people-csv') exportPeopleCSV();
    else if (act === 'export-people-pdf') exportPeoplePDF();
    else if (act === 'import-people-csv') { var inp = $('#importCsvInput'); if (inp) inp.click(); }
    else if (act === 'export-att-csv') exportAttendanceCSV();
    else if (act === 'export-att-pdf') exportAttendancePDF();
    else if (act === 'export-event-csv') exportEventCSV(id);
    else if (act === 'export-event-pdf') exportEventPDF(id);
    else if (act === 'do-print') window.print();
    else if (act === 'close-modal') { var m = $('#importModal'); if (m) m.remove(); }
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

// 最小的 Google Apps Script 模擬環境：只實作本專案用到的 API，讓 Code.gs 能在 Node 跑流程測試。
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function makeSheet(name, book) {
  let data = [];
  const width = () => data.reduce((m, r) => Math.max(m, r.length), 0);
  const ensure = (r, c) => { while (data.length < r) data.push([]); data.forEach(row => { while (row.length < c) row.push(''); }); };
  const sheet = {
    name,
    getName: () => name,
    getDataRange: () => sheet.getRange(1, 1, Math.max(data.length, 1), Math.max(width(), 1)),
    getLastRow: () => { for (let i = data.length; i > 0; i--) if (data[i - 1].some(v => v !== '')) return i; return 0; },
    getLastColumn: () => width(),
    getRange(r, c, nr = 1, nc = 1) {
      return {
        getValues: () => { ensure(r + nr - 1, c + nc - 1); return data.slice(r - 1, r - 1 + nr).map(row => row.slice(c - 1, c - 1 + nc)); },
        setValues(v) { ensure(r + nr - 1, c + nc - 1); v.forEach((row, i) => row.forEach((x, j) => { data[r - 1 + i][c - 1 + j] = x; })); return this; },
        setValue(x) { ensure(r, c); data[r - 1][c - 1] = x; return this; },
        clearContent() { ensure(r + nr - 1, c + nc - 1); for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) data[r - 1 + i][c - 1 + j] = ''; return this; },
        setFontWeight() { return this; }, setBackground() { return this; }, setDataValidation() { return this; }
      };
    },
    appendRow(row) { data.push(row.slice()); },
    clear() { data = []; },
    setFrozenRows() {}, setColumnWidth() {}, activate() {},
    copyTo(b) { const s = b.insertSheet(name + ' copy'); s._data = JSON.parse(JSON.stringify(data)); return s; },
    setName(n) { book._rename(sheet, n); name = n; return sheet; },
    get _rows() { return data; },
    set _data(d) { data = d; }
  };
  return sheet;
}

function makeBook() {
  const sheets = {};
  const book = {
    getSheetByName: n => sheets[n] || null,
    insertSheet: n => (sheets[n] = makeSheet(n, book)),
    deleteSheet: s => { delete sheets[s.getName()]; },
    _rename(s, n) { delete sheets[s.getName()]; sheets[n] = s; },
    _sheets: sheets
  };
  return book;
}

function load(opts = {}) {
  const book = makeBook();
  const ui = {
    alerts: [], prompts: opts.prompts || [], answer: opts.answer || 'OK',
    ButtonSet: { OK: 'OK', OK_CANCEL: 'OK_CANCEL' }, Button: { OK: 'OK', CANCEL: 'CANCEL' },
    alert(title, msg) { ui.alerts.push(msg ? title + '｜' + msg : title); return ui.answer; },
    prompt() { const t = ui.prompts.shift() || ''; return { getSelectedButton: () => 'OK', getResponseText: () => t }; },
    createMenu() { const m = { addItem: () => m, addSeparator: () => m, addToUi: () => m }; return m; },
    showModalDialog(html) { ui.dialog = html.content; }
  };
  const users = opts.users || {};
  const ctx = {
    console,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => book, getUi: () => ui,
      newDataValidation: () => ({ requireCheckbox() { return this; }, build: () => ({}) })
    },
    UrlFetchApp: {
      fetch(url, o) {
        if (url.includes('api.line.me')) {
          const u = users[o.payload.id_token];
          return { getResponseCode: () => (u ? 200 : 400), getContentText: () => JSON.stringify(u ? { sub: u.userId, name: u.name } : {}) };
        }
        throw new Error('unexpected fetch ' + url);
      }
    },
    CacheService: { getScriptCache: () => ({ get: () => null, put() {} }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: 1 }, computeDigest: (a, s) => [...Buffer.from(s)], base64Encode: b => Buffer.from(b).toString('base64'),
      formatDate: () => '20261017'
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ text: t, setMimeType() { return this; } }) },
    Session: { getScriptTimeZone: () => 'Asia/Taipei' },
    HtmlService: { createHtmlOutput: c => ({ content: c, setWidth() { return this; }, setHeight() { return this; } }) }
  };
  vm.createContext(ctx);
  const root = path.join(__dirname, '..');
  for (const f of ['docs/pricing.js', 'apps-script/Import.gs', 'apps-script/Code.gs']) {
    vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
  }
  ctx.__book = book; ctx.__ui = ui;
  ctx.post = body => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).text);
  return ctx;
}

module.exports = { load };

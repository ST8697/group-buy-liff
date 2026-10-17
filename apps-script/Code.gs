/**
 * 團購點單後端：Google 試算表 + Apps Script Web App。
 * 需要同一專案內的 Pricing.gs（= docs/pricing.js）與 Import.gs。
 */

var SHEETS = {
  settings: '設定',
  products: '商品',
  members: '團員',
  items: '明細',
  orders: '官網購物車清單',
  lottery: '抽獎'
};

var HEADERS = {
  商品: ['類型', '商品鍵', '商品名稱', '款式', '所屬內衣', '圖片', '網址', '缺貨', '開放'],
  團員: ['LINE userId', '名稱', '取貨方式', '備註', '更新時間', '內衣件數', '內褲件數', '內衣金額', '內褲金額', '運費', '應付', '付款回報', '已付款', '已取貨', '受缺貨影響'],
  明細: ['LINE userId', '名稱', '類型', '商品鍵', '所屬內衣', '商品名稱', '款式', '數量'],
  抽獎: ['獎品', '得獎者', 'LINE userId', '抽獎時間']
};

// 設定工作表：[標籤, 預設值, 說明]
var SETTINGS = [
  ['團名', '24HRS 買5送1 內衣團', '顯示在點單頁標題'],
  ['活動網址', 'https://www.fashionforyes.com/categories/buy-5-get-1-free', '「匯入官網商品」的預設網址'],
  ['截止時間', '', '日期時間，例如 2026/10/20 22:00'],
  ['狀態', '開放點單', '開放點單／已截單／已結算（由選單自動切換）'],
  ['進度', '', '已下單／已到貨（手動填，團員頁面會顯示）'],
  ['付款期限', '', '顯示在群組公告與點單頁，例如 10/22 前'],
  ['轉帳資訊', '', '面交團員截單後看到，例如 822 中國信託 1234-5678-9012'],
  ['賣貨便連結', '', '賣貨便團員截單後看到（$1 商品的賣場網址）'],
  ['LIFF 網址', '', '例如 https://liff.line.me/1234567890-abcdefgh'],
  ['LINE Login Channel ID', '', '用來驗證團員身分，LINE Developers 後台的 Channel ID'],
  ['團主 LINE userId', '', '截單後仍可補件；先下一筆單，再從「團員」表複製'],
  ['單價', 460, '單件原價'],
  ['買N送1', 5, '買幾件送 1 件'],
  ['每單最多贈品', 10, ''],
  ['每單最多件數', 60, '含贈品'],
  ['團購級距', '10:400,30:380', '付費件數:單價，以 10 件為單位'],
  ['內褲加購價', 109, ''],
  ['賣貨便運費', 38, ''],
  ['滿額贈', '999:滿額贈內褲,2500:手洗精隨行包', '每張訂單達門檻送的贈品，會拿來抽獎'],
  ['最終單價', '', '結算後自動填入'],
  ['結算時間', '', '結算後自動填入']
];

// ---------- 試算表工具 ----------

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function sheet_(name) {
  var sh = ss_().getSheetByName(name);
  if (!sh) {
    sh = ss_().insertSheet(name);
    if (HEADERS[name]) {
      sh.getRange(1, 1, 1, HEADERS[name].length).setValues([HEADERS[name]]).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
  }
  return sh;
}

function readTable_(name) {
  var sh = sheet_(name), values = sh.getDataRange().getValues();
  var head = values.shift() || [];
  return values.filter(function (r) { return r.join('') !== ''; }).map(function (r) {
    var o = {};
    head.forEach(function (h, i) { o[h] = r[i]; });
    return o;
  });
}

function writeTable_(name, rows) {
  var sh = sheet_(name), head = HEADERS[name];
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
  if (!rows.length) return;
  sh.getRange(2, 1, rows.length, head.length).setValues(rows.map(function (o) {
    return head.map(function (h) { return o[h] === undefined ? '' : o[h]; });
  }));
}

function settings_() {
  var o = {};
  sheet_(SHEETS.settings).getDataRange().getValues().forEach(function (r) { if (r[0]) o[r[0]] = r[1]; });
  return o;
}

function setSetting_(key, value) {
  var sh = sheet_(SHEETS.settings), values = sh.getDataRange().getValues();
  for (var i = 0; i < values.length; i++) if (values[i][0] === key) { sh.getRange(i + 1, 2).setValue(value); return; }
  sh.appendRow([key, value, '']);
}

function pricingCfg_(st) {
  function list(str, f) {
    return String(str || '').split(/[,，]/).map(function (x) { return x.trim(); }).filter(String).map(function (x) {
      var p = x.split(/[:：]/); return f(p[0], p[1]);
    });
  }
  return Pricing.cfg({
    basePrice: Number(st['單價']) || undefined,
    buyN: Number(st['買N送1']) || undefined,
    maxFreePerOrder: Number(st['每單最多贈品']) || undefined,
    maxPerOrder: Number(st['每單最多件數']) || undefined,
    tiers: st['團購級距'] ? list(st['團購級距'], function (a, b) { return { min: Number(a), price: Number(b) }; }) : undefined,
    pantyPrice: Number(st['內褲加購價']) || undefined,
    shippingFee: st['賣貨便運費'] === '' ? undefined : Number(st['賣貨便運費']),
    gifts: st['滿額贈'] ? list(st['滿額贈'], function (a, b) { return { min: Number(a), name: b }; }) : []
  });
}

function isDate_(v) { return Object.prototype.toString.call(v) === '[object Date]'; }

function isOpen_(st) {
  if (st['狀態'] !== '開放點單') return false;
  var d = st['截止時間'];
  return !isDate_(d) || new Date() < d;
}

// ---------- Web API ----------

function doGet() {
  return json_({ ok: true, message: '團購 API 運作中，請從 LIFF 點單頁使用' });
}

function doPost(e) {
  try {
    var req = JSON.parse(e.postData.contents);
    var user = verifyUser_(req.idToken);
    var handlers = { state: apiState_, submit: apiSubmit_, report: apiReport_ };
    if (!handlers[req.action]) throw new Error('未知的動作');
    return json_(handlers[req.action](req, user));
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/** 向 LINE 驗證 ID token，回傳 { userId, name } */
function verifyUser_(idToken) {
  if (!idToken) throw new Error('請從 LINE 開啟點單頁');
  var cache = CacheService.getScriptCache();
  var hash = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, idToken));
  var hit = cache.get(hash);
  if (hit) return JSON.parse(hit);
  var channelId = String(settings_()['LINE Login Channel ID'] || '').trim();
  if (!channelId) throw new Error('團主尚未設定 LINE Login Channel ID');
  var res = UrlFetchApp.fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'post', payload: { id_token: idToken, client_id: channelId }, muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) throw new Error('登入已過期，請重新開啟點單頁');
  var body = JSON.parse(res.getContentText());
  var user = { userId: body.sub, name: body.name || 'LINE 使用者' };
  cache.put(hash, JSON.stringify(user), 600);
  return user;
}

function catalog_() {
  var rows = readTable_(SHEETS.products).filter(function (r) { return r['開放'] === true || r['開放'] === 'TRUE'; });
  var map = {}, order = [];
  rows.forEach(function (r) {
    if (r['類型'] !== '內衣') return;
    var k = r['商品鍵'];
    if (!map[k]) { map[k] = { key: k, name: r['商品名稱'], image: r['圖片'], url: r['網址'], variants: [], panties: [] }; order.push(k); }
    map[k].variants.push({ variant: String(r['款式']), soldOut: r['缺貨'] === true });
  });
  rows.forEach(function (r) {
    if (r['類型'] !== '內褲' || !map[r['所屬內衣']]) return;
    map[r['所屬內衣']].panties.push({ key: r['商品鍵'], name: r['商品名稱'], variant: String(r['款式']), soldOut: r['缺貨'] === true });
  });
  return order.map(function (k) { return map[k]; });
}

function apiState_(req, user) {
  var st = settings_(), cfg = pricingCfg_(st);
  var items = readTable_(SHEETS.items);
  var total = items.reduce(function (a, r) { return a + (r['類型'] === '內衣' ? Number(r['數量']) : 0); }, 0);
  var me = readTable_(SHEETS.members).filter(function (m) { return m['LINE userId'] === user.userId; })[0];
  var myItems = items.filter(function (r) { return r['LINE userId'] === user.userId; }).map(function (r) {
    return { type: r['類型'] === '內衣' ? 'bra' : 'panty', key: r['商品鍵'], parent: r['所屬內衣'], name: r['商品名稱'], variant: String(r['款式']), qty: Number(r['數量']) };
  });
  var settled = st['狀態'] === '已結算';
  var out = {
    ok: true,
    user: user,
    isOrganizer: user.userId === st['團主 LINE userId'],
    round: {
      name: st['團名'], deadline: isDate_(st['截止時間']) ? st['截止時間'].toISOString() : '',
      status: settled ? 'settled' : (isOpen_(st) ? 'open' : 'closed'),
      progress: st['進度'] || '', payDeadline: st['付款期限'] || '',
      unit: settled ? Number(st['最終單價']) : null
    },
    pricing: cfg,
    total: total,
    products: catalog_(),
    me: {
      pickup: me ? me['取貨方式'] : '', note: me ? me['備註'] : '', items: myItems
    }
  };
  if (settled && me) {
    out.me.bill = {
      bras: Number(me['內衣件數']), panties: Number(me['內褲件數']), braAmount: Number(me['內衣金額']),
      pantyAmount: Number(me['內褲金額']), shipping: Number(me['運費']), total: Number(me['應付']),
      report: me['付款回報'], paid: me['已付款'] === true, pickedUp: me['已取貨'] === true,
      soldOutNote: me['受缺貨影響'] || ''
    };
    out.me.payment = me['取貨方式'] === 'ship'
      ? { method: 'ship', link: st['賣貨便連結'] }
      : { method: 'face', info: st['轉帳資訊'] };
    out.lottery = readTable_(SHEETS.lottery).map(function (r) {
      return { prize: r['獎品'], winner: r['得獎者'], mine: r['LINE userId'] === user.userId };
    });
  }
  return out;
}

function apiSubmit_(req, user) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var st = settings_();
    var organizer = user.userId === st['團主 LINE userId'];
    if (st['狀態'] === '已結算') throw new Error('已結算，無法修改');
    if (!isOpen_(st) && !organizer) throw new Error('已截止，無法修改');
    if (['face', 'ship'].indexOf(req.pickup) < 0) throw new Error('請選擇取貨方式');
    var catalog = catalog_(), lookup = {};
    catalog.forEach(function (p) {
      p.variants.forEach(function (v) { lookup['bra|' + p.key + '|' + v.variant] = { name: p.name, parent: '', soldOut: v.soldOut }; });
      p.panties.forEach(function (v) { lookup['panty|' + v.key + '|' + v.variant + '|' + p.key] = { name: v.name, parent: p.key, soldOut: v.soldOut }; });
    });
    var items = (req.items || []).filter(function (it) { return Number(it.qty) > 0; }).map(function (it) {
      var id = it.type === 'bra' ? 'bra|' + it.key + '|' + it.variant : 'panty|' + it.key + '|' + it.variant + '|' + it.parent;
      var p = lookup[id];
      if (!p) throw new Error('商品已下架：' + it.variant);
      if (p.soldOut) throw new Error('已缺貨：' + p.name + ' ' + it.variant);
      return { type: it.type, key: it.key, parent: p.parent, name: p.name, variant: it.variant, qty: Math.min(99, Math.floor(Number(it.qty))) };
    });
    var err = Pricing.validateItems(items);
    if (err) throw new Error(err);

    var rows = readTable_(SHEETS.items).filter(function (r) { return r['LINE userId'] !== user.userId; });
    items.forEach(function (it) {
      rows.push({ 'LINE userId': user.userId, '名稱': user.name, '類型': it.type === 'bra' ? '內衣' : '內褲', '商品鍵': it.key, '所屬內衣': it.parent, '商品名稱': it.name, '款式': it.variant, '數量': it.qty });
    });
    writeTable_(SHEETS.items, rows);

    var members = readTable_(SHEETS.members), me = null;
    members.forEach(function (m) { if (m['LINE userId'] === user.userId) me = m; });
    if (!me) { me = { 'LINE userId': user.userId, '已付款': false, '已取貨': false }; members.push(me); }
    me['名稱'] = user.name;
    me['取貨方式'] = req.pickup;
    me['備註'] = String(req.note || '').slice(0, 200);
    me['更新時間'] = new Date();
    me['內衣件數'] = items.filter(function (i) { return i.type === 'bra'; }).reduce(function (a, i) { return a + i.qty; }, 0);
    me['內褲件數'] = items.filter(function (i) { return i.type === 'panty'; }).reduce(function (a, i) { return a + i.qty; }, 0);
    if (!items.length) members = members.filter(function (m) { return m !== me; });
    writeTable_(SHEETS.members, members);
    formatMembers_();
  } finally {
    lock.releaseLock();
  }
  return apiState_(req, user);
}

function apiReport_(req, user) {
  var text = String(req.text || '').trim().slice(0, 60);
  if (!text) throw new Error('請填寫付款資訊');
  var members = readTable_(SHEETS.members), found = false;
  members.forEach(function (m) { if (m['LINE userId'] === user.userId) { m['付款回報'] = text; found = true; } });
  if (!found) throw new Error('找不到你的訂單');
  writeTable_(SHEETS.members, members);
  formatMembers_();
  return apiState_(req, user);
}

/** 加上核取方塊格式但保留原本的勾選值（insertCheckboxes 會把值清成 false） */
function checkbox_(range) {
  range.setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
}

function formatMembers_() {
  var sh = sheet_(SHEETS.members), n = Math.max(sh.getLastRow() - 1, 1);
  checkbox_(sh.getRange(2, 13, n, 2));
}

// ---------- 試算表選單 ----------

function onOpen() {
  SpreadsheetApp.getUi().createMenu('🛒 團購')
    .addItem('1. 初始化試算表（第一次使用）', 'menuSetup')
    .addItem('2. 匯入官網商品', 'menuImport')
    .addSeparator()
    .addItem('3. 截單並結算', 'menuSettle')
    .addItem('4. 產生群組公告', 'menuAnnounce')
    .addItem('5. 查看官網購物車清單', 'menuOrders')
    .addSeparator()
    .addItem('重新開放點單', 'menuReopen')
    .addItem('新開一團（封存本團）', 'menuNewRound')
    .addToUi();
}

function menuSetup() {
  var sh = sheet_(SHEETS.settings), existing = settings_();
  if (sh.getLastRow() === 0) sh.appendRow(['項目', '值', '說明']);
  SETTINGS.forEach(function (r) { if (!(r[0] in existing)) sh.appendRow(r); });
  // 「10:400,30:380」這類值會被試算表自動轉成時間，文字類設定一律設為純文字格式
  var values = sh.getDataRange().getValues();
  SETTINGS.forEach(function (r) {
    if (typeof r[1] !== 'string' || r[0] === '截止時間') return;
    for (var i = 0; i < values.length; i++) {
      if (values[i][0] !== r[0]) continue;
      var cell = sh.getRange(i + 1, 2), v = values[i][1];
      cell.setNumberFormat('@');
      if (isDate_(v) || (v === '' && r[1] !== '')) cell.setValue(r[1]);
    }
  });
  sh.getRange(1, 1, 1, 3).setFontWeight('bold');
  sh.setColumnWidth(1, 170); sh.setColumnWidth(2, 320); sh.setColumnWidth(3, 360);
  ['商品', '團員', '明細', '抽獎'].forEach(sheet_);
  sheet_(SHEETS.orders);
  var def = ss_().getSheetByName('工作表1') || ss_().getSheetByName('Sheet1');
  if (def && def.getLastRow() === 0) ss_().deleteSheet(def);
  SpreadsheetApp.getUi().alert('初始化完成。請到「設定」填寫截止時間、轉帳資訊、賣貨便連結、LIFF 網址與 LINE Login Channel ID，再執行「匯入官網商品」。');
}

function menuImport() {
  var ui = SpreadsheetApp.getUi(), st = settings_();
  var r = ui.prompt('匯入官網商品', '活動頁網址（留空使用設定中的網址）：\n' + st['活動網址'], ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var url = r.getResponseText().trim() || st['活動網址'];
  if (r.getResponseText().trim()) setSetting_('活動網址', url);
  ui.alert(importProducts_(url));
}

/** 不跳對話框的匯入（可在 Apps Script 編輯器直接執行，結果看執行記錄） */
function runImport() {
  Logger.log(importProducts_(settings_()['活動網址']));
}

function importProducts_(url) {
  var products = fetchCampaign(url), rows = [];
  products.forEach(function (p) {
    p.variants.forEach(function (v) {
      rows.push({ '類型': '內衣', '商品鍵': p.id, '商品名稱': p.name, '款式': v.variant, '所屬內衣': '', '圖片': p.image, '網址': p.url, '缺貨': v.soldOut, '開放': p.eligible });
    });
    p.panties.forEach(function (v) {
      rows.push({ '類型': '內褲', '商品鍵': v.key, '商品名稱': v.name, '款式': v.variant, '所屬內衣': p.id, '圖片': '', '網址': '', '缺貨': v.soldOut, '開放': p.eligible });
    });
  });
  writeTable_(SHEETS.products, rows);
  var sh = sheet_(SHEETS.products);
  if (rows.length) checkbox_(sh.getRange(2, 8, rows.length, 2));
  var skipped = products.filter(function (p) { return !p.eligible; }).map(function (p) { return p.name; });
  return ('匯入 ' + products.length + ' 款商品（' + rows.length + ' 列）。' +
    (skipped.length ? '\n\n以下不參加買5送1，已預設不開放：\n' + skipped.join('\n') : '') +
    '\n\n可在「商品」表取消勾選「開放」來隱藏款式；截單後才缺貨請勾選「缺貨」再重新結算。');
}

function collect_() {
  var products = readTable_(SHEETS.products), soldOut = {};
  products.forEach(function (r) { if (r['缺貨'] === true) soldOut[r['類型'] + '|' + r['商品鍵'] + '|' + r['款式']] = true; });
  var affected = {}, items = [];
  readTable_(SHEETS.items).forEach(function (r) {
    var type = r['類型'] === '內衣' ? 'bra' : 'panty';
    if (soldOut[r['類型'] + '|' + r['商品鍵'] + '|' + r['款式']]) {
      (affected[r['LINE userId']] = affected[r['LINE userId']] || []).push(r['商品名稱'] + ' ' + r['款式'] + ' ×' + r['數量']);
      return;
    }
    items.push({ userId: r['LINE userId'], type: type, key: r['商品鍵'], parent: r['所屬內衣'], name: r['商品名稱'], variant: String(r['款式']), qty: Number(r['數量']) });
  });
  // 缺貨移除內衣後，內褲可能超過同款內衣件數：依比例裁掉
  var bras = {};
  items.forEach(function (i) { if (i.type === 'bra') bras[i.userId + '|' + i.key] = (bras[i.userId + '|' + i.key] || 0) + i.qty; });
  items.forEach(function (i) {
    if (i.type !== 'panty') return;
    var k = i.userId + '|' + i.parent, cap = bras[k] || 0, take = Math.min(i.qty, cap);
    if (take < i.qty) (affected[i.userId] = affected[i.userId] || []).push(i.name + ' ' + i.variant + ' 內褲 ×' + (i.qty - take));
    i.qty = take; bras[k] = cap - take;
  });
  var members = readTable_(SHEETS.members).map(function (m) {
    return { userId: m['LINE userId'], name: m['名稱'], pickup: m['取貨方式'] };
  });
  return { items: items, members: members, affected: affected };
}

function menuSettle() {
  var ui = SpreadsheetApp.getUi(), st = settings_();
  if (st['狀態'] === '開放點單') setSetting_('狀態', '已截單');
  var data = collect_(), cfg = pricingCfg_(st);
  var r = Pricing.settle(data.members, data.items, cfg);
  if (!r.ok) {
    ui.alert('還不能結算', r.message + '。\n\n狀態已改為「已截單」，團員無法再修改；團主可以用點單頁補件（需先在設定填「團主 LINE userId」），補好後再執行一次「截單並結算」。', ui.ButtonSet.OK);
    return;
  }
  var summary = '整團 ' + r.total + ' 件，拆成 ' + r.orders.length + ' 張訂單（' + r.orders.map(function (o) { return o.size; }).join('＋') + '）\n' +
    '每件內衣 $' + r.unit.toFixed(2) + '\n四捨五入差額：' + (r.roundingDiff >= 0 ? '多收 $' : '少收 $') + Math.abs(r.roundingDiff) + '\n' +
    '抽獎品項：' + (r.lottery.map(function (l) { return l.prize; }).join('、') || '無') + '\n\n確定結算並抽獎嗎？結算後團員就會看到應付金額。';
  if (ui.alert('截單並結算', summary, ui.ButtonSet.OK_CANCEL) !== ui.Button.OK) return;

  var bill = {};
  r.members.forEach(function (m) { bill[m.userId] = m; });
  var rows = readTable_(SHEETS.members).map(function (m) {
    var b = bill[m['LINE userId']] || { bras: 0, panties: 0, braAmount: 0, pantyAmount: 0, shipping: 0, total: 0 };
    m['內衣件數'] = b.bras; m['內褲件數'] = b.panties; m['內衣金額'] = b.braAmount; m['內褲金額'] = b.pantyAmount;
    m['運費'] = b.shipping; m['應付'] = b.total;
    m['受缺貨影響'] = (data.affected[m['LINE userId']] || []).join('、');
    return m;
  });
  writeTable_(SHEETS.members, rows);
  formatMembers_();
  var now = new Date();
  writeTable_(SHEETS.lottery, r.lottery.map(function (l) { return { '獎品': l.prize, '得獎者': l.winner, 'LINE userId': l.userId || '', '抽獎時間': now }; }));
  writeOrders_(r.orders, cfg);
  setSetting_('最終單價', Math.round(r.unit * 100) / 100);
  setSetting_('結算時間', now);
  setSetting_('狀態', '已結算');
  ui.alert('結算完成。下一步：選單「4. 產生群組公告」貼到 LINE 群組。');
}

function writeOrders_(orders, cfg) {
  var sh = sheet_(SHEETS.orders);
  sh.clear();
  var out = [['官網購物車清單（依序把每張訂單的商品加入購物車，結帳金額應接近「預估」）', '', '', '']];
  orders.forEach(function (o) {
    out.push(['', '', '', '']);
    out.push(['第 ' + o.no + ' 張訂單｜內衣 ' + o.size + ' 件' + (o.pantyCount ? '＋內褲 ' + o.pantyCount + ' 件' : '') + '｜預估 $' + o.estimate,
      o.gifts.length ? '滿額贈：' + o.gifts.join('、') : '', '', '']);
    out.push(['商品', '款式', '數量', '已加入購物車']);
    o.bras.forEach(function (b) { out.push([b.name, b.variant, b.qty, false]); });
    o.panties.forEach(function (p) { out.push(['（加購）' + p.name, p.variant, p.qty, false]); });
  });
  sh.getRange(1, 1, out.length, 4).setValues(out);
  sh.getRange(1, 1).setFontWeight('bold');
  out.forEach(function (row, i) {
    if (row[3] === false) checkbox_(sh.getRange(i + 1, 4));
    if (/^第 \d+ 張/.test(row[0])) sh.getRange(i + 1, 1, 1, 4).setFontWeight('bold').setBackground('#F3EAD7');
  });
  sh.setColumnWidth(1, 360); sh.setColumnWidth(2, 200);
}

function menuAnnounce() {
  var st = settings_();
  if (st['狀態'] !== '已結算') { SpreadsheetApp.getUi().alert('請先執行「截單並結算」'); return; }
  var lot = readTable_(SHEETS.lottery);
  var text = '【' + st['團名'] + '】已截單！\n' +
    '本團每件內衣 $' + Math.round(Number(st['最終單價'])) + '（加購內褲 $' + st['內褲加購價'] + '／件）\n\n' +
    '請打開點單頁查看自己的明細、應付金額與付款方式：\n' + (st['LIFF 網址'] || '（請在設定填 LIFF 網址）') + '\n' +
    (st['付款期限'] ? '付款期限：' + st['付款期限'] + '\n' : '') +
    (lot.length ? '\n🎁 抽獎結果\n' + lot.map(function (l) { return '・' + l['獎品'] + ' → ' + l['得獎者']; }).join('\n') + '\n' : '') +
    '\n收齊款項後就會到官網下單，謝謝大家！';
  var html = HtmlService.createHtmlOutput(
    '<textarea id="t" style="width:100%;height:300px;font-size:14px">' + text.replace(/</g, '&lt;') + '</textarea>' +
    '<button onclick="t.select();document.execCommand(\'copy\');this.textContent=\'已複製\'">複製</button>'
  ).setWidth(460).setHeight(380);
  SpreadsheetApp.getUi().showModalDialog(html, '群組公告');
}

function menuOrders() {
  var sh = ss_().getSheetByName(SHEETS.orders);
  if (!sh || sh.getLastRow() < 2) { SpreadsheetApp.getUi().alert('請先執行「截單並結算」'); return; }
  sh.activate();
}

function menuReopen() {
  var ui = SpreadsheetApp.getUi();
  if (ui.alert('重新開放點單', '會清除結算金額與抽獎結果，團員可以再次修改。確定嗎？', ui.ButtonSet.OK_CANCEL) !== ui.Button.OK) return;
  setSetting_('狀態', '開放點單');
  setSetting_('最終單價', '');
  writeTable_(SHEETS.lottery, []);
  ui.alert('已重新開放。若截止時間已過，請一併修改「設定」的截止時間。');
}

function menuNewRound() {
  var ui = SpreadsheetApp.getUi();
  if (ui.alert('新開一團', '會把本團的團員、明細、購物車清單、抽獎複製成封存工作表，然後清空。確定嗎？', ui.ButtonSet.OK_CANCEL) !== ui.Button.OK) return;
  var tag = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd');
  [SHEETS.members, SHEETS.items, SHEETS.orders, SHEETS.lottery].forEach(function (name) {
    var sh = ss_().getSheetByName(name);
    if (!sh || sh.getLastRow() < 2) return;
    var copy = sh.copyTo(ss_()), base = '封存' + tag + '-' + name, n = base, i = 2;
    while (ss_().getSheetByName(n)) n = base + '(' + i++ + ')';
    copy.setName(n);
  });
  writeTable_(SHEETS.members, []);
  writeTable_(SHEETS.items, []);
  writeTable_(SHEETS.lottery, []);
  sheet_(SHEETS.orders).clear();
  ['最終單價', '結算時間', '進度', '截止時間', '付款期限'].forEach(function (k) { setSetting_(k, ''); });
  setSetting_('狀態', '開放點單');
  ui.alert('已封存。請到「設定」更新團名與截止時間，再執行「匯入官網商品」。點單連結不用換。');
}

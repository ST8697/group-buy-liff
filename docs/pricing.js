/**
 * 團購計價核心：瀏覽器、Apps Script、Node 測試共用同一份。
 * Apps Script 端請把本檔內容整份貼到 Pricing.gs。
 */
var Pricing = (function () {
  var DEFAULTS = {
    basePrice: 460,          // 單件原價
    buyN: 5,                 // 買 N 送 1
    maxFreePerOrder: 10,     // 每單最多送幾件
    maxPerOrder: 60,         // 每單最多幾件（含贈品）
    tierUnit: 10,            // 團購價以幾件為單位
    tiers: [{ min: 10, price: 400 }, { min: 30, price: 380 }],
    pantyPrice: 109,
    shippingFee: 38,
    gifts: [{ min: 999, name: '滿額贈內褲' }, { min: 2500, name: '手洗精隨行包' }]
  };

  function cfg(s) {
    var o = {};
    for (var k in DEFAULTS) o[k] = DEFAULTS[k];
    if (s) for (var j in s) if (s[j] !== undefined && s[j] !== null && s[j] !== '') o[j] = s[j];
    return o;
  }

  function groupSize(s) { return s.buyN + 1; }

  /** 單張訂單 n 件內衣（含贈品）的官網結帳金額 */
  function orderCost(n, s) {
    s = cfg(s);
    var free = Math.min(Math.floor(n / groupSize(s)), s.maxFreePerOrder);
    var paid = n - free;
    var grouped = Math.floor(paid / s.tierUnit) * s.tierUnit;
    var tierPrice = s.basePrice;
    s.tiers.forEach(function (t) { if (grouped >= t.min && t.price < tierPrice) tierPrice = t.price; });
    return grouped * tierPrice + (paid - grouped) * s.basePrice;
  }

  /** 把 total 件（需為 6 的倍數）拆成多張訂單，總價最低；同價時單數較少優先 */
  function bestSplit(total, s) {
    s = cfg(s);
    var g = groupSize(s);
    if (total <= 0) return { cost: 0, orders: [] };
    if (total % g !== 0) throw new Error('總件數 ' + total + ' 不是 ' + g + ' 的倍數');
    var cost = [0], cnt = [0], pick = [0];
    for (var x = g; x <= total; x += g) {
      cost[x] = Infinity;
      for (var k = g; k <= Math.min(s.maxPerOrder, x); k += g) {
        var c = orderCost(k, s) + cost[x - k], n = cnt[x - k] + 1;
        if (c < cost[x] || (c === cost[x] && n < cnt[x])) { cost[x] = c; cnt[x] = n; pick[x] = k; }
      }
    }
    var orders = [];
    for (var r = total; r > 0; r -= pick[r]) orders.push(pick[r]);
    orders.sort(function (a, b) { return b - a; });
    return { cost: cost[total], orders: orders };
  }

  /**
   * 點單中即時預估。截單時團主會把件數補到 6 的倍數，
   * 所以單價以「補齊後的件數」計算；better 是往上 30 件內第一個更便宜的件數。
   */
  function estimate(total, s) {
    s = cfg(s);
    var g = groupSize(s);
    var filled = Math.max(g, Math.ceil(total / g) * g);
    var cur = bestSplit(filled, s);
    var unit = cur.cost / filled;
    var better = null;
    for (var t = filled + g; t <= filled + 30; t += g) {
      var u = bestSplit(t, s).cost / t;
      if (Math.round(u) < Math.round(unit)) { better = { total: t, unit: u }; break; }
    }
    return { total: total, filled: filled, gap: filled - total, unit: unit, orders: cur.orders, better: better };
  }

  /** 每人的內衣件數不可少於同款加購內褲件數 */
  function validateItems(items) {
    var bras = {}, panties = {};
    items.forEach(function (it) {
      if (!(it.qty > 0)) return;
      if (it.type === 'bra') bras[it.key] = (bras[it.key] || 0) + it.qty;
      else panties[it.parent] = (panties[it.parent] || 0) + it.qty;
    });
    for (var p in panties) if (panties[p] > (bras[p] || 0)) return '加購內褲不能超過同款內衣件數';
    return '';
  }

  /** 依件數加權抽獎；每個獎品獨立抽，同一人可中多次 */
  function drawLottery(tickets, prizes, rng) {
    rng = rng || Math.random;
    var pool = tickets.filter(function (t) { return t.count > 0; });
    var sum = pool.reduce(function (a, t) { return a + t.count; }, 0);
    return prizes.map(function (prize) {
      if (!sum) return { prize: prize, winner: '' };
      var r = rng() * sum, acc = 0;
      for (var i = 0; i < pool.length; i++) {
        acc += pool[i].count;
        if (r < acc) return { prize: prize, winner: pool[i].name, userId: pool[i].userId };
      }
      return { prize: prize, winner: pool[pool.length - 1].name, userId: pool[pool.length - 1].userId };
    });
  }

  /** 依拆單結果分配購物車：同款內衣盡量放同一張，內褲跟著同款內衣走 */
  function assignOrders(items, orderSizes, s) {
    s = cfg(s);
    var lines = {}, pantyLines = {};
    items.forEach(function (it) {
      if (!(it.qty > 0)) return;
      var id = it.key + '|' + it.variant;
      var bucket = it.type === 'bra' ? lines : pantyLines;
      if (!bucket[id]) bucket[id] = { key: it.key, parent: it.parent, name: it.name, variant: it.variant, qty: 0 };
      bucket[id].qty += it.qty;
    });
    var braList = Object.keys(lines).sort().map(function (k) { return lines[k]; });
    var orders = orderSizes.map(function (n, i) { return { no: i + 1, size: n, bras: [], panties: [] }; });
    var oi = 0, room = orders.length ? orders[0].size : 0;
    braList.forEach(function (l) {
      var left = l.qty;
      while (left > 0 && oi < orders.length) {
        var take = Math.min(left, room);
        orders[oi].bras.push({ key: l.key, name: l.name, variant: l.variant, qty: take });
        left -= take; room -= take;
        if (room === 0) { oi++; room = oi < orders.length ? orders[oi].size : 0; }
      }
    });
    Object.keys(pantyLines).sort().forEach(function (k) {
      var l = pantyLines[k], left = l.qty;
      orders.forEach(function (o) {
        if (!left) return;
        var cap = o.bras.filter(function (b) { return b.key === l.parent; }).reduce(function (a, b) { return a + b.qty; }, 0);
        var used = o.panties.filter(function (p) { return p.parent === l.parent; }).reduce(function (a, p) { return a + p.qty; }, 0);
        var take = Math.min(left, cap - used);
        if (take > 0) { o.panties.push({ key: l.key, parent: l.parent, name: l.name, variant: l.variant, qty: take }); left -= take; }
      });
    });
    orders.forEach(function (o) {
      o.braCost = orderCost(o.size, s);
      o.pantyCount = o.panties.reduce(function (a, p) { return a + p.qty; }, 0);
      o.estimate = o.braCost + o.pantyCount * s.pantyPrice;
      o.gifts = s.gifts.filter(function (g) { return o.estimate >= g.min; }).map(function (g) { return g.name; });
    });
    return orders;
  }

  /**
   * 截單結算。
   * members: [{userId, name, pickup: 'face'|'ship'}]
   * items:   [{userId, type: 'bra'|'panty', key, parent, name, variant, qty}]
   */
  function settle(members, items, s, rng) {
    s = cfg(s);
    var by = {};
    members.forEach(function (m) { by[m.userId] = { userId: m.userId, name: m.name, pickup: m.pickup, bras: 0, panties: 0 }; });
    items.forEach(function (it) {
      var m = by[it.userId];
      if (!m || !(it.qty > 0)) return;
      if (it.type === 'bra') m.bras += it.qty; else m.panties += it.qty;
    });
    var list = Object.keys(by).map(function (k) { return by[k]; }).filter(function (m) { return m.bras > 0; });
    var total = list.reduce(function (a, m) { return a + m.bras; }, 0);
    var g = groupSize(s);
    if (total === 0) return { ok: false, total: 0, need: g, message: '目前沒有任何訂單' };
    if (total % g !== 0) return { ok: false, total: total, need: g - total % g, message: '總件數 ' + total + ' 件，需再補 ' + (g - total % g) + ' 件才是 ' + g + ' 的倍數' };
    var split = bestSplit(total, s);
    var unit = split.cost / total;
    var collected = 0;
    list.forEach(function (m) {
      m.braAmount = Math.round(m.bras * unit);
      m.pantyAmount = m.panties * s.pantyPrice;
      m.shipping = m.pickup === 'ship' ? s.shippingFee : 0;
      m.total = m.braAmount + m.pantyAmount + m.shipping;
      collected += m.braAmount;
    });
    var orders = assignOrders(items.filter(function (it) { return by[it.userId] && by[it.userId].bras > 0; }), split.orders, s);
    var prizes = [];
    orders.forEach(function (o) { prizes = prizes.concat(o.gifts); });
    var lottery = drawLottery(list.map(function (m) { return { userId: m.userId, name: m.name, count: m.bras }; }), prizes, rng);
    return {
      ok: true, total: total, unit: unit, braCost: split.cost,
      roundingDiff: collected - split.cost,
      members: list, orders: orders, lottery: lottery
    };
  }

  return {
    DEFAULTS: DEFAULTS, cfg: cfg, orderCost: orderCost, bestSplit: bestSplit, estimate: estimate,
    validateItems: validateItems, drawLottery: drawLottery, assignOrders: assignOrders, settle: settle
  };
})();

if (typeof module !== 'undefined') module.exports = Pricing;

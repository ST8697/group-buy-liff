// 示範模式：模擬 Apps Script 回應，讓頁面在沒有後端時也能操作。
// 網址加 ?demo=open | closed | organizer | settled-face | settled-ship 可切換情境。
var MockApi = (function () {
  var OTHERS = 37;
  var scenario = new URLSearchParams(location.search).get('demo') || 'open';
  var products = null;
  var saved = { pickup: '', note: '', items: [] };

  function load() {
    if (products) return Promise.resolve(products);
    return fetch('demo-products.json').then(function (r) { return r.json(); }).then(function (p) { return (products = p); });
  }

  function demoSettledItems(p) {
    return [
      { type: 'bra', key: p[0].key, name: p[0].name, variant: p[0].variants[1].variant, qty: 4 },
      { type: 'bra', key: p[3].key, name: p[3].name, variant: p[3].variants[0].variant, qty: 2 },
      { type: 'panty', key: p[0].panties[0].key, parent: p[0].key, name: p[0].panties[0].name, variant: p[0].panties[0].variant, qty: 2 }
    ];
  }

  function state() {
    var settled = scenario.indexOf('settled') === 0;
    var deadline = new Date(Date.now() + (scenario === 'open' ? 2.3 * 864e5 : -36e5));
    var mine = saved.items.filter(function (i) { return i.type === 'bra'; }).reduce(function (a, i) { return a + i.qty; }, 0);
    var out = {
      ok: true,
      user: { userId: 'Udemo', name: '示範使用者' },
      isOrganizer: scenario === 'organizer',
      round: {
        name: '24HRS 買5送1 內衣團（示範）', deadline: deadline.toISOString(),
        status: settled ? 'settled' : (scenario === 'open' ? 'open' : 'closed'),
        progress: '', payDeadline: settled ? '10/22（四）前' : '', unit: settled ? 316.67 : null
      },
      pricing: Pricing.cfg(),
      total: OTHERS + mine,
      products: products,
      me: { pickup: saved.pickup, note: saved.note, items: saved.items }
    };
    if (settled) {
      var ship = scenario === 'settled-ship';
      out.total = 36;
      out.me.pickup = ship ? 'ship' : 'face';
      out.me.items = demoSettledItems(products);
      out.me.bill = { bras: 6, panties: 2, braAmount: 1900, pantyAmount: 218, shipping: ship ? 38 : 0, total: 2118 + (ship ? 38 : 0), report: saved.report || '', paid: false, pickedUp: false, soldOutNote: '' };
      out.me.payment = ship ? { method: 'ship', link: 'https://myship.7-11.com.tw/general/detail/GM0000000000000' } : { method: 'face', info: '822 中國信託 1234-5678-9012（戶名：王小明）' };
      out.lottery = [{ prize: '滿額贈內褲', winner: '示範使用者', mine: true }, { prize: '手洗精隨行包', winner: 'Amy', mine: false }];
    }
    return out;
  }

  function call(action, body) {
    return load().then(function () {
      return new Promise(function (resolve) { setTimeout(resolve, 250); });
    }).then(function () {
      if (action === 'submit') {
        var st = state();
        if (st.round.status === 'settled') return { ok: false, error: '已結算，無法修改' };
        if (st.round.status === 'closed' && !st.isOrganizer) return { ok: false, error: '已截止，無法修改' };
        if (['face', 'ship'].indexOf(body.pickup) < 0) return { ok: false, error: '請選擇取貨方式' };
        var err = Pricing.validateItems(body.items);
        if (err) return { ok: false, error: err };
        saved = { pickup: body.pickup, note: body.note, items: body.items.filter(function (i) { return i.qty > 0; }) };
      }
      if (action === 'report') saved.report = body.text;
      return state();
    });
  }

  return { call: call, scenario: scenario };
})();

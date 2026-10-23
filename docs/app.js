(function () {
  var CONFIG = window.APP_CONFIG || {};
  var params = new URLSearchParams(location.search);
  var DEMO = !CONFIG.API_URL || params.has('demo');

  var FLOW = {
    face: { title: '面交', icon: '🤝', steps: ['截單後在此頁看到應付金額', '依頁面上的轉帳資訊匯款', '回填轉帳帳號後五碼', '到貨後團主通知面交'] },
    ship: { title: '賣貨便寄送', icon: '📦', steps: ['截單後在此頁看到應付金額（含運費 ${fee}）', '點頁面上的賣貨便連結', '購買「$1」商品，數量 = 應付金額，選取貨門市', '回填賣貨便訂單編號，到貨後寄出'] }
  };
  var PROGRESS = ['已截單', '已付款', '已下單', '已到貨', '已取貨'];

  var S = null;            // 伺服器狀態
  var cart = {};           // id -> {type,key,parent,variant,qty}
  var pickup = '', note = '';
  var openKey = null, sheetOpen = false, err = '', busy = false, idToken = '';

  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  function money(n) { return '$' + Math.round(n).toLocaleString(); }
  function id(type, key, variant, parent) { return [type, key, variant, parent || ''].join('|'); }

  // ---------- API ----------

  function api(action, body) {
    body = body || {};
    if (DEMO) return MockApi.call(action, body);
    body.action = action;
    body.idToken = idToken;
    return fetch(CONFIG.API_URL, { method: 'POST', body: JSON.stringify(body) })
      .then(function (r) { return r.json(); })
      .catch(function () { return { ok: false, error: '連線失敗，請稍後再試' }; });
  }

  function boot() {
    if (DEMO) { showDemoBar(); return refresh(); }
    if (!window.liff) return fatal('LINE 元件載入失敗，請重新開啟');
    liff.init({ liffId: CONFIG.LIFF_ID }).then(function () {
      if (!liff.isLoggedIn()) { liff.login({ redirectUri: location.href }); return; }
      idToken = liff.getIDToken();
      return refresh();
    }).catch(function (e) { fatal('LINE 初始化失敗：' + e.message); });
  }

  function refresh() {
    return api('state').then(function (res) {
      if (!res.ok) return handleError(res.error);
      apply(res, true);
    });
  }

  function handleError(msg) {
    if (!DEMO && /登入已過期/.test(msg)) { liff.login({ redirectUri: location.href }); return; }
    if (!S) return fatal(msg);
    err = msg; busy = false; render();
  }

  function fatal(msg) { $('main').innerHTML = '<p class="empty">' + esc(msg) + '</p>'; $('bar').hidden = true; }

  function apply(res, resetCart) {
    S = res;
    if (resetCart) {
      cart = {};
      (S.me.items || []).forEach(function (i) { cart[id(i.type, i.key, i.variant, i.parent)] = { type: i.type, key: i.key, parent: i.parent || '', variant: i.variant, qty: i.qty }; });
      pickup = S.me.pickup || '';
      note = S.me.note || '';
    }
    render();
  }

  // ---------- 計算 ----------

  function editable() { return S.round.status === 'open' || (S.round.status === 'closed' && S.isOrganizer); }
  function qty(i) { return (cart[i] && cart[i].qty) || 0; }
  function myBras() { return sumType('bra'); }
  function sumType(t) { var n = 0; for (var k in cart) if (cart[k].type === t) n += cart[k].qty; return n; }
  function savedBras() { return (S.me.items || []).filter(function (i) { return i.type === 'bra'; }).reduce(function (a, i) { return a + i.qty; }, 0); }
  function liveTotal() { return S.total - savedBras() + myBras(); }
  function brasOf(key) { var n = 0; for (var k in cart) if (cart[k].type === 'bra' && cart[k].key === key) n += cart[k].qty; return n; }
  function pantiesOf(key) { var n = 0; for (var k in cart) if (cart[k].type === 'panty' && cart[k].parent === key) n += cart[k].qty; return n; }
  function cartItems() { var a = []; for (var k in cart) if (cart[k].qty > 0) a.push(cart[k]); return a; }

  function signature(items, p, n) {
    return JSON.stringify([items.map(function (i) { return id(i.type, i.key, i.variant, i.parent) + '=' + i.qty; }).sort(), p || '', n || '']);
  }
  function dirty() { return signature(cartItems(), pickup, note) !== signature(S.me.items || [], S.me.pickup, S.me.note); }

  // ---------- 畫面 ----------

  function render() {
    renderHeader();
    if (S.round.status === 'settled') return renderSettled();
    var h = '';
    if (S.round.status === 'closed') {
      h += S.isOrganizer
        ? '<div class="banner">已截單｜團主補件模式：補到 6 的倍數後，回試算表執行「截單並結算」。</div>'
        : '<div class="banner">已截單，正在等團主結算。結算後這裡會顯示你的應付金額與付款方式。</div>';
    }
    h += '<h2>1. 選擇取貨方式</h2><div class="card pad"><div class="opts">' + ['face', 'ship'].map(optHtml).join('') + '</div></div>';
    h += '<h2>2. 挑選內衣</h2>';
    if (!S.products.length) h += '<p class="empty">團主還沒開放商品</p>';
    S.products.forEach(function (p) { h += productHtml(p); });
    $('main').innerHTML = h;
    renderBar();
  }

  function renderHeader() {
    $('round-name').textContent = document.title = S.round.name || '內衣團購';
    var d = S.round.deadline ? new Date(S.round.deadline) : null;
    var cd = '';
    if (S.round.status === 'settled') cd = '已結算';
    else if (S.round.status === 'closed') cd = '已截單';
    else if (d) {
      var ms = d - Date.now(), dd = Math.floor(ms / 864e5), hh = Math.floor(ms % 864e5 / 36e5), mm = Math.floor(ms % 36e5 / 6e4);
      cd = '⏰ ' + (d.getMonth() + 1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ' 截止' +
        (ms <= 0 ? '' : '（剩 ' + (dd ? dd + ' 天 ' : '') + (hh || dd ? hh + ' 小時' : mm + ' 分') + '）');
    }
    $('countdown').textContent = cd;
    var labels = document.querySelectorAll('.stats small');
    if (S.round.status === 'settled') {
      var b = S.me.bill;
      labels[0].textContent = '我的內衣'; labels[1].textContent = '本團單價'; labels[2].textContent = '應付';
      $('stat-total').textContent = b ? b.bras + ' 件' : '-';
      $('stat-unit').textContent = money(S.round.unit);
      $('stat-gap').textContent = b ? money(b.total) : '-';
      return;
    }
    labels[0].textContent = '已湊到'; labels[1].textContent = '目前單價'; labels[2].textContent = '湊滿 6 件';
    var t = liveTotal(), e = Pricing.estimate(t, S.pricing);
    $('stat-total').textContent = t + ' 件';
    $('stat-unit').textContent = money(e.unit);
    $('stat-gap').textContent = e.gap ? '差 ' + e.gap + ' 件' : '已湊滿';
  }

  function optHtml(k) {
    var f = FLOW[k], fee = money(S.pricing.shippingFee);
    return '<button class="opt' + (pickup === k ? ' on' : '') + '" data-pick="' + k + '"' + (editable() ? '' : ' disabled') + '>' +
      '<b>' + f.icon + ' ' + f.title + (pickup === k ? ' ✓' : '') + '</b><ol>' +
      f.steps.map(function (s) { return '<li>' + esc(s.replace('${fee}', fee)) + '</li>'; }).join('') + '</ol></button>';
  }

  function productHtml(p) {
    var cnt = brasOf(p.key), isOpen = openKey === p.key, can = editable();
    var h = '<div class="card"><button class="prod-head" data-open="' + esc(p.key) + '">' +
      (p.image ? '<img src="' + esc(p.image) + '" alt="" loading="lazy">' : '<span class="ph-img"></span>') +
      '<span class="info"><span class="name">' + esc(p.name) + '</span><br><span class="muted">' + p.variants.length + ' 種顏色/款式' +
      (p.panties.length ? '｜可加購同款內褲 ' + money(S.pricing.pantyPrice) : '') + '</span>' +
      (cnt ? '<br><span class="chip">已選 ' + cnt + ' 件' + (pantiesOf(p.key) ? '＋內褲 ' + pantiesOf(p.key) : '') + '</span>' : '') +
      '</span><span class="arrow">' + (isOpen ? '▴' : '▾') + '</span></button>';
    if (isOpen) {
      h += '<div class="variants">';
      p.variants.forEach(function (v) { h += rowHtml(id('bra', p.key, v.variant), v.variant, v.soldOut, can, null); });
      if (p.panties.length) {
        var left = cnt - pantiesOf(p.key);
        h += '<div class="sub">加購同款內褲（最多 ' + cnt + ' 件' + (cnt ? '' : '，請先選內衣') + '）</div>';
        p.panties.forEach(function (v) { h += rowHtml(id('panty', v.key, v.variant, p.key), v.variant + ' 內褲', v.soldOut, can, left); });
      }
      if (p.url) h += '<div class="sub"><a class="ext" href="' + esc(p.url) + '" target="_blank" rel="noopener">看官網商品介紹 ↗</a></div>';
      h += '</div>';
    }
    return h + '</div>';
  }

  function rowHtml(i, label, soldOut, can, pantyLeft) {
    var q = qty(i);
    var plusOk = can && !soldOut && (pantyLeft == null || pantyLeft > 0) && q < 99;
    return '<div class="row' + (soldOut ? ' sold' : '') + '"><span>' + esc(label) + (soldOut ? '（缺貨）' : '') + '</span>' +
      '<span class="stepper"><button data-step="' + esc(i) + '" data-d="-1" aria-label="減少"' + (can && q ? '' : ' disabled') + '>−</button>' +
      '<output>' + q + '</output><button data-step="' + esc(i) + '" data-d="1" aria-label="增加"' + (plusOk ? '' : ' disabled') + '>＋</button></span></div>';
  }

  function renderBar() {
    var bars = myBras(), pants = sumType('panty');
    var unit = Pricing.estimate(liveTotal(), S.pricing).unit;
    var est = bars * unit + pants * S.pricing.pantyPrice + (pickup === 'ship' && bars ? S.pricing.shippingFee : 0);
    var can = editable(), d = can && dirty();
    var h = '<div class="inner">';
    if (sheetOpen) {
      h += '<b>我的訂單</b>';
      var items = cartItems();
      if (!items.length) h += '<p class="muted">還沒選任何商品</p>';
      items.forEach(function (it) {
        var name = it.type === 'bra' ? productName(it.key) : '內褲';
        h += '<div class="row"><span>' + esc(name) + '・' + esc(it.variant) + '</span><span>× ' + it.qty + '</span></div>';
      });
      h += '<div class="row"><span>取貨方式</span><span>' + (pickup ? FLOW[pickup].title : '<span class="dirty">尚未選擇</span>') + '</span></div>';
      h += '<textarea id="note" rows="2" maxlength="200" placeholder="備註（選填），例如：想跟同事一起取貨"' + (can ? '' : ' disabled') + '>' + esc(note) + '</textarea>';
    }
    h += '<div class="sum"><span>🛍 我的 ' + bars + ' 件' + (pants ? '＋內褲 ' + pants : '') + (d ? ' <span class="dirty">・尚未送出</span>' : '') + '</span>' +
      '<span>預估 <span class="amt">' + money(est) + '</span></span></div>';
    h += '<div class="muted">最終金額以截單時的單價為準</div>';
    if (err) h += '<div class="err">' + esc(err) + '</div>';
    if (sheetOpen) {
      h += '<div class="btns"><button data-act="close">繼續選</button>' +
        (can ? '<button class="pri" data-act="submit"' + (busy ? ' disabled' : '') + '>' + (busy ? '送出中…' : (S.me.items && S.me.items.length ? '更新訂單' : '送出訂單')) + '</button>' : '') + '</div>';
      if (can && S.me.items && S.me.items.length) h += '<div class="sub" style="text-align:center"><a href="#" class="ext" data-act="cancel">取消我的訂單</a></div>';
    } else {
      h += '<div class="btns"><button class="pri" data-act="open">查看我的訂單 ▴</button></div>';
    }
    $('bar').innerHTML = h + '</div>';
    $('bar').hidden = false;
  }

  function productName(key) {
    for (var i = 0; i < S.products.length; i++) if (S.products[i].key === key) return S.products[i].name.replace('24HRS', '');
    return '';
  }

  function renderSettled() {
    var b = S.me.bill;
    $('bar').hidden = true;
    if (!b) { $('main').innerHTML = '<p class="empty">本團已結算，你這次沒有參加。</p>'; return; }
    var h = '';
    if (b.soldOutNote) h += '<div class="banner warn">以下品項缺貨已取消：' + esc(b.soldOutNote) + '</div>';
    h += '<h2>我的明細</h2><div class="card pad">';
    (S.me.items || []).forEach(function (it) {
      h += '<div class="row"><span>' + esc(it.type === 'bra' ? productName(it.key) : '內褲') + '・' + esc(it.variant) + '</span><span>× ' + it.qty + '</span></div>';
    });
    h += '<div class="row"><span>內衣 ' + b.bras + ' × ' + money(S.round.unit) + '</span><span>' + money(b.braAmount) + '</span></div>';
    if (b.panties) h += '<div class="row"><span>內褲 ' + b.panties + ' × ' + money(S.pricing.pantyPrice) + '</span><span>' + money(b.pantyAmount) + '</span></div>';
    if (b.shipping) h += '<div class="row"><span>賣貨便運費</span><span>' + money(b.shipping) + '</span></div>';
    h += '<div class="row"><b>應付</b><span class="total">' + money(b.total) + '</span></div></div>';

    var pay = S.me.payment || {};
    h += '<h2>付款方式</h2><div class="card pad">';
    if (pay.method === 'ship') {
      h += '<b>📦 賣貨便</b><ol style="padding-left:18px;margin:6px 0">' +
        '<li>開啟賣場：' + (pay.link ? '<a class="ext" href="' + esc(pay.link) + '" target="_blank" rel="noopener">賣貨便連結 ↗</a>' : '（團主尚未提供）') + '</li>' +
        '<li>商品「$1」購買 <b>' + b.total.toLocaleString() + '</b> 件</li><li>選擇取貨門市並完成下單</li></ol>';
    } else {
      h += '<b>🤝 面交・轉帳</b><p style="margin:6px 0">' + (pay.info ? esc(pay.info) : '（團主尚未提供轉帳資訊）') + '</p>';
    }
    if (S.round.payDeadline) h += '<p class="muted">付款期限：' + esc(S.round.payDeadline) + '</p>';
    h += '<input id="report" placeholder="' + (pay.method === 'ship' ? '賣貨便訂單編號' : '轉帳帳號後五碼') + '" value="' + esc(b.report || '') + '">' +
      '<button class="pri" style="margin-top:8px" data-act="report"' + (busy ? ' disabled' : '') + '>' + (b.report ? '更新付款回報' : '回報付款') + '</button>' +
      (b.report ? '<p class="muted">已回報：' + esc(b.report) + (b.paid ? '・團主已確認收款 ✓' : '・等待團主確認') + '</p>' : '') +
      (err ? '<div class="err">' + esc(err) + '</div>' : '') + '</div>';

    if (S.lottery && S.lottery.length) {
      h += '<h2>🎁 抽獎結果</h2><div class="card pad">';
      S.lottery.forEach(function (l) {
        h += '<div class="row"><span>' + esc(l.prize) + '</span><span class="' + (l.mine ? 'win' : '') + '">' + esc(l.winner) + (l.mine ? '（你）' : '') + '</span></div>';
      });
      h += '<p class="muted">每件內衣一張籤，依件數加權抽出</p></div>';
    }

    var step = b.pickedUp ? 4 : S.round.progress === '已到貨' ? 3 : S.round.progress === '已下單' ? 2 : b.paid ? 1 : 0;
    h += '<h2>進度</h2><div class="card pad"><div class="steps">' + PROGRESS.map(function (s, i) {
      return '<span class="' + (i === step ? 'on' : '') + '">' + (i <= step ? '● ' : '○ ') + s + '</span>' + (i < PROGRESS.length - 1 ? '<span>→</span>' : '');
    }).join('') + '</div></div>';
    $('main').innerHTML = h;
  }

  function toast(msg) {
    var t = $('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { t.hidden = true; }, 2200);
  }

  // ---------- 事件 ----------

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-pick],[data-open],[data-step],[data-act]');
    if (!el || el.disabled) return;
    if (el.dataset.pick) { pickup = el.dataset.pick; err = ''; return render(); }
    if (el.dataset.open) { openKey = openKey === el.dataset.open ? null : el.dataset.open; return render(); }
    if (el.dataset.step) return step(el.dataset.step, Number(el.dataset.d));
    var act = el.dataset.act;
    if (act === 'open') { sheetOpen = true; return renderBar(); }
    if (act === 'close') { sheetOpen = false; err = ''; return renderBar(); }
    if (act === 'submit') return submit();
    if (act === 'cancel') { e.preventDefault(); return cancelOrder(); }
    if (act === 'report') return report();
  });

  document.addEventListener('input', function (e) { if (e.target.id === 'note') note = e.target.value; });

  function step(i, d) {
    var parts = i.split('|');
    if (!cart[i]) cart[i] = { type: parts[0], key: parts[1], variant: parts[2], parent: parts[3], qty: 0 };
    cart[i].qty = Math.max(0, cart[i].qty + d);
    // 減少內衣時，內褲不能超過內衣件數
    if (parts[0] === 'bra') {
      var over = pantiesOf(parts[1]) - brasOf(parts[1]);
      for (var k in cart) if (over > 0 && cart[k].type === 'panty' && cart[k].parent === parts[1] && cart[k].qty) {
        var cut = Math.min(over, cart[k].qty); cart[k].qty -= cut; over -= cut;
      }
    }
    err = '';
    var y = window.scrollY;
    render();
    window.scrollTo(0, y);
  }

  function submit() {
    if (!pickup) { err = '請先在最上方選擇取貨方式'; window.scrollTo({ top: 0, behavior: 'smooth' }); return render(); }
    if (!myBras()) { err = '請先選擇至少一件內衣'; return renderBar(); }
    send(cartItems(), '已送出，截止前都能修改');
  }

  function cancelOrder() {
    if (!confirm('確定要取消你的訂單嗎？')) return;
    cart = {};
    send([], '已取消訂單');
  }

  function send(items, okMsg) {
    busy = true; err = ''; renderBar();
    api('submit', { pickup: pickup || 'face', note: note, items: items }).then(function (res) {
      busy = false;
      if (!res.ok) return handleError(res.error);
      sheetOpen = false;
      apply(res, true);
      toast(okMsg);
    });
  }

  function report() {
    var v = $('report').value.trim();
    if (!v) { err = '請填寫付款資訊'; return renderSettled(); }
    busy = true; err = ''; renderSettled();
    api('report', { text: v }).then(function (res) {
      busy = false;
      if (!res.ok) return handleError(res.error);
      apply(res, false);
      toast('已回報，等待團主確認');
    });
  }

  function showDemoBar() {
    var bar = $('demo-bar');
    bar.hidden = false;
    var cur = MockApi.scenario;
    bar.innerHTML = '示範模式（假資料）：' + [['open', '點單中'], ['organizer', '截單・團主補件'], ['closed', '截單・團員'], ['settled-face', '結算・面交'], ['settled-ship', '結算・賣貨便']]
      .map(function (s) { return '<button onclick="location.search=\'?demo=' + s[0] + '\'"' + (s[0] === cur ? ' disabled' : '') + '>' + s[1] + '</button>'; }).join('');
  }

  setInterval(function () { if (S && S.round.status === 'open') renderHeader(); }, 60000);
  boot();
})();

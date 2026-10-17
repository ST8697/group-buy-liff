// 在模擬的 Apps Script 環境跑完整一團：初始化 → 點單 → 截單 → 團主補件 → 結算 → 公告 → 付款回報 → 新開一團
const test = require('node:test');
const assert = require('node:assert');
const { load } = require('./fake-gas');

const USERS = {
  t1: { userId: 'U1', name: '小美' },
  t2: { userId: 'U2', name: 'Amy' },
  t0: { userId: 'U0', name: '團主' }
};

function setup() {
  const g = load({ users: USERS });
  g.menuSetup();
  g.setSetting_('LINE Login Channel ID', '123');
  g.setSetting_('團主 LINE userId', 'U0');
  g.setSetting_('轉帳資訊', '822 1234');
  g.setSetting_('賣貨便連結', 'https://myship.example');
  g.writeTable_('商品', [
    { 類型: '內衣', 商品鍵: 'A', 商品名稱: '經典款', 款式: '黑', 缺貨: false, 開放: true },
    { 類型: '內衣', 商品鍵: 'A', 商品名稱: '經典款', 款式: '白桃', 缺貨: false, 開放: true },
    { 類型: '內衣', 商品鍵: 'B', 商品名稱: '深V', 款式: '膚', 缺貨: false, 開放: true },
    { 類型: '內衣', 商品鍵: 'Z', 商品名稱: '青春期', 款式: 'S', 缺貨: false, 開放: false },
    { 類型: '內褲', 商品鍵: 'PA', 商品名稱: '經典內褲', 款式: '黑色', 所屬內衣: 'A', 缺貨: false, 開放: true }
  ]);
  return g;
}

test('完整一團流程', () => {
  const g = setup();

  let s = g.post({ action: 'state', idToken: 't1' });
  assert.ok(s.ok, s.error);
  assert.strictEqual(s.round.status, 'open');
  assert.deepStrictEqual(s.products.map(p => p.key), ['A', 'B']);
  assert.strictEqual(s.products[0].panties.length, 1);

  // 沒選取貨方式、內褲超量、已關閉商品都要擋
  assert.match(g.post({ action: 'submit', idToken: 't1', items: [] }).error, /取貨方式/);
  assert.match(g.post({ action: 'submit', idToken: 't1', pickup: 'face', items: [
    { type: 'bra', key: 'A', variant: '黑', qty: 1 }, { type: 'panty', key: 'PA', parent: 'A', variant: '黑色', qty: 2 }] }).error, /內褲/);
  assert.match(g.post({ action: 'submit', idToken: 't1', pickup: 'face', items: [{ type: 'bra', key: 'Z', variant: 'S', qty: 1 }] }).error, /下架/);
  assert.match(g.post({ action: 'state', idToken: 'bad' }).error, /登入/);

  s = g.post({ action: 'submit', idToken: 't1', pickup: 'face', note: '同事一起取', items: [
    { type: 'bra', key: 'A', variant: '黑', qty: 20 }, { type: 'panty', key: 'PA', parent: 'A', variant: '黑色', qty: 3 }] });
  assert.ok(s.ok, s.error);
  assert.strictEqual(s.total, 20);
  assert.strictEqual(s.me.items.length, 2);

  // 修改：覆蓋而不是累加
  s = g.post({ action: 'submit', idToken: 't1', pickup: 'face', items: [
    { type: 'bra', key: 'A', variant: '黑', qty: 18 }, { type: 'panty', key: 'PA', parent: 'A', variant: '黑色', qty: 3 }] });
  assert.strictEqual(s.total, 18);

  g.post({ action: 'submit', idToken: 't2', pickup: 'ship', items: [{ type: 'bra', key: 'B', variant: '膚', qty: 10 }] });

  // 28 件不是 6 的倍數 → 結算被擋、狀態變已截單
  g.menuSettle();
  assert.match(g.__ui.alerts.pop(), /補 2 件/);
  assert.strictEqual(g.settings_()['狀態'], '已截單');
  assert.match(g.post({ action: 'submit', idToken: 't2', pickup: 'ship', items: [{ type: 'bra', key: 'B', variant: '膚', qty: 12 }] }).error, /截止/);

  // 團主截單後仍可補到 36 件
  s = g.post({ action: 'submit', idToken: 't0', pickup: 'face', items: [{ type: 'bra', key: 'A', variant: '白桃', qty: 8 }] });
  assert.ok(s.ok, s.error);
  assert.strictEqual(s.isOrganizer, true);
  assert.strictEqual(s.total, 36);

  g.menuSettle();
  assert.match(g.__ui.alerts.pop(), /結算完成/);
  const st = g.settings_();
  assert.strictEqual(st['狀態'], '已結算');
  assert.strictEqual(Math.round(st['最終單價']), 317);

  const amy = g.post({ action: 'state', idToken: 't2' });
  assert.strictEqual(amy.round.status, 'settled');
  assert.strictEqual(amy.me.bill.total, Math.round(10 * 11400 / 36) + 38);
  assert.deepStrictEqual(amy.me.payment, { method: 'ship', link: 'https://myship.example' });
  const mei = g.post({ action: 'state', idToken: 't1' });
  assert.strictEqual(mei.me.bill.pantyAmount, 327);
  assert.strictEqual(mei.me.payment.info, '822 1234');
  assert.ok(mei.lottery.length >= 1, '36 件單張訂單應有滿額贈可抽');

  // 結算後不能改單，但可以回報付款
  assert.match(g.post({ action: 'submit', idToken: 't1', pickup: 'face', items: [] }).error, /已結算/);
  assert.strictEqual(g.post({ action: 'report', idToken: 't1', text: '12345' }).me.bill.report, '12345');

  // 購物車清單：每張訂單件數加總正確
  const rows = g.__book.getSheetByName('官網購物車清單')._rows;
  assert.ok(rows.some(r => /^第 1 張訂單｜內衣 36 件＋內褲 3 件/.test(r[0])));

  g.menuAnnounce();
  assert.match(g.__ui.dialog, /每件內衣 \$317/);
  assert.doesNotMatch(g.__ui.dialog, /小美 18/);

  g.menuNewRound();
  assert.strictEqual(g.readTable_('明細').length, 0);
  assert.ok(g.__book.getSheetByName('封存20261017-團員'));
  assert.strictEqual(g.settings_()['狀態'], '開放點單');
});

test('截單後才缺貨：移除品項並記錄受影響團員', () => {
  const g = setup();
  g.post({ action: 'submit', idToken: 't1', pickup: 'face', items: [
    { type: 'bra', key: 'A', variant: '黑', qty: 6 }, { type: 'bra', key: 'B', variant: '膚', qty: 6 },
    { type: 'panty', key: 'PA', parent: 'A', variant: '黑色', qty: 2 }] });
  g.post({ action: 'submit', idToken: 't2', pickup: 'face', items: [{ type: 'bra', key: 'A', variant: '黑', qty: 6 }] });
  const p = g.readTable_('商品');
  p[2]['缺貨'] = true; // 深V 膚
  g.writeTable_('商品', p);
  g.menuSettle();
  const m = g.readTable_('團員').find(x => x['LINE userId'] === 'U1');
  assert.strictEqual(m['內衣件數'], 6);
  assert.match(m['受缺貨影響'], /深V 膚 ×6/);
  assert.strictEqual(m['內褲件數'], 2);
});

test('勾選已付款後重新寫入不會被清掉', () => {
  const g = setup();
  g.post({ action: 'submit', idToken: 't1', pickup: 'face', items: [{ type: 'bra', key: 'A', variant: '黑', qty: 6 }] });
  const rows = g.readTable_('團員');
  rows[0]['已付款'] = true;
  g.writeTable_('團員', rows);
  g.menuSettle();
  assert.strictEqual(g.readTable_('團員')[0]['已付款'], true);
});

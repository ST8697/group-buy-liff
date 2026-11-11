// 計價核心的邊界情況：0 件、負數、設定空白、折抵過大、抽獎邊界、同款內褲掛在兩款內衣
const test = require('node:test');
const assert = require('node:assert');
const P = require('../docs/pricing.js');

test('設定：空字串／null 用預設值，但 0 會保留', () => {
  const c = P.cfg({ basePrice: '', pantyPrice: null, shippingFee: 0, buyN: undefined });
  assert.strictEqual(c.basePrice, 460);
  assert.strictEqual(c.pantyPrice, 109);
  assert.strictEqual(c.shippingFee, 0);   // 免運要能設成 0
  assert.strictEqual(c.buyN, 5);
  assert.strictEqual(P.cfg().basePrice, 460);
});

test('單張訂單：0 件、未滿 6 件原價、每單最多送 10 件', () => {
  assert.strictEqual(P.orderCost(0), 0);
  assert.strictEqual(P.orderCost(5), 5 * 460);
  assert.strictEqual(P.orderCost(10), 4140);          // 送 1、付 9 件未滿 10 件團購價
  assert.strictEqual(P.orderCost(60), 50 * 380);      // 送 10、付 50 件
  // 66 件仍只送 10：付 56 件 → 50 件團購價 + 6 件原價
  assert.strictEqual(P.orderCost(66), 50 * 380 + 6 * 460);
});

test('拆單：0 件與負數回空訂單；非 6 的倍數錯誤訊息', () => {
  assert.deepStrictEqual(P.bestSplit(0), { cost: 0, orders: [] });
  assert.deepStrictEqual(P.bestSplit(-6), { cost: 0, orders: [] });
  assert.deepStrictEqual(P.bestSplit(6), { cost: 2300, orders: [6] });
  assert.throws(() => P.bestSplit(7), /總件數 7 不是 6 的倍數/);
});

test('任意件數最低價：零頭原價，且不會比單張更貴', () => {
  assert.strictEqual(P.minCost(0), 0);
  assert.strictEqual(P.minCost(7), 2300 + 460);
  for (let n = 1; n <= 66; n++) assert.ok(P.minCost(n) <= P.orderCost(Math.min(n, 60)) + Math.max(0, n - 60) * 460, `${n} 件`);
});

test('即時預估：剛好 6 的倍數不用補，orders 為拆單結果', () => {
  const e = P.estimate(36);
  assert.deepStrictEqual([e.filled, e.gap, e.orders, e.better], [36, 0, [36], null]);
  assert.deepStrictEqual(P.estimate(0).orders, [6]); // 0 件時以補到 6 件預估
});

test('內褲檢查：數量 0、NaN 的品項忽略；同款不同色內褲合併計算', () => {
  const bra = { type: 'bra', key: 'A', variant: '黑', qty: 2 };
  assert.strictEqual(P.validateItems([bra, { type: 'panty', key: 'X', parent: 'B', variant: '黑', qty: 0 }]), '');
  assert.strictEqual(P.validateItems([bra, { type: 'panty', key: 'X', parent: 'B', variant: '黑', qty: NaN }]), '');
  assert.ok(P.validateItems([bra,
    { type: 'panty', key: 'X', parent: 'A', variant: '黑', qty: 1 },
    { type: 'panty', key: 'X', parent: 'A', variant: '白', qty: 2 }]));
  assert.strictEqual(P.validateItems([]), '');
});

test('抽獎：沒人參加時沒有得獎者；0 件不參加；亂數接近 1 落在最後一位', () => {
  assert.deepStrictEqual(P.drawLottery([], ['x']), [{ prize: 'x', winner: '' }]);
  const t = [{ userId: 'a', name: 'A', count: 0 }, { userId: 'b', name: 'B', count: 2 }, { userId: 'c', name: 'C', count: 1 }];
  const r = P.drawLottery(t, ['x', 'y'], () => 0.9999);
  assert.deepStrictEqual(r.map(x => x.winner), ['C', 'C']);   // 同一人可中多次
  assert.strictEqual(P.drawLottery(t, ['x'], () => 0)[0].winner, 'B'); // A 0 件不會中
  assert.deepStrictEqual(P.drawLottery(t, []), []);
});

test('結算：沒有任何內衣訂單', () => {
  const m = [{ userId: 'u1', name: '小美', pickup: 'face' }];
  const r = P.settle(m, [], {});
  assert.deepStrictEqual(r, { ok: false, total: 0, need: 6, message: '目前沒有任何訂單' });
});

test('結算：不在團員名單的品項不計；只有內褲沒有內衣的人不出現在帳單', () => {
  const m = [{ userId: 'u1', name: '小美', pickup: 'face' }, { userId: 'u2', name: 'Amy', pickup: 'ship' }];
  const items = [
    { userId: 'u1', type: 'bra', key: 'A', name: 'a', variant: '黑', qty: 6 },
    { userId: 'u2', type: 'panty', key: 'P', parent: 'A', name: 'p', variant: '黑', qty: 2 },
    { userId: 'ghost', type: 'bra', key: 'A', name: 'a', variant: '黑', qty: 5 }
  ];
  const r = P.settle(m, items, {}, () => 0);
  assert.ok(r.ok);
  assert.strictEqual(r.total, 6);
  assert.deepStrictEqual(r.members.map(x => x.userId), ['u1']);
  assert.strictEqual(r.orders[0].pantyCount, 0);
});

test('結算：折抵大於單價時單價為 0；負數折抵當 0；文字數字可用', () => {
  const m = [{ userId: 'u1', name: '小美', pickup: 'ship' }];
  const items = [{ userId: 'u1', type: 'bra', key: 'A', name: 'a', variant: '黑', qty: 6 }];
  let r = P.settle(m, items, { discountPerBra: 9999 }, () => 0);
  assert.strictEqual(r.unit, 0);
  assert.strictEqual(r.members[0].total, 38);    // 只剩運費，不會變負數
  r = P.settle(m, items, { discountPerBra: -5 }, () => 0);
  assert.strictEqual(r.discount, 0);
  assert.strictEqual(r.unit, 2300 / 6);
  r = P.settle(m, items, { discountPerBra: '10' }, () => 0);
  assert.strictEqual(r.discount, 10);
  assert.strictEqual(r.unit, 2300 / 6 - 10);
});

test('結算：免運設 0 時寄送也不收運費', () => {
  const m = [{ userId: 'u1', name: '小美', pickup: 'ship' }];
  const items = [{ userId: 'u1', type: 'bra', key: 'A', name: 'a', variant: '黑', qty: 6 }];
  assert.strictEqual(P.settle(m, items, { shippingFee: 0 }, () => 0).members[0].shipping, 0);
});

test('購物車分配：同一款內衣跨兩張訂單時，內褲依各單容量分配', () => {
  const items = [
    { type: 'bra', key: 'A', name: 'a', variant: '黑', qty: 66 },
    { type: 'panty', key: 'P', parent: 'A', name: 'p', variant: '黑', qty: 50 }
  ];
  const o = P.assignOrders(items, [60, 6]);
  assert.deepStrictEqual(o.map(x => x.bras[0].qty), [60, 6]);
  assert.deepStrictEqual(o.map(x => x.pantyCount), [50, 0]);
  const o2 = P.assignOrders([items[0], Object.assign({}, items[1], { qty: 64 })], [60, 6]);
  assert.deepStrictEqual(o2.map(x => x.pantyCount), [60, 4]);
});

// 🐛 同一款加購內褲（商品鍵相同）若同時掛在兩款內衣底下，assignOrders 以「商品鍵|款式」合併，
// 只記住第一個 parent，另一款內衣底下的內褲會被默默漏掉，購物車清單少列。
// 團員帳單仍照 12 件收內褲錢，但購物車清單只有 6 件。程式未修，先標 todo。
test('購物車分配：同一款內褲掛在兩款內衣底下不可漏件', { todo: 'docs/pricing.js assignOrders 以 key|variant 合併內褲，未區分 parent，會漏件（見測試工程師 2026-11-11 報告）' }, () => {
  const items = [
    { type: 'bra', key: 'A', name: 'a', variant: '黑', qty: 6 },
    { type: 'bra', key: 'B', name: 'b', variant: '膚', qty: 6 },
    { type: 'panty', key: 'P', parent: 'A', name: 'p', variant: '黑', qty: 6 },
    { type: 'panty', key: 'P', parent: 'B', name: 'p', variant: '黑', qty: 6 }
  ];
  const o = P.assignOrders(items, [12]);
  assert.strictEqual(o[0].pantyCount, 12);
});

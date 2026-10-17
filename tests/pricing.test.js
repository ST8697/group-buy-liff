const test = require('node:test');
const assert = require('node:assert');
const P = require('../docs/pricing.js');

// 官網活動頁價目表（2026 金秋狂購節）：N 件 → 單件價
const OFFICIAL = { 6: 383, 12: 333, 18: 350, 24: 333, 30: 343, 36: 316, 42: 326, 48: 316, 54: 324, 60: 316 };

test('單張訂單金額符合官方價目表', () => {
  for (const [n, unit] of Object.entries(OFFICIAL)) {
    assert.strictEqual(Math.floor(P.orderCost(+n) / n), unit, `${n} 件`);
  }
});

test('拆單選最便宜的組合', () => {
  assert.deepStrictEqual(P.bestSplit(84).orders, [48, 36]);
  assert.deepStrictEqual(P.bestSplit(120).orders, [60, 60]);
  const r = P.bestSplit(96);
  assert.strictEqual(r.orders.reduce((a, b) => a + b), 96);
  assert.ok(r.orders.every(n => n <= 60 && n % 6 === 0));
  assert.throws(() => P.bestSplit(40));
});

test('即時預估：以補齊後件數計價，並提示更便宜的件數', () => {
  const e = P.estimate(40);
  assert.strictEqual(e.filled, 42);
  assert.strictEqual(e.gap, 2);
  assert.strictEqual(Math.round(e.unit), 326);
  assert.deepStrictEqual([e.better.total, Math.round(e.better.unit)], [48, 317]);
  assert.strictEqual(Math.round(P.estimate(3).unit), 383);
  assert.strictEqual(P.estimate(36).gap, 0);
  assert.strictEqual(P.estimate(36).better, null);
  assert.strictEqual(P.estimate(0).gap, 6);
});

test('內褲不能超過同款內衣件數', () => {
  const bra = { type: 'bra', key: 'A', variant: '黑', qty: 2 };
  assert.strictEqual(P.validateItems([bra, { type: 'panty', key: 'X', parent: 'A', variant: '黑', qty: 2 }]), '');
  assert.ok(P.validateItems([bra, { type: 'panty', key: 'X', parent: 'A', variant: '黑', qty: 3 }]));
  assert.ok(P.validateItems([{ type: 'panty', key: 'X', parent: 'B', variant: '黑', qty: 1 }]));
});

function sample() {
  const members = [
    { userId: 'u1', name: '小美', pickup: 'face' },
    { userId: 'u2', name: 'Amy', pickup: 'ship' },
    { userId: 'u3', name: '團主', pickup: 'face' }
  ];
  const items = [
    { userId: 'u1', type: 'bra', key: 'A', name: '經典款', variant: '黑', qty: 20 },
    { userId: 'u1', type: 'panty', key: 'PA', parent: 'A', name: '經典內褲', variant: '黑', qty: 3 },
    { userId: 'u2', type: 'bra', key: 'B', name: '深V', variant: '膚', qty: 10 },
    { userId: 'u3', type: 'bra', key: 'A', name: '經典款', variant: '白桃', qty: 6 }
  ];
  return { members, items };
}

test('結算：平均單價、四捨五入、運費、內褲', () => {
  const { members, items } = sample();
  const r = P.settle(members, items, {}, () => 0);
  assert.ok(r.ok);
  assert.strictEqual(r.total, 36);
  assert.strictEqual(r.braCost, 11400);
  const amy = r.members.find(m => m.userId === 'u2');
  assert.strictEqual(amy.braAmount, Math.round(10 * 11400 / 36));
  assert.strictEqual(amy.shipping, 38);
  const mei = r.members.find(m => m.userId === 'u1');
  assert.strictEqual(mei.pantyAmount, 327);
  assert.strictEqual(mei.total, mei.braAmount + 327);
  assert.strictEqual(r.roundingDiff, r.members.reduce((a, m) => a + m.braAmount, 0) - 11400);
});

test('結算：件數不是 6 的倍數會回報要補幾件', () => {
  const { members, items } = sample();
  items[3].qty = 4;
  const r = P.settle(members, items, {});
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.need, 2);
});

test('購物車分配：件數正確、內褲跟著同款內衣', () => {
  const { members, items } = sample();
  items.push({ userId: 'u3', type: 'bra', key: 'C', name: '運動', variant: '灰', qty: 48 });
  const r = P.settle(members, items, {}, () => 0.5);
  assert.deepStrictEqual(r.orders.map(o => o.size), [48, 36]);
  r.orders.forEach(o => {
    assert.strictEqual(o.bras.reduce((a, b) => a + b.qty, 0), o.size);
    o.panties.forEach(p => {
      const cap = o.bras.filter(b => b.key === p.parent).reduce((a, b) => a + b.qty, 0);
      assert.ok(p.qty <= cap);
    });
  });
  assert.strictEqual(r.orders.reduce((a, o) => a + o.pantyCount, 0), 3);
  assert.ok(r.orders[0].gifts.includes('手洗精隨行包'));
});

test('抽獎依件數加權', () => {
  const t = [{ userId: 'a', name: 'A', count: 1 }, { userId: 'b', name: 'B', count: 9 }];
  assert.strictEqual(P.drawLottery(t, ['x'], () => 0.05)[0].winner, 'A');
  assert.strictEqual(P.drawLottery(t, ['x'], () => 0.5)[0].winner, 'B');
});

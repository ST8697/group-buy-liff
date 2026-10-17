// 以實際下載的官網頁面驗證解析；未提供頁面時略過。
// 用法：FFY_PRODUCT_HTML=商品頁.html FFY_CATEGORY_HTML=活動頁.html node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const I = require('../apps-script/Import.gs');

const prod = process.env.FFY_PRODUCT_HTML, cat = process.env.FFY_CATEGORY_HTML;

test('解析商品頁', { skip: !prod && '未提供 FFY_PRODUCT_HTML' }, () => {
  const p = I.parseProductHtml(fs.readFileSync(prod, 'utf8'), 'https://example/p');
  assert.ok(p.name && !/_$/.test(p.name));
  assert.ok(p.variants.length > 0 && p.variants.every(v => v.variant));
  assert.ok(p.image.startsWith('https://'));
  assert.strictEqual(p.eligible, true);
  p.panties.forEach(x => { assert.ok(x.key && x.variant && !/一件$/.test(x.variant)); });
  console.log(p.name, p.variants.length, '款', p.panties.map(x => x.variant).join('、'));
});

test('解析活動頁商品連結', { skip: !cat && '未提供 FFY_CATEGORY_HTML' }, () => {
  const links = I.parseCategoryLinks(fs.readFileSync(cat, 'utf8'));
  assert.ok(links.length >= 10);
  assert.strictEqual(new Set(links).size, links.length);
});

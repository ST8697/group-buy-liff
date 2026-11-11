// 用自製的小型假頁面測試官網匯入解析（不需下載官網頁面、不連網）。
// 真實頁面的驗證仍在 import.test.js（提供 FFY_*_HTML 時才跑）。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const I = require('../apps-script/Import.gs');

// 仿 SHOPLINE：app.value('product', JSON.parse('...'));，內容是跳脫過的 JSON 字串
function productHtml(p) {
  const literal = JSON.stringify(JSON.stringify(p)).slice(1, -1).replace(/'/g, "\\'");
  return "<html><script>app.value('shop', {});\napp.value('product', JSON.parse('" + literal + "'));\n</script></html>";
}

function baseProduct(over) {
  return Object.assign({
    _id: 'bra1',
    owner_id: 'own9',
    status: 'active',
    title_translations: { 'zh-hant': '【金秋狂購】▪️ 經典無鋼圈內衣_', en: 'Classic' },
    media: [{ images: { original: { url: 'https://img.example/media/image_clips/abc123/original.jpg?v=1' } } }],
    price: { dollars: 990 },
    price_sale: { dollars: 460 },
    variations: [
      { fields_translations: { 'zh-hant': ['黑', 'M'] }, quantity: 5 },
      { fields_translations: { 'zh-hant': ['白桃', ''] }, total_orderable_quantity: 0, quantity: 9 },
      { fields_translations: { en: ['Nude', 'L'] }, quantity: 0, unlimited_quantity: true }
    ],
    addon_promotions: [{
      discounted_price: { dollars: 109 },
      discountable_products: [
        { _id: 'pa1', title_translations: { 'zh-hant': '加購▪️經典內褲-黑色一件' }, quantity: 3 },
        { _id: 'pa2', title_translations: { 'zh-hant': '無痕內褲' }, quantity: 0, out_of_stock_orderable: true }
      ]
    }]
  }, over);
}

test('活動頁連結：只取官網商品頁、去重、保留順序', () => {
  const html = [
    '<a href="https://www.fashionforyes.com/products/bra-b">B</a>',
    '<a href="https://www.fashionforyes.com/products/bra-a">A</a>',
    '<a href="https://www.fashionforyes.com/products/bra-b">B 重複</a>',
    '<a href="https://www.fashionforyes.com/categories/sale">分類頁</a>',
    '<a href="http://www.fashionforyes.com/products/http-only">非 https</a>',
    '<a href="https://evil.example/products/bra-c">別的網域</a>'
  ].join('\n');
  assert.deepStrictEqual(I.parseCategoryLinks(html), [
    'https://www.fashionforyes.com/products/bra-b',
    'https://www.fashionforyes.com/products/bra-a'
  ]);
  assert.deepStrictEqual(I.parseCategoryLinks(''), []);
});

test('商品頁：名稱清理、價格、縮圖網址', () => {
  const p = I.parseProductHtml(productHtml(baseProduct()), 'https://shop/p/1');
  assert.strictEqual(p.id, 'bra1');
  assert.strictEqual(p.name, '經典無鋼圈內衣');   // 去掉「▪️」前的活動字樣與結尾底線
  assert.strictEqual(p.url, 'https://shop/p/1');
  assert.strictEqual(p.price, 460);                // 有特價用特價
  assert.strictEqual(p.image, 'https://shoplineimg.com/own9/abc123/400x.webp?source_format=jpg');
  assert.strictEqual(p.eligible, true);
});

test('商品頁：款式組合與缺貨判斷', () => {
  const p = I.parseProductHtml(productHtml(baseProduct()), 'u');
  assert.deepStrictEqual(p.variants, [
    { variant: '黑/M', soldOut: false },       // 有庫存
    { variant: '白桃', soldOut: true },        // 空白欄位略過；可訂量 0 優先於 quantity
    { variant: 'Nude/L', soldOut: false }      // 沒有中文時用英文；不限量不算缺貨
  ]);
});

test('商品頁：加購內褲拆出名稱、款式、價格、缺貨', () => {
  const p = I.parseProductHtml(productHtml(baseProduct()), 'u');
  assert.deepStrictEqual(p.panties, [
    { key: 'pa1', name: '經典內褲', variant: '黑色', price: 109, soldOut: false },
    { key: 'pa2', name: '無痕內褲', variant: '無痕內褲', price: 109, soldOut: false } // 沒有「-」時名稱即款式；可缺貨下單不算缺貨
  ]);
});

test('商品頁：沒有款式時用「單一款式」，缺貨看商品本身庫存', () => {
  const p = I.parseProductHtml(productHtml(baseProduct({ variations: [], quantity: 0, addon_promotions: undefined })), 'u');
  assert.deepStrictEqual(p.variants, [{ variant: '單一款式', soldOut: true }]);
  assert.deepStrictEqual(p.panties, []);
  const q = I.parseProductHtml(productHtml(baseProduct({ variations: undefined, quantity: 2 })), 'u');
  assert.deepStrictEqual(q.variants, [{ variant: '單一款式', soldOut: false }]);
});

test('商品頁：特價為 0 改用原價；沒有圖片或 owner_id 時的縮圖', () => {
  const p = I.parseProductHtml(productHtml(baseProduct({ price_sale: { dollars: 0 }, owner_id: '' })), 'u');
  assert.strictEqual(p.price, 990);
  assert.strictEqual(p.image, 'https://img.example/media/image_clips/abc123/original.jpg?v=1'); // 沒有 owner_id 用原圖
  const q = I.parseProductHtml(productHtml(baseProduct({ media: [] })), 'u');
  assert.strictEqual(q.image, '');
});

test('商品頁：青春期／漫畫／成套與未上架商品不參加', () => {
  for (const t of ['青春期少女內衣', '漫畫聯名款', '成套組合']) {
    const p = I.parseProductHtml(productHtml(baseProduct({ title_translations: { 'zh-hant': t } })), 'u');
    assert.strictEqual(p.eligible, false, t);
  }
  const d = I.parseProductHtml(productHtml(baseProduct({ status: 'draft' })), 'u');
  assert.strictEqual(d.eligible, false);
});

test('商品頁：名稱含單引號、雙引號、反斜線也能正確解開', () => {
  const p = I.parseProductHtml(productHtml(baseProduct({ title_translations: { 'zh-hant': "Mom's \"軟\" 內衣 \\ 新款" } })), 'u');
  assert.strictEqual(p.name, "Mom's \"軟\" 內衣 \\ 新款");
  assert.strictEqual(p.variants.length, 3);
});

test('商品頁：不是商品頁（找不到內嵌資料）回 null', () => {
  assert.strictEqual(I.parseProductHtml('<html>404</html>', 'u'), null);
  assert.strictEqual(I.parseProductHtml('', 'u'), null);
});

// 在 vm 裡載入 Import.gs，用假的 UrlFetchApp 測 fetchCampaign
function loadImport(pages) {
  const resp = (url) => {
    const html = pages[url];
    return { getResponseCode: () => (html == null ? 404 : 200), getContentText: () => html || '' };
  };
  const ctx = {
    UrlFetchApp: {
      fetch: (url) => resp(url),
      fetchAll: (reqs) => reqs.map(r => resp(r.url))
    }
  };
  vm.createContext(ctx);
  const f = path.join(__dirname, '..', 'apps-script', 'Import.gs');
  vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: 'Import.gs' });
  return ctx;
}

test('匯入活動：抓失敗或不是商品頁的連結會略過，其他照順序回傳', () => {
  const L = 'https://www.fashionforyes.com/products/';
  const g = loadImport({
    'https://cat': `<a href="${L}a">a</a><a href="${L}broken">x</a><a href="${L}notprod">y</a><a href="${L}b">b</a>`,
    [L + 'a']: productHtml(baseProduct({ _id: 'A' })),
    [L + 'notprod']: '<html>維護中</html>',
    [L + 'b']: productHtml(baseProduct({ _id: 'B' }))
  });
  const out = g.fetchCampaign('https://cat');
  assert.deepStrictEqual([...out].map(p => p.id), ['A', 'B']); // vm 陣列跨 realm，先轉成本地陣列
  assert.strictEqual(out[1].url, L + 'b');
});

test('匯入活動：活動頁抓不到或沒有商品時給清楚的錯誤', () => {
  const g = loadImport({ 'https://empty': '<html>改版了</html>' });
  assert.throws(() => g.fetchCampaign('https://empty'), /找不到任何商品/);
  assert.throws(() => g.fetchCampaign('https://missing'), /HTTP 404/);
});

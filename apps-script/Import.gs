/**
 * 從官網（SHOPLINE）活動頁匯入商品。
 * parse* 為純函式，Node 測試可直接呼叫；fetch* 只在 Apps Script 執行。
 */

/** 取出 app.value('key', JSON.parse('...')) 內嵌的 JSON */
function extractAppValue_(html, key) {
  var tag = "app.value('" + key + "', JSON.parse('";
  var start = html.indexOf(tag);
  if (start < 0) return null;
  start += tag.length;
  var end = html.indexOf("'));", start);
  var literal = html.slice(start, end).replace(/\\'/g, "'");
  return JSON.parse(JSON.parse('"' + literal + '"'));
}

/** 活動頁 → 商品網址清單（去重、保留順序） */
function parseCategoryLinks(html) {
  var re = /href="(https:\/\/www\.fashionforyes\.com\/products\/[a-z0-9-]+)"/g, m, seen = {}, out = [];
  while ((m = re.exec(html))) if (!seen[m[1]]) { seen[m[1]] = true; out.push(m[1]); }
  return out;
}

function cleanTitle_(t) {
  return String(t || '').replace(/^.*?▪️\s*/, '').replace(/[_ˍ\s]+$/, '').trim();
}

function thumb_(url, ownerId) {
  var m = /image_clips\/([a-f0-9]+)\/original\.(\w+)/.exec(url || '');
  return m && ownerId ? 'https://shoplineimg.com/' + ownerId + '/' + m[1] + '/400x.webp?source_format=' + m[2] : (url || '');
}

function soldOut_(o) {
  if (o.unlimited_quantity || o.out_of_stock_orderable) return false;
  var q = o.total_orderable_quantity != null ? o.total_orderable_quantity : o.quantity;
  return !(q > 0);
}

/** 商品頁 → { id, name, url, image, eligible, variants, panties } */
function parseProductHtml(html, url) {
  var p = extractAppValue_(html, 'product');
  if (!p) return null;
  var name = cleanTitle_(p.title_translations && (p.title_translations['zh-hant'] || p.title_translations.en));
  var media = p.media && p.media[0] && p.media[0].images && p.media[0].images.original;
  var variants = (p.variations || []).map(function (v) {
    var f = v.fields_translations && (v.fields_translations['zh-hant'] || v.fields_translations.en) || [];
    return { variant: f.filter(String).join('/'), soldOut: soldOut_(v) };
  });
  if (!variants.length) variants = [{ variant: '單一款式', soldOut: soldOut_(p) }];
  var panties = [];
  (p.addon_promotions || []).forEach(function (a) {
    (a.discountable_products || []).forEach(function (d) {
      var t = cleanTitle_(d.title_translations && (d.title_translations['zh-hant'] || d.title_translations.en));
      var dash = t.lastIndexOf('-');
      panties.push({
        key: d._id,
        name: dash > 0 ? t.slice(0, dash) : t,
        variant: (dash > 0 ? t.slice(dash + 1) : t).replace(/一件$/, ''),
        price: a.discounted_price ? a.discounted_price.dollars : null,
        soldOut: soldOut_(d)
      });
    });
  });
  return {
    id: p._id,
    name: name,
    url: url,
    image: thumb_(media && media.url, p.owner_id),
    price: p.price_sale && p.price_sale.dollars ? p.price_sale.dollars : (p.price && p.price.dollars),
    eligible: !/青春期|漫畫|成套/.test(name) && p.status === 'active',
    variants: variants,
    panties: panties
  };
}

function fetchHtml_(url) {
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (res.getResponseCode() !== 200) throw new Error('抓取失敗（HTTP ' + res.getResponseCode() + '）：' + url);
  return res.getContentText('UTF-8');
}

/** 活動頁網址 → 商品陣列 */
function fetchCampaign(categoryUrl) {
  var links = parseCategoryLinks(fetchHtml_(categoryUrl));
  if (!links.length) throw new Error('活動頁找不到任何商品，可能是官網改版，請改用手動填寫「商品」工作表');
  var reqs = links.map(function (u) { return { url: u, muteHttpExceptions: true, headers: { 'User-Agent': 'Mozilla/5.0' } }; });
  var out = [];
  UrlFetchApp.fetchAll(reqs).forEach(function (res, i) {
    if (res.getResponseCode() !== 200) return;
    var p = parseProductHtml(res.getContentText('UTF-8'), links[i]);
    if (p) out.push(p);
  });
  return out;
}

if (typeof module !== 'undefined') module.exports = { parseCategoryLinks: parseCategoryLinks, parseProductHtml: parseProductHtml };

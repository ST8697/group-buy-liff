# 專案進度（交接用）

> 最後更新：2026-10-23｜在另一台電腦接續時，請先讀這份檔案，再看 [README.md](README.md) 的部署步驟。

## 一、這個專案在做什麼

把「賣貨便建賣場 → 手動統計款式數量金額 → 官網下單」的團購流程，改成：

```
團員在 LINE 打開 LIFF 點單頁 → 選取貨方式、款式、數量、加購內褲 → 送出
團主在 Google 試算表：截單並結算 → 產生群組公告 → 照「官網購物車清單」到官網下單
```

- 官網活動：https://www.fashionforyes.com/categories/buy-5-get-1-free（24HRS 內衣買 5 送 1）
- 每團約 15 人，範本可以重複使用

## 二、已定案的需求（訪談結論）

| 項目 | 決定 |
|---|---|
| 架構 | LIFF 點單頁（GitHub Pages）＋ Apps Script 後端 ＋ Google 試算表（兼管理後台），全部用個人帳號 |
| 計價 | 整團平均：總金額 ÷ 總件數；四捨五入，差額由團主吸收 |
| 計價公式 | 每單 N 件：贈品 floor(N/6)（最多 10）；付費件數每滿 10 件適用團購價（10–29 件 $400、30 件以上 $380），零頭 $460。用官網價目表 10 組數字驗證過 |
| 下單件數 | 只下 6 的倍數；不足時由**團主補件**；每張訂單最多 60 件，自動拆單取總價最低 |
| 點單頁單價 | 以目前實際件數計算，未達下一個門檻的零頭以原價 $460 計（例：8 件 = 402.5）；截單時團主仍補到 6 的倍數 |
| 贈品 | 不分個人，價值算進平均單價；團員只要選自己要的款式 |
| 加購內褲 | 只開放同款內褲 $109，個人另計，件數不能超過同款內衣 |
| 品項 | 只開放參加買 5 送 1 的內衣（青春期、漫畫胸款排除） |
| 取貨 | 面交（轉帳）或賣貨便；點單時先選；賣貨便加運費 **$38** |
| 賣貨便 | 一個固定隱藏賣場、一個 **$1 商品**，數量 = 應付金額 − 運費（賣場固定運費 $38 由賣貨便結帳時另收，合計 = 應付）；只能**取貨付款**；單筆上限 $20,000；買家必填「LINE社群名稱」 |
| 收款 | 截單 → 算出金額 → 團員在點單頁看到金額與付款方式 → 面交轉帳（可選填帳號後五碼）／賣貨便下單、取貨時付款（不用回填，團主在後台用數量與 LINE社群名稱對帳）→ 團主勾選已付款 |
| 抽獎 | 每張訂單的滿額贈（手洗精、內褲）抽給團員，依每人內衣件數加權（團主補的件數也算）；只公開得獎者名字 |
| 官網發財金 | 抽中歸團主 |
| 隱私 | 點單頁不顯示誰買了幾件；群組公告只有單價、連結和得獎名單 |
| 點單頁 | 單頁設計：頂部顯示已湊到、目前單價、湊滿 6 件；步驟 1 選取貨方式（含兩種流程說明）；步驟 2 商品卡片；底部是我的訂單和備註 |

## 三、目前完成到哪裡

| 步驟 | 狀態 | 說明 |
|---|---|---|
| 程式開發與測試 | ✅ | 12 個測試通過（`node --test tests/*.test.js`） |
| 1. GitHub Pages | ✅ | https://st8697.github.io/group-buy-liff/ （`?demo=open` 是示範模式） |
| 2. Google 試算表＋Apps Script | ✅ | 個人 Gmail 帳號下的試算表「**內衣團購**」；Apps Script 專案「內衣團購」有 4 個檔案：`程式碼.gs`、`Pricing.gs`、`Import.gs`、`appsscript.json`；已授權、已初始化 |
| 匯入官網商品 | ✅ | 194 列（內衣 138、內褲 56），青春期款 6 列預設不開放。Google 伺服器抓官網**沒有被擋** |
| 3. 部署網頁應用程式 | ✅ | 版本 1，執行身分「我」、存取權「所有人」。API 測試正常，GitHub Pages 跨網域呼叫也正常 |
| 4. LINE Developers 建 LIFF | ✅ | Provider「團購」→ LINE Login channel「內衣團購點單」→ LIFF（Full、openid＋profile、Bot link Off），Channel 已 Published |
| 5. 填 config.js 和試算表設定 | ✅ | `docs/config.js` 已上線；「設定」已填團名、截止時間、付款期限、轉帳資訊、LIFF 網址、Channel ID（API 已讀到 Channel ID）。賣貨便連結、團主 userId 待第 6、7 步 |
| 6. 賣貨便 $1 賣場 | ✅ | 賣場已上架，網址已填進試算表 |
| 7. 手機試點一筆＋設定團主 userId | ✅ | 手機 LINE 下測試單成功（內衣 12、內褲 1、面交），團主 userId 已填入「設定」 |

**LINE 設定**

- LINE Login Channel ID：`2012162599`
- LIFF ID：`2012162599-VWFBR1hI`
- LIFF URL：https://liff.line.me/2012162599-VWFBR1hI

**Apps Script 網頁應用程式網址（API_URL）**

```
https://script.google.com/macros/s/AKfycbwGLeJDxOdIcXsGQJJqkffLjoBy01OXCTUDbollRFqs7fRBijEpdFAL6XPiLZl4HVjx4Q/exec
```

## 四、接下來要做的事

**本團設定**（試算表「設定」）：團名「雙11金秋狂購節」、截止 2026/10/24 15:00、付款期限「待通知」，轉帳資訊已填（不放進 repo）。

### 第 6 步：賣貨便 $1 賣場
- ✅ 已建立隱藏賣場「內衣團購結帳 LINE社群專用」（GM2610238425106），商品「團購結帳」$1、庫存 9999；購物車填 3,000 件正常
- ✅ 賣場網址 https://myship.7-11.com.tw/general/detail/GM2610238425106 已填到試算表「設定 → 賣貨便連結」

### 正式開團前
- ✅ 團主測試單已取消
- 把 LIFF 網址 https://liff.line.me/2012162599-VWFBR1hI 貼到 LINE 群組

### 待辦（非緊急）
- Apps Script 的 `Pricing.gs` 還是舊版（點單頁單價改版前）。目前後端沒用到 `estimate`，所以結算不受影響；下次改 Apps Script 時順便把 `docs/pricing.js` 整份貼過去並發布新版本

## 五、注意事項（踩過的坑）

- **從 LINE 社群（OpenChat）開啟 LIFF 拿不到 ID token**（頁面顯示「請從 LINE 開啟點單頁」）。已改成拿不到時送 access token，後端用 `verifyAccessToken_` 驗證 client_id 再取個人資料；Apps Script 已發布版本 2

- **修改 Apps Script 程式碼後一定要發布新版本**：部署 → 管理部署作業 → 編輯（鉛筆）→ 版本選「新版本」→ 部署，網址才不會變
- `docs/pricing.js` 同時是 Apps Script 的 `Pricing.gs`，修改後兩邊都要更新
- 修改 `docs/` 的 JS/CSS 後，把 `index.html` 裡的 `?v=` 版本號加 1，否則手機 LINE 會沿用快取（最多 10 分鐘）
- Claude 桌面版的內建瀏覽器會擋掉 Google 的彈出視窗（例如授權、Apps Script 開新分頁）。授權改在 Apps Script 編輯器按「執行」完成；或改用自己電腦的 Chrome
- 內建瀏覽器窗格太窄時，試算表的「🛒 團購」選單會被收起來。需要時可以在 Apps Script 編輯器直接執行 `runImport` 匯入商品
- 第一次實際結帳時，核對官網結帳金額和「官網購物車清單」的預估金額；只有 6 的倍數件數的價格經過官方價目表驗證

## 六、在新電腦接續

```bash
git clone https://github.com/ST8697/group-buy-liff.git
cd group-buy-liff
node --test tests/*.test.js
```

開一個新的 Claude 對話，把資料夾設成 `group-buy-liff`，然後說：

> 請先讀 PROGRESS.md 和 README.md，我們要從「四、接下來要做的事」繼續。

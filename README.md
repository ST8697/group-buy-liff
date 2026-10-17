# 24HRS 內衣團購點單系統

在 LINE 裡點單 → Google 試算表自動統計、計價、拆單、抽獎 → 團主照「官網購物車清單」下單。

- **點單頁**（`docs/`）：LIFF 網頁，放在 GitHub Pages
- **後端**（`apps-script/`）：Google Apps Script，資料存在你的 Google 試算表
- **示範模式**：還沒部署也能先看畫面 → https://st8697.github.io/group-buy-liff/?demo=open

```
團員：LINE 開連結 → 選取貨方式 → 選款式/數量/內褲 → 送出（截止前可改）
團主：截單並結算 → 貼群組公告 → 團員自己看金額並付款回報 → 照購物車清單下單
```

---

## 一、部署（第一次，約 30–60 分鐘）

### 1. 開啟 GitHub Pages

1. 到 repo 的 **Settings → Pages**
2. Source 選 **Deploy from a branch**，Branch 選 `main`、資料夾選 `/docs`，按 Save
3. 等 1–2 分鐘，網址是 `https://st8697.github.io/group-buy-liff/`
4. 打開 `…/?demo=open` 確認示範模式能動

### 2. 建立 Google 試算表與 Apps Script

1. 用個人 Google 帳號新增一份試算表，例如「內衣團購」
2. 選單 **擴充功能 → Apps Script**
3. 建立 3 個指令碼檔案，內容分別整份複製貼上：

   | Apps Script 檔名 | 從 repo 複製 |
   |---|---|
   | `Code.gs`（覆蓋預設的 `程式碼.gs`） | `apps-script/Code.gs` |
   | `Pricing.gs` | `docs/pricing.js` |
   | `Import.gs` | `apps-script/Import.gs` |

4. 左側 **專案設定（齒輪）** → 勾選「在編輯器中顯示 appsscript.json」→ 回編輯器，把 `appsscript.json` 內容換成 repo 的 `apps-script/appsscript.json`
5. 儲存，回到試算表**重新整理**，上方會出現 **🛒 團購** 選單
6. 執行 **🛒 團購 → 1. 初始化試算表**，第一次會要求授權：選你的帳號 →「進階」→「前往（不安全）」→ 允許
   （這是你自己寫的指令碼，Google 對未驗證的個人指令碼都會這樣提示）

### 3. 部署成網頁應用程式（API）

1. Apps Script 右上 **部署 → 新增部署作業**
2. 類型選 **網頁應用程式**
   - 執行身分：**我**
   - 誰可以存取：**所有人**
3. 部署 → 複製結尾是 `/exec` 的網址（等一下要用）

> ⚠️ 之後若修改程式碼，請用 **部署 → 管理部署作業 → 編輯（鉛筆）→ 版本選「新版本」→ 部署**，網址才不會變。

### 4. 建立 LIFF（LINE Developers）

1. 到 https://developers.line.biz/console/ 用你的 LINE 登入
2. 建立 Provider（名稱隨意，例如「團購」）
3. 在 Provider 底下 **Create a new channel → LINE Login**
   - App types 勾 **Web app**
4. 進入 channel：
   - **Basic settings** 頁的 **Channel ID** → 記下來
   - **LIFF** 分頁 → **Add**
     - Size：**Full**
     - Endpoint URL：`https://st8697.github.io/group-buy-liff/`
     - Scopes：勾 **openid** 和 **profile**
     - Bot link feature：Off
   - 建立後記下 **LIFF ID**（像 `2001234567-AbCdEfGh`）和 **LIFF URL**（`https://liff.line.me/…`）
5. ⚠️ channel 狀態從 **Developing 改成 Published**（頁面上方），否則只有你自己能登入

### 5. 填入設定

1. 在 GitHub 網頁上編輯 `docs/config.js`（點檔案 → 鉛筆圖示），填入：
   ```js
   LIFF_ID: '你的 LIFF ID',
   API_URL: '第 3 步的 /exec 網址'
   ```
   Commit 後等 1–2 分鐘 Pages 更新
2. 試算表「設定」工作表填寫：
   - **LIFF 網址**、**LINE Login Channel ID**
   - **轉帳資訊**（面交團員截單後才看得到）
   - **賣貨便連結**（見下方第 6 步）
   - **截止時間**（例如 `2026/10/20 22:00`，請確認儲存格是日期格式）

### 6. 賣貨便固定賣場（只做一次）

1. 建立一個賣貨便賣場，只放一個商品「團購結帳」，**單價 $1**、庫存設大一點
2. ⚠️ 先自己試下單，確認**單筆數量上限**能不能填到 3,000 以上（一個人買 6 件＋內褲大約 $2,000～$3,000）。如果有上限，告訴我改成其他做法
3. 賣場網址填到「設定 → 賣貨便連結」

### 7. 試跑

1. **🛒 團購 → 2. 匯入官網商品**（直接按確定 = 用設定裡的活動網址）
2. 用手機 LINE 打開 LIFF 網址，點一筆單
3. 到「團員」工作表，把你自己的 `LINE userId` 複製到「設定 → 團主 LINE userId」（截單後你才能補件）

---

## 二、每一團的流程（SOP）

| 步驟 | 在哪裡 | 做什麼 |
|---|---|---|
| 1 | 試算表 | **新開一團**（第一次不用）→ 更新「設定」的團名、截止時間、付款期限 |
| 2 | 試算表 | **2. 匯入官網商品**；不想開放的款式在「商品」表取消勾選「開放」 |
| 3 | LINE 群組 | 貼 LIFF 網址 |
| 4 | — | 截止時間到，點單頁自動鎖住 |
| 5 | 試算表 | **3. 截單並結算**：件數不是 6 的倍數時會告訴你要補幾件 → 用點單頁補件 → 再按一次 |
| 6 | 試算表 | **4. 產生群組公告** → 複製貼到群組（只有單價、連結、得獎名單，不列個人明細） |
| 7 | 試算表「團員」 | 看「付款回報」欄，確認收款後勾「已付款」 |
| 8 | 試算表 | **5. 查看官網購物車清單** → 一張一張加入購物車結帳，對一下「預估」金額 |
| 9 | 試算表「設定」 | 「進度」填 `已下單`、到貨後填 `已到貨`；團員取貨後勾「已取貨」 |

- 截單後才發現缺貨：在「商品」表勾「缺貨」→ 再執行「截單並結算」，受影響的人會在點單頁看到通知
- 結算後想讓大家再改：**重新開放點單**（會清掉結算金額和抽獎）

---

## 三、計價規則

依官網活動頁價目表反推（`tests/pricing.test.js` 用價目表 10 組數字驗證）：

```
每張訂單 N 件內衣（含贈品）：
  贈品 = floor(N ÷ 6)，最多 10 件
  付費 = N − 贈品
  付費件數每滿 10 件適用團購價：10～29 件 $400、30 件以上 $380；不滿 10 件的零頭 $460
```

- 整團件數補到 6 的倍數後自動拆單（每張最多 60 件，選總價最低的組合）
- 每人內衣金額 = 件數 × 平均單價（四捨五入，差額由團主吸收）
- 內褲 $109 × 件數另計；賣貨便加運費 $38
- 每張訂單達滿額門檻的贈品（設定「滿額贈」）依每人內衣件數加權抽獎
- 價格、級距、運費都在「設定」工作表，活動改了直接改設定即可

⚠️ 第一次實際結帳時，請核對官網結帳金額和「官網購物車清單」的預估金額，不一樣請回報。

---

## 四、開發

```bash
node --test tests/*.test.js     # 單元測試＋模擬 Apps Script 的完整流程測試
node tools/serve.js             # 本機預覽 http://localhost:8080/?demo=open
```

示範情境：`?demo=open`（點單中）、`organizer`（截單・團主補件）、`closed`（截單・團員）、`settled-face`、`settled-ship`

用真實官網頁面測匯入：

```bash
curl -s -o p.html https://www.fashionforyes.com/products/24hrs-classic-bra-event
FFY_PRODUCT_HTML=p.html node --test tests/import.test.js
```

`docs/pricing.js` 同時給點單頁與 Apps Script 使用，修改後記得也更新 Apps Script 的 `Pricing.gs` 並發布新版本。

## 五、常見問題

| 狀況 | 處理 |
|---|---|
| 點單頁顯示「團主尚未設定 LINE Login Channel ID」 | 填「設定 → LINE Login Channel ID」 |
| 別人打開說無法登入 | LINE Developers 的 channel 要改成 **Published** |
| 「連線失敗」 | `config.js` 的 API_URL 是否為 `/exec` 結尾；部署存取權是否為「所有人」 |
| 改了程式碼但沒生效 | Apps Script 要「管理部署作業 → 新版本」；GitHub Pages 要等 1–2 分鐘 |
| 匯入商品失敗 | 官網可能改版，可以手動在「商品」工作表新增列（類型／商品鍵／商品名稱／款式／開放） |

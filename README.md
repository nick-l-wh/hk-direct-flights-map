# 香港國際機場直航地圖

Static map of every nonstop passenger destination from Hong Kong International Airport (HKG). No build step: open `index.html` through any static file server.

截至 **2026年10月29日**：146 個城市、152 個機場。介面為繁體中文（香港）。

## 睇地圖

本地預覽：

```bash
python3 -m http.server 8765
```

然後打開 <http://127.0.0.1:8765/>。請用網站伺服器，不要直接以 `file://` 開啟，否則瀏覽器會擋住 `data/destinations.json`。

GitHub Pages（由 `main` 分支根目錄發佈）：

<https://nick-l-wh.github.io/hk-direct-flights-map/>

## 地圖上有甚麼

- 淺色 OpenFreeMap Positron 底圖（OpenStreetMap 資料，外觀接近 CARTO Positron；CARTO 光柵圖磚現時需要 API key）
- 香港（HKG）為藍色圓點，標籤「香港 (HKG)」
- 由 HKG 到每個航點的半透明粉紅色大圓航線
- 航點圓點按地區着色
- 點擊或移上航點會顯示彈出視窗：中文同英文城市名、IATA 代碼、航空公司，以及季節性／新開航／復航／暫停備註
- 左側可以按地區、航空公司篩選，亦可以搜尋城市或代碼

## 資料

| 內容 | 來源 |
| --- | --- |
| 航點、航空公司、備註 | [Wikipedia — Hong Kong International Airport — Airlines and destinations](https://en.wikipedia.org/wiki/Hong_Kong_International_Airport#Airlines_and_destinations)（整理截至 2026-10-29；條目引用存取日期 2026-10-17）。只包括客運直航，不包括貨運。 |
| 緯度、經度、英文機場名、ICAO | [OurAirports](https://ourairports.com/data/) `airports.csv`，以 IATA 代碼對照 `scheduled_service=yes` 的 large／medium airport。座標不是估算。 |

金邊用現正營運的 Techo International Airport（KTI）。烏蘭巴托用 Chinggis Khaan International Airport（UBN）。舊代碼 PNH、ULN 在 OurAirports 已沒有定期航班。

澳門與香港之間沒有定期客運航班，所以「台灣／澳門」只列出台灣航點。

出發前請向航空公司或香港國際機場查詢最新航班。

重新產生 `data/destinations.json`（要自備 OurAirports 的 `airports.csv`）：

```bash
python3 scripts/build_destinations.py --airports airports.csv
```

## GitHub Pages

網站檔案放在儲存庫根目錄（`index.html`），並有 `.nojekyll`，所以 Pages 可以跳過 Jekyll。

發佈設定：Settings → Pages → Build and deployment → Source：**Deploy from a branch** → Branch：**main** → Folder：**/ (root)**。

# 滾倉盈虧計算機 - Vercel 部署指南

本專案為基於 **Vite + React (TypeScript) + Tailwind CSS** 開發的高級前端單頁應用程式（SPA）。
我們已經為您配置好最理想的 Vercel 設定檔，讓您可以直接無縫部署到 Vercel 平台。

---

## 🚀 快速部署步驟

### 步驟 1：準備您的 GitHub 儲存庫
1. 在 GitHub 上建立一個新的**私有**或**公開**儲存庫 (Repository)。
2. 將本專案的所有檔案（包含 `.gitignore`、`vercel.json` 等）推送到您的 GitHub 儲存庫：
   ```bash
   git init
   git add .
   git commit -m "feat: init rolling-calculator"
   git branch -M main
   git remote add origin <您的 GitHub 儲存庫網址>
   git push -u origin main
   ```

### 步驟 2：登入 Vercel 並匯入專案
1. 瀏覽 [Vercel 官網 (vercel.com)](https://vercel.com/) 並登入您的帳戶。
2. 點擊右上角的 **"Add New..."** 按鈕，選擇 **"Project"**。
3. 連接您的 GitHub 帳戶，並在列表中找到剛才建立的儲存庫，點擊 **"Import"**。

### 步驟 3：配置 Vercel 專案參數
Vercel 會自動偵測到這是 **Vite** 專案，大部分設定保持預設即可：
* **Framework Preset (框架預設)**: 選擇 `Vite`
* **Root Directory (根目錄)**: `./` (預設)
* **Build and Output Settings (建置與輸出設定)**:
  * **Build Command (建置指令)**: `npm run build` 或 `vite build`
  * **Output Directory (輸出目錄)**: `dist`
  * **Install Command (安裝指令)**: `npm install`
* **Environment Variables (環境變數)**: *本程式為 100% 前端純計算機（包含 localStorage 本地儲存），故不需要任何環境變數 API Key，直接留空即可。*

### 步驟 4：點擊 Deploy 部署！
1. 點擊最下方的 **"Deploy"** 按鈕。
2. 等待約 30 ~ 60 秒的自動編譯建置。
3. 部署成功！您將獲得一個專屬的 Vercel 免費子網域（例如：`your-project.vercel.app`），即可立即公開分享。

---

## 🛠️ 已為您置入的優化檔案

本專案根目錄下已為您建立了 `/vercel.json` 設定檔：
* **`/vercel.json`**: 
  ```json
  {
    "cleanUrls": true,
    "trailingSlash": false,
    "rewrites": [
      {
        "source": "/(.*)",
        "destination": "/index.html"
      }
    ]
  }
  ```
  * **用途**：確保使用者在自訂路由、重新整理頁面或點選深層連結時，不會出現 404 錯誤，能由 Vite SPA 路由正確承接，提昇部署至 Vercel 後的穩定度。

---

祝您使用愉快！如有任何策略組合設定或計算公式優化需求，歡迎隨時提出調整。

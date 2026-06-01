# 零用金池

給 iPhone 和 Android 瀏覽器使用的家庭零用金網頁 App。爸媽可以發放零用金，小孩可以每日記帳與補登，資料可透過 Firebase Firestore 在不同裝置同步。

## 功能

- 爸媽建立家庭帳本、設定家長密碼與孩子密碼
- 爸媽可發放零用金、調整期初金額、新增多位孩子
- 小孩可每日記帳，也可選過去日期補登
- 自動計算每位孩子的零用金池餘額
- 流水帳可篩選、修改、刪除
- 支援 CSV 匯出、JSON 備份與匯入
- Firebase Firestore 即時同步
- GitHub Pages 靜態部署
- PWA 離線快取，可從手機瀏覽器加入主畫面

## 本機使用

```powershell
node dev-server.js
```

然後前往 `http://localhost:4173`。

## 開啟多人同步

1. 到 Firebase Console 建立專案。
2. 建立 Web App，複製 Firebase config。
3. 啟用 Firestore Database。
4. 本機測試時可把 config 暫時填進 `firebase-config.js`。
5. GitHub Pages 部署請把 config 填到 GitHub Secrets，不要把真實 key commit 到 repo。

`firebase-config.js` 範例：

```js
window.ALLOWANCE_FIREBASE_CONFIG = {
  apiKey: "your-api-key",
  authDomain: "your-project-id.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project-id.appspot.com",
  messagingSenderId: "your-messaging-sender-id",
  appId: "your-app-id"
};
```

## Firestore 規則

第一版家用可先用下列規則測試。這代表知道網址的人都可以讀寫同一份家庭帳本，適合私人 repo 或只給家人使用的網址。正式長期使用建議再加 Firebase Authentication。

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /families/{familyId} {
      allow read, write: if true;
    }
  }
}
```

資料會存在 `families/main-family` 這份文件。

## GitHub Pages

此 repo 已包含 `.github/workflows/pages.yml`。推到 `main` 後，GitHub Actions 會部署靜態網站。

若第一次部署沒有跑起來，到 GitHub repo 的 Settings → Pages，把 Source 設為 GitHub Actions。

到 GitHub repo 的 Settings → Secrets and variables → Actions → New repository secret，新增以下 Secrets：

- `FIREBASE_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_MESSAGING_SENDER_ID`
- `FIREBASE_APP_ID`

GitHub Actions 會在部署時產生 `firebase-config.js`，因此 repo 內的 `firebase-config.js` 只保留 placeholder。

## 手機使用

iPhone 用 Safari 開 GitHub Pages 網址，點分享按鈕，再選「加入主畫面」。

Android 用 Chrome 開 GitHub Pages 網址，點右上角選單，再選「安裝應用程式」或「加入主畫面」。

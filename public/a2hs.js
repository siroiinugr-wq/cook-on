/*!
 * a2hs.js — 「ホーム画面に追加」ボタン（MASAのウェブアプリ共通）
 * 使い方: </body> の直前に <script src="/a2hs.js" defer></script> を1行足すだけ。
 * React(Vite)なら public/a2hs.js に置いて index.html に同じ1行。
 *
 * 表示ルール
 *  - PC                          → 出さない
 *  - スマホで「アプリとして」開いている → 出さない
 *  - スマホのブラウザで開いている      → 常に表示
 *      ・Android 未インストール   → タップで本物のインストール画面
 *      ・Android インストール済み → 「インストール済み」表示＋アイコンから開く案内
 *      ・iPhone                  → 追加手順の案内（※インストール済みかは判定できない）
 *      ・LINE/Instagram内ブラウザ → 「Safari/Chromeで開いて」案内
 *
 * アプリごとの調整（読み込みタグに書く。書かなければ右下16px・重なり順35）
 *   data-bottom="80"  … 画面の下から何pxの高さに出すか（下のタブバーや保存バーをよける）
 *   data-side="left"  … 左下に出す（右下に大事なボタンがある画面向け）
 *   data-z="35"       … 重なり順。アプリのポップアップ（z-40以上）より下にしておくと、開いたときに隠れる
 */
(function () {
  if (window.__a2hsLoaded) return;
  window.__a2hsLoaded = true;

  var me = document.currentScript;
  var opt = function (k, d) { var v = me && me.getAttribute('data-' + k); return v == null || v === '' ? d : v; };
  var bottomPx = parseInt(opt('bottom', '16'), 10) || 0;
  var side = opt('side', 'right') === 'left' ? 'left' : 'right';
  var zIndex = parseInt(opt('z', '35'), 10);
  if (isNaN(zIndex)) zIndex = 35;

  var ua = navigator.userAgent;
  var isIOS = /iPhone|iPad|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOSのPC表示対策
  var isAndroid = /Android/.test(ua);
  var isMobile = isIOS || isAndroid;
  var isStandalone =
    ['standalone', 'fullscreen', 'minimal-ui'].some(function (m) {
      return window.matchMedia('(display-mode: ' + m + ')').matches;
    }) || navigator.standalone === true;
  var isInApp = /Line\/|Instagram|FBAN|FBAV|FB_IAB/i.test(ua);
  var isIOSChrome = isIOS && /CriOS/.test(ua);

  if (!isMobile || isStandalone) return;

  var deferredPrompt = null; // Androidのインストール画面を後で出すための預かり
  var installed = false;

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    render();
  });
  window.addEventListener('appinstalled', function () {
    installed = true;
    deferredPrompt = null;
    render();
  });
  // Android Chrome: manifest に related_applications を書いておくとインストール済みか分かる
  if ('getInstalledRelatedApps' in navigator) {
    navigator.getInstalledRelatedApps().then(function (apps) {
      if (apps && apps.length) { installed = true; render(); }
    }).catch(function () {});
  }

  // ---- 表示（Shadow DOMでアプリ側のCSSと干渉しない） ----
  var host = document.createElement('div');
  host.id = 'a2hs-root';
  var root = host.attachShadow({ mode: 'open' });
  root.innerHTML =
    '<style>' +
    ':host{all:initial}' +
    '.btn{position:fixed;' + side + ':16px;bottom:calc(' + bottomPx + 'px + env(safe-area-inset-bottom));z-index:' + zIndex + ';' +
    'display:flex;align-items:center;gap:6px;padding:10px 14px;border:0;border-radius:999px;' +
    'background:#111;color:#fff;font:600 13px/1 -apple-system,BlinkMacSystemFont,"Hiragino Sans",sans-serif;' +
    'box-shadow:0 4px 14px rgba(0,0,0,.25);cursor:pointer;-webkit-tap-highlight-color:transparent}' +
    '.btn.done{background:#2e7d32}' +
    '.mask{position:fixed;inset:0;z-index:2147483001;background:rgba(0,0,0,.45);display:none}' +
    '.sheet{position:fixed;left:0;right:0;bottom:0;z-index:2147483002;background:#fff;color:#111;' +
    'border-radius:16px 16px 0 0;padding:20px 20px calc(20px + env(safe-area-inset-bottom));' +
    'font:14px/1.7 -apple-system,BlinkMacSystemFont,"Hiragino Sans",sans-serif;display:none}' +
    '.sheet h3{margin:0 0 8px;font-size:16px}.sheet ol{margin:0;padding-left:1.3em}' +
    '.close{margin-top:14px;width:100%;padding:12px;border:0;border-radius:10px;background:#eee;font:600 14px sans-serif}' +
    '.open .mask,.open .sheet{display:block}' +
    '</style>' +
    '<div class="wrap"><button class="btn" type="button"></button>' +
    '<div class="mask"></div><div class="sheet"><div class="body"></div>' +
    '<button class="close" type="button">閉じる</button></div></div>';

  var wrap = root.querySelector('.wrap');
  var btn = root.querySelector('.btn');
  var body = root.querySelector('.body');
  function closeSheet() { wrap.classList.remove('open'); }
  root.querySelector('.mask').addEventListener('click', closeSheet);
  root.querySelector('.close').addEventListener('click', closeSheet);

  function showGuide(html) { body.innerHTML = html; wrap.classList.add('open'); }

  function render() {
    btn.classList.toggle('done', installed);
    btn.textContent = installed ? '✓ インストール済み' : '＋ ホーム画面に追加';
  }

  btn.addEventListener('click', function () {
    if (isInApp) {
      return showGuide('<h3>ブラウザで開いてください</h3>' +
        'アプリ内ブラウザ（LINE・Instagramなど）からは追加できません。<br>' +
        '右上（または右下）のメニューから「' + (isIOS ? 'Safari' : 'ブラウザ') + 'で開く」を選んでください。');
    }
    if (installed) {
      return showGuide('<h3>すでにインストール済みです</h3>' +
        'ホーム画面のアイコンから開くと、アプリとして全画面で使えます。<br>' +
        '（Chromeのメニュー「⋮」に「アプリで開く」が出ていればそこからも開けます）');
    }
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function (r) {
        if (r.outcome === 'accepted') installed = true;
        deferredPrompt = null;
        render();
      });
      return;
    }
    if (isIOS) {
      return showGuide('<h3>ホーム画面に追加する方法</h3><ol>' +
        '<li>' + (isIOSChrome ? '右上の共有ボタン' : '画面下（または上）の共有ボタン') + '（□に↑）をタップ</li>' +
        '<li>「ホーム画面に追加」を選ぶ（見つからなければ下にスクロール）</li>' +
        '<li>右上の「追加」をタップ</li></ol>' +
        '<p style="margin:10px 0 0;color:#666;font-size:12px">すでに追加済みの方は、ホーム画面のアイコンから開いてください。</p>');
    }
    showGuide('<h3>ホーム画面に追加する方法</h3><ol>' +
      '<li>右上のメニュー（⋮）をタップ</li>' +
      '<li>「ホーム画面に追加」または「アプリをインストール」を選ぶ</li></ol>');
  });

  render();
  // body の先頭に置く：重なり順が同じなら、あとから開くアプリのポップアップが上に来る
  var mount = function () { document.body.insertBefore(host, document.body.firstChild); };
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();

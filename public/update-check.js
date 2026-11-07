/*!
 * update-check.js — 新しい版が公開されたら知らせる（MASAのウェブアプリ共通。OMNI の帯と同じ仕様）
 *
 * 画面を開いたまま（ホーム画面に置いたアプリは特に）デプロイが走ると、
 * 読み込み直すまで古いコードが動き続ける。古い画面と新しいルールの組み合わせで
 * 事故が起きたことがあるので（OMNI 2026-10）、5分ごとと画面に戻ったときに確かめ、
 * 古ければ上に「読み込み直す」を出す。
 *
 * 使い方（index.html の </body> の前）：
 *   <script src="/update-check.js" data-version="%VITE_APP_VERSION%" defer></script>
 *   - data-version … 組み立てたときの版。scripts/stamp-version.mjs が public/version.json に書き、
 *                    vite.config が VITE_APP_VERSION に入れる（Vite が %…% を置き換える）
 *   - data-url     … 版を読む場所（書かなければ /version.json）
 * 開発中（版が dev）は何もしない。
 */
(function () {
  if (window.__updateCheckLoaded) return;
  window.__updateCheckLoaded = true;

  var me = document.currentScript;
  var mine = me && me.getAttribute('data-version');
  if (!mine || mine === 'dev' || mine.charAt(0) === '%') return;
  var url = (me && me.getAttribute('data-url')) || '/version.json';
  var EVERY = 5 * 60 * 1000;
  var shown = false;

  function show() {
    if (shown || !document.body) return;
    shown = true;
    var host = document.createElement('div');
    host.id = 'update-check-root';
    var root = host.attachShadow({ mode: 'open' });
    root.innerHTML =
      '<style>' +
      ':host{all:initial}' +
      '.bar{position:fixed;left:50%;top:calc(8px + env(safe-area-inset-top));transform:translateX(-50%);' +
      'z-index:2147483000;width:min(520px,calc(100vw - 16px));box-sizing:border-box;' +
      'display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px 10px 16px;' +
      'border:1px solid #fde68a;border-radius:14px;background:#fffbeb;box-shadow:0 6px 20px rgba(0,0,0,.12);' +
      'font:12px/1.6 -apple-system,BlinkMacSystemFont,"Hiragino Sans","Noto Sans JP",sans-serif;color:#78350f;' +
      'animation:in .3s ease}' +
      '@keyframes in{from{opacity:0;transform:translate(-50%,-8px)}to{opacity:1;transform:translate(-50%,0)}}' +
      'button{flex-shrink:0;border:0;border-radius:10px;background:#92400e;color:#fff;padding:8px 12px;' +
      'font:600 12px/1 -apple-system,BlinkMacSystemFont,"Hiragino Sans",sans-serif;cursor:pointer}' +
      '</style>' +
      '<div class="bar" role="status" aria-live="polite">' +
      '<span>新しい版が公開されました。読み込み直すと最新の画面になります。</span>' +
      '<button type="button">読み込み直す</button></div>';
    root.querySelector('button').addEventListener('click', function () { window.location.reload(); });
    document.body.appendChild(host);
  }

  function check() {
    if (shown) return;
    fetch(url + '?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        var now = d && d.version ? String(d.version) : '';
        if (now && now !== mine) show();
      })
      .catch(function () { /* 通信できないときは黙って次の機会にする */ });
  }

  check();
  setInterval(check, EVERY);
  // ほかのアプリやタブから戻ってきたときにも確かめる（ホーム画面のアプリは閉じずに戻ることが多い）
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') check();
  });
})();

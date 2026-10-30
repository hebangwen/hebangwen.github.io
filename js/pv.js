/* =========================================================
   Page views —— Cloudflare Workers + D1
   入口：_config.butterfly.yml -> inject.bottom
   未配置 ENDPOINT 时整个脚本静默退出，不会发出任何请求
   ========================================================= */
(function () {
  'use strict';

  /* 改成你的 Worker 域名（部署后 wrangler 会打印） */
  var ENDPOINT = 'https://blog-pv.hebangwen.workers.dev';

  var DEDUPE_MS = 30 * 60 * 1000; // 同一路径 30 分钟内只计一次
  var LABEL = '阅读';

  if (!ENDPOINT || ENDPOINT.indexOf('example.workers.dev') !== -1) return;

  var meta = document.getElementById('post-meta');
  if (!meta) return; // 只在文章页统计

  var path = normalize(location.pathname);
  if (!path) return;

  var slot = ensureSlot(meta);
  if (!slot) return;
  var value = slot.querySelector('.cf-pv-value');

  var seen = readSeen(path);

  if (seen) {
    fetch(ENDPOINT + '/views?path=' + encodeURIComponent(path))
      .then(toJson)
      .then(render)
      .catch(noop);
  } else {
    fetch(ENDPOINT + '/hit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: path }),
      keepalive: true
    })
      .then(toJson)
      .then(function (data) {
        render(data);
        markSeen(path);
      })
      .catch(noop);
  }

  function render(data) {
    if (!data || typeof data.views !== 'number') return;
    value.textContent = format(data.views);
    // 用 !important 顶掉主题里未知来源的隐藏规则，确保计数一定可见
    slot.style.setProperty('display', 'inline', 'important');
  }

  function ensureSlot(root) {
    var line = root.querySelector('.meta-secondline');
    if (!line) return null;

    // 这一行已有内容时才补分隔符，避免出现孤零零的竖线
    var needsSeparator = line.children.length > 0;

    var span = document.createElement('span');
    span.className = 'post-meta-pv';
    span.style.display = 'none';
    span.innerHTML =
      (needsSeparator ? '<span class="post-meta-separator">|</span>' : '') +
      '<i class="far fa-eye fa-fw post-meta-icon"></i>' +
      '<span class="post-meta-label">' + LABEL + ':</span>' +
      '<span class="cf-pv-value">—</span>';
    line.appendChild(span);
    return span;
  }

  function normalize(raw) {
    var p = String(raw || '').split('#')[0].split('?')[0];
    if (!p || p.charAt(0) !== '/') return null;
    if (/\.(css|js|png|jpe?g|gif|svg|webp|ico|json|xml|txt|woff2?)$/i.test(p)) return null;
    if (p.slice(-11) === '/index.html') p = p.slice(0, -11);
    if (p.charAt(p.length - 1) !== '/') p += '/';
    return p;
  }

  function readSeen(p) {
    try {
      var raw = sessionStorage.getItem('cfpv:' + p);
      if (!raw) return false;
      return Date.now() - Number(raw) < DEDUPE_MS;
    } catch (e) {
      return false;
    }
  }

  function markSeen(p) {
    try {
      sessionStorage.setItem('cfpv:' + p, String(Date.now()));
    } catch (e) {
      /* 隐私模式下忽略 */
    }
  }

  function format(n) {
    if (n >= 100000) return (n / 10000).toFixed(1) + ' 万';
    if (n >= 10000) return (n / 10000).toFixed(1) + ' 万';
    return String(n);
  }

  function toJson(r) {
    if (!r.ok) throw new Error('bad status ' + r.status);
    return r.json();
  }

  function noop() {}
})();

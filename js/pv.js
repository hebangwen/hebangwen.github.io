/* =========================================================
   Page views —— Cloudflare Workers + D1
   入口：_config.butterfly.yml -> inject.bottom
     · 所有页面：上报一次浏览（首页、归档、标签、分类都算）
     · 文章页：额外显示本篇阅读量
     · 侧栏「网站资讯」：显示站点总访问量与今日/昨日访问
   未配置 ENDPOINT 时整个脚本静默退出，不会发出任何请求
   ========================================================= */
(function () {
  'use strict';

  /* 主用自定义域名（workers.dev 在国内被阻断），后者作为海外兜底；首个探测成功的基址在会话内复用 */
  var ENDPOINT = 'https://pv.99610105.xyz';
  var FALLBACK = 'https://blog-pv.hebangwen.workers.dev';

  var PROBE_TIMEOUT = 4000; // 单次请求上限：被阻断时快速失败，不拖住页面
  var DEDUPE_MS = 30 * 60 * 1000; // 同一路径 30 分钟内只计一次
  var STATS_TTL = 5 * 60 * 1000; // 站点总量缓存 5 分钟
  var LABEL = '阅读';

  if (!ENDPOINT) return;

  initSiteStats();
  initPageView();

  /* ---------------- 站点总量 ---------------- */
  function initSiteStats() {
    var box = document.querySelector('.card-webinfo .webinfo');
    if (!box) return;

    var cached = readJson('cfpv:stats:v2', STATS_TTL);
    if (cached) {
      paintStats(box, cached);
      return;
    }

    getJson('/stats')
      .then(function (data) {
        if (!data || typeof data.site !== 'number') return;
        paintStats(box, data);
        writeJson('cfpv:stats:v2', data);
      })
      .catch(noop);
  }

  function paintStats(box, data) {
    setItem(box, 'cf-site-pv', '总访问量', data.site);
    if (typeof data.today === 'number') {
      setItem(box, 'cf-site-today', '今日访问', data.today);
    }
    /* 昨日用来对照：只有一天数据时总数与今日必然相等，多一行能看出这是历史量而非重复查询 */
    if (typeof data.yesterday === 'number') {
      setItem(box, 'cf-site-yesterday', '昨日访问', data.yesterday);
    }
  }

  function setItem(box, id, name, count) {
    var el = box.querySelector('#' + id);
    if (!el) {
      el = document.createElement('div');
      el.className = 'webinfo-item';
      el.innerHTML =
        '<div class="item-name">' + name + ' :</div>' +
        '<div class="item-count" id="' + id + '">—</div>';
      box.appendChild(el);
    }
    el.querySelector('.item-count').textContent = format(count);
  }

  /* ---------------- 页面浏览 ---------------- */
  function initPageView() {
    var path = normalize(location.pathname);
    if (!path) return;

    /* 文章页既计数也渲染阅读量，其他页面只计数 */
    var meta = document.getElementById('post-meta');
    var isPost = !!meta;
    var slot = isPost ? ensureSlot(meta) : null;
    var value = slot ? slot.querySelector('.cf-pv-value') : null;

    if (readSeen(path)) {
      if (!isPost) return;
      getJson('/views?path=' + encodeURIComponent(path))
        .then(render)
        .catch(noop);
      return;
    }

    postJson('/hit', JSON.stringify({ path: path, type: isPost ? 'post' : 'page' }))
      .then(function (data) {
        if (!data) return; // 两个域名都不通时不标记已读，下次访问再试
        render(data);
        markSeen(path);
      })
      .catch(noop);

    function render(data) {
      if (!value || !data || typeof data.views !== 'number') return;
      value.textContent = format(data.views);
      // 用 !important 顶掉主题里未知来源的隐藏规则，确保计数一定可见
      slot.style.setProperty('display', 'inline', 'important');
    }
  }

  /* 文章页 meta 里的阅读数槽位，不存在就建一个 */
  function ensureSlot(root) {
    var line = root.querySelector('.meta-secondline');
    if (!line) return null;

    var span = document.createElement('span');
    span.className = 'post-meta-pv';
    span.style.display = 'none';
    // 分隔符由 CSS 的 .meta-secondline::before 提供，避免与主题 wordcount 重复
    span.innerHTML =
      '<i class="far fa-eye fa-fw post-meta-icon"></i>' +
      '<span class="post-meta-label">' + LABEL + ':</span>' +
      '<span class="cf-pv-value">—</span>';
    line.appendChild(span);
    return span;
  }

  /* ---------------- 网络：双域名 + 超时 ---------------- */
  var BASE_KEY = 'cfpv:base';
  var basePromise = null;

  function withBase(make) {
    return resolveBase().then(function (base) {
      return base ? make(base) : null;
    });
  }

  /* 自定义域名优先，不通再退到 workers.dev；结果写进 sessionStorage，同一次会话只探测一次 */
  function resolveBase() {
    if (basePromise) return basePromise;
    var cached = readRaw(BASE_KEY);
    if (cached) {
      basePromise = Promise.resolve(cached === '-' ? null : cached);
      return basePromise;
    }
    basePromise = probe(ENDPOINT).then(function (ok) {
      if (ok) return ENDPOINT;
      return probe(FALLBACK).then(function (ok2) {
        return ok2 ? FALLBACK : null;
      });
    }).then(function (found) {
      writeRaw(BASE_KEY, found || '-');
      return found;
    });
    return basePromise;
  }

  function probe(base) {
    if (!base) return Promise.resolve(false);
    return fetchTimeout(base + '/stats', {}, PROBE_TIMEOUT)
      .then(function (r) { return !!r && r.ok; })
      .catch(function () { return false; });
  }

  function fetchTimeout(url, opts, ms) {
    if (typeof AbortController === 'undefined') return fetch(url, opts);
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, ms);
    var o = {};
    for (var k in opts) {
      if (Object.prototype.hasOwnProperty.call(opts, k)) o[k] = opts[k];
    }
    o.signal = ctrl.signal;
    return fetch(url, o).then(
      function (r) { clearTimeout(timer); return r; },
      function (e) { clearTimeout(timer); throw e; }
    );
  }

  function getJson(path) {
    return withBase(function (base) {
      return fetchTimeout(base + path, {}, PROBE_TIMEOUT);
    }).then(function (r) { return r ? toJson(r) : null; });
  }

  function postJson(path, body) {
    return withBase(function (base) {
      return fetchTimeout(base + path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: body,
        keepalive: true
      }, PROBE_TIMEOUT);
    }).then(function (r) { return r ? toJson(r) : null; });
  }

  /* ---------------- 工具 ---------------- */
  function normalize(raw) {
    var p = String(raw || '').split('#')[0].split('?')[0];
    if (!p || p.charAt(0) !== '/') return null;
    if (/\.(css|js|png|jpe?g|gif|svg|webp|ico|json|xml|txt|woff2?)$/i.test(p)) return null;
    if (p.slice(-11) === '/index.html') p = p.slice(0, -11);
    if (p.charAt(p.length - 1) !== '/') p += '/';
    return p;
  }

  function readSeen(p) {
    var raw = readRaw('cfpv:' + p);
    if (!raw) return false;
    return Date.now() - Number(raw) < DEDUPE_MS;
  }

  function markSeen(p) {
    writeRaw('cfpv:' + p, String(Date.now()));
  }

  function readJson(key, ttl) {
    var raw = readRaw(key);
    if (!raw) return null;
    try {
      var obj = JSON.parse(raw);
      if (!obj || !obj.__t || Date.now() - obj.__t > ttl) return null;
      return obj.data;
    } catch (e) {
      return null;
    }
  }

  function writeJson(key, data) {
    try {
      writeRaw(key, JSON.stringify({ __t: Date.now(), data: data }));
    } catch (e) {
      /* ignore */
    }
  }

  function readRaw(key) {
    try {
      return sessionStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function writeRaw(key, val) {
    try {
      sessionStorage.setItem(key, val);
    } catch (e) {
      /* 隐私模式下忽略 */
    }
  }

  function format(n) {
    if (typeof n !== 'number') return '—';
    if (n >= 10000) return (n / 10000).toFixed(1) + ' 万';
    return String(n);
  }

  function toJson(r) {
    if (!r.ok) throw new Error('bad status ' + r.status);
    return r.json();
  }

  function noop() {}
})();

/* =========================================================
   Homepage hero —— 首页开场
   入口：_config.butterfly.yml -> inject.bottom
   仅在首页 #page-header.full_page 生效，其余页面直接退出
   ---------------------------------------------------------
   主视觉是一个三维点云网络：手写 3D 投影 + 距离连线，
   缓慢自转，鼠标可倾斜；不依赖 Three.js。
   ========================================================= */
(function () {
  'use strict';

  /* 可改的文案 */
  var COPY = {
    lede: '把读过、写过、调过的东西记下来。',
    entryLabel: '最新一篇'
  };

  var header = document.getElementById('page-header');
  if (!header || !header.classList.contains('full_page')) return;

  var info = document.getElementById('site-info');
  var title = document.getElementById('site-title');
  if (!info || !title || info.dataset.heroReady) return;
  info.dataset.heroReady = '1';

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* 1. 标题拆成修饰行与主行 */
  var raw = (title.textContent || '').trim();
  var match = raw.match(/^(Yet Another)\s+/i);
  var name = document.createElement('span');
  name.className = 'hero-name';

  title.textContent = '';
  if (match) {
    var prelude = document.createElement('span');
    prelude.className = 'hero-prelude';
    prelude.textContent = match[1];
    title.appendChild(prelude);
    name.textContent = raw.slice(match[0].length);
  } else {
    name.textContent = raw;
  }
  title.appendChild(name);

  /* 2. 左栏容器 */
  var copy = document.createElement('div');
  copy.className = 'hero-copy';
  info.insertBefore(copy, title);
  copy.appendChild(title);

  var lede = document.createElement('p');
  lede.className = 'hero-lede';
  lede.textContent = COPY.lede;
  copy.appendChild(lede);

  var entry = buildEntry(COPY.entryLabel);
  if (entry) copy.appendChild(entry);

  /* 3. 三维场景 */
  initScene();

  /* 4. 滚动提示 */
  var cue = document.getElementById('scroll-down');
  if (cue) {
    cue.setAttribute('role', 'button');
    cue.setAttribute('tabindex', '0');
    cue.setAttribute('aria-label', '继续浏览文章');
    cue.innerHTML = '<span class="hero-scroll-line"></span>';
    var jump = function () {
      window.scrollTo({
        top: header.offsetHeight,
        behavior: reduce ? 'auto' : 'smooth'
      });
    };
    cue.addEventListener('click', jump);
    cue.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        jump();
      }
    });
  }

  /* 5. 滚动时淡出，把位置让给文章列表 */
  var ticking = false;
  window.addEventListener(
    'scroll',
    function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () {
        ticking = false;
        var y = window.scrollY || window.pageYOffset || 0;
        var h = header.offsetHeight || 1;
        var p = Math.min(1, y / (h * 0.85));
        header.style.setProperty('--hero-shift', (-p * 40).toFixed(1) + 'px');
        header.style.setProperty('--hero-fade', (1 - p).toFixed(3));
      });
    },
    { passive: true }
  );

  /* ---------------- 三维点云 ---------------- */

  function initScene() {
    var canvas = document.createElement('canvas');
    canvas.className = 'hero-scene';
    canvas.setAttribute('aria-hidden', 'true');
    header.insertBefore(canvas, info);

    var ctx = canvas.getContext('2d');
    if (!ctx) return;

    var nodes = buildSphere(40);
    var edges = buildEdges(nodes, 0.72, 3);

    var w = 0;
    var h = 0;
    var raf = 0;
    var running = true;

    var spin = 0;
    var tiltX = -0.16;
    var tiltY = 0;
    var targetTiltX = -0.16;
    var targetTiltY = 0;
    var last = 0;

    resize();

    if (reduce) {
      render(0);
      window.addEventListener('resize', function () {
        resize();
        render(0);
      });
      return;
    }

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(
        function (records) {
          var visible = records[0].isIntersecting;
          if (visible && !running) {
            running = true;
            last = 0;
            loop(0);
          } else if (!visible) {
            running = false;
            if (raf) window.cancelAnimationFrame(raf);
            raf = 0;
          }
        },
        { threshold: 0 }
      ).observe(header);
    }

    if (window.matchMedia('(hover: hover)').matches) {
      header.addEventListener(
        'mousemove',
        function (e) {
          var r = header.getBoundingClientRect();
          targetTiltY = ((e.clientX - r.left) / r.width - 0.5) * 0.55;
          targetTiltX = -0.16 + ((e.clientY - r.top) / r.height - 0.5) * 0.35;
        },
        { passive: true }
      );
      header.addEventListener('mouseleave', function () {
        targetTiltX = -0.16;
        targetTiltY = 0;
      });
    }

    window.addEventListener('resize', resize, { passive: true });

    loop(0);

    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = header.clientWidth;
      h = header.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function loop(ts) {
      if (!running) return;
      var dt = last ? Math.min((ts - last) / 1000, 0.05) : 0;
      last = ts;

      spin += dt * 0.16;
      tiltX += (targetTiltX - tiltX) * 0.06;
      tiltY += (targetTiltY - tiltY) * 0.06;

      render(spin);
      raf = window.requestAnimationFrame(loop);
    }

    function render(baseSpin) {
      ctx.clearRect(0, 0, w, h);
      if (!w || !h) return;

      var rx = tiltX;
      var ry = baseSpin + tiltY;
      var cosX = Math.cos(rx);
      var sinX = Math.sin(rx);
      var cosY = Math.cos(ry);
      var sinY = Math.sin(ry);

      var narrow = w <= 1024;
      var cx = w * (narrow ? 0.5 : 0.7);
      var cy = h * (narrow ? 0.46 : 0.5);
      var radius = Math.min(w, h) * (narrow ? 0.4 : 0.29);
      var fov = 2.8;

      var projected = nodes.map(function (n) {
        var x1 = n.x * cosY - n.z * sinY;
        var z1 = n.x * sinY + n.z * cosY;
        var y1 = n.y * cosX - z1 * sinX;
        var z2 = n.y * sinX + z1 * cosX;
        var s = fov / (fov + z2);
        return {
          x: cx + x1 * radius * s,
          y: cy + y1 * radius * s,
          z: z2,
          s: s
        };
      });

      /* 连线：先画，按深度衰减 */
      ctx.lineWidth = 1;
      for (var i = 0; i < edges.length; i++) {
        var a = projected[edges[i][0]];
        var b = projected[edges[i][1]];
        var depth = (a.z + b.z) / 2;
        var alpha = 0.17 - depth * 0.135;
        if (alpha <= 0.012) continue;
        ctx.strokeStyle = 'rgba(244, 247, 248, ' + alpha.toFixed(3) + ')';
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      /* 节点：近大远小，少数用强调色 */
      for (var k = 0; k < projected.length; k++) {
        var p = projected[k];
        var d = (p.z + 1) / 2;
        var r = Math.max(0.6, 2.6 * p.s - d * 0.9);
        var nodeAlpha = 0.82 - d * 0.56;
        if (nodeAlpha <= 0.04) continue;
        ctx.fillStyle =
          k % 7 === 3
            ? 'rgba(78, 168, 222, ' + nodeAlpha.toFixed(3) + ')'
            : 'rgba(244, 247, 248, ' + nodeAlpha.toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /* 斐波那契球面分布，比纯随机更匀 */
  function buildSphere(count) {
    var pts = [];
    var golden = Math.PI * (3 - Math.sqrt(5));
    for (var i = 0; i < count; i++) {
      var y = count === 1 ? 0 : 1 - (i / (count - 1)) * 2;
      var r = Math.sqrt(Math.max(0, 1 - y * y));
      var theta = golden * i;
      var jitter = 0.55 + Math.random() * 0.62;
      pts.push({
        x: Math.cos(theta) * r * jitter,
        y: y * jitter,
        z: Math.sin(theta) * r * jitter
      });
    }
    return pts;
  }

  function buildEdges(pts, maxDist, maxPerNode) {
    var edges = [];
    var deg = [];
    for (var i = 0; i < pts.length; i++) deg.push(0);

    for (var a = 0; a < pts.length; a++) {
      for (var b = a + 1; b < pts.length; b++) {
        if (deg[a] >= maxPerNode || deg[b] >= maxPerNode) continue;
        var dx = pts[a].x - pts[b].x;
        var dy = pts[a].y - pts[b].y;
        var dz = pts[a].z - pts[b].z;
        if (dx * dx + dy * dy + dz * dz < maxDist * maxDist) {
          edges.push([a, b]);
          deg[a]++;
          deg[b]++;
        }
      }
    }
    return edges;
  }

  /* 「最新一篇」入口，从首页文章列表里取第一条真实数据 */
  function buildEntry(label) {
    var item = document.querySelector('.recent-post-item');
    if (!item) return null;
    var link = item.querySelector('a.article-title');
    if (!link) return null;

    var href = link.getAttribute('href');
    var text = (link.textContent || '').trim();
    if (!href || !text) return null;

    var time = item.querySelector('time');
    var date = time ? time.getAttribute('datetime') || time.textContent || '' : '';

    var a = document.createElement('a');
    a.className = 'hero-entry';
    a.href = href;

    var l = document.createElement('span');
    l.className = 'hero-entry-label';
    l.textContent = label;
    a.appendChild(l);

    var t = document.createElement('span');
    t.className = 'hero-entry-title';
    t.textContent = text;
    a.appendChild(t);

    if (date) {
      var d = document.createElement('span');
      d.className = 'hero-entry-date';
      d.textContent = date.slice(0, 10);
      a.appendChild(d);
    }
    return a;
  }
})();

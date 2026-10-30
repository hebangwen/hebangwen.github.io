/* =========================================================
   Homepage hero —— 三维粒子文字
   入口：_config.butterfly.yml -> inject.bottom
   ---------------------------------------------------------
   流程：先把站点标题画到离屏 canvas → 按像素采样成粒子 →
        three.js 渲染为 Points → 滚动时粒子向外爆散并淡出，
        同时 DOM 层的导语与「最新一篇」退场，让位给文章列表。
   降级：WebGL 不可用 / 减少动效 / three 加载失败时，
        保留原始 DOM 标题，布局回落到左对齐。
   ========================================================= */
(function () {
  'use strict';

  var COPY = {
    lede: '把读过、写过、调过的东西记下来。',
    entryLabel: '最新一篇'
  };

  var FONT_STACK =
    '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';

  var header = document.getElementById('page-header');
  if (!header || !header.classList.contains('full_page')) return;

  var info = document.getElementById('site-info');
  var title = document.getElementById('site-title');
  if (!info || !title || info.dataset.heroReady) return;
  info.dataset.heroReady = '1';

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* 1. 标题拆分 */
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

  var displayText = (name.textContent || raw).trim();

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

  /* 3. 滚动提示 */
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

  /* 4. 三维文字 */
  if (!reduce) loadThree();

  function loadThree() {
    if (!window.WebGLRenderingContext) return;
    import('/js/three.module.min.js')
      .then(function (mod) {
        var THREE = mod.default || mod;
        try {
          buildScene(THREE);
        } catch (err) {
          /* 保持 DOM 降级 */
        }
      })
      .catch(function () {
        /* 保持 DOM 降级 */
      });
  }

  function buildScene(THREE) {
    var canvas = document.createElement('canvas');
    canvas.className = 'hero-webgl';
    canvas.setAttribute('aria-hidden', 'true');
    header.insertBefore(canvas, info);

    var renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000);
    camera.position.set(0, 0, 120);

    var points = null;
    var base = null;
    var dirs = null;
    var spreads = null;
    var count = 0;
    var material = null;
    var geometry = null;

    var scaleFactor = 1;
    var p = 0;
    var targetP = 0;
    var mouseX = 0;
    var mouseY = 0;
    var camX = 0;
    var camY = 0;
    var raf = 0;
    var visible = true;
    var ready = false;

    buildParticles();
    resize();
    loop();

    window.addEventListener('resize', debounce(resize, 200), { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    header.addEventListener(
      'mousemove',
      function (e) {
        var r = header.getBoundingClientRect();
        mouseX = ((e.clientX - r.left) / r.width - 0.5) * 2;
        mouseY = ((e.clientY - r.top) / r.height - 0.5) * 2;
      },
      { passive: true }
    );
    header.addEventListener('mouseleave', function () {
      mouseX = 0;
      mouseY = 0;
    });

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(
        function (records) {
          visible = records[0].isIntersecting;
          if (visible && !raf) loop();
        },
        { threshold: 0 }
      ).observe(header);
    }

    function buildParticles() {
      var W = Math.max(320, header.clientWidth);
      var H = Math.max(300, header.clientHeight);

      var off = document.createElement('canvas');
      off.width = W;
      off.height = H;
      var g = off.getContext('2d');
      if (!g) return;

      var text = displayText || 'Blog';
      var fontSize = Math.min(H * 0.3, W * 0.34);
      g.font = '800 ' + fontSize + 'px ' + FONT_STACK;

      var measured = g.measureText(text).width;
      var maxW = W * (W < 700 ? 0.94 : 0.82);
      if (measured > maxW) {
        fontSize *= maxW / measured;
        g.font = '800 ' + fontSize + 'px ' + FONT_STACK;
        measured = g.measureText(text).width;
      }

      g.fillStyle = '#ffffff';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, W / 2, H * 0.4);

      var data = g.getImageData(0, 0, W, H).data;
      var step = Math.max(2, Math.round(W / 520));

      var pos = [];
      var col = [];
      var dz = [];
      var spread = [];

      var accent = new THREE.Color(0x4ea8de);
      var paper = new THREE.Color(0xf4f7f8);

      for (var y = 0; y < H; y += step) {
        for (var x = 0; x < W; x += step) {
          var idx = (y * W + x) * 4 + 3;
          if (data[idx] < 140) continue;

          pos.push(x - W / 2, -(y - H / 2), (Math.random() - 0.5) * 34);

          var c = Math.random() < 0.06 ? accent : paper;
          col.push(c.r, c.g, c.b);

          /* 同一小格里的粒子共享方向，碎开时是块状碎片而不是均匀尘埃 */
          var cellX = Math.floor(x / (W / 16));
          var cellY = Math.floor(y / (H * 0.5 / 9));
          var seed = cellX * 131 + cellY * 37 + 1;
          var ang = pseudo(seed) * Math.PI * 2;
          var ring = 0.55 + pseudo(seed + 11) * 0.6;

          dz.push(
            Math.cos(ang) * ring,
            Math.sin(ang) * ring * 0.7 - (0.3 + pseudo(seed + 23) * 0.6),
            0.35 + pseudo(seed + 41) * 1.2
          );
          spread.push(20 + pseudo(seed + 57) * 90);
        }
      }

      count = pos.length / 3;
      if (!count) return;

      base = new Float32Array(pos);
      dirs = new Float32Array(dz);
      spreads = new Float32Array(spread);

      geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));

      material = new THREE.PointsMaterial({
        size: 0.42,
        sizeAttenuation: true,
        vertexColors: true,
        transparent: true,
        opacity: 1,
        depthWrite: false
      });

      points = new THREE.Points(geometry, material);
      scene.add(points);
    }

    function resize() {
      var w = header.clientWidth;
      var h = header.clientHeight;
      if (!w || !h) return;

      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();

      /* 采样坐标是画布像素，这里换算成相机可见范围内的世界单位 */
      var vFov = (camera.fov * Math.PI) / 180;
      var visH = 2 * Math.tan(vFov / 2) * camera.position.z;
      var visW = visH * camera.aspect;
      scaleFactor = visW / w;

      applyPositions(p);

      if (!ready) {
        ready = true;
        header.classList.add('is-3d');
      }
    }

    function applyPositions(progress) {
      if (!geometry) return;
      var arr = geometry.attributes.position.array;
      var k = progress * progress;
      for (var i = 0; i < count; i++) {
        var s = Math.pow(progress, 1.55) * spreads[i];
        arr[i * 3] = base[i * 3] * scaleFactor + dirs[i * 3] * s;
        arr[i * 3 + 1] = base[i * 3 + 1] * scaleFactor + dirs[i * 3 + 1] * s - k * 62;
        arr[i * 3 + 2] = base[i * 3 + 2] * scaleFactor + dirs[i * 3 + 2] * s;
      }
      geometry.attributes.position.needsUpdate = true;
      if (material) material.opacity = Math.max(0, 1 - progress * 1.12);
    }

    function onScroll() {
      var y = window.scrollY || window.pageYOffset || 0;
      var h = header.offsetHeight || 1;
      targetP = Math.min(1, Math.max(0, y / (h * 0.82)));
    }

    function loop() {
      raf = window.requestAnimationFrame(loop);
      if (!visible) {
        if (raf) window.cancelAnimationFrame(raf);
        raf = 0;
        return;
      }

      p += (targetP - p) * 0.12;
      camX += (mouseX * 6 - camX) * 0.06;
      camY += (-mouseY * 4 - camY) * 0.06;

      applyPositions(p);

      /* 整块文字随鼠标轻微倾斜，透视本身产生立体感 */
      if (points) {
        points.rotation.y += (mouseX * 0.16 - points.rotation.y) * 0.06;
        points.rotation.x += (-mouseY * 0.08 - points.rotation.x) * 0.06;
      }

      camera.position.x = camX;
      camera.position.y = camY;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    }
  }

  /* ---------------- 工具 ---------------- */

  function pseudo(seed) {
    var v = Math.sin(seed * 12.9898) * 43758.5453;
    return v - Math.floor(v);
  }

  function debounce(fn, wait) {
    var t = 0;
    return function () {
      clearTimeout(t);
      t = setTimeout(fn, wait);
    };
  }

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

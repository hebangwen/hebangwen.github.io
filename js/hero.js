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

  /* 圆点 + 软边 + 大气雾化：比 PointsMaterial 的方块点更接近油墨/光点 */
  var VERT = [
    'attribute float aSize;',
    'attribute vec3 aColor;',
    'attribute float aFog;',
    'uniform float uFocal;',
    'uniform float uPixelRatio;',
    'varying vec3 vColor;',
    'varying float vFog;',
    'void main() {',
    '  vColor = aColor;',
    '  vFog = aFog;',
    '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
    '  gl_PointSize = aSize * uFocal * uPixelRatio / max(0.001, -mv.z);',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');

  var FRAG = [
    'uniform float uOpacity;',
    'uniform vec3 uFog;',
    'varying vec3 vColor;',
    'varying float vFog;',
    'void main() {',
    '  vec2 d = gl_PointCoord - vec2(0.5);',
    '  float r = length(d);',
    '  if (r > 0.5) discard;',
    '  float a = smoothstep(0.5, 0.08, r);',
    '  vec3 c = mix(vColor, uFog, vFog);',
    '  gl_FragColor = vec4(c, a * uOpacity);',
    '  #include <colorspace_fragment>',
    '}'
  ].join('\n');

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
    var cellsOf = null;
    var cellCenter = null;
    var cellDelay = null;
    var cellSpin = null;
    var cellSpread = null;
    var cellCos = null;
    var cellSin = null;
    var cellLp = null;
    var count = 0;
    var material = null;
    var geometry = null;

    var uniforms = {
      uOpacity: { value: 1 },
      uFocal: { value: 1000 },
      uPixelRatio: { value: 1 },
      uFog: { value: new THREE.Color(0x39474f) }
    };

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
      var step = W < 700 ? 1 : Math.max(2, Math.round(W / 620));

      var pos = [];
      var col = [];
      var sizes = [];
      var fogs = [];
      var dz = [];
      var cellIds = [];

      var CELL_X = 16;
      var CELL_Y = 10;
      var cellW = W / CELL_X;
      var cellH = H / CELL_Y;

      var edgeColor = new THREE.Color(0xf2f8f9);
      var bodyColor = new THREE.Color(0xd2dadb);

      for (var y = 0; y < H; y += step) {
        for (var x = 0; x < W; x += step) {
          if (data[(y * W + x) * 4 + 3] < 140) continue;

          /* 四邻采样判断字形边缘：边缘粒子提亮并加大，字形靠这层光浮起来 */
          var isEdge =
            data[(y * W + Math.max(0, x - step * 2)) * 4 + 3] < 140 ||
            data[(y * W + Math.min(W - 1, x + step * 2)) * 4 + 3] < 140 ||
            data[(Math.max(0, y - step * 2) * W + x) * 4 + 3] < 140 ||
            data[(Math.min(H - 1, y + step * 2) * W + x) * 4 + 3] < 140;

          var z = (Math.random() - 0.5) * 34;
          pos.push(x - W / 2, -(y - H / 2), z);

          var c;
          var sz;
          if (isEdge) {
            c = edgeColor;
            sz = 0.66;
          } else {
            c = bodyColor;
            sz = 0.46;
          }
          col.push(c.r, c.g, c.b);
          sizes.push(sz);

          /* 越往屏幕深处越向雾色收敛；边缘留一点雾，让它像被光照到的轮廓 */
          var fogDepth = (z + 17) / 34;
          fogs.push(fogDepth * (isEdge ? 0.14 : 0.52));

          var gx = Math.floor(x / cellW);
          var gy = Math.floor(y / cellH);
          cellIds.push(gy * CELL_X + gx);

          var seed = gx * 131 + gy * 37 + 1;
          var ang = pseudo(seed) * Math.PI * 2;
          var ring = 0.55 + pseudo(seed + 11) * 0.6;
          dz.push(
            Math.cos(ang) * ring,
            Math.sin(ang) * ring * 0.7 - (0.3 + pseudo(seed + 23) * 0.6),
            0.35 + pseudo(seed + 41) * 1.2
          );
        }
      }

      count = pos.length / 3;
      if (!count) return;

      var cells = CELL_X * CELL_Y;
      cellCenter = new Float32Array(cells * 2);
      cellDelay = new Float32Array(cells);
      cellSpin = new Float32Array(cells);
      cellCos = new Float32Array(cells);
      cellSin = new Float32Array(cells);
      cellLp = new Float32Array(cells);
      cellSpread = new Float32Array(cells);

      for (var k = 0; k < cells; k++) {
        var cx = k % CELL_X;
        var cy = Math.floor(k / CELL_X);
        cellCenter[k * 2] = (cx + 0.5) * cellW - W / 2;
        cellCenter[k * 2 + 1] = -((cy + 0.5) * cellH - H / 2);
        cellDelay[k] = pseudo(k * 7 + 3) * 0.35;
        cellSpin[k] = (pseudo(k * 13 + 5) - 0.5) * 2.4;
        cellSpread[k] = 26 + pseudo(k * 3 + 1) * 92;
      }

      base = new Float32Array(pos);
      dirs = new Float32Array(dz);
      cellsOf = new Uint16Array(cellIds);

      geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
      geometry.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(col), 3));
      geometry.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(sizes), 1));
      geometry.setAttribute('aFog', new THREE.BufferAttribute(new Float32Array(fogs), 1));

      material = new THREE.ShaderMaterial({
        uniforms: uniforms,
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
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
      uniforms.uFocal.value = (0.5 * h) / Math.tan(vFov / 2);
      uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio || 1, 2);

      applyPositions(p);

      if (!ready) {
        ready = true;
        header.classList.add('is-3d');
      }
    }

    function applyPositions(progress) {
      if (!geometry) return;

      var arr = geometry.attributes.position.array;
      var sf = scaleFactor;
      var cells = cellLp.length;
      var c;

      /* 每簇算一次旋转，粒子共享，避免上万个三角函数 */
      for (c = 0; c < cells; c++) {
        var d = cellDelay[c];
        var lp = (progress - d) / (1 - d);
        lp = lp < 0 ? 0 : lp > 1 ? 1 : lp;
        cellLp[c] = lp;
        var ang = lp * cellSpin[c];
        cellCos[c] = Math.cos(ang);
        cellSin[c] = Math.sin(ang);
      }

      for (var i = 0; i < count; i++) {
        var id = cellsOf[i];
        var lpv = cellLp[id];
        var cos = cellCos[id];
        var sin = cellSin[id];

        var px = base[i * 3];
        var py = base[i * 3 + 1];

        /* 碎片绕各自格心旋转，是"碎"而不是"整体平移" */
        var dx = px - cellCenter[id * 2];
        var dy = py - cellCenter[id * 2 + 1];
        var rx = dx * cos - dy * sin;
        var ry = dx * sin + dy * cos;

        var s = Math.pow(lpv, 1.6) * cellSpread[id];
        var k = lpv * lpv;

        arr[i * 3] = (cellCenter[id * 2] + rx) * sf + dirs[i * 3] * s;
        arr[i * 3 + 1] = (cellCenter[id * 2 + 1] + ry) * sf + dirs[i * 3 + 1] * s - k * 70;
        arr[i * 3 + 2] = base[i * 3 + 2] * sf + dirs[i * 3 + 2] * s;
      }

      geometry.attributes.position.needsUpdate = true;
      uniforms.uOpacity.value = Math.max(0, 1 - progress * 1.12);
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

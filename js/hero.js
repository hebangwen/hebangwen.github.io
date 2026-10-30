/* =========================================================
   Homepage hero —— 首页开场
   入口：_config.butterfly.yml -> inject.bottom
   仅在首页 #page-header.full_page 生效，其余页面直接退出
   ========================================================= */
(function () {
  'use strict';

  /* 可改的文案 */
  var COPY = {
    lede: '把读过、写过、调过的东西记下来。',
    entryLabel: '最新一篇'
  };

  /* 结构图：一条主干向右上延伸，分叉出几条支路 */
  var GRAPH_SVG =
    '<svg viewBox="0 0 560 680" fill="none" aria-hidden="true">' +
    '<path class="g-line is-faint" pathLength="1" style="animation-delay:.02s" d="M250 662C196 612 160 574 104 552"></path>' +
    '<path class="g-line" pathLength="1" style="animation-delay:.15s" d="M250 662C250 600 300 566 348 520C400 470 430 420 452 352C470 296 492 248 516 206"></path>' +
    '<path class="g-trace" pathLength="1" d="M250 662C250 600 300 566 348 520C400 470 430 420 452 352C470 296 492 248 516 206"></path>' +
    '<path class="g-line" pathLength="1" style="animation-delay:.55s" d="M348 520C300 500 254 486 196 462C160 447 132 430 108 404"></path>' +
    '<path class="g-line" pathLength="1" style="animation-delay:.75s" d="M452 352C486 372 502 408 508 452C512 486 508 512 498 536"></path>' +
    '<path class="g-line" pathLength="1" style="animation-delay:.9s" d="M196 462C168 486 132 502 96 508"></path>' +
    '<circle class="g-ring" cx="516" cy="206" r="13" style="animation-delay:1.42s"></circle>' +
    '<circle class="g-ping" cx="516" cy="206" r="13"></circle>' +
    '<circle class="g-node" cx="250" cy="662" r="4.2" style="animation-delay:.3s"></circle>' +
    '<circle class="g-node" cx="348" cy="520" r="4" style="animation-delay:.7s"></circle>' +
    '<circle class="g-node" cx="452" cy="352" r="4" style="animation-delay:.92s"></circle>' +
    '<circle class="g-node is-accent" cx="516" cy="206" r="4.6" style="animation-delay:1.2s"></circle>' +
    '<circle class="g-node" cx="196" cy="462" r="3.4" style="animation-delay:1.05s"></circle>' +
    '<circle class="g-node" cx="108" cy="404" r="3.2" style="animation-delay:1.15s"></circle>' +
    '<circle class="g-node" cx="498" cy="536" r="3.2" style="animation-delay:1.22s"></circle>' +
    '<circle class="g-node" cx="96" cy="508" r="3.2" style="animation-delay:1.28s"></circle>' +
    '</svg>';

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

  /* 3. 右栏结构图 */
  var graph = document.createElement('div');
  graph.className = 'hero-graph';
  graph.setAttribute('aria-hidden', 'true');
  graph.innerHTML = GRAPH_SVG;
  info.appendChild(graph);

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
  window.addEventListener('scroll', function () {
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
  }, { passive: true });

  /* 6. 结构图随鼠标轻微位移 */
  if (!reduce && window.matchMedia('(hover: hover)').matches) {
    graph.style.willChange = 'transform';
    header.addEventListener('mousemove', function (e) {
      var r = header.getBoundingClientRect();
      var dx = (e.clientX - r.left) / r.width - 0.5;
      var dy = (e.clientY - r.top) / r.height - 0.5;
      graph.style.transform =
        'translate3d(' + (dx * -16).toFixed(1) + 'px,' + (dy * -12).toFixed(1) + 'px,0)';
    }, { passive: true });
    header.addEventListener('mouseleave', function () {
      graph.style.transform = 'translate3d(0,0,0)';
    });
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
    var date = time ? (time.getAttribute('datetime') || time.textContent || '') : '';

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

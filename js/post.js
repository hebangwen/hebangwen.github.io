/* =========================================================
   文章页头：分类上提、窄屏精简、顶部阅读进度
   入口：_config.butterfly.yml -> inject.bottom
   只在带 banner 的文章页生效
   ========================================================= */
(function () {
  'use strict';

  var header = document.getElementById('page-header');
  if (!header || !header.classList.contains('post-bg')) return;

  liftCategory();
  trimMetaOnNarrow();
  initProgress();

  /* 分类从 meta 里提到标题上方，形成「分类 / 标题 / 线 / 元信息」的层级 */
  function liftCategory() {
    var meta = document.getElementById('post-meta');
    var title = document.querySelector('#post-info .post-title');
    if (!meta || !title) return;

    var wrap = meta.querySelector('.post-meta-categories');
    if (!wrap) return;

    var names = [].map
      .call(wrap.querySelectorAll('a'), function (a) {
        return (a.textContent || '').trim();
      })
      .filter(Boolean);

    if (names.length) {
      var eyebrow = document.createElement('div');
      eyebrow.className = 'post-eyebrow';
      eyebrow.textContent = names.join(' / ');
      title.parentNode.insertBefore(eyebrow, title);
    }

    var prev = wrap.previousElementSibling;
    if (prev && prev.classList.contains('post-meta-separator')) prev.remove();
    wrap.remove();
  }

  /* 窄屏里「更新于」会把 meta 挤成两行并裁切，直接收掉 */
  function trimMetaOnNarrow() {
    if (!window.matchMedia('(max-width: 768px)').matches) return;

    var updated = document.querySelector('#post-meta .post-meta-date-updated');
    if (!updated) return;

    var start = updated;
    for (var i = 0; i < 3 && start.previousElementSibling; i++) {
      start = start.previousElementSibling;
    }

    var node = start;
    while (node) {
      node.style.display = 'none';
      if (node === updated) break;
      node = node.nextElementSibling;
    }
  }

  function initProgress() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    var bar = document.createElement('div');
    bar.className = 'read-progress';
    bar.setAttribute('aria-hidden', 'true');
    document.body.appendChild(bar);

    var raf = 0;

    function update() {
      raf = 0;
      var doc = document.documentElement;
      var total = doc.scrollHeight - window.innerHeight;
      var y = window.scrollY || window.pageYOffset || 0;
      var p = total > 0 ? Math.min(1, Math.max(0, y / total)) : 0;
      bar.style.transform = 'scaleX(' + p.toFixed(4) + ')';
    }

    window.addEventListener(
      'scroll',
      function () {
        if (raf) return;
        raf = window.requestAnimationFrame(update);
      },
      { passive: true }
    );

    window.addEventListener('resize', update, { passive: true });

    update();
  }
})();

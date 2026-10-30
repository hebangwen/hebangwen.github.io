/* =========================================================
   文章页：顶部阅读进度 + 窄屏 header 精简
   入口：_config.butterfly.yml -> inject.bottom
   只在带 banner 的文章页生效
   ========================================================= */
(function () {
  'use strict';

  var header = document.getElementById('page-header');
  if (!header || !header.classList.contains('post-bg')) return;

  trimMetaOnNarrow();
  initProgress();

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

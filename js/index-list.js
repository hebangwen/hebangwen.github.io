/* =========================================================
   首页索引 —— 按月分组
   入口：_config.butterfly.yml -> inject.bottom
   只在首页 #recent-posts 内生效；没有 JS 时页面只是一列
   未分组的索引行，功能不受影响。
   ========================================================= */
(function () {
  'use strict';

  var list = document.querySelector('#recent-posts .recent-post-items');
  if (!list) return;

  var items = Array.prototype.slice.call(
    list.querySelectorAll(':scope > .recent-post-item')
  );
  if (!items.length) return;

  /* 幂等：pjax 或重复注入时不重复插分组头 */
  if (list.querySelector('.index-month')) return;

  var groups = [];
  var current = null;

  items.forEach(function (item) {
    var time = item.querySelector('time[datetime]');
    var raw = time ? time.getAttribute('datetime') : '';
    var key = raw ? raw.slice(0, 7) : '';

    if (!key) {
      /* 没有日期的条目并入上一组，避免出现空头 */
      if (current) current.items.push(item);
      return;
    }

    if (!current || current.key !== key) {
      current = { key: key, items: [] };
      groups.push(current);
    }
    current.items.push(item);
  });

  if (!groups.length) return;

  groups.forEach(function (group) {
    var head = document.createElement('div');
    head.className = 'index-month';

    var label = document.createElement('span');
    label.className = 'index-month-label';
    label.textContent = group.key.replace('-', ' / ');

    var count = document.createElement('span');
    count.className = 'index-month-count';
    count.textContent = group.items.length + ' 篇';

    head.appendChild(label);
    head.appendChild(count);
    list.insertBefore(head, group.items[0]);
  });

  /* 最后一行的收尾线由 CSS 的 border-bottom 提供，无需额外处理 */
})();

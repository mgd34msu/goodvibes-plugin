(function () {
  'use strict';

  const API_BASE = '/api/items';

  const form = document.getElementById('add-form');
  const input = document.getElementById('item-input');
  const list = document.getElementById('item-list');
  const emptyMsg = document.getElementById('empty-msg');
  const errorMsg = document.getElementById('error-msg');
  const submitBtn = form.querySelector('button[type="submit"]');

  // ── Helpers ────────────────────────────────────────────────────────────────

  function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.hidden = false;
  }

  function clearError() {
    errorMsg.textContent = '';
    errorMsg.hidden = true;
  }

  function syncEmpty() {
    emptyMsg.hidden = list.children.length > 0;
  }

  // ── DOM builder ────────────────────────────────────────────────────────────

  function createItemEl(item) {
    const li = document.createElement('li');
    li.className = 'item';
    li.dataset.id = item.id;

    const span = document.createElement('span');
    span.className = 'item-name';
    span.textContent = item.name;

    const btn = document.createElement('button');
    btn.className = 'delete-btn';
    btn.type = 'button';
    btn.textContent = 'Delete';
    btn.setAttribute('aria-label', 'Delete ' + item.name);
    btn.addEventListener('click', () => deleteItem(item.id, btn));

    li.appendChild(span);
    li.appendChild(btn);
    return li;
  }

  // ── API calls ───────────────────────────────────────────────────────────────

  async function loadItems() {
    clearError();
    try {
      const res = await fetch(API_BASE);
      if (!res.ok) throw new Error('Failed to load items (' + res.status + ')');
      const items = await res.json();

      list.innerHTML = '';
      items.forEach(function (item) {
        list.appendChild(createItemEl(item));
      });
      syncEmpty();
    } catch (err) {
      showError(err.message);
    }
  }

  async function addItem(name) {
    clearError();
    submitBtn.disabled = true;
    try {
      const res = await fetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data && data.error) || 'Failed to add item (' + res.status + ')');
      }
      const item = await res.json();
      list.appendChild(createItemEl(item));
      syncEmpty();
      input.value = '';
      input.focus();
    } catch (err) {
      showError(err.message);
    } finally {
      submitBtn.disabled = false;
    }
  }

  async function deleteItem(id, btn) {
    clearError();
    btn.disabled = true;
    try {
      const res = await fetch(API_BASE + '/' + id, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete item (' + res.status + ')');
      const li = list.querySelector('[data-id="' + id + '"]');
      if (li) li.remove();
      syncEmpty();
    } catch (err) {
      showError(err.message);
      btn.disabled = false;
    }
  }

  // ── Event wiring ────────────────────────────────────────────────────────────

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    const name = input.value.trim();
    if (name) addItem(name);
  });

  // ── Init ────────────────────────────────────────────────────────────────────

  loadItems();

})();

const API_BASE = 'http://localhost:3000';

const form = document.getElementById('add-form');
const input = document.getElementById('item-input');
const list = document.getElementById('items-list');
const errorMsg = document.getElementById('error-msg');

// --- Helpers ---

function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.hidden = false;
}

function clearError() {
  errorMsg.textContent = '';
  errorMsg.hidden = true;
}

function renderItems(items) {
  list.innerHTML = '';

  if (!items.length) {
    const empty = document.createElement('li');
    empty.className = 'empty-msg';
    empty.textContent = 'No items yet.';
    list.appendChild(empty);
    return;
  }

  items.forEach((item) => {
    const li = document.createElement('li');
    li.dataset.id = item.id;

    const name = document.createElement('span');
    name.className = 'item-name';
    name.textContent = item.name;

    const btn = document.createElement('button');
    btn.className = 'delete-btn';
    btn.setAttribute('aria-label', `Delete ${item.name}`);
    btn.textContent = '\u00d7';
    btn.addEventListener('click', () => deleteItem(item.id));

    li.appendChild(name);
    li.appendChild(btn);
    list.appendChild(li);
  });
}

// --- API calls ---

async function loadItems() {
  clearError();
  try {
    const res = await fetch(`${API_BASE}/api/items`);
    if (!res.ok) throw new Error(`Server error: ${res.status}`);
    const data = await res.json();
    renderItems(data);
  } catch (err) {
    showError(`Failed to load items: ${err.message}`);
  }
}

async function addItem(name) {
  clearError();
  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  try {
    const res = await fetch(`${API_BASE}/api/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Server error: ${res.status}`);
    }
    input.value = '';
    await loadItems();
  } catch (err) {
    showError(`Failed to add item: ${err.message}`);
  } finally {
    submitBtn.disabled = false;
  }
}

async function deleteItem(id) {
  clearError();
  // Optimistically remove from DOM while request is in-flight
  const li = list.querySelector(`li[data-id="${id}"]`);
  if (li) li.remove();
  if (!list.children.length) renderItems([]);

  try {
    const res = await fetch(`${API_BASE}/api/items/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(`Server error: ${res.status}`);
    // Sync with server in case of concurrent updates
    await loadItems();
  } catch (err) {
    showError(`Failed to delete item: ${err.message}`);
    await loadItems(); // Restore actual state on failure
  }
}

// --- Init ---

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = input.value.trim();
  if (name) addItem(name);
});

loadItems();

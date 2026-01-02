# HTMX Patterns

## Infinite Scroll

```html
<div id="posts">
  <article>Post 1...</article>
  <article>Post 2...</article>

  <!-- Load more trigger -->
  <div hx-get="/posts?page=2"
       hx-trigger="revealed"
       hx-swap="outerHTML"
       hx-indicator="#loading">
    <span id="loading" class="htmx-indicator">Loading more...</span>
  </div>
</div>

<!-- Server returns more posts + new trigger -->
<!-- Response: -->
<article>Post 3...</article>
<article>Post 4...</article>
<div hx-get="/posts?page=3"
     hx-trigger="revealed"
     hx-swap="outerHTML">
  Loading more...
</div>
```

## Click to Edit

```html
<!-- Display mode -->
<div hx-get="/contact/1/edit" hx-trigger="click" hx-swap="outerHTML">
  <span>John Doe</span>
  <span>john@example.com</span>
</div>

<!-- Edit mode (returned from server) -->
<form hx-put="/contact/1" hx-swap="outerHTML">
  <input name="name" value="John Doe">
  <input name="email" value="john@example.com">
  <button type="submit">Save</button>
  <button hx-get="/contact/1" hx-swap="outerHTML">Cancel</button>
</form>
```

## Active Search

```html
<input type="search"
       name="q"
       hx-get="/search"
       hx-trigger="input changed delay:500ms, search"
       hx-target="#results"
       hx-indicator=".spinner"
       placeholder="Search...">
<span class="spinner htmx-indicator">Searching...</span>
<div id="results"></div>
```

## Bulk Delete

```html
<form hx-delete="/items" hx-target="#items" hx-swap="innerHTML">
  <table>
    <thead>
      <tr>
        <th><input type="checkbox" onclick="toggleAll(this)"></th>
        <th>Name</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody id="items">
      <tr>
        <td><input type="checkbox" name="ids" value="1"></td>
        <td>Item 1</td>
        <td>
          <button hx-delete="/items/1"
                  hx-target="closest tr"
                  hx-swap="outerHTML"
                  hx-confirm="Delete this item?">
            Delete
          </button>
        </td>
      </tr>
      <!-- More rows -->
    </tbody>
  </table>
  <button type="submit" hx-confirm="Delete selected items?">
    Delete Selected
  </button>
</form>

<script>
function toggleAll(el) {
  document.querySelectorAll('input[name="ids"]')
    .forEach(cb => cb.checked = el.checked);
}
</script>
```

## Tabs

```html
<div class="tabs" hx-target="#tab-content" hx-swap="innerHTML">
  <button hx-get="/tabs/overview" class="active">Overview</button>
  <button hx-get="/tabs/details">Details</button>
  <button hx-get="/tabs/history">History</button>
</div>
<div id="tab-content">
  <!-- Tab content loads here -->
</div>

<style>
  .tabs button.htmx-request {
    opacity: 0.5;
  }
</style>

<script>
  // Update active class
  document.body.addEventListener('htmx:afterRequest', function(e) {
    if (e.target.closest('.tabs')) {
      document.querySelectorAll('.tabs button').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
    }
  });
</script>
```

## Modal Dialog

```html
<!-- Trigger button -->
<button hx-get="/modal/user-form"
        hx-target="#modal-container"
        hx-swap="innerHTML">
  Open Modal
</button>

<div id="modal-container"></div>

<!-- Modal template (returned from server) -->
<div class="modal-backdrop" onclick="closeModal(event)">
  <div class="modal" onclick="event.stopPropagation()">
    <header>
      <h2>User Form</h2>
      <button onclick="closeModal()">X</button>
    </header>
    <form hx-post="/users" hx-target="#modal-container" hx-swap="innerHTML">
      <input name="name" required>
      <button type="submit">Save</button>
    </form>
  </div>
</div>

<script>
function closeModal(event) {
  if (!event || event.target.classList.contains('modal-backdrop')) {
    document.getElementById('modal-container').innerHTML = '';
  }
}
</script>
```

## Toast Notifications

```html
<!-- Toast container -->
<div id="toast-container" class="fixed top-4 right-4"></div>

<!-- Any action can trigger a toast via OOB -->
<button hx-post="/action" hx-target="#result">
  Do Action
</button>

<!-- Server response with OOB toast -->
<div id="result">Success content...</div>

<div id="toast" hx-swap-oob="afterbegin:#toast-container">
  <div class="toast" role="alert">
    Action completed successfully!
    <button onclick="this.parentElement.remove()">X</button>
  </div>
</div>

<style>
.toast {
  animation: slideIn 0.3s, fadeOut 0.3s 2.7s forwards;
}
@keyframes slideIn {
  from { transform: translateX(100%); }
}
@keyframes fadeOut {
  to { opacity: 0; }
}
</style>
```

## Sortable List

```html
<ul id="sortable"
    hx-post="/reorder"
    hx-trigger="end"
    hx-swap="none">
  <li data-id="1">Item 1</li>
  <li data-id="2">Item 2</li>
  <li data-id="3">Item 3</li>
</ul>

<script src="https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js"></script>
<script>
new Sortable(document.getElementById('sortable'), {
  animation: 150,
  onEnd: function(evt) {
    const order = [...evt.to.children].map(li => li.dataset.id);
    htmx.ajax('POST', '/reorder', {
      target: '#sortable',
      values: { order: order.join(',') }
    });
  }
});
</script>
```

## Progressive Enhancement

```html
<!-- Works without JavaScript -->
<form action="/search" method="get"
      hx-get="/search"
      hx-target="#results"
      hx-swap="innerHTML"
      hx-push-url="true">
  <input name="q" type="search">
  <button type="submit">Search</button>
</form>

<div id="results">
  <!-- Enhanced: AJAX loads here -->
  <!-- Fallback: Full page reload shows results -->
</div>
```

## Cascade Selects

```html
<select name="country"
        hx-get="/states"
        hx-target="#state-select"
        hx-swap="innerHTML">
  <option value="">Select Country</option>
  <option value="us">United States</option>
  <option value="ca">Canada</option>
</select>

<select name="state" id="state-select">
  <option value="">Select State/Province</option>
</select>

<!-- Server returns options based on country -->
<option value="ca">California</option>
<option value="tx">Texas</option>
<option value="ny">New York</option>
```

## Inline Validation

```html
<form hx-post="/register" hx-target="#result">
  <label>
    Email
    <input name="email" type="email"
           hx-get="/validate/email"
           hx-trigger="blur changed"
           hx-target="next .error"
           hx-swap="innerHTML">
    <span class="error"></span>
  </label>

  <label>
    Username
    <input name="username"
           hx-get="/validate/username"
           hx-trigger="blur changed"
           hx-target="next .error"
           hx-swap="innerHTML"
           hx-indicator="next .checking">
    <span class="checking htmx-indicator">Checking...</span>
    <span class="error"></span>
  </label>

  <button type="submit">Register</button>
</form>
```

## Optimistic UI

```html
<button hx-post="/like"
        hx-vals='{"id": 123}'
        hx-swap="outerHTML"
        onclick="this.classList.add('liked'); this.textContent = 'Liked!'">
  Like
</button>

<!-- Or with swap timing -->
<button hx-post="/like"
        hx-vals='{"id": 123}'
        hx-swap="outerHTML swap:0s"
        hx-on::before-request="this.classList.add('liked')">
  Like
</button>
```

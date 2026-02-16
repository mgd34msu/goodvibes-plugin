# Accessibility Patterns Reference

Common accessibility patterns and anti-patterns organized by WCAG 2.1 criteria.

## 1. Perceivable

### 1.1 Text Alternatives

#### Pattern: Informative Images

**Good:**
```tsx
<img src="/chart.png" alt="Sales increased 23% in Q4 2025" />
```

**Bad:**
```tsx
<img src="/chart.png" alt="chart" />
<img src="/chart.png" /> {/* Missing alt */}
```

#### Pattern: Decorative Images

**Good:**
```tsx
<img src="/pattern.svg" alt="" aria-hidden="true" />
```

**Bad:**
```tsx
<img src="/pattern.svg" alt="decorative pattern" />
```

#### Pattern: Functional Images

**Good:**
```tsx
<button aria-label="Close dialog">
  <CloseIcon aria-hidden="true" />
</button>
```

**Bad:**
```tsx
<button>
  <CloseIcon alt="X" />
</button>
```

### 1.3 Adaptable

#### Pattern: Heading Hierarchy

**Good:**
```tsx
<h1>Page Title</h1>
<h2>Section 1</h2>
<h3>Subsection 1.1</h3>
<h3>Subsection 1.2</h3>
<h2>Section 2</h2>
```

**Bad:**
```tsx
<h1>Page Title</h1>
<h3>Section 1</h3> {/* Skipped h2 */}
<h1>Section 2</h1> {/* Multiple h1s */}
```

#### Pattern: Landmark Regions

**Good:**
```tsx
<header>
  <nav aria-label="Main navigation">
    {/* Navigation links */}
  </nav>
</header>
<main>
  {/* Primary content */}
</main>
<footer>
  {/* Site footer */}
</footer>
```

**Bad:**
```tsx
<div className="header">
  <div className="nav">
    {/* Navigation links */}
  </div>
</div>
<div className="content">
  {/* Primary content */}
</div>
```

### 1.4 Distinguishable

#### Pattern: Color Contrast

**Good (4.5:1 minimum for normal text):**
```css
.text-primary {
  color: #1e40af; /* Blue 800: 8.59:1 on white */
}

.button-primary {
  background: #2563eb; /* Blue 600 */
  color: #ffffff; /* White: 4.56:1 */
}
```

**Bad:**
```css
.text-primary {
  color: #93c5fd; /* Blue 300: 2.05:1 on white - FAIL */
}
```

#### Pattern: Non-Color Indicators

**Good:**
```tsx
<span className="flex items-center gap-2">
  <CheckCircleIcon className="text-green-600" />
  <span>Success</span>
</span>
```

**Bad:**
```tsx
<span className="text-green-600">Success</span> {/* Color only */}
```

#### Pattern: Reduced Motion

**Good:**
```css
.animated {
  transition: transform 0.3s ease;
}

@media (prefers-reduced-motion: reduce) {
  .animated {
    transition: none;
  }
}
```

**Bad:**
```css
.animated {
  animation: spin 2s infinite;
  /* No prefers-reduced-motion handling */
}
```

## 2. Operable

### 2.1 Keyboard Accessible

#### Pattern: Custom Button

**Good:**
```tsx
function CustomButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      {children}
    </div>
  );
}
```

**Bad:**
```tsx
function CustomButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <div onClick={onClick}>
      {children}
    </div>
  );
}
```

**Best (use native element):**
```tsx
function Button({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick}>{children}</button>;
}
```

#### Pattern: Skip Links

**Good:**
```tsx
function SkipLink(): JSX.Element {
  return (
    <a href="#main-content" className="sr-only focus:not-sr-only">
      Skip to main content
    </a>
  );
}
```

#### Pattern: Focus Trap in Modal

**Good:**
```tsx
function Modal({ isOpen, onClose, children }: { isOpen: boolean; onClose: () => void; children: React.ReactNode }) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const focusableElements = modalRef.current?.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    firstElement?.focus();

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      } else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', handleTab);
    return () => document.removeEventListener('keydown', handleTab);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div ref={modalRef} role="dialog" aria-modal="true">
      {children}
    </div>
  );
}
```

### 2.4 Navigable

#### Pattern: Page Title

**Good:**
```tsx
export function metadata(): Metadata {
  return {
    title: 'Dashboard - MyApp',
  };
}
```

**Bad:**
```tsx
export function metadata(): Metadata {
  return {
    title: 'MyApp', // Same title on every page
  };
}
```

#### Pattern: Focus Indicator

**Good:**
```css
button:focus-visible {
  outline: 2px solid #2563eb;
  outline-offset: 2px;
}
```

**Bad:**
```css
button:focus {
  outline: none; /* Never do this without alternative */
}
```

### 2.5 Input Modalities

#### Pattern: Click Target Size

**Good (minimum 44x44px):**
```tsx
<button className="min-h-[44px] min-w-[44px] px-4 py-2">
  Click me
</button>
```

**Bad:**
```tsx
<button className="p-1 text-xs">
  Click me
</button>
```

## 3. Understandable

### 3.1 Readable

#### Pattern: Language Attribute

**Good:**
```tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

### 3.2 Predictable

#### Pattern: Consistent Navigation

**Good:**
```tsx
function Navigation(): JSX.Element {
  return (
    <nav aria-label="Main navigation">
      <ul>
        <li><a href="/">Home</a></li>
        <li><a href="/about">About</a></li>
        <li><a href="/contact">Contact</a></li>
      </ul>
    </nav>
  );
}
// Same navigation order on every page
```

### 3.3 Input Assistance

#### Pattern: Form Labels

**Good:**
```tsx
function EmailField(): JSX.Element {
  const id = useId();
  const errorId = useId();
  const [error, setError] = useState<string>('');

  return (
    <div>
      <label htmlFor={id}>Email address</label>
      <input
        id={id}
        type="email"
        required
        aria-required="true"
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={error ? errorId : undefined}
      />
      {error && (
        <p id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
```

**Bad:**
```tsx
function EmailField(): JSX.Element {
  return (
    <input type="email" placeholder="Email" />
  );
}
```

#### Pattern: Error Identification

**Good:**
```tsx
function FormErrors({ errors }: { errors: Array<{ field: string; message: string }> }) {
  if (errors.length === 0) return null;

  return (
    <div role="alert" aria-labelledby="error-summary">
      <h2 id="error-summary">There are {errors.length} errors</h2>
      <ul>
        {errors.map((error) => (
          <li key={error.field}>
            <a href={`#${error.field}`}>{error.message}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

#### Pattern: Autocomplete

**Good:**
```tsx
<input
  type="email"
  name="email"
  autoComplete="email"
/>

<input
  type="tel"
  name="phone"
  autoComplete="tel"
/>

<input
  type="text"
  name="address"
  autoComplete="street-address"
/>
```

## 4. Robust

### 4.1 Compatible

#### Pattern: Valid HTML

**Good:**
```tsx
<button type="button" aria-label="Close">
  <XIcon />
</button>
```

**Bad:**
```tsx
<button type="submit" role="link"> {/* Invalid role on button */}
  Submit
</button>
```

#### Pattern: Name, Role, Value

**Good:**
```tsx
function CustomCheckbox({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <label>
      <span
        role="checkbox"
        aria-checked={checked}
        tabIndex={0}
        onClick={() => onChange(!checked)}
        onKeyDown={(e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            onChange(!checked);
          }
        }}
      >
        {checked ? <CheckIcon /> : <UncheckedIcon />}
      </span>
      <span>{label}</span>
    </label>
  );
}
```

**Best (use native element):**
```tsx
function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <label>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
```

## ARIA Patterns

### Tabs

**Good:**
```tsx
function Tabs({ tabs, activeTab, onChange }: { tabs: Array<{ id: string; label: string; content: React.ReactNode }>; activeTab: string; onChange: (id: string) => void }) {
  return (
    <div>
      <div role="tablist" aria-label="Content sections">
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`panel-${tab.id}`}
          aria-labelledby={`tab-${tab.id}`}
          hidden={activeTab !== tab.id}
          tabIndex={0}
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}
```

### Accordion

**Good:**
```tsx
function Accordion({ items }: { items: Array<{ id: string; title: string; content: React.ReactNode }> }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div>
      {items.map((item) => (
        <div key={item.id}>
          <h3>
            <button
              id={`accordion-header-${item.id}`}
              aria-expanded={expanded === item.id}
              aria-controls={`accordion-panel-${item.id}`}
              onClick={() => setExpanded(expanded === item.id ? null : item.id)}
            >
              {item.title}
            </button>
          </h3>
          <div
            id={`accordion-panel-${item.id}`}
            role="region"
            aria-labelledby={`accordion-header-${item.id}`}
            hidden={expanded !== item.id}
          >
            {item.content}
          </div>
        </div>
      ))}
    </div>
  );
}
```

### Combobox (Autocomplete)

**Good:**
```tsx
function Combobox({ options, value, onChange }: { options: Array<{ id: string; label: string }>; value: string; onChange: (value: string) => void }) {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const inputId = useId();
  const listboxId = useId();

  return (
    <div>
      <label htmlFor={inputId}>Search</label>
      <input
        id={inputId}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-activedescendant={
          activeIndex >= 0 ? `option-${activeIndex}` : undefined
        }
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setIsOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex(Math.min(activeIndex + 1, options.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex(Math.max(activeIndex - 1, 0));
          }
        }}
      />
      {isOpen && (
        <ul id={listboxId} role="listbox">
          {options.map((option, index) => (
            <li
              key={option.id}
              id={`option-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              onClick={() => {
                onChange(option.label);
                setIsOpen(false);
              }}
            >
              {option.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

## Common Mistakes

### Mistake: Div Soup

**Bad:**
```tsx
<div className="header">
  <div className="nav">
    <div className="nav-item">Home</div>
  </div>
</div>
```

**Good:**
```tsx
<header>
  <nav>
    <a href="/">Home</a>
  </nav>
</header>
```

### Mistake: onClick on Non-Interactive

**Bad:**
```tsx
<div onClick={handleClick}>Click me</div>
```

**Good:**
```tsx
<button onClick={handleClick}>Click me</button>
```

### Mistake: Auto-Playing Media

**Bad:**
```tsx
<video src="/video.mp4" autoPlay />
```

**Good:**
```tsx
<video src="/video.mp4" controls />
```

### Mistake: Redundant ARIA

**Bad:**
```tsx
<button role="button" aria-label="Submit">
  Submit
</button>
```

**Good:**
```tsx
<button>Submit</button>
```

### Mistake: Missing Form Validation

**Bad:**
```tsx
<form>
  <input type="email" />
  <button type="submit">Submit</button>
</form>
```

**Good:**
```tsx
<form noValidate onSubmit={handleSubmit}>
  <label htmlFor="email">Email</label>
  <input
    id="email"
    type="email"
    required
    aria-required="true"
    aria-invalid={error ? 'true' : 'false'}
  />
  {error && <p role="alert">{error}</p>}
  <button type="submit">Submit</button>
</form>
```

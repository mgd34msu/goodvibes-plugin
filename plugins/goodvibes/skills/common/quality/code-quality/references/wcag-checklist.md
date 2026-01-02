# WCAG 2.1 Level AA Checklist

Comprehensive accessibility checklist for web content.

## Principle 1: Perceivable

### 1.1 Text Alternatives

#### 1.1.1 Non-text Content (A)
- [ ] Images have descriptive `alt` text
- [ ] Decorative images have `alt=""`
- [ ] Complex images have extended descriptions
- [ ] Form inputs have accessible labels
- [ ] Audio/video has text alternatives

```html
<!-- Informative image -->
<img src="chart.png" alt="Q4 sales increased 25% compared to Q3">

<!-- Decorative image -->
<img src="border.png" alt="" role="presentation">

<!-- Complex image with extended description -->
<figure>
  <img src="flowchart.png" alt="User registration process flowchart"
       aria-describedby="flowchart-desc">
  <figcaption id="flowchart-desc">
    Detailed description of the flowchart steps...
  </figcaption>
</figure>
```

### 1.2 Time-based Media

#### 1.2.1 Audio-only and Video-only (A)
- [ ] Audio has text transcript
- [ ] Video has audio description or transcript

#### 1.2.2 Captions (A)
- [ ] Pre-recorded video has synchronized captions
- [ ] Captions include speaker identification
- [ ] Captions include relevant sound effects

#### 1.2.3 Audio Description (A)
- [ ] Video has audio description track (if needed)

#### 1.2.4 Captions (Live) (AA)
- [ ] Live video has real-time captions

#### 1.2.5 Audio Description (AA)
- [ ] Pre-recorded video has audio description

### 1.3 Adaptable

#### 1.3.1 Info and Relationships (A)
- [ ] Headings use proper `h1`-`h6` hierarchy
- [ ] Lists use `ul`, `ol`, `dl` elements
- [ ] Tables have proper headers and scope
- [ ] Form fields have associated labels
- [ ] Regions use landmark roles

```html
<!-- Proper heading hierarchy -->
<h1>Main Title</h1>
  <h2>Section</h2>
    <h3>Subsection</h3>

<!-- Table with headers -->
<table>
  <thead>
    <tr>
      <th scope="col">Name</th>
      <th scope="col">Age</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Alice</td>
      <td>30</td>
    </tr>
  </tbody>
</table>
```

#### 1.3.2 Meaningful Sequence (A)
- [ ] Reading order is logical when CSS is disabled
- [ ] Tab order matches visual order

#### 1.3.3 Sensory Characteristics (A)
- [ ] Instructions don't rely solely on shape, size, location, or sound
- [ ] "Click the round button" includes additional identifier

#### 1.3.4 Orientation (AA)
- [ ] Content works in both portrait and landscape
- [ ] No orientation lock unless essential

#### 1.3.5 Identify Input Purpose (AA)
- [ ] Form inputs have `autocomplete` attribute where appropriate

```html
<input type="email" autocomplete="email" name="email">
<input type="tel" autocomplete="tel" name="phone">
<input type="text" autocomplete="given-name" name="firstName">
```

### 1.4 Distinguishable

#### 1.4.1 Use of Color (A)
- [ ] Color is not sole means of conveying information
- [ ] Links are distinguishable by more than color

```html
<!-- BAD: Color only -->
<span style="color: red">Error</span>

<!-- GOOD: Color + icon/text -->
<span style="color: red">
  <span aria-hidden="true">!</span> Error: Invalid email
</span>
```

#### 1.4.2 Audio Control (A)
- [ ] Auto-playing audio can be paused/stopped
- [ ] Audio doesn't play for more than 3 seconds automatically

#### 1.4.3 Contrast (Minimum) (AA)
- [ ] Normal text: 4.5:1 contrast ratio
- [ ] Large text (18pt+ or 14pt+ bold): 3:1 contrast ratio
- [ ] UI components: 3:1 contrast ratio

#### 1.4.4 Resize Text (AA)
- [ ] Text resizes up to 200% without loss of functionality
- [ ] No horizontal scrolling at 320px width

#### 1.4.5 Images of Text (AA)
- [ ] Text is used instead of images of text (except logos)

#### 1.4.10 Reflow (AA)
- [ ] Content reflows at 400% zoom (320px equivalent)
- [ ] No two-dimensional scrolling for text content

#### 1.4.11 Non-text Contrast (AA)
- [ ] UI components have 3:1 contrast ratio
- [ ] Graphical objects have 3:1 contrast ratio

#### 1.4.12 Text Spacing (AA)
- [ ] Content works with increased text spacing:
  - Line height: 1.5x font size
  - Paragraph spacing: 2x font size
  - Letter spacing: 0.12x font size
  - Word spacing: 0.16x font size

#### 1.4.13 Content on Hover or Focus (AA)
- [ ] Hover/focus content is dismissible (Esc key)
- [ ] Hover/focus content is hoverable
- [ ] Hover/focus content persists until dismissed

---

## Principle 2: Operable

### 2.1 Keyboard Accessible

#### 2.1.1 Keyboard (A)
- [ ] All functionality available via keyboard
- [ ] No timing required for keystrokes

#### 2.1.2 No Keyboard Trap (A)
- [ ] Focus can move away from all components
- [ ] If trap exists, user is informed how to exit

#### 2.1.4 Character Key Shortcuts (A)
- [ ] Single-character shortcuts can be turned off or remapped

### 2.2 Enough Time

#### 2.2.1 Timing Adjustable (A)
- [ ] Time limits can be turned off, adjusted, or extended
- [ ] User warned before timeout with option to extend

#### 2.2.2 Pause, Stop, Hide (A)
- [ ] Moving content can be paused
- [ ] Auto-updating content can be paused

### 2.3 Seizures and Physical Reactions

#### 2.3.1 Three Flashes or Below Threshold (A)
- [ ] No content flashes more than 3 times per second

### 2.4 Navigable

#### 2.4.1 Bypass Blocks (A)
- [ ] Skip navigation link present
- [ ] Landmark regions defined

```html
<a href="#main-content" class="skip-link">Skip to main content</a>
<nav aria-label="Main navigation">...</nav>
<main id="main-content">...</main>
```

#### 2.4.2 Page Titled (A)
- [ ] Pages have descriptive, unique titles
- [ ] Title indicates purpose and context

#### 2.4.3 Focus Order (A)
- [ ] Focus order is logical and meaningful
- [ ] Tab order follows visual order

#### 2.4.4 Link Purpose (In Context) (A)
- [ ] Link text describes destination
- [ ] Avoid "click here", "read more" without context

```html
<!-- BAD -->
<a href="/pricing">Click here</a>

<!-- GOOD -->
<a href="/pricing">View pricing plans</a>

<!-- ACCEPTABLE with context -->
<p>Learn about our pricing. <a href="/pricing">Read more<span class="sr-only"> about pricing</span></a></p>
```

#### 2.4.5 Multiple Ways (AA)
- [ ] Multiple ways to locate pages (nav, search, sitemap)

#### 2.4.6 Headings and Labels (AA)
- [ ] Headings and labels are descriptive
- [ ] Headings indicate content they precede

#### 2.4.7 Focus Visible (AA)
- [ ] Keyboard focus indicator is visible
- [ ] Custom focus styles are clearly visible

```css
/* Ensure visible focus */
:focus {
  outline: 2px solid #005fcc;
  outline-offset: 2px;
}

/* Don't just remove outline */
:focus {
  outline: none; /* BAD */
}
```

### 2.5 Input Modalities

#### 2.5.1 Pointer Gestures (A)
- [ ] Multi-point gestures have single-pointer alternatives
- [ ] Path-based gestures have alternatives

#### 2.5.2 Pointer Cancellation (A)
- [ ] Actions trigger on up-event, not down-event
- [ ] Up-event can abort action

#### 2.5.3 Label in Name (A)
- [ ] Accessible name contains visible text

```html
<!-- Accessible name matches visible label -->
<button aria-label="Search">Search</button>  <!-- GOOD -->
<button aria-label="Find items">Search</button>  <!-- BAD - mismatch -->
```

#### 2.5.4 Motion Actuation (A)
- [ ] Motion-triggered actions have UI alternatives
- [ ] Motion features can be disabled

---

## Principle 3: Understandable

### 3.1 Readable

#### 3.1.1 Language of Page (A)
- [ ] Page has `lang` attribute

```html
<html lang="en">
```

#### 3.1.2 Language of Parts (AA)
- [ ] Content in different language has `lang` attribute

```html
<p>The French word <span lang="fr">bonjour</span> means hello.</p>
```

### 3.2 Predictable

#### 3.2.1 On Focus (A)
- [ ] Focus doesn't trigger unexpected context change

#### 3.2.2 On Input (A)
- [ ] Input doesn't trigger unexpected context change
- [ ] Form submission requires explicit action

#### 3.2.3 Consistent Navigation (AA)
- [ ] Navigation is consistent across pages

#### 3.2.4 Consistent Identification (AA)
- [ ] Same functionality has same labels

### 3.3 Input Assistance

#### 3.3.1 Error Identification (A)
- [ ] Errors are identified in text
- [ ] Error field is indicated

```html
<label for="email">Email</label>
<input type="email" id="email" aria-describedby="email-error" aria-invalid="true">
<span id="email-error" role="alert">Please enter a valid email address</span>
```

#### 3.3.2 Labels or Instructions (A)
- [ ] Form fields have labels
- [ ] Required format is indicated

#### 3.3.3 Error Suggestion (AA)
- [ ] Error messages suggest corrections
- [ ] Format examples provided

#### 3.3.4 Error Prevention (Legal, Financial, Data) (AA)
- [ ] Submissions are reversible, verified, or confirmed
- [ ] Review step before final submission

---

## Principle 4: Robust

### 4.1 Compatible

#### 4.1.1 Parsing (A) - Obsolete in WCAG 2.2
- [ ] HTML is well-formed (no duplicate IDs)

#### 4.1.2 Name, Role, Value (A)
- [ ] Custom controls have accessible names
- [ ] Custom controls have appropriate roles
- [ ] State changes are announced

```html
<!-- Custom toggle button -->
<button
  role="switch"
  aria-checked="false"
  aria-label="Enable notifications"
>
  Notifications
</button>

<!-- Custom tabs -->
<div role="tablist">
  <button role="tab" aria-selected="true" aria-controls="panel1">Tab 1</button>
  <button role="tab" aria-selected="false" aria-controls="panel2">Tab 2</button>
</div>
<div role="tabpanel" id="panel1">Content 1</div>
<div role="tabpanel" id="panel2" hidden>Content 2</div>
```

#### 4.1.3 Status Messages (AA)
- [ ] Status messages announced by screen readers
- [ ] Use `role="status"` or `aria-live`

```html
<!-- Status message -->
<div role="status" aria-live="polite">
  Form submitted successfully
</div>

<!-- Alert message -->
<div role="alert" aria-live="assertive">
  Error: Session expired
</div>
```

---

## Testing Tools

### Automated
- axe DevTools (browser extension)
- WAVE (browser extension)
- Lighthouse Accessibility audit
- pa11y (CLI)

### Manual Testing
- Keyboard-only navigation (Tab, Enter, Space, Arrow keys)
- Screen reader testing (NVDA, VoiceOver, JAWS)
- Zoom to 200%/400%
- High contrast mode
- Color blindness simulation

### Testing Commands

```bash
# axe-core CLI
npx @axe-core/cli https://localhost:3000

# pa11y
npx pa11y https://localhost:3000 --standard WCAG2AA

# Lighthouse
npx lighthouse https://localhost:3000 --only-categories=accessibility --output=json
```

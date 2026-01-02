# CSS Keyframe Animation Patterns Library

Copy-paste ready animation patterns.

## Entrance Animations

### Fade In
```css
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
.fade-in { animation: fadeIn 0.3s ease-out forwards; }
```

### Fade In Up
```css
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.fade-in-up { animation: fadeInUp 0.5s ease-out forwards; }
```

### Fade In Down
```css
@keyframes fadeInDown {
  from {
    opacity: 0;
    transform: translateY(-20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

### Fade In Left/Right
```css
@keyframes fadeInLeft {
  from {
    opacity: 0;
    transform: translateX(-20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes fadeInRight {
  from {
    opacity: 0;
    transform: translateX(20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}
```

### Scale In
```css
@keyframes scaleIn {
  from {
    opacity: 0;
    transform: scale(0.9);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
```

### Zoom In
```css
@keyframes zoomIn {
  from {
    opacity: 0;
    transform: scale(0.5);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
```

### Slide In From Edge
```css
@keyframes slideInFromTop {
  from { transform: translateY(-100%); }
  to { transform: translateY(0); }
}

@keyframes slideInFromBottom {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}

@keyframes slideInFromLeft {
  from { transform: translateX(-100%); }
  to { transform: translateX(0); }
}

@keyframes slideInFromRight {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}
```

### Pop In (with overshoot)
```css
@keyframes popIn {
  0% {
    opacity: 0;
    transform: scale(0.8);
  }
  70% {
    transform: scale(1.05);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}
```

## Exit Animations

### Fade Out
```css
@keyframes fadeOut {
  from { opacity: 1; }
  to { opacity: 0; }
}
```

### Fade Out Down
```css
@keyframes fadeOutDown {
  from {
    opacity: 1;
    transform: translateY(0);
  }
  to {
    opacity: 0;
    transform: translateY(20px);
  }
}
```

### Scale Out
```css
@keyframes scaleOut {
  from {
    opacity: 1;
    transform: scale(1);
  }
  to {
    opacity: 0;
    transform: scale(0.9);
  }
}
```

## Attention Seekers

### Pulse
```css
@keyframes pulse {
  0%, 100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.05);
  }
}
.pulse { animation: pulse 2s ease-in-out infinite; }
```

### Bounce
```css
@keyframes bounce {
  0%, 20%, 50%, 80%, 100% {
    transform: translateY(0);
  }
  40% {
    transform: translateY(-20px);
  }
  60% {
    transform: translateY(-10px);
  }
}
```

### Shake
```css
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
  20%, 40%, 60%, 80% { transform: translateX(5px); }
}
```

### Wobble
```css
@keyframes wobble {
  0% { transform: translateX(0) rotate(0deg); }
  15% { transform: translateX(-10px) rotate(-5deg); }
  30% { transform: translateX(8px) rotate(3deg); }
  45% { transform: translateX(-6px) rotate(-3deg); }
  60% { transform: translateX(4px) rotate(2deg); }
  75% { transform: translateX(-2px) rotate(-1deg); }
  100% { transform: translateX(0) rotate(0deg); }
}
```

### Flash
```css
@keyframes flash {
  0%, 50%, 100% { opacity: 1; }
  25%, 75% { opacity: 0; }
}
```

### Jello
```css
@keyframes jello {
  0%, 100% { transform: skewX(0deg) skewY(0deg); }
  30% { transform: skewX(-10deg) skewY(-10deg); }
  40% { transform: skewX(8deg) skewY(8deg); }
  50% { transform: skewX(-5deg) skewY(-5deg); }
  60% { transform: skewX(3deg) skewY(3deg); }
  70% { transform: skewX(-1deg) skewY(-1deg); }
}
```

### Heartbeat
```css
@keyframes heartbeat {
  0%, 100% { transform: scale(1); }
  14% { transform: scale(1.15); }
  28% { transform: scale(1); }
  42% { transform: scale(1.15); }
  70% { transform: scale(1); }
}
```

### Rubber Band
```css
@keyframes rubberBand {
  0% { transform: scale(1); }
  30% { transform: scaleX(1.25) scaleY(0.75); }
  40% { transform: scaleX(0.75) scaleY(1.25); }
  50% { transform: scaleX(1.15) scaleY(0.85); }
  65% { transform: scaleX(0.95) scaleY(1.05); }
  75% { transform: scaleX(1.05) scaleY(0.95); }
  100% { transform: scale(1); }
}
```

## Loading Indicators

### Spinner
```css
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.spinner {
  width: 24px;
  height: 24px;
  border: 2px solid #e5e7eb;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
```

### Dots Loading
```css
@keyframes dotPulse {
  0%, 80%, 100% {
    transform: scale(0);
    opacity: 0.5;
  }
  40% {
    transform: scale(1);
    opacity: 1;
  }
}
.dot {
  animation: dotPulse 1.4s ease-in-out infinite;
}
.dot:nth-child(1) { animation-delay: 0s; }
.dot:nth-child(2) { animation-delay: 0.16s; }
.dot:nth-child(3) { animation-delay: 0.32s; }
```

### Progress Bar
```css
@keyframes progressIndeterminate {
  0% {
    left: -35%;
    right: 100%;
  }
  60% {
    left: 100%;
    right: -90%;
  }
  100% {
    left: 100%;
    right: -90%;
  }
}
.progress-bar {
  position: absolute;
  background: #3b82f6;
  animation: progressIndeterminate 2.1s cubic-bezier(0.65, 0.815, 0.735, 0.395) infinite;
}
```

### Skeleton Shimmer
```css
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
.skeleton {
  background: linear-gradient(
    90deg,
    #f0f0f0 25%,
    #e0e0e0 50%,
    #f0f0f0 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}
```

## UI Patterns

### Modal Overlay
```css
@keyframes overlayFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes modalSlideIn {
  from {
    opacity: 0;
    transform: translateY(-20px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.overlay {
  animation: overlayFadeIn 0.2s ease-out;
}
.modal {
  animation: modalSlideIn 0.3s ease-out;
}
```

### Dropdown
```css
@keyframes dropdownOpen {
  from {
    opacity: 0;
    transform: translateY(-8px) scaleY(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scaleY(1);
  }
}
.dropdown {
  transform-origin: top center;
  animation: dropdownOpen 0.2s ease-out;
}
```

### Toast/Notification
```css
@keyframes toastSlideIn {
  from {
    transform: translateY(-100%);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

@keyframes toastSlideOut {
  from {
    transform: translateY(0);
    opacity: 1;
  }
  to {
    transform: translateY(-100%);
    opacity: 0;
  }
}
```

### Tooltip
```css
@keyframes tooltipFadeIn {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.tooltip {
  animation: tooltipFadeIn 0.15s ease-out;
}
```

### Accordion Expand
```css
@keyframes accordionOpen {
  from {
    opacity: 0;
    max-height: 0;
  }
  to {
    opacity: 1;
    max-height: 500px;
  }
}
.accordion-content {
  overflow: hidden;
  animation: accordionOpen 0.3s ease-out;
}
```

### Page Transition
```css
@keyframes pageEnter {
  from {
    opacity: 0;
    transform: translateX(10px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes pageExit {
  from {
    opacity: 1;
    transform: translateX(0);
  }
  to {
    opacity: 0;
    transform: translateX(-10px);
  }
}
```

## Scroll Animations (with JavaScript)

```css
/* Animate when element enters viewport */
.animate-on-scroll {
  opacity: 0;
  transform: translateY(30px);
  transition: opacity 0.6s ease-out, transform 0.6s ease-out;
}

.animate-on-scroll.visible {
  opacity: 1;
  transform: translateY(0);
}

/* Staggered children */
.animate-on-scroll.visible .child {
  opacity: 1;
  transform: translateY(0);
}
.animate-on-scroll .child {
  opacity: 0;
  transform: translateY(20px);
  transition: opacity 0.4s ease-out, transform 0.4s ease-out;
}
.animate-on-scroll .child:nth-child(1) { transition-delay: 0.1s; }
.animate-on-scroll .child:nth-child(2) { transition-delay: 0.2s; }
.animate-on-scroll .child:nth-child(3) { transition-delay: 0.3s; }
```

```javascript
// Intersection Observer to trigger animations
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      }
    });
  },
  { threshold: 0.1 }
);

document.querySelectorAll('.animate-on-scroll').forEach((el) => {
  observer.observe(el);
});
```

## Special Effects

### Gradient Animation
```css
@keyframes gradientMove {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
.animated-gradient {
  background: linear-gradient(-45deg, #ee7752, #e73c7e, #23a6d5, #23d5ab);
  background-size: 400% 400%;
  animation: gradientMove 15s ease infinite;
}
```

### Glow Pulse
```css
@keyframes glowPulse {
  0%, 100% {
    box-shadow: 0 0 5px rgba(59, 130, 246, 0.5);
  }
  50% {
    box-shadow: 0 0 20px rgba(59, 130, 246, 0.8);
  }
}
```

### Float
```css
@keyframes float {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10px);
  }
}
.float {
  animation: float 3s ease-in-out infinite;
}
```

### Typewriter
```css
@keyframes typing {
  from { width: 0; }
  to { width: 100%; }
}

@keyframes blink {
  50% { border-color: transparent; }
}

.typewriter {
  overflow: hidden;
  white-space: nowrap;
  border-right: 2px solid;
  animation:
    typing 3s steps(30, end),
    blink 0.75s step-end infinite;
}
```

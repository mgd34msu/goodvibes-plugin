# GSAP Plugins Reference

All plugins are now FREE after Webflow acquisition (2024).

## Installation

```javascript
// NPM - import what you need
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Flip } from "gsap/Flip";
import { Draggable } from "gsap/Draggable";

// Register all at once
gsap.registerPlugin(ScrollTrigger, Flip, Draggable);
```

## ScrollTrigger

Link animations to scroll position.

```javascript
gsap.to(".box", {
  scrollTrigger: {
    trigger: ".box",
    start: "top center",
    end: "bottom center",
    scrub: true,
    pin: true
  },
  x: 500
});
```

See [scrolltrigger.md](scrolltrigger.md) for complete reference.

## Flip

Animate layout changes with FLIP technique.

```javascript
// 1. Get initial state
const state = Flip.getState(".boxes");

// 2. Make DOM changes
container.appendChild(box);  // or toggle class, etc.

// 3. Animate from previous positions
Flip.from(state, {
  duration: 0.5,
  ease: "power1.inOut",
  stagger: 0.1,
  absolute: true,
  onEnter: elements => gsap.fromTo(elements,
    { opacity: 0, scale: 0 },
    { opacity: 1, scale: 1 }
  ),
  onLeave: elements => gsap.to(elements,
    { opacity: 0, scale: 0 }
  )
});
```

### Flip Options

```javascript
Flip.from(state, {
  duration: 0.5,
  ease: "power1.inOut",
  absolute: true,          // Use absolute positioning
  scale: true,             // Animate scale changes
  nested: true,            // Track nested elements
  prune: true,             // Remove elements that left
  spin: true,              // Allow rotation
  props: "backgroundColor", // Also animate these CSS props
  simple: true             // Just x/y, no scale/rotation
});
```

## Draggable

Make elements draggable with bounds and snap.

```javascript
Draggable.create(".box", {
  type: "x,y",             // or "x", "y", "rotation"
  bounds: ".container",
  inertia: true,
  snap: {
    x: value => Math.round(value / 50) * 50,
    y: value => Math.round(value / 50) * 50
  },
  onDrag: function() {
    console.log(this.x, this.y);
  },
  onDragEnd: function() {
    console.log("dropped at", this.x, this.y);
  }
});
```

### With Inertia

```javascript
import { InertiaPlugin } from "gsap/InertiaPlugin";
gsap.registerPlugin(InertiaPlugin);

Draggable.create(".box", {
  inertia: true,
  onThrowUpdate: function() {
    console.log("flicking...");
  }
});
```

## SplitText

Split text into chars, words, or lines for animation.

```javascript
import { SplitText } from "gsap/SplitText";

const split = new SplitText(".headline", {
  type: "chars, words, lines",
  linesClass: "line",
  wordsClass: "word",
  charsClass: "char"
});

// Animate characters
gsap.from(split.chars, {
  opacity: 0,
  y: 50,
  rotateX: -90,
  stagger: 0.02,
  duration: 0.5
});

// Revert when done (restore original HTML)
split.revert();
```

## MotionPathPlugin

Animate along SVG paths or custom paths.

```javascript
import { MotionPathPlugin } from "gsap/MotionPathPlugin";

gsap.to(".rocket", {
  duration: 5,
  motionPath: {
    path: "#flightPath",   // SVG path element
    align: "#flightPath",
    autoRotate: true,
    alignOrigin: [0.5, 0.5]
  }
});

// Or define path as array of points
gsap.to(".ball", {
  motionPath: {
    path: [
      { x: 0, y: 0 },
      { x: 100, y: -100 },
      { x: 200, y: 0 },
      { x: 300, y: -100 }
    ],
    curviness: 1.5
  },
  duration: 3
});
```

## MorphSVGPlugin

Morph between SVG shapes.

```javascript
import { MorphSVGPlugin } from "gsap/MorphSVGPlugin";

gsap.to("#circle", {
  duration: 2,
  morphSVG: "#star",
  ease: "power2.inOut"
});

// Convert to path first if needed
MorphSVGPlugin.convertToPath("circle, rect, ellipse");
```

## DrawSVGPlugin

Animate SVG strokes.

```javascript
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";

// Draw from 0% to 100%
gsap.from(".svg-path", {
  drawSVG: 0,
  duration: 2
});

// Draw specific range
gsap.to(".svg-path", {
  drawSVG: "20% 80%",
  duration: 2
});

// Draw from center
gsap.from(".svg-path", {
  drawSVG: "50% 50%",
  duration: 2
});
```

## TextPlugin

Animate text content.

```javascript
import { TextPlugin } from "gsap/TextPlugin";

gsap.to(".text", {
  duration: 2,
  text: "This is the new text!",
  ease: "none"
});

// With HTML
gsap.to(".text", {
  duration: 2,
  text: {
    value: "<strong>Bold</strong> text",
    delimiter: ""
  }
});
```

## ScrambleTextPlugin

Scramble text like a hacker effect.

```javascript
import { ScrambleTextPlugin } from "gsap/ScrambleTextPlugin";

gsap.to(".text", {
  duration: 2,
  scrambleText: {
    text: "REVEALED!",
    chars: "XO",
    revealDelay: 0.5,
    speed: 0.3
  }
});
```

## ScrollSmoother

Smooth scrolling with parallax.

```javascript
import { ScrollSmoother } from "gsap/ScrollSmoother";

// HTML structure required:
// <div id="smooth-wrapper">
//   <div id="smooth-content">...</div>
// </div>

ScrollSmoother.create({
  wrapper: "#smooth-wrapper",
  content: "#smooth-content",
  smooth: 1,              // Smoothing amount (seconds)
  effects: true,          // Enable data-speed/data-lag attributes
  smoothTouch: 0.1        // Mobile smoothing (0 = off)
});
```

```html
<!-- In HTML, add attributes for parallax -->
<img data-speed="0.5" src="..." />  <!-- slower -->
<img data-speed="1.5" src="..." />  <!-- faster -->
<div data-lag="0.5">Laggy element</div>
```

## Observer

Watch for user interactions (scroll, touch, pointer).

```javascript
import { Observer } from "gsap/Observer";

Observer.create({
  target: window,
  type: "wheel, touch, pointer",
  onUp: () => previousSlide(),
  onDown: () => nextSlide(),
  wheelSpeed: -1,
  tolerance: 10
});
```

## ScrollToPlugin

Smooth scroll to targets.

```javascript
import { ScrollToPlugin } from "gsap/ScrollToPlugin";

gsap.to(window, {
  duration: 1,
  scrollTo: {
    y: "#section3",
    offsetY: 100
  }
});

// Horizontal scroll
gsap.to(".container", {
  duration: 1,
  scrollTo: { x: 500 }
});
```

## CustomEase

Create custom easing curves.

```javascript
import { CustomEase } from "gsap/CustomEase";

CustomEase.create("myEase", "M0,0 C0.25,0.1 0.25,1 1,1");

gsap.to(".box", {
  x: 500,
  ease: "myEase"
});

// From existing ease
CustomEase.create("superBounce",
  CustomEase.get("bounce").copy().setReversed(true)
);
```

## EasePack

Additional easing functions.

```javascript
import { EasePack } from "gsap/EasePack";

// Now available:
"rough({ strength: 2, points: 20 })"
"slow(0.5, 0.8)"
"expoScale(0.5, 5)"
```

## Plugin Quick Reference

| Plugin | Purpose |
|--------|---------|
| ScrollTrigger | Scroll-based animations |
| Flip | FLIP layout animations |
| Draggable | Drag-and-drop |
| SplitText | Text splitting |
| MotionPathPlugin | Path animations |
| MorphSVGPlugin | SVG morphing |
| DrawSVGPlugin | SVG stroke animation |
| TextPlugin | Text replacement |
| ScrambleTextPlugin | Text scramble effect |
| ScrollSmoother | Smooth scroll + parallax |
| Observer | Input detection |
| ScrollToPlugin | Smooth scroll navigation |
| CustomEase | Custom easing curves |
| InertiaPlugin | Momentum/throw physics |

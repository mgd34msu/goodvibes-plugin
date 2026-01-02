# GSAP ScrollTrigger Complete Reference

## Setup

```javascript
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);
```

## Basic Usage

### Simple Trigger
```javascript
// Animate when element enters viewport
gsap.to(".box", {
  scrollTrigger: ".box",
  x: 500
});
```

### Full Configuration
```javascript
gsap.to(".box", {
  scrollTrigger: {
    trigger: ".box",
    start: "top center",
    end: "bottom center",
    toggleActions: "play pause reverse reset",
    markers: true
  },
  x: 500
});
```

## Configuration Options

### Trigger & Positioning

```javascript
{
  trigger: ".element",        // Element that triggers
  endTrigger: ".other",       // Different element for end position

  // Start/End format: "[trigger] [scroller]"
  start: "top center",        // trigger's top hits scroller's center
  end: "bottom top",          // trigger's bottom hits scroller's top

  // Position keywords: top, center, bottom, left, right
  // Or pixels: "top 100px", "bottom -50px"
  // Or percentages: "top 80%"
  // Or relative: "top bottom-=100"
}
```

### Scrub (Link to Scroll)

```javascript
{
  scrub: true,       // Instant link to scroll position
  scrub: 0.5,        // 0.5 second smoothing
  scrub: 1,          // 1 second smoothing
  scrub: 2           // 2 second smoothing (smoother, slower)
}
```

### Pin (Fix Element During Scroll)

```javascript
{
  pin: true,              // Pin trigger element
  pin: ".other-element",  // Pin different element
  pinSpacing: true,       // Add spacing (default: true)
  pinSpacing: "margin",   // Use margin instead of padding
  pinReparent: true,      // Move to body (for z-index issues)
  anticipatePin: 1        // Prevent jitter on fast scroll
}
```

### Toggle Actions

```javascript
{
  // Format: "onEnter onLeave onEnterBack onLeaveBack"
  toggleActions: "play pause reverse reset",

  // Options for each:
  // play, pause, resume, reverse, restart, reset, complete, none
}
```

### Toggle Class

```javascript
{
  toggleClass: "active",                   // Add class to trigger
  toggleClass: {
    targets: ".other",                     // Target other elements
    className: "is-visible"
  }
}
```

### Callbacks

```javascript
{
  onEnter: () => console.log("entered"),
  onLeave: () => console.log("left"),
  onEnterBack: () => console.log("entered from bottom"),
  onLeaveBack: () => console.log("left to top"),

  onUpdate: (self) => {
    console.log("progress:", self.progress);  // 0 to 1
    console.log("direction:", self.direction); // 1 or -1
    console.log("velocity:", self.getVelocity());
  },

  onToggle: (self) => console.log("toggled", self.isActive),

  onRefresh: (self) => console.log("refreshed"),
  onRefreshInit: (self) => console.log("refresh started"),
  onScrubComplete: () => console.log("scrub finished")
}
```

### Snapping

```javascript
{
  snap: 0.5,               // Snap to 0, 0.5, 1 (progress values)
  snap: 1 / 4,             // Snap to quarters
  snap: [0, 0.2, 0.5, 1],  // Specific snap points

  snap: {
    snapTo: 1 / 4,
    duration: 0.3,
    delay: 0,
    ease: "power1.inOut",
    directional: true,     // Only snap in scroll direction
    onStart: () => {},
    onComplete: () => {}
  },

  // Snap to labels
  snap: {
    snapTo: "labels",
    duration: 0.5
  }
}
```

### Horizontal Scrolling

```javascript
{
  horizontal: true,
  // Now start/end use left/right instead of top/bottom
  start: "left center",
  end: "right center"
}
```

### Custom Scroller

```javascript
{
  scroller: ".scroll-container",  // Custom scroll element
  // For horizontal scroll container:
  horizontal: true
}
```

### Performance Options

```javascript
{
  fastScrollEnd: true,     // Force complete on fast scroll
  fastScrollEnd: 3000,     // Custom velocity threshold

  preventOverlaps: true,   // Kill overlapping ScrollTriggers
  preventOverlaps: "group" // Only within named group
}
```

## Standalone ScrollTrigger

Create without animation:

```javascript
ScrollTrigger.create({
  trigger: ".element",
  start: "top center",
  end: "bottom center",
  onEnter: () => console.log("entered"),
  onLeave: () => console.log("left"),
  markers: true
});
```

## With Timelines

```javascript
const tl = gsap.timeline({
  scrollTrigger: {
    trigger: ".container",
    start: "top top",
    end: "+=3000",  // Scroll for 3000px
    scrub: true,
    pin: true
  }
});

tl.to(".box1", { x: 500 })
  .to(".box2", { y: 200 })
  .to(".box3", { rotation: 360 });
```

## Batch Animations

Efficiently animate many elements:

```javascript
ScrollTrigger.batch(".card", {
  onEnter: (elements) => {
    gsap.from(elements, {
      opacity: 0,
      y: 50,
      stagger: 0.1
    });
  },
  onLeave: (elements) => {
    gsap.to(elements, { opacity: 0.5 });
  }
});
```

## Methods

```javascript
// Get all ScrollTriggers
ScrollTrigger.getAll();

// Get by ID
ScrollTrigger.getById("myId");

// Refresh calculations (after resize, content change)
ScrollTrigger.refresh();
ScrollTrigger.refresh(true);  // Safe mode (uses setTimeout)

// Clear/reset
ScrollTrigger.clearScrollMemory();

// Kill
ScrollTrigger.kill();              // Kill all
myScrollTrigger.kill();            // Kill single
myScrollTrigger.kill(true);        // Kill and remove pin

// Enable/disable
ScrollTrigger.disable();
ScrollTrigger.enable();
myScrollTrigger.disable();
myScrollTrigger.enable();

// Scroll to position
ScrollTrigger.scrollTo(500);
ScrollTrigger.scrollTo(".element");

// Get scroll position
ScrollTrigger.positionInViewport(".element", "center");

// Match media for responsive
ScrollTrigger.matchMedia({
  "(min-width: 800px)": function() {
    // Desktop animations
  },
  "(max-width: 799px)": function() {
    // Mobile animations
  }
});
```

## Common Patterns

### Parallax Effect
```javascript
gsap.to(".bg-image", {
  yPercent: -30,
  ease: "none",
  scrollTrigger: {
    trigger: ".section",
    start: "top bottom",
    end: "bottom top",
    scrub: true
  }
});
```

### Progress Bar
```javascript
gsap.to(".progress-bar", {
  scaleX: 1,
  ease: "none",
  scrollTrigger: {
    trigger: "body",
    start: "top top",
    end: "bottom bottom",
    scrub: 0.3
  }
});
```

### Pin + Horizontal Scroll
```javascript
const sections = gsap.utils.toArray(".panel");

gsap.to(sections, {
  xPercent: -100 * (sections.length - 1),
  ease: "none",
  scrollTrigger: {
    trigger: ".horizontal-container",
    pin: true,
    scrub: 1,
    snap: 1 / (sections.length - 1),
    end: () => "+=" + document.querySelector(".horizontal-container").offsetWidth
  }
});
```

### Reveal on Scroll
```javascript
gsap.utils.toArray(".reveal").forEach((elem) => {
  gsap.set(elem, { autoAlpha: 0, y: 50 });

  ScrollTrigger.create({
    trigger: elem,
    start: "top 85%",
    once: true,
    onEnter: () => gsap.to(elem, {
      autoAlpha: 1,
      y: 0,
      duration: 0.6
    })
  });
});
```

### Scrub with Smooth Catching
```javascript
gsap.to(".element", {
  x: 500,
  scrollTrigger: {
    trigger: ".container",
    start: "top center",
    end: "bottom center",
    scrub: 2  // Takes 2 seconds to catch up
  }
});
```

## Debugging

```javascript
{
  markers: true,
  markers: {
    startColor: "green",
    endColor: "red",
    fontSize: "12px",
    indent: 20
  },
  id: "myTrigger"  // Label in console
}
```

## Best Practices

1. **Refresh on content changes** - Call `ScrollTrigger.refresh()` after dynamic content loads
2. **Use `once: true`** for one-time reveals to improve performance
3. **Avoid overlapping pins** - Use `preventOverlaps`
4. **Test on mobile** - Pin behavior can differ
5. **Remove markers in production**
6. **Use `anticipatePin: 1`** for smoother pin starts

---
name: framer-motion
description: Creates animations with Framer Motion/Motion including transitions, gestures, layout animations, and scroll effects. Use when animating React components, creating page transitions, adding gesture interactions, or building animated interfaces.
---

# Framer Motion

Production-ready animation library for React with declarative animations and gestures.

## Quick Start

**Install:**
```bash
npm install framer-motion
```

**Basic animation:**
```tsx
import { motion } from 'framer-motion';

function Component() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      Hello World
    </motion.div>
  );
}
```

## Core Concepts

### Motion Components

```tsx
import { motion } from 'framer-motion';

// Any HTML element
<motion.div />
<motion.span />
<motion.button />
<motion.svg />
<motion.path />

// Custom components
const MotionCard = motion(Card);
```

### Animate Prop

```tsx
// Simple values
<motion.div animate={{ x: 100 }} />

// Multiple properties
<motion.div
  animate={{
    x: 100,
    opacity: 0.5,
    scale: 1.2,
    rotate: 45,
  }}
/>

// Keyframes
<motion.div
  animate={{
    x: [0, 100, 0],
    opacity: [1, 0.5, 1],
  }}
/>
```

### Initial State

```tsx
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
/>

// Disable initial animation
<motion.div initial={false} animate={{ x: 100 }} />
```

### Exit Animations

```tsx
import { motion, AnimatePresence } from 'framer-motion';

function Modal({ isOpen, onClose }) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="modal-backdrop"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="modal-content"
          >
            Modal content
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

## Transitions

### Basic Transitions

```tsx
<motion.div
  animate={{ x: 100 }}
  transition={{
    duration: 0.5,
    delay: 0.2,
    ease: 'easeInOut',
  }}
/>
```

### Spring Physics

```tsx
<motion.div
  animate={{ x: 100 }}
  transition={{
    type: 'spring',
    stiffness: 100,
    damping: 10,
    mass: 1,
  }}
/>

// Bounce effect
<motion.div
  animate={{ y: 0 }}
  initial={{ y: -100 }}
  transition={{
    type: 'spring',
    bounce: 0.5,
  }}
/>
```

### Tween (Keyframe)

```tsx
<motion.div
  animate={{ x: 100 }}
  transition={{
    type: 'tween',
    ease: 'easeInOut',
    duration: 0.5,
  }}
/>

// Custom easing
<motion.div
  transition={{
    ease: [0.17, 0.67, 0.83, 0.67], // Cubic bezier
  }}
/>
```

### Per-Property Transitions

```tsx
<motion.div
  animate={{ x: 100, opacity: 0 }}
  transition={{
    x: { type: 'spring', stiffness: 100 },
    opacity: { duration: 0.2 },
  }}
/>
```

## Variants

### Basic Variants

```tsx
const variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

<motion.div
  variants={variants}
  initial="hidden"
  animate="visible"
/>
```

### Orchestration

```tsx
const container = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.3,
    },
  },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

function List({ items }) {
  return (
    <motion.ul
      variants={container}
      initial="hidden"
      animate="visible"
    >
      {items.map((item) => (
        <motion.li key={item.id} variants={item}>
          {item.text}
        </motion.li>
      ))}
    </motion.ul>
  );
}
```

### Dynamic Variants

```tsx
const variants = {
  hidden: { opacity: 0 },
  visible: (custom: number) => ({
    opacity: 1,
    transition: { delay: custom * 0.1 },
  }),
};

{items.map((item, i) => (
  <motion.div
    key={item.id}
    custom={i}
    variants={variants}
    initial="hidden"
    animate="visible"
  />
))}
```

## Gestures

### Hover

```tsx
<motion.button
  whileHover={{ scale: 1.05 }}
  whileTap={{ scale: 0.95 }}
>
  Click me
</motion.button>

// With variants
<motion.div
  whileHover="hover"
  variants={{
    hover: { scale: 1.1, rotate: 5 },
  }}
/>
```

### Tap/Click

```tsx
<motion.div
  whileTap={{ scale: 0.9 }}
  onTap={() => console.log('Tapped!')}
  onTapStart={() => console.log('Tap started')}
  onTapCancel={() => console.log('Tap cancelled')}
/>
```

### Drag

```tsx
<motion.div
  drag
  dragConstraints={{ left: 0, right: 300, top: 0, bottom: 300 }}
  dragElastic={0.2}
  dragMomentum={false}
  whileDrag={{ scale: 1.1 }}
  onDragStart={(event, info) => console.log('Drag started')}
  onDrag={(event, info) => console.log('Dragging', info.point)}
  onDragEnd={(event, info) => console.log('Drag ended')}
/>

// Constrain to parent
<motion.div ref={constraintsRef}>
  <motion.div drag dragConstraints={constraintsRef} />
</motion.div>

// Drag axis
<motion.div drag="x" /> // Horizontal only
<motion.div drag="y" /> // Vertical only
```

### Focus

```tsx
<motion.input
  whileFocus={{ scale: 1.02, borderColor: '#3b82f6' }}
/>
```

## Layout Animations

### Basic Layout

```tsx
<motion.div layout>
  {isExpanded ? 'Expanded content' : 'Collapsed'}
</motion.div>
```

### Shared Layout

```tsx
function Tabs({ tabs, activeTab, setActiveTab }) {
  return (
    <div className="tabs">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          className="tab"
        >
          {tab.label}
          {activeTab === tab.id && (
            <motion.div
              layoutId="underline"
              className="underline"
            />
          )}
        </button>
      ))}
    </div>
  );
}
```

### Layout Groups

```tsx
import { LayoutGroup } from 'framer-motion';

<LayoutGroup>
  <motion.div layout />
  <motion.div layout />
</LayoutGroup>
```

### Layout Transition

```tsx
<motion.div
  layout
  transition={{
    layout: { duration: 0.3, ease: 'easeOut' },
  }}
/>
```

## Scroll Animations

### Scroll-Linked Values

```tsx
import { motion, useScroll, useTransform } from 'framer-motion';

function ParallaxHeader() {
  const { scrollY } = useScroll();

  const y = useTransform(scrollY, [0, 300], [0, -100]);
  const opacity = useTransform(scrollY, [0, 300], [1, 0]);

  return (
    <motion.header style={{ y, opacity }}>
      <h1>Parallax Header</h1>
    </motion.header>
  );
}
```

### Scroll Progress

```tsx
function ProgressBar() {
  const { scrollYProgress } = useScroll();

  return (
    <motion.div
      className="progress-bar"
      style={{ scaleX: scrollYProgress }}
    />
  );
}
```

### Scroll Container

```tsx
function ScrollContainer() {
  const containerRef = useRef(null);
  const { scrollYProgress } = useScroll({
    container: containerRef,
  });

  return (
    <div ref={containerRef} style={{ overflow: 'scroll', height: 400 }}>
      {/* Content */}
    </div>
  );
}
```

### In View Animation

```tsx
import { motion, useInView } from 'framer-motion';

function FadeInSection({ children }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 50 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5 }}
    >
      {children}
    </motion.div>
  );
}
```

### whileInView

```tsx
<motion.div
  initial={{ opacity: 0 }}
  whileInView={{ opacity: 1 }}
  viewport={{ once: true, amount: 0.5 }}
/>
```

## Animation Controls

### useAnimation

```tsx
import { motion, useAnimation } from 'framer-motion';

function Component() {
  const controls = useAnimation();

  async function sequence() {
    await controls.start({ x: 100 });
    await controls.start({ y: 100 });
    await controls.start({ x: 0, y: 0 });
  }

  return (
    <motion.div animate={controls}>
      <button onClick={sequence}>Start Sequence</button>
    </motion.div>
  );
}
```

### Start/Stop

```tsx
const controls = useAnimation();

// Start animation
controls.start({ x: 100 });

// Start with variants
controls.start('visible');

// Stop animation
controls.stop();

// Set immediately (no animation)
controls.set({ x: 0 });
```

## SVG Animations

### Path Drawing

```tsx
<motion.svg viewBox="0 0 100 100">
  <motion.path
    d="M10 10 L90 10 L90 90 L10 90 Z"
    initial={{ pathLength: 0 }}
    animate={{ pathLength: 1 }}
    transition={{ duration: 2, ease: 'easeInOut' }}
    stroke="#000"
    strokeWidth="2"
    fill="none"
  />
</motion.svg>
```

### Circle Progress

```tsx
function CircleProgress({ progress }) {
  return (
    <svg viewBox="0 0 100 100">
      <motion.circle
        cx="50"
        cy="50"
        r="40"
        stroke="#3b82f6"
        strokeWidth="8"
        fill="none"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: progress }}
        transition={{ duration: 0.5 }}
        style={{
          rotate: -90,
          transformOrigin: '50% 50%',
        }}
      />
    </svg>
  );
}
```

## Page Transitions

### Next.js App Router

```tsx
// app/template.tsx
'use client';

import { motion } from 'framer-motion';

export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.3 }}
    >
      {children}
    </motion.div>
  );
}
```

### With AnimatePresence

```tsx
'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { usePathname } from 'next/navigation';

export default function PageTransition({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pathname}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
```

## Performance

### Reduce Motion

```tsx
import { useReducedMotion } from 'framer-motion';

function Component() {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      animate={{ x: shouldReduceMotion ? 0 : 100 }}
      transition={{ duration: shouldReduceMotion ? 0 : 0.5 }}
    />
  );
}
```

### Hardware Acceleration

```tsx
// Use transform properties for GPU acceleration
<motion.div
  animate={{
    x: 100,        // Good - uses transform
    scale: 1.2,    // Good - uses transform
    opacity: 0.5,  // Good - composited
  }}
/>

// Avoid animating layout properties
<motion.div
  animate={{
    width: 200,    // Avoid - triggers layout
    height: 200,   // Avoid - triggers layout
  }}
/>
```

## Best Practices

1. **Use layout for size changes** - Smooth without layout thrashing
2. **Prefer spring for natural feel** - More organic than tween
3. **Stagger children in lists** - Better visual hierarchy
4. **Use variants for complex animations** - Cleaner code
5. **Respect reduced motion** - Accessibility

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Missing AnimatePresence | Wrap exit animations |
| Animating layout properties | Use transform instead |
| Key missing in lists | Add unique keys |
| No initial state | Add initial prop |
| Heavy animations | Use will-change sparingly |

## Reference Files

- [references/variants.md](references/variants.md) - Complex variants
- [references/gestures.md](references/gestures.md) - Gesture patterns
- [references/scroll.md](references/scroll.md) - Scroll animations

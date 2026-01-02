# Lottie React Integration Patterns

## Setup

```bash
npm install lottie-react
# or
npm install lottie-web
```

## Basic Usage with lottie-react

```jsx
import Lottie from 'lottie-react';
import animationData from './animation.json';

function BasicAnimation() {
  return (
    <Lottie
      animationData={animationData}
      loop={true}
      autoplay={true}
    />
  );
}
```

## Props Reference

```jsx
<Lottie
  // Data source (choose one)
  animationData={jsonData}        // imported JSON
  path="/animation.json"          // URL path

  // Playback
  loop={true}                     // boolean | number
  autoplay={true}
  initialSegment={[0, 50]}        // [start, end] frames

  // Renderer
  renderer="svg"                  // 'svg' | 'canvas' | 'html'
  rendererSettings={{
    preserveAspectRatio: 'xMidYMid slice'
  }}

  // Styling
  style={{ width: 300, height: 300 }}
  className="my-animation"

  // Events
  onComplete={() => {}}
  onLoopComplete={() => {}}
  onEnterFrame={() => {}}
  onSegmentStart={() => {}}
  onConfigReady={() => {}}
  onDataReady={() => {}}
  onDOMLoaded={() => {}}

  // Ref for control
  lottieRef={ref}
/>
```

## Controlled Animation

```jsx
import { useRef, useState } from 'react';
import Lottie from 'lottie-react';

function ControlledAnimation({ animationData }) {
  const lottieRef = useRef(null);
  const [isPaused, setIsPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [direction, setDirection] = useState(1);

  return (
    <div>
      <Lottie
        lottieRef={lottieRef}
        animationData={animationData}
        loop={true}
        autoplay={true}
      />

      <div className="controls">
        <button onClick={() => {
          setIsPaused(!isPaused);
          isPaused ? lottieRef.current?.play() : lottieRef.current?.pause();
        }}>
          {isPaused ? 'Play' : 'Pause'}
        </button>

        <button onClick={() => lottieRef.current?.stop()}>
          Stop
        </button>

        <button onClick={() => {
          const newSpeed = speed === 1 ? 2 : 1;
          setSpeed(newSpeed);
          lottieRef.current?.setSpeed(newSpeed);
        }}>
          Speed: {speed}x
        </button>

        <button onClick={() => {
          const newDirection = direction === 1 ? -1 : 1;
          setDirection(newDirection);
          lottieRef.current?.setDirection(newDirection);
        }}>
          Direction: {direction === 1 ? 'Forward' : 'Reverse'}
        </button>
      </div>
    </div>
  );
}
```

## Custom Hook with lottie-web

```jsx
import { useEffect, useRef, useCallback } from 'react';
import lottie from 'lottie-web';

export function useLottie(options) {
  const containerRef = useRef(null);
  const animationRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    animationRef.current = lottie.loadAnimation({
      container: containerRef.current,
      renderer: 'svg',
      loop: true,
      autoplay: true,
      ...options
    });

    return () => {
      animationRef.current?.destroy();
    };
  }, [options.animationData, options.path]);

  const play = useCallback(() => animationRef.current?.play(), []);
  const pause = useCallback(() => animationRef.current?.pause(), []);
  const stop = useCallback(() => animationRef.current?.stop(), []);
  const setSpeed = useCallback((speed) => animationRef.current?.setSpeed(speed), []);
  const setDirection = useCallback((dir) => animationRef.current?.setDirection(dir), []);
  const goToAndPlay = useCallback((value, isFrame) =>
    animationRef.current?.goToAndPlay(value, isFrame), []);
  const goToAndStop = useCallback((value, isFrame) =>
    animationRef.current?.goToAndStop(value, isFrame), []);

  return {
    containerRef,
    animation: animationRef,
    play,
    pause,
    stop,
    setSpeed,
    setDirection,
    goToAndPlay,
    goToAndStop
  };
}

// Usage
function MyAnimation() {
  const { containerRef, play, pause } = useLottie({
    path: '/animation.json',
    autoplay: false
  });

  return (
    <>
      <div ref={containerRef} style={{ width: 200, height: 200 }} />
      <button onClick={play}>Play</button>
      <button onClick={pause}>Pause</button>
    </>
  );
}
```

## Lazy Loading

```jsx
import { Suspense, lazy, useState } from 'react';
import Lottie from 'lottie-react';

// Lazy load animation data
const loadAnimation = () => import('./heavy-animation.json');

function LazyAnimation() {
  const [animationData, setAnimationData] = useState(null);

  useEffect(() => {
    loadAnimation().then((data) => setAnimationData(data.default));
  }, []);

  if (!animationData) {
    return <div className="skeleton" />;
  }

  return <Lottie animationData={animationData} />;
}
```

## Hover Interaction

```jsx
function HoverAnimation({ animationData }) {
  const lottieRef = useRef(null);

  const handleMouseEnter = () => {
    lottieRef.current?.setDirection(1);
    lottieRef.current?.play();
  };

  const handleMouseLeave = () => {
    lottieRef.current?.setDirection(-1);
    lottieRef.current?.play();
  };

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <Lottie
        lottieRef={lottieRef}
        animationData={animationData}
        autoplay={false}
        loop={false}
      />
    </div>
  );
}
```

## Click to Toggle

```jsx
function ToggleAnimation({ animationData }) {
  const lottieRef = useRef(null);
  const [isActive, setIsActive] = useState(false);

  const handleClick = () => {
    if (isActive) {
      // Play reverse
      lottieRef.current?.setDirection(-1);
      lottieRef.current?.play();
    } else {
      // Play forward
      lottieRef.current?.setDirection(1);
      lottieRef.current?.play();
    }
    setIsActive(!isActive);
  };

  return (
    <button onClick={handleClick} className="animation-button">
      <Lottie
        lottieRef={lottieRef}
        animationData={animationData}
        autoplay={false}
        loop={false}
      />
    </button>
  );
}
```

## Scroll-Linked Animation

```jsx
function ScrollLinkedAnimation({ animationData }) {
  const containerRef = useRef(null);
  const lottieRef = useRef(null);

  useEffect(() => {
    const handleScroll = () => {
      if (!lottieRef.current || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const scrollProgress = Math.max(0, Math.min(1,
        (window.innerHeight - rect.top) / (window.innerHeight + rect.height)
      ));

      const frame = scrollProgress * lottieRef.current.getDuration(true);
      lottieRef.current.goToAndStop(frame, true);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Initial position

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div ref={containerRef}>
      <Lottie
        lottieRef={lottieRef}
        animationData={animationData}
        autoplay={false}
      />
    </div>
  );
}
```

## Intersection Observer Animation

```jsx
function ViewportAnimation({ animationData }) {
  const containerRef = useRef(null);
  const lottieRef = useRef(null);
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsInView(entry.isIntersecting);
        if (entry.isIntersecting) {
          lottieRef.current?.play();
        } else {
          lottieRef.current?.pause();
        }
      },
      { threshold: 0.5 }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef}>
      <Lottie
        lottieRef={lottieRef}
        animationData={animationData}
        autoplay={false}
        loop={true}
      />
    </div>
  );
}
```

## Segmented Animation

```jsx
function SegmentedAnimation({ animationData }) {
  const lottieRef = useRef(null);
  const [currentSegment, setCurrentSegment] = useState('idle');

  const segments = {
    idle: [0, 30],
    hover: [30, 60],
    click: [60, 90]
  };

  const playSegment = (segmentName) => {
    setCurrentSegment(segmentName);
    lottieRef.current?.playSegments(segments[segmentName], true);
  };

  return (
    <div
      onMouseEnter={() => playSegment('hover')}
      onMouseLeave={() => playSegment('idle')}
      onClick={() => playSegment('click')}
    >
      <Lottie
        lottieRef={lottieRef}
        animationData={animationData}
        autoplay={true}
        loop={true}
        initialSegment={segments.idle}
      />
    </div>
  );
}
```

## Loading States

```jsx
function LoadingButton({ isLoading, onClick, children }) {
  return (
    <button onClick={onClick} disabled={isLoading}>
      {isLoading ? (
        <Lottie
          animationData={spinnerAnimation}
          loop={true}
          style={{ width: 24, height: 24 }}
        />
      ) : (
        children
      )}
    </button>
  );
}
```

## Success/Error States

```jsx
function StatusAnimation({ status }) {
  const animations = {
    loading: loadingAnimation,
    success: successAnimation,
    error: errorAnimation
  };

  return (
    <Lottie
      key={status} // Force remount on status change
      animationData={animations[status]}
      loop={status === 'loading'}
      autoplay={true}
      style={{ width: 100, height: 100 }}
    />
  );
}
```

## Performance: Multiple Instances

```jsx
// Use a single animation instance with multiple containers
function OptimizedMultiple({ animationData, count }) {
  // For many instances, consider canvas renderer
  return (
    <div className="grid">
      {Array.from({ length: count }).map((_, i) => (
        <Lottie
          key={i}
          animationData={animationData}
          renderer="canvas"
          loop={true}
          style={{ width: 50, height: 50 }}
        />
      ))}
    </div>
  );
}
```

## TypeScript Types

```typescript
import Lottie, { LottieRefCurrentProps } from 'lottie-react';
import { AnimationItem } from 'lottie-web';

interface AnimationData {
  v: string;
  fr: number;
  ip: number;
  op: number;
  w: number;
  h: number;
  // ...
}

function TypedAnimation() {
  const lottieRef = useRef<LottieRefCurrentProps>(null);

  const handleClick = () => {
    // Type-safe methods
    lottieRef.current?.play();
    lottieRef.current?.pause();
    lottieRef.current?.stop();
    lottieRef.current?.setSpeed(2);
  };

  return (
    <Lottie
      lottieRef={lottieRef}
      animationData={animationData as AnimationData}
    />
  );
}
```

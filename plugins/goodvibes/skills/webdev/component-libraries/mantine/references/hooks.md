# Mantine Hooks Reference

Complete hook catalog from @mantine/hooks.

## State Management

### useDisclosure

```tsx
import { useDisclosure } from '@mantine/hooks';

// Basic usage
const [opened, { open, close, toggle }] = useDisclosure(false);

// With callbacks
const [opened, handlers] = useDisclosure(false, {
  onOpen: () => console.log('Opened'),
  onClose: () => console.log('Closed'),
});

// Usage
<Modal opened={opened} onClose={close}>...</Modal>
<Button onClick={open}>Open</Button>
```

### useToggle

```tsx
import { useToggle } from '@mantine/hooks';

// Boolean toggle
const [value, toggle] = useToggle();

// Toggle between values
const [value, toggle] = useToggle(['light', 'dark']);
const [size, toggle] = useToggle(['sm', 'md', 'lg', 'xl']);

// Toggle with specific value
toggle('dark'); // Set to 'dark'
toggle(); // Toggle to next value
```

### useCounter

```tsx
import { useCounter } from '@mantine/hooks';

const [count, handlers] = useCounter(0, { min: 0, max: 10 });

handlers.increment(); // +1
handlers.decrement(); // -1
handlers.set(5);      // Set to 5
handlers.reset();     // Reset to initial
```

### useQueue

```tsx
import { useQueue } from '@mantine/hooks';

const { state, queue, add, update, cleanQueue } = useQueue({
  initialValues: [1, 2, 3],
  limit: 5,
});

add(4, 5, 6); // Add to queue
update((values) => values.filter((v) => v > 2));
cleanQueue(); // Clear pending items
```

### useListState

```tsx
import { useListState } from '@mantine/hooks';

const [values, handlers] = useListState([1, 2, 3]);

handlers.append(4);           // Add to end
handlers.prepend(0);          // Add to start
handlers.insert(2, 2.5);      // Insert at index
handlers.remove(1);           // Remove at index
handlers.pop();               // Remove last
handlers.shift();             // Remove first
handlers.reorder({ from: 0, to: 2 }); // Reorder
handlers.setItem(1, 100);     // Set at index
handlers.setItemProp(1, 'name', 'value'); // Set object property
handlers.filter((item) => item > 2);
handlers.apply((item, index) => item * 2);
```

### useSetState

```tsx
import { useSetState } from '@mantine/hooks';

const [state, setState] = useSetState({ name: '', email: '' });

// Partial updates (like class components)
setState({ name: 'John' }); // Only updates name
setState((current) => ({ count: current.count + 1 }));
```

## Input and Form

### useDebouncedValue

```tsx
import { useDebouncedValue } from '@mantine/hooks';

const [value, setValue] = useState('');
const [debounced] = useDebouncedValue(value, 300);

// Search with debounce
useEffect(() => {
  searchAPI(debounced);
}, [debounced]);
```

### useDebouncedState

```tsx
import { useDebouncedState } from '@mantine/hooks';

// Combined state + debounce
const [value, setValue] = useDebouncedState('', 300);

<TextInput value={value} onChange={(e) => setValue(e.target.value)} />
```

### useDebouncedCallback

```tsx
import { useDebouncedCallback } from '@mantine/hooks';

const handleSearch = useDebouncedCallback((query: string) => {
  fetchResults(query);
}, 300);

<TextInput onChange={(e) => handleSearch(e.target.value)} />
```

### useThrottledValue

```tsx
import { useThrottledValue } from '@mantine/hooks';

const [value, setValue] = useState('');
const throttledValue = useThrottledValue(value, 1000);
```

### useInputState

```tsx
import { useInputState } from '@mantine/hooks';

const [value, setValue] = useInputState('');

// Works directly with event handlers
<TextInput value={value} onChange={setValue} />
```

### useUncontrolled

```tsx
import { useUncontrolled } from '@mantine/hooks';

function CustomInput({ value, defaultValue, onChange }) {
  const [_value, handleChange] = useUncontrolled({
    value,
    defaultValue,
    onChange,
    finalValue: '',
  });

  return <input value={_value} onChange={(e) => handleChange(e.target.value)} />;
}
```

## Lifecycle

### useDidUpdate

```tsx
import { useDidUpdate } from '@mantine/hooks';

// Like useEffect but skips first render
useDidUpdate(() => {
  console.log('Value changed:', value);
}, [value]);
```

### usePrevious

```tsx
import { usePrevious } from '@mantine/hooks';

const [value, setValue] = useState(0);
const previousValue = usePrevious(value);

// previousValue is the value from last render
```

### useIsFirstRender

```tsx
import { useIsFirstRender } from '@mantine/hooks';

const firstRender = useIsFirstRender();
// true on first render, false after
```

### useShallowEffect

```tsx
import { useShallowEffect } from '@mantine/hooks';

// Shallow comparison for dependencies
useShallowEffect(() => {
  console.log('Object properties changed');
}, [{ a: 1, b: 2 }]);
```

## UI and DOM

### useClickOutside

```tsx
import { useClickOutside } from '@mantine/hooks';

const ref = useClickOutside(() => setOpened(false));

<div ref={ref}>Click outside to close</div>

// With multiple refs
const ref = useClickOutside(() => setOpened(false), null, [
  triggerRef,
  dropdownRef,
]);
```

### useFocusTrap

```tsx
import { useFocusTrap } from '@mantine/hooks';

const focusTrapRef = useFocusTrap(opened);

<div ref={focusTrapRef}>
  {/* Focus is trapped within */}
  <input />
  <button>Submit</button>
</div>
```

### useFocusWithin

```tsx
import { useFocusWithin } from '@mantine/hooks';

const { ref, focused } = useFocusWithin();

<div ref={ref}>
  <input />
  <button />
  {focused && <div>Something inside is focused</div>}
</div>
```

### useFocusReturn

```tsx
import { useFocusReturn } from '@mantine/hooks';

// Returns focus to trigger when modal closes
const returnFocus = useFocusReturn({ opened, shouldReturnFocus: true });
```

### useHover

```tsx
import { useHover } from '@mantine/hooks';

const { hovered, ref } = useHover();

<div ref={ref}>
  {hovered ? 'Hovering' : 'Not hovering'}
</div>
```

### useMouse

```tsx
import { useMouse } from '@mantine/hooks';

// Track mouse position
const { ref, x, y } = useMouse();

<div ref={ref}>
  Mouse position: {x}, {y}
</div>
```

### useMove

```tsx
import { useMove } from '@mantine/hooks';

const [value, setValue] = useState({ x: 0.5, y: 0.5 });
const { ref } = useMove(setValue);

// For sliders, color pickers, etc.
<div ref={ref} style={{ position: 'relative', width: 200, height: 200 }}>
  <div style={{ left: `${value.x * 100}%`, top: `${value.y * 100}%` }} />
</div>
```

### useResizeObserver

```tsx
import { useResizeObserver, useElementSize } from '@mantine/hooks';

// Full observer
const [ref, rect] = useResizeObserver();
// rect: { width, height, x, y, top, left, bottom, right }

// Just size
const { ref, width, height } = useElementSize();

<div ref={ref}>
  Size: {width} x {height}
</div>
```

### useViewportSize

```tsx
import { useViewportSize } from '@mantine/hooks';

const { width, height } = useViewportSize();
```

### useWindowScroll

```tsx
import { useWindowScroll } from '@mantine/hooks';

const [scroll, scrollTo] = useWindowScroll();

// scroll.x, scroll.y
scrollTo({ y: 0 }); // Scroll to top
```

### useIntersection

```tsx
import { useIntersection } from '@mantine/hooks';

const { ref, entry } = useIntersection({
  root: containerRef.current,
  threshold: 1,
});

const isVisible = entry?.isIntersecting;

<div ref={ref}>Observed element</div>
```

## Utilities

### useClipboard

```tsx
import { useClipboard } from '@mantine/hooks';

const clipboard = useClipboard({ timeout: 2000 });

<Button
  color={clipboard.copied ? 'green' : 'blue'}
  onClick={() => clipboard.copy('Text to copy')}
>
  {clipboard.copied ? 'Copied' : 'Copy'}
</Button>
```

### useDocumentTitle

```tsx
import { useDocumentTitle } from '@mantine/hooks';

useDocumentTitle('Page Title | My App');
```

### useDocumentVisibility

```tsx
import { useDocumentVisibility } from '@mantine/hooks';

const visibility = useDocumentVisibility();
// 'visible' | 'hidden'

useEffect(() => {
  if (visibility === 'hidden') {
    // Pause video, stop animations, etc.
  }
}, [visibility]);
```

### useFullscreen

```tsx
import { useFullscreen } from '@mantine/hooks';

const { ref, toggle, fullscreen } = useFullscreen();

<div ref={ref}>
  <Button onClick={toggle}>
    {fullscreen ? 'Exit' : 'Enter'} fullscreen
  </Button>
</div>
```

### useHotkeys

```tsx
import { useHotkeys } from '@mantine/hooks';

useHotkeys([
  ['mod+K', () => openSearch()],
  ['mod+S', () => saveDocument()],
  ['mod+shift+P', () => openCommandPalette()],
  ['Escape', () => closeModal()],
]);

// mod = Cmd on Mac, Ctrl on Windows/Linux
```

### useIdle

```tsx
import { useIdle } from '@mantine/hooks';

const idle = useIdle(2000); // Idle after 2 seconds
// idle: boolean

const idle = useIdle(2000, { events: ['keypress', 'mousemove'] });
```

### useInterval

```tsx
import { useInterval } from '@mantine/hooks';

const interval = useInterval(() => setCount((c) => c + 1), 1000);

<Button onClick={interval.toggle}>
  {interval.active ? 'Stop' : 'Start'}
</Button>

// Methods: start(), stop(), toggle()
// Properties: active
```

### useTimeout

```tsx
import { useTimeout } from '@mantine/hooks';

const { start, clear } = useTimeout(() => {
  console.log('Timeout fired');
}, 3000);

start(); // Start timeout
clear(); // Cancel timeout
```

### useMediaQuery

```tsx
import { useMediaQuery } from '@mantine/hooks';

const isMobile = useMediaQuery('(max-width: 768px)');
const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');
const isLandscape = useMediaQuery('(orientation: landscape)');

if (isMobile) {
  return <MobileLayout />;
}
```

### useLocalStorage

```tsx
import { useLocalStorage } from '@mantine/hooks';

const [value, setValue, removeValue] = useLocalStorage({
  key: 'user-settings',
  defaultValue: { theme: 'dark', fontSize: 14 },
});

// Serialize custom types
const [value, setValue] = useLocalStorage({
  key: 'date',
  serialize: (date) => date.toISOString(),
  deserialize: (str) => new Date(str),
});
```

### useSessionStorage

```tsx
import { useSessionStorage } from '@mantine/hooks';

const [value, setValue] = useSessionStorage({
  key: 'session-data',
  defaultValue: null,
});
```

### useHash

```tsx
import { useHash } from '@mantine/hooks';

const [hash, setHash] = useHash();
// hash: current URL hash without #
// setHash('section-2') -> URL becomes #section-2
```

### useNetwork

```tsx
import { useNetwork } from '@mantine/hooks';

const network = useNetwork();
// network.online: boolean
// network.downlink: number (Mbps)
// network.effectiveType: '4g' | '3g' | '2g' | 'slow-2g'
// network.rtt: number (round trip time)
// network.saveData: boolean
```

### useOs

```tsx
import { useOs } from '@mantine/hooks';

const os = useOs();
// 'undetermined' | 'macos' | 'ios' | 'windows' | 'android' | 'linux'
```

### usePageLeave

```tsx
import { usePageLeave } from '@mantine/hooks';

usePageLeave(() => {
  console.log('User left the page');
});
```

### useReducedMotion

```tsx
import { useReducedMotion } from '@mantine/hooks';

const reduceMotion = useReducedMotion();

// Disable animations if user prefers reduced motion
const animation = reduceMotion ? {} : { transition: 'all 0.3s' };
```

### useScrollIntoView

```tsx
import { useScrollIntoView } from '@mantine/hooks';

const { scrollIntoView, targetRef } = useScrollIntoView<HTMLDivElement>({
  offset: 60,
  duration: 500,
});

<button onClick={() => scrollIntoView({ alignment: 'center' })}>
  Scroll to target
</button>
<div ref={targetRef}>Target element</div>
```

### useLogger

```tsx
import { useLogger } from '@mantine/hooks';

// Development debugging
useLogger('MyComponent', [prop1, prop2, state]);
// Logs: [MyComponent] mounted, [MyComponent] updated (prop1, prop2)
```

### useForceUpdate

```tsx
import { useForceUpdate } from '@mantine/hooks';

const forceUpdate = useForceUpdate();

// Force re-render
<Button onClick={forceUpdate}>Force Update</Button>
```

### useId

```tsx
import { useId } from '@mantine/hooks';

const id = useId();
// Generates unique ID for accessibility attributes

<label htmlFor={id}>Label</label>
<input id={id} />
```

### useMergedRef

```tsx
import { useMergedRef } from '@mantine/hooks';

function Component({ ref, ...props }) {
  const myRef = useRef();
  const mergedRef = useMergedRef(ref, myRef);

  return <div ref={mergedRef} {...props} />;
}
```

### useEyeDropper

```tsx
import { useEyeDropper } from '@mantine/hooks';

const { supported, open } = useEyeDropper();

const pickColor = async () => {
  const { sRGBHex } = await open();
  setColor(sRGBHex);
};
```

### usePwa

```tsx
import { usePwa } from '@mantine/hooks';

const { isPwa, isStandalone } = usePwa();
// isPwa: running as PWA
// isStandalone: running in standalone mode
```

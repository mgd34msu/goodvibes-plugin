# Headless UI Components Reference

Complete API for all Headless UI components.

## Menu

### Components

```tsx
import {
  Menu,
  MenuButton,
  MenuItems,
  MenuItem,
  MenuSeparator,
  MenuSection,
  MenuHeading,
} from '@headlessui/react'
```

### Menu Props

| Prop | Type | Description |
|------|------|-------------|
| `as` | ElementType | Render as different element |

### MenuButton Props

| Prop | Type | Description |
|------|------|-------------|
| `as` | ElementType | Default: `button` |
| `disabled` | boolean | Disable button |

### MenuItems Props

| Prop | Type | Description |
|------|------|-------------|
| `anchor` | string | Position: `"bottom"`, `"top"`, `"left"`, `"right"` with `start`/`end` |
| `transition` | boolean | Enable transitions |
| `static` | boolean | Always render (for Framer Motion) |
| `unmount` | boolean | Remove from DOM when closed |
| `portal` | boolean | Render in portal |
| `modal` | boolean | Modal behavior |

### MenuItem Props

| Prop | Type | Description |
|------|------|-------------|
| `disabled` | boolean | Disable item |
| `as` | ElementType | Render element |

### Data Attributes

```css
/* MenuButton */
[data-open] { } /* Menu is open */
[data-focus] { }
[data-hover] { }
[data-active] { }
[data-disabled] { }

/* MenuItem */
[data-focus] { } /* Keyboard/mouse focus */
[data-disabled] { }
```

## Dialog

### Components

```tsx
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  DialogBackdrop,
  Description,
  CloseButton,
} from '@headlessui/react'
```

### Dialog Props

| Prop | Type | Description |
|------|------|-------------|
| `open` | boolean | Control visibility |
| `onClose` | function | Called when dialog should close |
| `role` | `"dialog"` \| `"alertdialog"` | ARIA role |
| `autoFocus` | boolean | Auto focus first element |

### DialogPanel Props

| Prop | Type | Description |
|------|------|-------------|
| `transition` | boolean | Enable transitions |
| `as` | ElementType | Render element |

### DialogBackdrop Props

| Prop | Type | Description |
|------|------|-------------|
| `transition` | boolean | Enable transitions |
| `as` | ElementType | Render element |

### Focus Management

```tsx
// Auto-focus specific element
<Dialog open={isOpen} onClose={close}>
  <DialogPanel>
    <input autoFocus /> {/* Focused when dialog opens */}
  </DialogPanel>
</Dialog>

// Or use data attribute
<button data-autofocus>Focus me</button>
```

## Listbox

### Components

```tsx
import {
  Listbox,
  ListboxButton,
  ListboxOptions,
  ListboxOption,
  ListboxSelectedOption,
} from '@headlessui/react'
```

### Listbox Props

| Prop | Type | Description |
|------|------|-------------|
| `value` | any | Selected value |
| `onChange` | function | Selection handler |
| `defaultValue` | any | Uncontrolled default |
| `by` | string \| function | Compare objects |
| `multiple` | boolean | Allow multiple selection |
| `disabled` | boolean | Disable entire listbox |
| `horizontal` | boolean | Horizontal layout |
| `name` | string | Form field name |

### ListboxOptions Props

| Prop | Type | Description |
|------|------|-------------|
| `anchor` | string | Positioning |
| `transition` | boolean | Enable transitions |
| `static` | boolean | Always render |
| `portal` | boolean | Render in portal |

### ListboxOption Props

| Prop | Type | Description |
|------|------|-------------|
| `value` | any | Option value |
| `disabled` | boolean | Disable option |

### Object Comparison

```tsx
// By field name
<Listbox by="id" value={selected} onChange={setSelected}>

// By function
<Listbox by={(a, b) => a.id === b.id} value={selected} onChange={setSelected}>
```

## Combobox

### Components

```tsx
import {
  Combobox,
  ComboboxInput,
  ComboboxButton,
  ComboboxOptions,
  ComboboxOption,
} from '@headlessui/react'
```

### Combobox Props

| Prop | Type | Description |
|------|------|-------------|
| `value` | any | Selected value |
| `onChange` | function | Selection handler |
| `multiple` | boolean | Multiple selection |
| `immediate` | boolean | Open on focus |
| `virtual` | object | Virtual scrolling config |
| `by` | string \| function | Compare objects |
| `name` | string | Form field name |

### ComboboxInput Props

| Prop | Type | Description |
|------|------|-------------|
| `displayValue` | function | Format selected value |
| `onChange` | function | Input change handler |
| `autoFocus` | boolean | Auto focus |

### Virtual Scrolling

```tsx
<Combobox virtual={{ options: filteredPeople }}>
  <ComboboxInput />
  <ComboboxOptions>
    {({ option }) => (
      <ComboboxOption value={option}>
        {option.name}
      </ComboboxOption>
    )}
  </ComboboxOptions>
</Combobox>
```

## Switch

### Components

```tsx
import {
  Switch,
  Field,
  Label,
  Description,
} from '@headlessui/react'
```

### Switch Props

| Prop | Type | Description |
|------|------|-------------|
| `checked` | boolean | Toggle state |
| `onChange` | function | Change handler |
| `defaultChecked` | boolean | Uncontrolled default |
| `disabled` | boolean | Disable switch |
| `name` | string | Form field name |
| `value` | string | Form value |

### Data Attributes

```css
[data-checked] { }
[data-disabled] { }
[data-focus] { }
[data-hover] { }
[data-active] { }
```

## Tabs

### Components

```tsx
import {
  TabGroup,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
} from '@headlessui/react'
```

### TabGroup Props

| Prop | Type | Description |
|------|------|-------------|
| `selectedIndex` | number | Controlled selection |
| `onChange` | function | Selection handler |
| `defaultIndex` | number | Initial selection |
| `vertical` | boolean | Vertical layout |
| `manual` | boolean | Manual activation |

### Tab Props

| Prop | Type | Description |
|------|------|-------------|
| `disabled` | boolean | Disable tab |
| `as` | ElementType | Render element |

### Data Attributes

```css
/* Tab */
[data-selected] { }
[data-hover] { }
[data-focus] { }
[data-disabled] { }

/* TabPanel */
[data-selected] { }
```

## Popover

### Components

```tsx
import {
  Popover,
  PopoverButton,
  PopoverPanel,
  PopoverBackdrop,
  PopoverGroup,
  CloseButton,
} from '@headlessui/react'
```

### PopoverPanel Props

| Prop | Type | Description |
|------|------|-------------|
| `anchor` | string | Positioning |
| `focus` | boolean | Focus trap |
| `transition` | boolean | Enable transitions |
| `static` | boolean | Always render |

## Disclosure

### Components

```tsx
import {
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
} from '@headlessui/react'
```

### Usage

```tsx
<Disclosure>
  <DisclosureButton className="flex justify-between w-full px-4 py-2 bg-gray-100">
    <span>What is your refund policy?</span>
    <ChevronDownIcon className="w-5 h-5 data-[open]:rotate-180" />
  </DisclosureButton>
  <DisclosurePanel className="px-4 py-2 text-gray-600">
    We offer a full refund within 30 days of purchase.
  </DisclosurePanel>
</Disclosure>
```

## Radio Group

### Components

```tsx
import {
  RadioGroup,
  Radio,
  Field,
  Label,
  Description,
} from '@headlessui/react'
```

### Usage

```tsx
<RadioGroup value={selected} onChange={setSelected}>
  {plans.map((plan) => (
    <Field key={plan.name} className="flex items-center gap-2">
      <Radio
        value={plan}
        className="
          w-4 h-4 rounded-full border
          data-[checked]:border-blue-500
          data-[checked]:bg-blue-500
        "
      />
      <Label>{plan.name}</Label>
      <Description className="text-sm text-gray-500">
        {plan.description}
      </Description>
    </Field>
  ))}
</RadioGroup>
```

## Checkbox

### Components

```tsx
import {
  Checkbox,
  Field,
  Label,
  Description,
} from '@headlessui/react'
```

### Usage

```tsx
<Field className="flex items-center gap-2">
  <Checkbox
    checked={enabled}
    onChange={setEnabled}
    className="
      w-4 h-4 rounded border
      data-[checked]:bg-blue-500
      data-[checked]:border-blue-500
    "
  >
    <CheckIcon className="w-3 h-3 text-white opacity-0 data-[checked]:opacity-100" />
  </Checkbox>
  <Label>Enable feature</Label>
</Field>
```

## Input

### Components

```tsx
import {
  Input,
  Textarea,
  Field,
  Label,
  Description,
} from '@headlessui/react'
```

### Usage

```tsx
<Field>
  <Label>Email</Label>
  <Description>We'll never share your email.</Description>
  <Input
    type="email"
    name="email"
    className="
      w-full px-3 py-2 border rounded
      data-[focus]:border-blue-500
      data-[invalid]:border-red-500
    "
  />
</Field>
```

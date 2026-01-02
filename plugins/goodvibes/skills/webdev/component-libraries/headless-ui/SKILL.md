---
name: headless-ui
description: Builds accessible UI components with Headless UI primitives for React and Vue. Use when creating custom-styled dropdowns, modals, tabs, or other interactive components with full accessibility support.
---

# Headless UI

Unstyled, accessible UI primitives for React and Vue from the Tailwind CSS team.

## Quick Start

```bash
npm install @headlessui/react
```

```tsx
import { Menu, MenuButton, MenuItems, MenuItem } from '@headlessui/react'

function Dropdown() {
  return (
    <Menu>
      <MenuButton className="px-4 py-2 bg-blue-500 text-white rounded">
        Options
      </MenuButton>
      <MenuItems
        anchor="bottom"
        className="bg-white shadow-lg rounded-lg p-1"
      >
        <MenuItem>
          <a className="block px-4 py-2 data-[focus]:bg-blue-100" href="/settings">
            Settings
          </a>
        </MenuItem>
        <MenuItem>
          <a className="block px-4 py-2 data-[focus]:bg-blue-100" href="/profile">
            Profile
          </a>
        </MenuItem>
      </MenuItems>
    </Menu>
  )
}
```

## Core Concepts

### Data Attributes for Styling

Headless UI exposes component state via data attributes:

```tsx
// Style with Tailwind data modifiers
<MenuItem>
  <button className="
    px-4 py-2 w-full text-left
    data-[focus]:bg-blue-100
    data-[disabled]:opacity-50
  ">
    Action
  </button>
</MenuItem>

// Or CSS selectors
<style>
.menu-item[data-focus] { background: #eff6ff; }
.menu-item[data-selected] { font-weight: bold; }
.menu-item[data-disabled] { opacity: 0.5; }
</style>
```

### Render Props

Access state programmatically:

```tsx
<MenuItem>
  {({ focus, disabled }) => (
    <button
      className={`px-4 py-2 ${focus ? 'bg-blue-100' : ''}`}
      disabled={disabled}
    >
      Action
    </button>
  )}
</MenuItem>
```

## Components

### Menu (Dropdown)

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

function UserMenu() {
  return (
    <Menu>
      <MenuButton className="flex items-center gap-2">
        <img src="/avatar.jpg" className="w-8 h-8 rounded-full" />
        <span>John Doe</span>
      </MenuButton>

      <MenuItems
        anchor="bottom end"
        className="w-52 bg-white rounded-xl shadow-lg p-1"
      >
        <MenuSection>
          <MenuHeading className="px-3 py-1 text-xs text-gray-500">
            Account
          </MenuHeading>
          <MenuItem>
            <a href="/profile" className="block px-3 py-2 data-[focus]:bg-gray-100 rounded">
              Profile
            </a>
          </MenuItem>
          <MenuItem>
            <a href="/settings" className="block px-3 py-2 data-[focus]:bg-gray-100 rounded">
              Settings
            </a>
          </MenuItem>
        </MenuSection>

        <MenuSeparator className="my-1 h-px bg-gray-200" />

        <MenuItem>
          <button className="w-full text-left px-3 py-2 text-red-600 data-[focus]:bg-red-50 rounded">
            Sign out
          </button>
        </MenuItem>
      </MenuItems>
    </Menu>
  )
}
```

### Dialog (Modal)

```tsx
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  DialogBackdrop,
  Description,
  CloseButton,
} from '@headlessui/react'
import { useState } from 'react'

function Modal() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <button onClick={() => setIsOpen(true)}>Open dialog</button>

      <Dialog open={isOpen} onClose={() => setIsOpen(false)}>
        <DialogBackdrop className="fixed inset-0 bg-black/30" />

        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="bg-white rounded-xl p-6 max-w-md w-full shadow-xl">
            <DialogTitle className="text-lg font-semibold">
              Delete account
            </DialogTitle>
            <Description className="mt-2 text-gray-600">
              This will permanently delete your account and all data.
            </Description>

            <div className="mt-4 flex gap-3 justify-end">
              <CloseButton className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">
                Cancel
              </CloseButton>
              <button
                onClick={() => setIsOpen(false)}
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
              >
                Delete
              </button>
            </div>
          </DialogPanel>
        </div>
      </Dialog>
    </>
  )
}
```

### Listbox (Select)

```tsx
import {
  Listbox,
  ListboxButton,
  ListboxOptions,
  ListboxOption,
} from '@headlessui/react'
import { useState } from 'react'

const people = [
  { id: 1, name: 'Wade Cooper' },
  { id: 2, name: 'Arlene Mccoy' },
  { id: 3, name: 'Devon Webb' },
]

function Select() {
  const [selected, setSelected] = useState(people[0])

  return (
    <Listbox value={selected} onChange={setSelected}>
      <ListboxButton className="w-full px-4 py-2 text-left bg-white border rounded-lg">
        {selected.name}
      </ListboxButton>

      <ListboxOptions
        anchor="bottom"
        className="w-[var(--button-width)] bg-white border rounded-lg shadow-lg mt-1"
      >
        {people.map((person) => (
          <ListboxOption
            key={person.id}
            value={person}
            className="px-4 py-2 cursor-pointer data-[focus]:bg-blue-100 data-[selected]:font-semibold"
          >
            {person.name}
          </ListboxOption>
        ))}
      </ListboxOptions>
    </Listbox>
  )
}
```

### Combobox (Autocomplete)

```tsx
import {
  Combobox,
  ComboboxInput,
  ComboboxButton,
  ComboboxOptions,
  ComboboxOption,
} from '@headlessui/react'
import { useState } from 'react'

function Autocomplete() {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(null)

  const filtered = query === ''
    ? people
    : people.filter((p) =>
        p.name.toLowerCase().includes(query.toLowerCase())
      )

  return (
    <Combobox value={selected} onChange={setSelected}>
      <div className="relative">
        <ComboboxInput
          className="w-full px-4 py-2 border rounded-lg"
          displayValue={(person) => person?.name}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people..."
        />
        <ComboboxButton className="absolute right-2 top-2">
          <ChevronDownIcon className="w-5 h-5" />
        </ComboboxButton>
      </div>

      <ComboboxOptions className="mt-1 bg-white border rounded-lg shadow-lg">
        {filtered.length === 0 && query !== '' ? (
          <div className="px-4 py-2 text-gray-500">No results found</div>
        ) : (
          filtered.map((person) => (
            <ComboboxOption
              key={person.id}
              value={person}
              className="px-4 py-2 data-[focus]:bg-blue-100"
            >
              {person.name}
            </ComboboxOption>
          ))
        )}
      </ComboboxOptions>
    </Combobox>
  )
}
```

### Switch (Toggle)

```tsx
import { Switch, Field, Label, Description } from '@headlessui/react'
import { useState } from 'react'

function Toggle() {
  const [enabled, setEnabled] = useState(false)

  return (
    <Field className="flex items-center justify-between">
      <span className="flex flex-col">
        <Label className="font-medium">Enable notifications</Label>
        <Description className="text-sm text-gray-500">
          Receive updates via email
        </Description>
      </span>

      <Switch
        checked={enabled}
        onChange={setEnabled}
        className="
          relative h-6 w-11 rounded-full
          bg-gray-200 data-[checked]:bg-blue-500
          transition-colors
        "
      >
        <span
          className="
            inline-block h-4 w-4 rounded-full bg-white
            translate-x-1 data-[checked]:translate-x-6
            transition-transform
          "
        />
      </Switch>
    </Field>
  )
}
```

### Tabs

```tsx
import { TabGroup, TabList, Tab, TabPanels, TabPanel } from '@headlessui/react'

function TabsExample() {
  return (
    <TabGroup>
      <TabList className="flex gap-1 bg-gray-100 p-1 rounded-lg">
        <Tab className="px-4 py-2 rounded-md data-[selected]:bg-white data-[selected]:shadow">
          Account
        </Tab>
        <Tab className="px-4 py-2 rounded-md data-[selected]:bg-white data-[selected]:shadow">
          Notifications
        </Tab>
        <Tab className="px-4 py-2 rounded-md data-[selected]:bg-white data-[selected]:shadow">
          Security
        </Tab>
      </TabList>

      <TabPanels className="mt-4">
        <TabPanel>Account settings content...</TabPanel>
        <TabPanel>Notification preferences...</TabPanel>
        <TabPanel>Security options...</TabPanel>
      </TabPanels>
    </TabGroup>
  )
}
```

## Transitions

### Built-in Transitions

```tsx
<MenuItems
  transition
  className="
    origin-top-right
    transition duration-200 ease-out
    data-[closed]:scale-95 data-[closed]:opacity-0
  "
>
  {/* items */}
</MenuItems>
```

### With Framer Motion

```tsx
import { AnimatePresence, motion } from 'framer-motion'

<Menu>
  {({ open }) => (
    <>
      <MenuButton>Options</MenuButton>
      <AnimatePresence>
        {open && (
          <MenuItems
            static
            as={motion.div}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
          >
            {/* items */}
          </MenuItems>
        )}
      </AnimatePresence>
    </>
  )}
</Menu>
```

## Positioning

Use `anchor` prop for dropdown positioning:

```tsx
<MenuItems anchor="bottom start">    {/* Below, aligned left */}
<MenuItems anchor="bottom end">      {/* Below, aligned right */}
<MenuItems anchor="top start">       {/* Above, aligned left */}
<MenuItems anchor="top end">         {/* Above, aligned right */}
<MenuItems anchor="left">            {/* Left side */}
<MenuItems anchor="right">           {/* Right side */}
```

## Form Integration

```tsx
// Automatic hidden input for forms
<Listbox name="assignee" value={selected} onChange={setSelected}>
  {/* ... */}
</Listbox>

// Multiple selection
<Listbox multiple value={selectedPeople} onChange={setSelectedPeople}>
  {/* ... */}
</Listbox>
```

## Keyboard Navigation

| Component | Keys |
|-----------|------|
| Menu | Enter/Space (open), Arrow keys (navigate), Esc (close) |
| Dialog | Esc (close), Tab (cycle focus) |
| Listbox | Arrow keys (navigate), Enter/Space (select), Esc (close) |
| Combobox | Arrow keys (navigate), Enter (select), Esc (close) |
| Tabs | Arrow keys (navigate), Home/End (first/last) |
| Switch | Space (toggle) |

## Best Practices

1. **Always style states** - Use `data-[focus]`, `data-[selected]`, `data-[disabled]`
2. **Provide transitions** - Smooth open/close animations improve UX
3. **Use semantic structure** - DialogTitle, Description for accessibility
4. **Handle keyboard** - All components have built-in keyboard support
5. **Test with screen readers** - ARIA attributes are automatic

## Reference Files

- [references/components.md](references/components.md) - Full component API
- [references/patterns.md](references/patterns.md) - Common patterns

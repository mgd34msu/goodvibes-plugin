# Headless UI Patterns

Common implementation patterns for Headless UI components.

## Custom Select with Search

```tsx
import {
  Combobox,
  ComboboxInput,
  ComboboxButton,
  ComboboxOptions,
  ComboboxOption,
} from '@headlessui/react'
import { useState } from 'react'
import { CheckIcon, ChevronUpDownIcon } from '@heroicons/react/20/solid'

interface Person {
  id: number
  name: string
  avatar: string
}

function SearchableSelect({ people }: { people: Person[] }) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Person | null>(null)

  const filtered =
    query === ''
      ? people
      : people.filter((person) =>
          person.name.toLowerCase().includes(query.toLowerCase())
        )

  return (
    <Combobox value={selected} onChange={setSelected} onClose={() => setQuery('')}>
      <div className="relative">
        <div className="relative w-full">
          <ComboboxInput
            className="w-full rounded-lg border py-2 pl-3 pr-10"
            displayValue={(person: Person) => person?.name}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Select a person..."
          />
          <ComboboxButton className="absolute inset-y-0 right-0 flex items-center pr-2">
            <ChevronUpDownIcon className="h-5 w-5 text-gray-400" />
          </ComboboxButton>
        </div>

        <ComboboxOptions
          transition
          className="
            absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg bg-white
            shadow-lg ring-1 ring-black/5
            transition duration-100 ease-in
            data-[closed]:opacity-0
          "
        >
          {filtered.length === 0 && query !== '' ? (
            <div className="px-4 py-2 text-gray-500">No results found</div>
          ) : (
            filtered.map((person) => (
              <ComboboxOption
                key={person.id}
                value={person}
                className="
                  relative cursor-pointer select-none py-2 pl-10 pr-4
                  data-[focus]:bg-blue-100
                "
              >
                {({ selected }) => (
                  <>
                    <span className={selected ? 'font-semibold' : ''}>
                      {person.name}
                    </span>
                    {selected && (
                      <CheckIcon className="absolute left-3 top-2.5 h-5 w-5 text-blue-600" />
                    )}
                  </>
                )}
              </ComboboxOption>
            ))
          )}
        </ComboboxOptions>
      </div>
    </Combobox>
  )
}
```

## Command Palette

```tsx
import {
  Dialog,
  DialogPanel,
  Combobox,
  ComboboxInput,
  ComboboxOptions,
  ComboboxOption,
} from '@headlessui/react'
import { useState, useEffect } from 'react'

interface Command {
  id: string
  name: string
  shortcut?: string
  action: () => void
}

function CommandPalette({ commands }: { commands: Command[] }) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')

  // Cmd+K to open
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setIsOpen(true)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  const filtered = query === ''
    ? commands
    : commands.filter((cmd) =>
        cmd.name.toLowerCase().includes(query.toLowerCase())
      )

  return (
    <Dialog
      open={isOpen}
      onClose={() => {
        setIsOpen(false)
        setQuery('')
      }}
    >
      <div className="fixed inset-0 bg-black/50" />

      <div className="fixed inset-0 flex items-start justify-center pt-[20vh]">
        <DialogPanel className="w-full max-w-lg bg-white rounded-xl shadow-2xl overflow-hidden">
          <Combobox
            onChange={(cmd: Command) => {
              cmd.action()
              setIsOpen(false)
              setQuery('')
            }}
          >
            <ComboboxInput
              className="w-full px-4 py-3 border-b text-lg"
              placeholder="Type a command..."
              onChange={(e) => setQuery(e.target.value)}
            />

            <ComboboxOptions static className="max-h-80 overflow-y-auto p-2">
              {filtered.length === 0 ? (
                <div className="px-4 py-2 text-gray-500">No commands found</div>
              ) : (
                filtered.map((cmd) => (
                  <ComboboxOption
                    key={cmd.id}
                    value={cmd}
                    className="
                      flex items-center justify-between px-4 py-2 rounded-lg
                      cursor-pointer data-[focus]:bg-blue-100
                    "
                  >
                    <span>{cmd.name}</span>
                    {cmd.shortcut && (
                      <kbd className="px-2 py-1 text-xs bg-gray-100 rounded">
                        {cmd.shortcut}
                      </kbd>
                    )}
                  </ComboboxOption>
                ))
              )}
            </ComboboxOptions>
          </Combobox>
        </DialogPanel>
      </div>
    </Dialog>
  )
}
```

## Confirmation Dialog

```tsx
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Description,
} from '@headlessui/react'
import { useState } from 'react'

interface ConfirmDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'warning' | 'info'
}

function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
}: ConfirmDialogProps) {
  const variantStyles = {
    danger: 'bg-red-500 hover:bg-red-600',
    warning: 'bg-yellow-500 hover:bg-yellow-600',
    info: 'bg-blue-500 hover:bg-blue-600',
  }

  return (
    <Dialog open={isOpen} onClose={onClose}>
      <div className="fixed inset-0 bg-black/30" />

      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel
          transition
          className="
            w-full max-w-md bg-white rounded-xl p-6 shadow-xl
            transition duration-200 ease-out
            data-[closed]:scale-95 data-[closed]:opacity-0
          "
        >
          <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
          <Description className="mt-2 text-gray-600">{message}</Description>

          <div className="mt-6 flex gap-3 justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              {cancelText}
            </button>
            <button
              onClick={() => {
                onConfirm()
                onClose()
              }}
              className={`px-4 py-2 text-white rounded-lg ${variantStyles[variant]}`}
            >
              {confirmText}
            </button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  )
}

// Usage with hook
function useConfirmDialog() {
  const [state, setState] = useState<{
    isOpen: boolean
    resolve: ((value: boolean) => void) | null
  }>({ isOpen: false, resolve: null })

  const confirm = (props: Omit<ConfirmDialogProps, 'isOpen' | 'onClose' | 'onConfirm'>) => {
    return new Promise<boolean>((resolve) => {
      setState({ isOpen: true, resolve })
    })
  }

  return { confirm, dialogProps: state }
}
```

## Multi-Select with Tags

```tsx
import {
  Listbox,
  ListboxButton,
  ListboxOptions,
  ListboxOption,
} from '@headlessui/react'
import { useState } from 'react'
import { XMarkIcon, CheckIcon } from '@heroicons/react/20/solid'

interface Tag {
  id: string
  name: string
  color: string
}

function MultiSelect({ tags }: { tags: Tag[] }) {
  const [selected, setSelected] = useState<Tag[]>([])

  const removeTag = (tagId: string) => {
    setSelected(selected.filter((t) => t.id !== tagId))
  }

  return (
    <Listbox value={selected} onChange={setSelected} multiple>
      <div className="relative">
        <ListboxButton className="w-full min-h-[42px] px-3 py-2 text-left border rounded-lg">
          {selected.length === 0 ? (
            <span className="text-gray-400">Select tags...</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {selected.map((tag) => (
                <span
                  key={tag.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-sm"
                  style={{ backgroundColor: tag.color + '20', color: tag.color }}
                >
                  {tag.name}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      removeTag(tag.id)
                    }}
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </ListboxButton>

        <ListboxOptions
          transition
          className="
            absolute z-10 mt-1 w-full bg-white rounded-lg shadow-lg
            max-h-60 overflow-auto
            transition duration-100 ease-out
            data-[closed]:opacity-0
          "
        >
          {tags.map((tag) => (
            <ListboxOption
              key={tag.id}
              value={tag}
              className="
                flex items-center justify-between px-4 py-2
                cursor-pointer data-[focus]:bg-gray-100
              "
            >
              {({ selected }) => (
                <>
                  <span className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: tag.color }}
                    />
                    {tag.name}
                  </span>
                  {selected && <CheckIcon className="w-5 h-5 text-blue-600" />}
                </>
              )}
            </ListboxOption>
          ))}
        </ListboxOptions>
      </div>
    </Listbox>
  )
}
```

## Nested Navigation Menu

```tsx
import { Menu, MenuButton, MenuItems, MenuItem } from '@headlessui/react'
import { ChevronRightIcon } from '@heroicons/react/20/solid'

interface NavItem {
  label: string
  href?: string
  children?: NavItem[]
}

function NavMenu({ items }: { items: NavItem[] }) {
  return (
    <nav className="flex gap-4">
      {items.map((item) =>
        item.children ? (
          <Menu key={item.label}>
            <MenuButton className="flex items-center gap-1 px-3 py-2 hover:bg-gray-100 rounded">
              {item.label}
              <ChevronRightIcon className="w-4 h-4 rotate-90" />
            </MenuButton>

            <MenuItems
              anchor="bottom start"
              className="w-56 bg-white rounded-lg shadow-lg p-1"
            >
              {item.children.map((child) => (
                <MenuItem key={child.label}>
                  <a
                    href={child.href}
                    className="block px-4 py-2 rounded data-[focus]:bg-gray-100"
                  >
                    {child.label}
                  </a>
                </MenuItem>
              ))}
            </MenuItems>
          </Menu>
        ) : (
          <a
            key={item.label}
            href={item.href}
            className="px-3 py-2 hover:bg-gray-100 rounded"
          >
            {item.label}
          </a>
        )
      )}
    </nav>
  )
}
```

## Accessible Form with Field Components

```tsx
import {
  Field,
  Label,
  Description,
  Input,
  Textarea,
  Select,
  Switch,
  Checkbox,
} from '@headlessui/react'

function ContactForm() {
  return (
    <form className="space-y-6">
      <Field>
        <Label className="block text-sm font-medium">Name</Label>
        <Input
          name="name"
          className="
            mt-1 block w-full rounded-lg border px-3 py-2
            data-[focus]:border-blue-500 data-[focus]:ring-1 data-[focus]:ring-blue-500
          "
        />
      </Field>

      <Field>
        <Label className="block text-sm font-medium">Email</Label>
        <Description className="text-sm text-gray-500">
          We'll use this to respond to your message
        </Description>
        <Input
          type="email"
          name="email"
          className="
            mt-1 block w-full rounded-lg border px-3 py-2
            data-[focus]:border-blue-500
            data-[invalid]:border-red-500
          "
        />
      </Field>

      <Field>
        <Label className="block text-sm font-medium">Subject</Label>
        <Select
          name="subject"
          className="mt-1 block w-full rounded-lg border px-3 py-2"
        >
          <option value="general">General Inquiry</option>
          <option value="support">Support</option>
          <option value="sales">Sales</option>
        </Select>
      </Field>

      <Field>
        <Label className="block text-sm font-medium">Message</Label>
        <Textarea
          name="message"
          rows={4}
          className="
            mt-1 block w-full rounded-lg border px-3 py-2
            data-[focus]:border-blue-500
          "
        />
      </Field>

      <Field className="flex items-center gap-3">
        <Checkbox
          name="subscribe"
          className="
            h-5 w-5 rounded border
            data-[checked]:bg-blue-500 data-[checked]:border-blue-500
          "
        />
        <Label>Subscribe to newsletter</Label>
      </Field>

      <Field className="flex items-center justify-between">
        <div>
          <Label className="font-medium">Priority support</Label>
          <Description className="text-sm text-gray-500">
            Get faster response times
          </Description>
        </div>
        <Switch
          name="priority"
          className="
            relative h-6 w-11 rounded-full bg-gray-200
            data-[checked]:bg-blue-500
          "
        />
      </Field>

      <button
        type="submit"
        className="w-full py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
      >
        Send Message
      </button>
    </form>
  )
}
```

## Preventing Flash on SSR

```tsx
// For Next.js or other SSR frameworks
// Add to _document.tsx or layout

<script
  dangerouslySetInnerHTML={{
    __html: `
      // Prevent flash of unstyled content for dialogs/menus
      document.documentElement.classList.add('js-loaded');
    `,
  }}
/>

// CSS
.js-loaded [data-headlessui-state] {
  /* Styles only apply after JS loads */
}
```

## Close on Route Change (Next.js)

```tsx
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'

function useCloseOnRouteChange(close: () => void) {
  const pathname = usePathname()

  useEffect(() => {
    close()
  }, [pathname, close])
}

// Usage in Menu
function NavMenu() {
  return (
    <Menu>
      {({ close }) => {
        useCloseOnRouteChange(close)

        return (
          <>
            <MenuButton>Menu</MenuButton>
            <MenuItems>
              <MenuItem>
                <Link href="/page">Navigate</Link>
              </MenuItem>
            </MenuItems>
          </>
        )
      }}
    </Menu>
  )
}
```

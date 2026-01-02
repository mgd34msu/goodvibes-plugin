# Ark UI Patterns

Common implementation patterns for Ark UI.

## Styling Patterns

### With Tailwind CSS

```tsx
import { Dialog, Portal } from '@ark-ui/react'

// Base styles with Tailwind
const dialogStyles = {
  backdrop: 'fixed inset-0 bg-black/50 backdrop-blur-sm',
  positioner: 'fixed inset-0 flex items-center justify-center p-4',
  content: `
    bg-white rounded-xl shadow-xl max-w-md w-full p-6
    data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95
    data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:zoom-out-95
  `,
}

<Dialog.Root>
  <Dialog.Trigger className="px-4 py-2 bg-blue-500 text-white rounded">
    Open
  </Dialog.Trigger>
  <Portal>
    <Dialog.Backdrop className={dialogStyles.backdrop} />
    <Dialog.Positioner className={dialogStyles.positioner}>
      <Dialog.Content className={dialogStyles.content}>
        <Dialog.Title className="text-lg font-semibold">Title</Dialog.Title>
        <Dialog.Description className="mt-2 text-gray-600">
          Description
        </Dialog.Description>
      </Dialog.Content>
    </Dialog.Positioner>
  </Portal>
</Dialog.Root>
```

### With CSS Modules

```css
/* dialog.module.css */
.backdrop {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.5);
}

.content {
  background: white;
  border-radius: 12px;
  padding: 24px;
  max-width: 400px;
  width: 100%;
}

.content[data-state="open"] {
  animation: fadeIn 200ms ease-out;
}

.content[data-state="closed"] {
  animation: fadeOut 150ms ease-in;
}

@keyframes fadeIn {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}

@keyframes fadeOut {
  from { opacity: 1; transform: scale(1); }
  to { opacity: 0; transform: scale(0.95); }
}
```

```tsx
import styles from './dialog.module.css'

<Dialog.Backdrop className={styles.backdrop} />
<Dialog.Content className={styles.content}>
```

### With Styled Components

```tsx
import styled from 'styled-components'
import { Dialog } from '@ark-ui/react'

const StyledBackdrop = styled(Dialog.Backdrop)`
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.5);
`

const StyledContent = styled(Dialog.Content)`
  background: white;
  border-radius: 12px;
  padding: 24px;

  &[data-state='open'] {
    animation: fadeIn 200ms ease-out;
  }
`
```

## Component Composition

### Reusable Dialog Component

```tsx
import { Dialog, Portal } from '@ark-ui/react'
import { X } from 'lucide-react'
import { ReactNode } from 'react'

interface ModalProps {
  trigger: ReactNode
  title: string
  description?: string
  children: ReactNode
  actions?: ReactNode
}

export function Modal({ trigger, title, description, children, actions }: ModalProps) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-black/50" />
        <Dialog.Positioner className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Content className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between p-4 border-b">
              <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
              <Dialog.CloseTrigger className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </Dialog.CloseTrigger>
            </div>

            <div className="p-4">
              {description && (
                <Dialog.Description className="text-gray-600 mb-4">
                  {description}
                </Dialog.Description>
              )}
              {children}
            </div>

            {actions && (
              <div className="flex justify-end gap-2 p-4 border-t">
                {actions}
              </div>
            )}
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  )
}

// Usage
<Modal
  trigger={<Button>Open Modal</Button>}
  title="Confirm Action"
  description="Are you sure you want to proceed?"
  actions={
    <>
      <Dialog.CloseTrigger asChild>
        <Button variant="outline">Cancel</Button>
      </Dialog.CloseTrigger>
      <Button onClick={handleConfirm}>Confirm</Button>
    </>
  }
>
  <p>Modal content here</p>
</Modal>
```

### Reusable Select Component

```tsx
import { Select, Portal } from '@ark-ui/react'
import { Check, ChevronDown } from 'lucide-react'

interface SelectItem {
  label: string
  value: string
  disabled?: boolean
}

interface SelectFieldProps {
  label: string
  items: SelectItem[]
  placeholder?: string
  value?: string
  onChange?: (value: string) => void
}

export function SelectField({
  label,
  items,
  placeholder = 'Select...',
  value,
  onChange,
}: SelectFieldProps) {
  return (
    <Select.Root
      items={items}
      value={value ? [value] : undefined}
      onValueChange={(details) => onChange?.(details.value[0])}
    >
      <Select.Label className="block text-sm font-medium mb-1">{label}</Select.Label>
      <Select.Control>
        <Select.Trigger className="flex items-center justify-between w-full px-4 py-2 border rounded-lg hover:border-gray-400 focus:ring-2 focus:ring-blue-500">
          <Select.ValueText placeholder={placeholder} />
          <Select.Indicator>
            <ChevronDown className="w-4 h-4" />
          </Select.Indicator>
        </Select.Trigger>
      </Select.Control>
      <Portal>
        <Select.Positioner>
          <Select.Content className="bg-white shadow-lg rounded-lg border p-1 min-w-[200px]">
            {items.map((item) => (
              <Select.Item
                key={item.value}
                item={item}
                className="flex items-center justify-between px-3 py-2 rounded cursor-pointer hover:bg-gray-100 data-[highlighted]:bg-gray-100 data-[disabled]:opacity-50"
              >
                <Select.ItemText>{item.label}</Select.ItemText>
                <Select.ItemIndicator>
                  <Check className="w-4 h-4" />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Positioner>
      </Portal>
    </Select.Root>
  )
}
```

## Form Integration

### With React Hook Form

```tsx
import { useForm, Controller } from 'react-hook-form'
import { Select, Checkbox, Switch } from '@ark-ui/react'

interface FormData {
  country: string
  acceptTerms: boolean
  notifications: boolean
}

function Form() {
  const { control, handleSubmit } = useForm<FormData>()

  const onSubmit = (data: FormData) => {
    console.log(data)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Controller
        name="country"
        control={control}
        rules={{ required: 'Country is required' }}
        render={({ field, fieldState }) => (
          <Select.Root
            items={countries}
            value={field.value ? [field.value] : undefined}
            onValueChange={(details) => field.onChange(details.value[0])}
          >
            <Select.Label>Country</Select.Label>
            <Select.Control>
              <Select.Trigger className={fieldState.error ? 'border-red-500' : ''}>
                <Select.ValueText placeholder="Select country" />
              </Select.Trigger>
            </Select.Control>
            {/* ... */}
          </Select.Root>
        )}
      />

      <Controller
        name="acceptTerms"
        control={control}
        rules={{ required: 'You must accept terms' }}
        render={({ field }) => (
          <Checkbox.Root
            checked={field.value}
            onCheckedChange={(details) => field.onChange(details.checked)}
          >
            <Checkbox.Control>
              <Checkbox.Indicator>
                <Check />
              </Checkbox.Indicator>
            </Checkbox.Control>
            <Checkbox.Label>Accept terms</Checkbox.Label>
            <Checkbox.HiddenInput />
          </Checkbox.Root>
        )}
      />

      <Controller
        name="notifications"
        control={control}
        render={({ field }) => (
          <Switch.Root
            checked={field.value}
            onCheckedChange={(details) => field.onChange(details.checked)}
          >
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
            <Switch.Label>Enable notifications</Switch.Label>
            <Switch.HiddenInput />
          </Switch.Root>
        )}
      />

      <button type="submit">Submit</button>
    </form>
  )
}
```

### Native Form Submission

```tsx
<form action="/api/submit" method="POST">
  <Select.Root name="country" items={countries}>
    {/* Select automatically includes hidden input */}
    {/* ... */}
  </Select.Root>

  <Checkbox.Root name="acceptTerms">
    <Checkbox.Control>
      <Checkbox.Indicator><Check /></Checkbox.Indicator>
    </Checkbox.Control>
    <Checkbox.Label>Accept terms</Checkbox.Label>
    <Checkbox.HiddenInput /> {/* Required for form submission */}
  </Checkbox.Root>

  <button type="submit">Submit</button>
</form>
```

## Accessibility Patterns

### Focus Management

```tsx
import { Dialog, Portal } from '@ark-ui/react'

<Dialog.Root
  initialFocusEl={() => document.getElementById('email-input')}
  finalFocusEl={() => document.getElementById('trigger-button')}
>
  <Dialog.Trigger id="trigger-button">Open</Dialog.Trigger>
  <Portal>
    <Dialog.Content>
      <input id="email-input" type="email" placeholder="Email" />
    </Dialog.Content>
  </Portal>
</Dialog.Root>
```

### Keyboard Navigation

```tsx
import { Menu, Portal } from '@ark-ui/react'

<Menu.Root
  onSelect={(details) => {
    // Handle selection
    console.log('Selected:', details.value)
  }}
>
  <Menu.Trigger>Menu</Menu.Trigger>
  <Portal>
    <Menu.Content>
      {/* Arrow keys navigate, Enter/Space select, Escape closes */}
      <Menu.Item value="edit">Edit</Menu.Item>
      <Menu.Item value="copy">Copy</Menu.Item>
      <Menu.Item value="delete">Delete</Menu.Item>
    </Menu.Content>
  </Portal>
</Menu.Root>
```

### Screen Reader Announcements

```tsx
import { Toast, Toaster, createToaster } from '@ark-ui/react'

const toaster = createToaster({
  placement: 'bottom-end',
})

// Toasts are automatically announced to screen readers
toaster.create({
  title: 'Success',
  description: 'Your file has been saved',
  type: 'success',
})
```

## Animation Patterns

### CSS Transitions

```css
[data-scope="dialog"][data-part="backdrop"] {
  transition: opacity 200ms ease-out;
}

[data-scope="dialog"][data-part="backdrop"][data-state="closed"] {
  opacity: 0;
}

[data-scope="dialog"][data-part="content"] {
  transition: opacity 200ms ease-out, transform 200ms ease-out;
}

[data-scope="dialog"][data-part="content"][data-state="closed"] {
  opacity: 0;
  transform: scale(0.95);
}
```

### With Framer Motion

```tsx
import { Dialog, Portal } from '@ark-ui/react'
import { AnimatePresence, motion } from 'framer-motion'

function AnimatedDialog() {
  const [open, setOpen] = useState(false)

  return (
    <Dialog.Root open={open} onOpenChange={(details) => setOpen(details.open)}>
      <Dialog.Trigger>Open</Dialog.Trigger>
      <Portal>
        <AnimatePresence>
          {open && (
            <>
              <Dialog.Backdrop asChild>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 bg-black/50"
                />
              </Dialog.Backdrop>
              <Dialog.Positioner className="fixed inset-0 flex items-center justify-center">
                <Dialog.Content asChild>
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="bg-white rounded-xl p-6 max-w-md w-full"
                  >
                    Content
                  </motion.div>
                </Dialog.Content>
              </Dialog.Positioner>
            </>
          )}
        </AnimatePresence>
      </Portal>
    </Dialog.Root>
  )
}
```

## State Management

### Controlled Components

```tsx
import { useState } from 'react'
import { Accordion } from '@ark-ui/react'

function ControlledAccordion() {
  const [value, setValue] = useState<string[]>(['item-1'])

  return (
    <Accordion.Root
      value={value}
      onValueChange={(details) => setValue(details.value)}
    >
      {/* items */}
    </Accordion.Root>
  )
}
```

### With Zustand

```tsx
import { create } from 'zustand'
import { Dialog } from '@ark-ui/react'

interface ModalStore {
  isOpen: boolean
  open: () => void
  close: () => void
}

const useModalStore = create<ModalStore>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}))

function ModalWithZustand() {
  const { isOpen, close } = useModalStore()

  return (
    <Dialog.Root open={isOpen} onOpenChange={(details) => !details.open && close()}>
      {/* ... */}
    </Dialog.Root>
  )
}

// Trigger from anywhere
function TriggerButton() {
  const { open } = useModalStore()
  return <button onClick={open}>Open Modal</button>
}
```

## Server Components

```tsx
// Works with React Server Components
// Just ensure client interactivity is wrapped in 'use client'

// ServerComponent.tsx (RSC)
import { ClientAccordion } from './ClientAccordion'

export function ServerComponent() {
  const items = await fetchItems()
  return <ClientAccordion items={items} />
}

// ClientAccordion.tsx
'use client'

import { Accordion } from '@ark-ui/react'

export function ClientAccordion({ items }) {
  return (
    <Accordion.Root>
      {items.map((item) => (
        <Accordion.Item key={item.id} value={item.id}>
          {/* ... */}
        </Accordion.Item>
      ))}
    </Accordion.Root>
  )
}
```

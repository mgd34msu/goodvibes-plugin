# Chakra UI Components Reference

Complete component API for Chakra UI v3.

## Data Display

### Avatar

```tsx
import { Avatar, AvatarGroup } from '@chakra-ui/react'

<Avatar.Root size="lg">
  <Avatar.Image src="/user.jpg" />
  <Avatar.Fallback>JD</Avatar.Fallback>
</Avatar.Root>

<AvatarGroup max={3}>
  <Avatar.Root>
    <Avatar.Image src="/user1.jpg" />
  </Avatar.Root>
  <Avatar.Root>
    <Avatar.Image src="/user2.jpg" />
  </Avatar.Root>
  <Avatar.Root>
    <Avatar.Image src="/user3.jpg" />
  </Avatar.Root>
  <Avatar.Root>
    <Avatar.Image src="/user4.jpg" />
  </Avatar.Root>
</AvatarGroup>
```

### Badge

```tsx
import { Badge } from '@chakra-ui/react'

<Badge>Default</Badge>
<Badge colorPalette="green">Success</Badge>
<Badge colorPalette="red">Error</Badge>
<Badge variant="solid" colorPalette="blue">Solid</Badge>
<Badge variant="outline" colorPalette="purple">Outline</Badge>
<Badge variant="subtle" colorPalette="orange">Subtle</Badge>
```

### Table

```tsx
import { Table } from '@chakra-ui/react'

<Table.Root>
  <Table.Header>
    <Table.Row>
      <Table.ColumnHeader>Name</Table.ColumnHeader>
      <Table.ColumnHeader>Email</Table.ColumnHeader>
      <Table.ColumnHeader numeric>Amount</Table.ColumnHeader>
    </Table.Row>
  </Table.Header>
  <Table.Body>
    {data.map((item) => (
      <Table.Row key={item.id}>
        <Table.Cell>{item.name}</Table.Cell>
        <Table.Cell>{item.email}</Table.Cell>
        <Table.Cell numeric>{item.amount}</Table.Cell>
      </Table.Row>
    ))}
  </Table.Body>
</Table.Root>
```

### Stat

```tsx
import { Stat } from '@chakra-ui/react'

<Stat.Root>
  <Stat.Label>Revenue</Stat.Label>
  <Stat.ValueText>$45,670</Stat.ValueText>
  <Stat.HelpText>
    <Stat.UpIndicator />
    23.36%
  </Stat.HelpText>
</Stat.Root>
```

## Feedback

### Alert

```tsx
import { Alert } from '@chakra-ui/react'

<Alert.Root status="info">
  <Alert.Indicator />
  <Alert.Content>
    <Alert.Title>Information</Alert.Title>
    <Alert.Description>This is an informational alert.</Alert.Description>
  </Alert.Content>
</Alert.Root>

// Status options: info, warning, success, error
```

### Toast

```tsx
import { Toaster, toaster } from '@chakra-ui/react'

// Add Toaster to app root
<Toaster />

// Trigger toast
function showToast() {
  toaster.create({
    title: 'Success!',
    description: 'Your changes have been saved.',
    type: 'success',
    duration: 5000,
  })
}

// Toast with action
toaster.create({
  title: 'File deleted',
  type: 'info',
  action: {
    label: 'Undo',
    onClick: () => restoreFile(),
  },
})
```

### Progress

```tsx
import { Progress } from '@chakra-ui/react'

<Progress.Root value={65}>
  <Progress.Track>
    <Progress.Range />
  </Progress.Track>
  <Progress.ValueText>65%</Progress.ValueText>
</Progress.Root>

// Indeterminate
<Progress.Root value={null}>
  <Progress.Track>
    <Progress.Range />
  </Progress.Track>
</Progress.Root>
```

### Spinner

```tsx
import { Spinner } from '@chakra-ui/react'

<Spinner size="sm" />
<Spinner size="md" />
<Spinner size="lg" />
<Spinner colorPalette="blue" />
```

### Skeleton

```tsx
import { Skeleton, SkeletonText, SkeletonCircle } from '@chakra-ui/react'

<Skeleton height="20px" />
<Skeleton height="100px" width="100%" />
<SkeletonCircle size="12" />
<SkeletonText noOfLines={4} gap="4" />

// With loaded state
<Skeleton loading={isLoading}>
  <Text>Content loaded</Text>
</Skeleton>
```

## Form Components

### Checkbox

```tsx
import { Checkbox } from '@chakra-ui/react'

<Checkbox.Root>
  <Checkbox.HiddenInput />
  <Checkbox.Control>
    <Checkbox.Indicator />
  </Checkbox.Control>
  <Checkbox.Label>Accept terms</Checkbox.Label>
</Checkbox.Root>

// Checkbox Group
<Checkbox.Group defaultValue={['react']}>
  <Stack>
    <Checkbox.Root value="react">
      <Checkbox.HiddenInput />
      <Checkbox.Control />
      <Checkbox.Label>React</Checkbox.Label>
    </Checkbox.Root>
    <Checkbox.Root value="vue">
      <Checkbox.HiddenInput />
      <Checkbox.Control />
      <Checkbox.Label>Vue</Checkbox.Label>
    </Checkbox.Root>
  </Stack>
</Checkbox.Group>
```

### Radio

```tsx
import { RadioGroup } from '@chakra-ui/react'

<RadioGroup.Root defaultValue="1">
  <Stack>
    <RadioGroup.Item value="1">
      <RadioGroup.ItemHiddenInput />
      <RadioGroup.ItemControl />
      <RadioGroup.ItemText>Option 1</RadioGroup.ItemText>
    </RadioGroup.Item>
    <RadioGroup.Item value="2">
      <RadioGroup.ItemHiddenInput />
      <RadioGroup.ItemControl />
      <RadioGroup.ItemText>Option 2</RadioGroup.ItemText>
    </RadioGroup.Item>
  </Stack>
</RadioGroup.Root>
```

### Switch

```tsx
import { Switch } from '@chakra-ui/react'

<Switch.Root>
  <Switch.HiddenInput />
  <Switch.Control>
    <Switch.Thumb />
  </Switch.Control>
  <Switch.Label>Enable notifications</Switch.Label>
</Switch.Root>
```

### Slider

```tsx
import { Slider } from '@chakra-ui/react'

<Slider.Root defaultValue={[50]} max={100}>
  <Slider.Control>
    <Slider.Track>
      <Slider.Range />
    </Slider.Track>
    <Slider.Thumb index={0} />
  </Slider.Control>
</Slider.Root>

// Range slider
<Slider.Root defaultValue={[25, 75]}>
  <Slider.Control>
    <Slider.Track>
      <Slider.Range />
    </Slider.Track>
    <Slider.Thumb index={0} />
    <Slider.Thumb index={1} />
  </Slider.Control>
</Slider.Root>
```

### NumberInput

```tsx
import { NumberInput } from '@chakra-ui/react'

<NumberInput.Root defaultValue="10" min={0} max={100}>
  <NumberInput.Field />
  <NumberInput.Control>
    <NumberInput.IncrementTrigger />
    <NumberInput.DecrementTrigger />
  </NumberInput.Control>
</NumberInput.Root>
```

### PinInput

```tsx
import { PinInput } from '@chakra-ui/react'

<PinInput.Root>
  <PinInput.HiddenInput />
  <PinInput.Control>
    <PinInput.Input index={0} />
    <PinInput.Input index={1} />
    <PinInput.Input index={2} />
    <PinInput.Input index={3} />
  </PinInput.Control>
</PinInput.Root>
```

## Overlay

### Drawer

```tsx
import { Button, Drawer, Portal } from '@chakra-ui/react'

<Drawer.Root placement="right">
  <Drawer.Trigger asChild>
    <Button>Open Drawer</Button>
  </Drawer.Trigger>
  <Portal>
    <Drawer.Backdrop />
    <Drawer.Positioner>
      <Drawer.Content>
        <Drawer.Header>
          <Drawer.Title>Drawer Title</Drawer.Title>
        </Drawer.Header>
        <Drawer.Body>
          Drawer content here...
        </Drawer.Body>
        <Drawer.Footer>
          <Drawer.CloseTrigger asChild>
            <Button variant="outline">Close</Button>
          </Drawer.CloseTrigger>
        </Drawer.Footer>
        <Drawer.CloseTrigger />
      </Drawer.Content>
    </Drawer.Positioner>
  </Portal>
</Drawer.Root>
```

### Popover

```tsx
import { Button, Popover, Portal } from '@chakra-ui/react'

<Popover.Root>
  <Popover.Trigger asChild>
    <Button>Open Popover</Button>
  </Popover.Trigger>
  <Portal>
    <Popover.Positioner>
      <Popover.Content>
        <Popover.Arrow>
          <Popover.ArrowTip />
        </Popover.Arrow>
        <Popover.Header>
          <Popover.Title>Popover Title</Popover.Title>
        </Popover.Header>
        <Popover.Body>
          Popover content...
        </Popover.Body>
        <Popover.CloseTrigger />
      </Popover.Content>
    </Popover.Positioner>
  </Portal>
</Popover.Root>
```

### Tooltip

```tsx
import { Tooltip } from '@chakra-ui/react'

<Tooltip.Root>
  <Tooltip.Trigger asChild>
    <Button>Hover me</Button>
  </Tooltip.Trigger>
  <Tooltip.Positioner>
    <Tooltip.Content>
      <Tooltip.Arrow>
        <Tooltip.ArrowTip />
      </Tooltip.Arrow>
      This is a tooltip
    </Tooltip.Content>
  </Tooltip.Positioner>
</Tooltip.Root>
```

## Navigation

### Breadcrumb

```tsx
import { Breadcrumb } from '@chakra-ui/react'

<Breadcrumb.Root>
  <Breadcrumb.List>
    <Breadcrumb.Item>
      <Breadcrumb.Link href="/">Home</Breadcrumb.Link>
    </Breadcrumb.Item>
    <Breadcrumb.Separator />
    <Breadcrumb.Item>
      <Breadcrumb.Link href="/products">Products</Breadcrumb.Link>
    </Breadcrumb.Item>
    <Breadcrumb.Separator />
    <Breadcrumb.Item>
      <Breadcrumb.CurrentLink>Details</Breadcrumb.CurrentLink>
    </Breadcrumb.Item>
  </Breadcrumb.List>
</Breadcrumb.Root>
```

### Link

```tsx
import { Link, LinkOverlay, LinkBox } from '@chakra-ui/react'

<Link href="/about">About Us</Link>
<Link href="/external" external>External Link</Link>

// Link card pattern
<LinkBox as="article" p="4" borderWidth="1px" rounded="md">
  <Text fontWeight="bold">
    <LinkOverlay href="/article">Article Title</LinkOverlay>
  </Text>
  <Text>Article description here...</Text>
</LinkBox>
```

### Pagination

```tsx
import { Pagination } from '@chakra-ui/react'

<Pagination.Root count={100} pageSize={10} defaultPage={1}>
  <Pagination.PrevTrigger />
  <Pagination.Items />
  <Pagination.NextTrigger />
</Pagination.Root>
```

## Disclosure

### Accordion

```tsx
import { Accordion } from '@chakra-ui/react'

<Accordion.Root collapsible defaultValue={['item-1']}>
  <Accordion.Item value="item-1">
    <Accordion.ItemTrigger>
      <Accordion.ItemIndicator />
      First Section
    </Accordion.ItemTrigger>
    <Accordion.ItemContent>
      First section content...
    </Accordion.ItemContent>
  </Accordion.Item>
  <Accordion.Item value="item-2">
    <Accordion.ItemTrigger>
      <Accordion.ItemIndicator />
      Second Section
    </Accordion.ItemTrigger>
    <Accordion.ItemContent>
      Second section content...
    </Accordion.ItemContent>
  </Accordion.Item>
</Accordion.Root>
```

### Collapsible

```tsx
import { Collapsible } from '@chakra-ui/react'

<Collapsible.Root>
  <Collapsible.Trigger asChild>
    <Button>Toggle Content</Button>
  </Collapsible.Trigger>
  <Collapsible.Content>
    This content can be collapsed or expanded.
  </Collapsible.Content>
</Collapsible.Root>
```

## Typography

```tsx
import { Heading, Text, Em, Strong, Code, Kbd } from '@chakra-ui/react'

<Heading as="h1" size="2xl">Main Title</Heading>
<Heading as="h2" size="xl">Section Title</Heading>

<Text fontSize="lg">Large text</Text>
<Text fontSize="md">Normal text</Text>
<Text fontSize="sm" color="gray.500">Small muted text</Text>

<Text>
  This is <Em>emphasized</Em> and <Strong>important</Strong> text.
</Text>

<Code>inline code</Code>
<Kbd>Ctrl</Kbd> + <Kbd>C</Kbd>
```

## Media

### Image

```tsx
import { Image } from '@chakra-ui/react'

<Image
  src="/photo.jpg"
  alt="Description"
  borderRadius="lg"
  objectFit="cover"
  fallbackSrc="/placeholder.jpg"
/>
```

### AspectRatio

```tsx
import { AspectRatio } from '@chakra-ui/react'

<AspectRatio ratio={16 / 9}>
  <Image src="/video-thumbnail.jpg" alt="Video" objectFit="cover" />
</AspectRatio>

<AspectRatio ratio={1}>
  <iframe src="https://youtube.com/embed/..." />
</AspectRatio>
```

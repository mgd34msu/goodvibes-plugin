# Ark UI Components Reference

Complete component catalog for Ark UI.

## Form Components

### Field

```tsx
import { Field } from '@ark-ui/react'

<Field.Root>
  <Field.Label>Email</Field.Label>
  <Field.Input className="w-full px-4 py-2 border rounded" />
  <Field.HelperText className="text-sm text-gray-500">
    We'll never share your email
  </Field.HelperText>
  <Field.ErrorText className="text-sm text-red-500">
    Email is required
  </Field.ErrorText>
</Field.Root>

// With textarea
<Field.Root>
  <Field.Label>Message</Field.Label>
  <Field.Textarea className="w-full px-4 py-2 border rounded" rows={4} />
</Field.Root>

// With select
<Field.Root>
  <Field.Label>Country</Field.Label>
  <Field.Select className="w-full px-4 py-2 border rounded">
    <option value="us">United States</option>
    <option value="uk">United Kingdom</option>
  </Field.Select>
</Field.Root>
```

### NumberInput

```tsx
import { NumberInput } from '@ark-ui/react'

<NumberInput.Root defaultValue="10" min={0} max={100}>
  <NumberInput.Label>Quantity</NumberInput.Label>
  <NumberInput.Control>
    <NumberInput.DecrementTrigger>-</NumberInput.DecrementTrigger>
    <NumberInput.Input className="w-20 text-center border" />
    <NumberInput.IncrementTrigger>+</NumberInput.IncrementTrigger>
  </NumberInput.Control>
</NumberInput.Root>
```

### PinInput

```tsx
import { PinInput } from '@ark-ui/react'

<PinInput.Root>
  <PinInput.Label>Enter verification code</PinInput.Label>
  <PinInput.Control className="flex gap-2">
    {[0, 1, 2, 3].map((index) => (
      <PinInput.Input
        key={index}
        index={index}
        className="w-12 h-12 text-center border rounded text-xl"
      />
    ))}
  </PinInput.Control>
  <PinInput.HiddenInput />
</PinInput.Root>

// OTP mode
<PinInput.Root otp>
  {/* ... */}
</PinInput.Root>
```

### Rating Group

```tsx
import { RatingGroup } from '@ark-ui/react'
import { StarIcon } from 'lucide-react'

<RatingGroup.Root count={5} defaultValue={3}>
  <RatingGroup.Label>Rating</RatingGroup.Label>
  <RatingGroup.Control className="flex gap-1">
    {[1, 2, 3, 4, 5].map((index) => (
      <RatingGroup.Item key={index} index={index}>
        <RatingGroup.ItemContext>
          {(item) => (
            <StarIcon
              className={item.highlighted ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}
            />
          )}
        </RatingGroup.ItemContext>
      </RatingGroup.Item>
    ))}
  </RatingGroup.Control>
  <RatingGroup.HiddenInput />
</RatingGroup.Root>
```

### RadioGroup

```tsx
import { RadioGroup } from '@ark-ui/react'

<RadioGroup.Root defaultValue="react">
  <RadioGroup.Label>Framework</RadioGroup.Label>
  <RadioGroup.Indicator />
  {['react', 'vue', 'svelte'].map((value) => (
    <RadioGroup.Item key={value} value={value} className="flex items-center gap-2">
      <RadioGroup.ItemControl className="
        w-5 h-5 rounded-full border-2
        data-[state=checked]:border-blue-500
        data-[state=checked]:bg-blue-500
      " />
      <RadioGroup.ItemText className="capitalize">{value}</RadioGroup.ItemText>
      <RadioGroup.ItemHiddenInput />
    </RadioGroup.Item>
  ))}
</RadioGroup.Root>
```

### SegmentGroup

```tsx
import { SegmentGroup } from '@ark-ui/react'

<SegmentGroup.Root defaultValue="react">
  <SegmentGroup.Indicator className="bg-blue-500 rounded absolute inset-0 -z-10" />
  {['React', 'Vue', 'Svelte'].map((option) => (
    <SegmentGroup.Item key={option} value={option.toLowerCase()}>
      <SegmentGroup.ItemControl />
      <SegmentGroup.ItemText className="px-4 py-2 relative z-10">
        {option}
      </SegmentGroup.ItemText>
      <SegmentGroup.ItemHiddenInput />
    </SegmentGroup.Item>
  ))}
</SegmentGroup.Root>
```

### ColorPicker

```tsx
import { ColorPicker, Portal } from '@ark-ui/react'

<ColorPicker.Root defaultValue="#ff0000">
  <ColorPicker.Label>Color</ColorPicker.Label>
  <ColorPicker.Control>
    <ColorPicker.ChannelInput channel="hex" className="w-24 px-2 py-1 border rounded" />
    <ColorPicker.Trigger className="w-8 h-8 rounded border">
      <ColorPicker.TransparencyGrid />
      <ColorPicker.Swatch value="currentColor" />
    </ColorPicker.Trigger>
  </ColorPicker.Control>
  <Portal>
    <ColorPicker.Positioner>
      <ColorPicker.Content className="bg-white shadow-lg rounded-lg p-4">
        <ColorPicker.Area>
          <ColorPicker.AreaBackground />
          <ColorPicker.AreaThumb className="w-4 h-4 rounded-full border-2 border-white shadow" />
        </ColorPicker.Area>
        <ColorPicker.ChannelSlider channel="hue" className="mt-4">
          <ColorPicker.ChannelSliderTrack className="h-4 rounded" />
          <ColorPicker.ChannelSliderThumb className="w-4 h-4 rounded-full border-2 border-white shadow" />
        </ColorPicker.ChannelSlider>
        <ColorPicker.SwatchGroup className="flex gap-2 mt-4">
          <ColorPicker.SwatchTrigger value="#ff0000">
            <ColorPicker.Swatch value="#ff0000" className="w-6 h-6 rounded" />
          </ColorPicker.SwatchTrigger>
          <ColorPicker.SwatchTrigger value="#00ff00">
            <ColorPicker.Swatch value="#00ff00" className="w-6 h-6 rounded" />
          </ColorPicker.SwatchTrigger>
          <ColorPicker.SwatchTrigger value="#0000ff">
            <ColorPicker.Swatch value="#0000ff" className="w-6 h-6 rounded" />
          </ColorPicker.SwatchTrigger>
        </ColorPicker.SwatchGroup>
      </ColorPicker.Content>
    </ColorPicker.Positioner>
  </Portal>
</ColorPicker.Root>
```

### FileUpload

```tsx
import { FileUpload } from '@ark-ui/react'

<FileUpload.Root maxFiles={5} accept="image/*">
  <FileUpload.Label>Upload images</FileUpload.Label>
  <FileUpload.Dropzone className="
    border-2 border-dashed rounded-lg p-8 text-center
    data-[dragging]:border-blue-500 data-[dragging]:bg-blue-50
  ">
    Drag and drop or click to upload
  </FileUpload.Dropzone>
  <FileUpload.Trigger className="mt-2 px-4 py-2 bg-blue-500 text-white rounded">
    Choose files
  </FileUpload.Trigger>
  <FileUpload.ItemGroup className="mt-4 space-y-2">
    <FileUpload.Context>
      {({ acceptedFiles }) =>
        acceptedFiles.map((file) => (
          <FileUpload.Item key={file.name} file={file} className="flex items-center gap-2 p-2 border rounded">
            <FileUpload.ItemPreview type="image/*" className="w-10 h-10 object-cover rounded">
              <FileUpload.ItemPreviewImage />
            </FileUpload.ItemPreview>
            <FileUpload.ItemName className="flex-1">{file.name}</FileUpload.ItemName>
            <FileUpload.ItemSizeText className="text-sm text-gray-500" />
            <FileUpload.ItemDeleteTrigger className="text-red-500">
              Delete
            </FileUpload.ItemDeleteTrigger>
          </FileUpload.Item>
        ))
      }
    </FileUpload.Context>
  </FileUpload.ItemGroup>
  <FileUpload.HiddenInput />
</FileUpload.Root>
```

## Overlay Components

### Drawer

```tsx
import { Drawer, Portal } from '@ark-ui/react'

<Drawer.Root>
  <Drawer.Trigger className="px-4 py-2 bg-blue-500 text-white rounded">
    Open Drawer
  </Drawer.Trigger>
  <Portal>
    <Drawer.Backdrop className="fixed inset-0 bg-black/50" />
    <Drawer.Positioner className="fixed inset-y-0 right-0 w-full max-w-md">
      <Drawer.Content className="h-full bg-white shadow-xl">
        <Drawer.Header className="p-4 border-b">
          <Drawer.Title className="text-lg font-semibold">Drawer Title</Drawer.Title>
          <Drawer.Description className="text-gray-600">
            Drawer description
          </Drawer.Description>
        </Drawer.Header>
        <Drawer.Body className="p-4">
          Drawer content here...
        </Drawer.Body>
        <Drawer.Footer className="p-4 border-t">
          <Drawer.CloseTrigger className="px-4 py-2 bg-gray-100 rounded">
            Close
          </Drawer.CloseTrigger>
        </Drawer.Footer>
        <Drawer.CloseTrigger className="absolute top-4 right-4">
          <XIcon />
        </Drawer.CloseTrigger>
      </Drawer.Content>
    </Drawer.Positioner>
  </Portal>
</Drawer.Root>
```

### HoverCard

```tsx
import { HoverCard, Portal } from '@ark-ui/react'

<HoverCard.Root openDelay={200}>
  <HoverCard.Trigger className="text-blue-500 underline cursor-pointer">
    @username
  </HoverCard.Trigger>
  <Portal>
    <HoverCard.Positioner>
      <HoverCard.Content className="bg-white shadow-lg rounded-lg p-4 max-w-xs">
        <HoverCard.Arrow>
          <HoverCard.ArrowTip />
        </HoverCard.Arrow>
        <div className="flex gap-4">
          <img src="/avatar.jpg" className="w-12 h-12 rounded-full" />
          <div>
            <h4 className="font-semibold">John Doe</h4>
            <p className="text-sm text-gray-600">Software Engineer</p>
            <p className="text-sm mt-2">Building great things...</p>
          </div>
        </div>
      </HoverCard.Content>
    </HoverCard.Positioner>
  </Portal>
</HoverCard.Root>
```

## Display Components

### Avatar

```tsx
import { Avatar } from '@ark-ui/react'

<Avatar.Root>
  <Avatar.Fallback className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
    JD
  </Avatar.Fallback>
  <Avatar.Image
    src="/avatar.jpg"
    alt="John Doe"
    className="w-12 h-12 rounded-full object-cover"
  />
</Avatar.Root>
```

### Progress

```tsx
import { Progress } from '@ark-ui/react'

// Linear
<Progress.Root value={65}>
  <Progress.Label>Loading...</Progress.Label>
  <Progress.ValueText>{65}%</Progress.ValueText>
  <Progress.Track className="w-full h-2 bg-gray-200 rounded-full">
    <Progress.Range className="h-full bg-blue-500 rounded-full" />
  </Progress.Track>
</Progress.Root>

// Circular
<Progress.Root value={65}>
  <Progress.Circle className="w-20 h-20">
    <Progress.CircleTrack className="stroke-gray-200" />
    <Progress.CircleRange className="stroke-blue-500" />
  </Progress.Circle>
  <Progress.ValueText className="absolute inset-0 flex items-center justify-center">
    65%
  </Progress.ValueText>
</Progress.Root>

// Indeterminate
<Progress.Root value={null}>
  <Progress.Track className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
    <Progress.Range className="h-full bg-blue-500 animate-progress" />
  </Progress.Track>
</Progress.Root>
```

### Collapsible

```tsx
import { Collapsible } from '@ark-ui/react'

<Collapsible.Root>
  <Collapsible.Trigger className="flex items-center justify-between w-full p-4 bg-gray-100 rounded">
    <span>Show more</span>
    <Collapsible.Context>
      {({ open }) => (
        <ChevronDownIcon className={open ? 'rotate-180' : ''} />
      )}
    </Collapsible.Context>
  </Collapsible.Trigger>
  <Collapsible.Content className="p-4">
    Hidden content that can be expanded or collapsed.
  </Collapsible.Content>
</Collapsible.Root>
```

### Carousel

```tsx
import { Carousel } from '@ark-ui/react'

const images = ['/slide1.jpg', '/slide2.jpg', '/slide3.jpg']

<Carousel.Root>
  <Carousel.Control className="flex justify-between mb-4">
    <Carousel.PrevTrigger className="px-4 py-2 bg-gray-100 rounded">
      Previous
    </Carousel.PrevTrigger>
    <Carousel.NextTrigger className="px-4 py-2 bg-gray-100 rounded">
      Next
    </Carousel.NextTrigger>
  </Carousel.Control>
  <Carousel.Viewport className="overflow-hidden rounded-lg">
    <Carousel.ItemGroup className="flex">
      {images.map((src, index) => (
        <Carousel.Item key={index} index={index} className="min-w-full">
          <img src={src} alt={`Slide ${index + 1}`} className="w-full" />
        </Carousel.Item>
      ))}
    </Carousel.ItemGroup>
  </Carousel.Viewport>
  <Carousel.IndicatorGroup className="flex justify-center gap-2 mt-4">
    {images.map((_, index) => (
      <Carousel.Indicator
        key={index}
        index={index}
        className="w-2 h-2 rounded-full bg-gray-300 data-[current]:bg-blue-500"
      />
    ))}
  </Carousel.IndicatorGroup>
</Carousel.Root>
```

### TreeView

```tsx
import { TreeView } from '@ark-ui/react'

const data = [
  {
    id: '1',
    name: 'Documents',
    children: [
      { id: '1.1', name: 'Resume.pdf' },
      { id: '1.2', name: 'Cover Letter.docx' },
    ],
  },
  {
    id: '2',
    name: 'Images',
    children: [
      { id: '2.1', name: 'photo.jpg' },
    ],
  },
]

<TreeView.Root>
  <TreeView.Tree>
    {data.map((node) => (
      <TreeView.Branch key={node.id} value={node.id}>
        <TreeView.BranchControl className="flex items-center gap-2 p-2 hover:bg-gray-100 rounded">
          <TreeView.BranchIndicator>
            <ChevronRightIcon className="data-[state=open]:rotate-90" />
          </TreeView.BranchIndicator>
          <TreeView.BranchText>{node.name}</TreeView.BranchText>
        </TreeView.BranchControl>
        <TreeView.BranchContent className="pl-4">
          {node.children?.map((child) => (
            <TreeView.Item key={child.id} value={child.id} className="p-2 hover:bg-gray-100 rounded">
              <TreeView.ItemText>{child.name}</TreeView.ItemText>
            </TreeView.Item>
          ))}
        </TreeView.BranchContent>
      </TreeView.Branch>
    ))}
  </TreeView.Tree>
</TreeView.Root>
```

## Utility Components

### Clipboard

```tsx
import { Clipboard } from '@ark-ui/react'

<Clipboard.Root value="https://example.com">
  <Clipboard.Label>Share link</Clipboard.Label>
  <Clipboard.Control className="flex gap-2">
    <Clipboard.Input className="flex-1 px-4 py-2 border rounded" />
    <Clipboard.Trigger className="px-4 py-2 bg-blue-500 text-white rounded">
      <Clipboard.Context>
        {({ copied }) => (copied ? 'Copied!' : 'Copy')}
      </Clipboard.Context>
    </Clipboard.Trigger>
  </Clipboard.Control>
</Clipboard.Root>
```

### QRCode

```tsx
import { QRCode } from '@ark-ui/react'

<QRCode.Root value="https://example.com">
  <QRCode.Frame>
    <QRCode.Pattern />
  </QRCode.Frame>
  <QRCode.Overlay>
    <img src="/logo.png" alt="Logo" className="w-8 h-8" />
  </QRCode.Overlay>
</QRCode.Root>
```

### Timer

```tsx
import { Timer } from '@ark-ui/react'

<Timer.Root autoStart countdown startMs={60000}>
  <Timer.Area className="flex gap-2 text-4xl font-mono">
    <Timer.Item type="minutes">
      {(value) => <span>{value.toString().padStart(2, '0')}</span>}
    </Timer.Item>
    <span>:</span>
    <Timer.Item type="seconds">
      {(value) => <span>{value.toString().padStart(2, '0')}</span>}
    </Timer.Item>
  </Timer.Area>
  <Timer.Control className="flex gap-2 mt-4">
    <Timer.ActionTrigger action="start">Start</Timer.ActionTrigger>
    <Timer.ActionTrigger action="pause">Pause</Timer.ActionTrigger>
    <Timer.ActionTrigger action="resume">Resume</Timer.ActionTrigger>
    <Timer.ActionTrigger action="reset">Reset</Timer.ActionTrigger>
  </Timer.Control>
</Timer.Root>
```

### Presence

```tsx
import { Presence } from '@ark-ui/react'

<Presence present={isVisible}>
  <div className="
    data-[state=open]:animate-fadeIn
    data-[state=closed]:animate-fadeOut
  ">
    Content with enter/exit animations
  </div>
</Presence>
```

### Portal

```tsx
import { Portal } from '@ark-ui/react'

// Default portal (document.body)
<Portal>
  <div>Rendered at document body</div>
</Portal>

// Custom container
<Portal container={containerRef}>
  <div>Rendered in specific container</div>
</Portal>
```

### Environment

```tsx
import { Environment } from '@ark-ui/react'

// For iframe or shadow DOM usage
<Environment value={customDocument}>
  <App />
</Environment>
```

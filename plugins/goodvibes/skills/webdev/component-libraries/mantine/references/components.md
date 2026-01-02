# Mantine Components Reference

Complete component catalog for Mantine.

## Layout

### AppShell

```tsx
import { AppShell, Burger, Group, Skeleton } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';

function Layout() {
  const [opened, { toggle }] = useDisclosure();

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{
        width: 300,
        breakpoint: 'sm',
        collapsed: { mobile: !opened },
      }}
      aside={{
        width: 300,
        breakpoint: 'md',
        collapsed: { desktop: false, mobile: true },
      }}
      footer={{ height: 60 }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md">
          <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
          <Text size="lg" fw={700}>Logo</Text>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        Navigation links
      </AppShell.Navbar>

      <AppShell.Main>
        Main content
      </AppShell.Main>

      <AppShell.Aside p="md">
        Sidebar content
      </AppShell.Aside>

      <AppShell.Footer p="md">
        Footer content
      </AppShell.Footer>
    </AppShell>
  );
}
```

### Grid

```tsx
import { Grid } from '@mantine/core';

// Basic grid
<Grid>
  <Grid.Col span={4}>Column 1</Grid.Col>
  <Grid.Col span={4}>Column 2</Grid.Col>
  <Grid.Col span={4}>Column 3</Grid.Col>
</Grid>

// Responsive columns
<Grid>
  <Grid.Col span={{ base: 12, sm: 6, md: 4, lg: 3 }}>
    Responsive
  </Grid.Col>
</Grid>

// With gutter
<Grid gutter="xl">
  <Grid.Col span={6}>With gutter</Grid.Col>
  <Grid.Col span={6}>With gutter</Grid.Col>
</Grid>

// Offset
<Grid>
  <Grid.Col span={3} offset={3}>Offset by 3</Grid.Col>
</Grid>
```

### Flex Components

```tsx
import { Group, Stack, Flex } from '@mantine/core';

// Horizontal group
<Group gap="md" justify="center" align="flex-start" wrap="wrap">
  <Box>Item</Box>
  <Box>Item</Box>
</Group>

// Vertical stack
<Stack gap="md" align="stretch">
  <Box>Item</Box>
  <Box>Item</Box>
</Stack>

// Flex (full control)
<Flex
  gap="md"
  justify="flex-start"
  align="center"
  direction="row"
  wrap="wrap"
>
  <Box>Item</Box>
</Flex>
```

## Data Display

### Table

```tsx
import { Table, Checkbox, ActionIcon, Menu } from '@mantine/core';

const rows = data.map((item) => (
  <Table.Tr key={item.id}>
    <Table.Td>
      <Checkbox />
    </Table.Td>
    <Table.Td>{item.name}</Table.Td>
    <Table.Td>{item.email}</Table.Td>
    <Table.Td>
      <Menu>
        <Menu.Target>
          <ActionIcon variant="subtle">
            <IconDots size={16} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item>Edit</Menu.Item>
          <Menu.Item color="red">Delete</Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </Table.Td>
  </Table.Tr>
));

<Table striped highlightOnHover withTableBorder withColumnBorders>
  <Table.Thead>
    <Table.Tr>
      <Table.Th w={40}></Table.Th>
      <Table.Th>Name</Table.Th>
      <Table.Th>Email</Table.Th>
      <Table.Th w={60}>Actions</Table.Th>
    </Table.Tr>
  </Table.Thead>
  <Table.Tbody>{rows}</Table.Tbody>
</Table>
```

### Accordion

```tsx
import { Accordion } from '@mantine/core';

<Accordion defaultValue="item-1" variant="separated">
  <Accordion.Item value="item-1">
    <Accordion.Control icon={<IconSettings />}>
      Settings
    </Accordion.Control>
    <Accordion.Panel>
      Settings panel content
    </Accordion.Panel>
  </Accordion.Item>
  <Accordion.Item value="item-2">
    <Accordion.Control icon={<IconUser />}>
      Account
    </Accordion.Control>
    <Accordion.Panel>
      Account panel content
    </Accordion.Panel>
  </Accordion.Item>
</Accordion>
```

### Timeline

```tsx
import { Timeline, Text } from '@mantine/core';

<Timeline active={1} bulletSize={24}>
  <Timeline.Item bullet={<IconCheck size={12} />} title="Order placed">
    <Text c="dimmed" size="sm">
      You placed your order
    </Text>
    <Text size="xs" mt={4}>2 hours ago</Text>
  </Timeline.Item>
  <Timeline.Item bullet={<IconPackage size={12} />} title="Shipped">
    <Text c="dimmed" size="sm">
      Your package is on the way
    </Text>
  </Timeline.Item>
  <Timeline.Item bullet={<IconTruck size={12} />} title="Delivery">
    <Text c="dimmed" size="sm">
      Expected delivery
    </Text>
  </Timeline.Item>
</Timeline>
```

### Avatar

```tsx
import { Avatar, AvatarGroup, Indicator } from '@mantine/core';

// Basic
<Avatar src="/avatar.jpg" alt="User name" radius="xl" />

// Initials fallback
<Avatar color="cyan" radius="xl">MK</Avatar>

// With status indicator
<Indicator inline processing color="green" size={12}>
  <Avatar src="/avatar.jpg" radius="xl" />
</Indicator>

// Group
<Avatar.Group spacing="sm">
  <Avatar src="/1.jpg" radius="xl" />
  <Avatar src="/2.jpg" radius="xl" />
  <Avatar src="/3.jpg" radius="xl" />
  <Avatar radius="xl">+5</Avatar>
</Avatar.Group>
```

### Badge

```tsx
import { Badge } from '@mantine/core';

<Badge>Default</Badge>
<Badge color="pink" variant="light">Light</Badge>
<Badge color="red" variant="filled">Filled</Badge>
<Badge color="blue" variant="outline">Outline</Badge>
<Badge color="teal" variant="dot">Dot</Badge>

// With icon
<Badge leftSection={<IconCheck size={12} />}>
  Verified
</Badge>

// Gradient
<Badge
  variant="gradient"
  gradient={{ from: 'indigo', to: 'cyan' }}
>
  Gradient
</Badge>
```

### Progress

```tsx
import { Progress, RingProgress } from '@mantine/core';

// Linear progress
<Progress value={65} color="blue" size="lg" radius="xl" />

// Striped animated
<Progress value={50} striped animated />

// Multiple sections
<Progress.Root size="xl">
  <Progress.Section value={35} color="cyan">
    <Progress.Label>Docs</Progress.Label>
  </Progress.Section>
  <Progress.Section value={28} color="pink">
    <Progress.Label>Code</Progress.Label>
  </Progress.Section>
</Progress.Root>

// Ring progress
<RingProgress
  sections={[
    { value: 40, color: 'cyan' },
    { value: 25, color: 'orange' },
    { value: 15, color: 'grape' },
  ]}
  label={
    <Text ta="center" fz="lg" fw={700}>
      80%
    </Text>
  }
/>
```

## Inputs

### Checkbox and Radio

```tsx
import { Checkbox, Radio, Switch } from '@mantine/core';

// Checkbox
<Checkbox label="I agree to terms" />
<Checkbox.Group
  label="Select frameworks"
  value={value}
  onChange={setValue}
>
  <Checkbox value="react" label="React" />
  <Checkbox value="vue" label="Vue" />
  <Checkbox value="svelte" label="Svelte" />
</Checkbox.Group>

// Radio
<Radio.Group
  name="favoriteFramework"
  label="Select your favorite"
  value={value}
  onChange={setValue}
>
  <Radio value="react" label="React" />
  <Radio value="vue" label="Vue" />
</Radio.Group>

// Switch
<Switch label="Enable notifications" />
<Switch
  size="lg"
  onLabel="ON"
  offLabel="OFF"
  thumbIcon={checked ? <IconCheck /> : <IconX />}
/>
```

### Slider

```tsx
import { Slider, RangeSlider } from '@mantine/core';

<Slider
  defaultValue={40}
  marks={[
    { value: 0, label: '0%' },
    { value: 50, label: '50%' },
    { value: 100, label: '100%' },
  ]}
/>

<RangeSlider
  defaultValue={[20, 80]}
  marks={[
    { value: 0, label: 'xs' },
    { value: 25, label: 'sm' },
    { value: 50, label: 'md' },
    { value: 75, label: 'lg' },
    { value: 100, label: 'xl' },
  ]}
/>
```

### Date Pickers

```bash
npm install @mantine/dates dayjs
```

```tsx
import '@mantine/dates/styles.css';
import { DateInput, DatePicker, DatePickerInput } from '@mantine/dates';

// Date input
<DateInput
  label="Pick date"
  placeholder="Pick date"
  valueFormat="YYYY-MM-DD"
/>

// Date picker inline
<DatePicker
  type="range"
  value={value}
  onChange={setValue}
/>

// Date picker input
<DatePickerInput
  type="range"
  label="Pick dates range"
  placeholder="Pick dates"
/>
```

### File Input

```tsx
import { FileInput, FileButton, Dropzone } from '@mantine/core';

<FileInput
  label="Upload files"
  placeholder="Pick file"
  accept="image/*"
  multiple
/>

// Dropzone
import { Dropzone, IMAGE_MIME_TYPE } from '@mantine/dropzone';

<Dropzone
  onDrop={(files) => console.log('accepted files', files)}
  onReject={(files) => console.log('rejected files', files)}
  maxSize={5 * 1024 ** 2}
  accept={IMAGE_MIME_TYPE}
>
  <Group justify="center" gap="xl" style={{ minHeight: 220 }}>
    <Dropzone.Accept>
      <IconUpload size={52} stroke={1.5} />
    </Dropzone.Accept>
    <Dropzone.Reject>
      <IconX size={52} stroke={1.5} />
    </Dropzone.Reject>
    <Dropzone.Idle>
      <IconPhoto size={52} stroke={1.5} />
    </Dropzone.Idle>
    <div>
      <Text size="xl">Drag images here or click to select</Text>
    </div>
  </Group>
</Dropzone>
```

## Overlays

### Menu

```tsx
import { Menu, Button } from '@mantine/core';

<Menu shadow="md" width={200}>
  <Menu.Target>
    <Button>Actions</Button>
  </Menu.Target>

  <Menu.Dropdown>
    <Menu.Label>Application</Menu.Label>
    <Menu.Item leftSection={<IconSettings size={14} />}>
      Settings
    </Menu.Item>
    <Menu.Item leftSection={<IconMessage size={14} />}>
      Messages
    </Menu.Item>

    <Menu.Divider />

    <Menu.Label>Danger zone</Menu.Label>
    <Menu.Item color="red" leftSection={<IconTrash size={14} />}>
      Delete account
    </Menu.Item>
  </Menu.Dropdown>
</Menu>
```

### Popover

```tsx
import { Popover, Text, Button } from '@mantine/core';

<Popover width={200} position="bottom" withArrow shadow="md">
  <Popover.Target>
    <Button>Toggle popover</Button>
  </Popover.Target>
  <Popover.Dropdown>
    <Text size="sm">Popover content</Text>
  </Popover.Dropdown>
</Popover>
```

### Tooltip

```tsx
import { Tooltip, Button } from '@mantine/core';

<Tooltip label="Tooltip content">
  <Button>Hover me</Button>
</Tooltip>

<Tooltip.Floating label="Follows cursor">
  <Box>Hover over this area</Box>
</Tooltip.Floating>
```

### Spotlight

```bash
npm install @mantine/spotlight
```

```tsx
import '@mantine/spotlight/styles.css';
import { Spotlight, spotlight } from '@mantine/spotlight';

// Setup
<Spotlight
  actions={[
    { id: 'home', label: 'Home', onClick: () => navigate('/') },
    { id: 'docs', label: 'Documentation', onClick: () => navigate('/docs') },
  ]}
  nothingFound="Nothing found..."
  searchProps={{
    placeholder: 'Search...',
  }}
/>

// Trigger
<Button onClick={spotlight.open}>Open spotlight (Cmd+K)</Button>

// Or with keyboard shortcut
import { useHotkeys } from '@mantine/hooks';
useHotkeys([['mod+K', () => spotlight.open()]]);
```

## Feedback

### Alert

```tsx
import { Alert } from '@mantine/core';

<Alert variant="light" color="blue" title="Information">
  This is an informational alert.
</Alert>

<Alert variant="filled" color="red" title="Error" icon={<IconX />}>
  Something went wrong!
</Alert>

<Alert
  variant="outline"
  color="yellow"
  title="Warning"
  withCloseButton
  onClose={() => {}}
>
  Please check your input.
</Alert>
```

### Loading

```tsx
import { Loader, LoadingOverlay, Skeleton } from '@mantine/core';

// Loader
<Loader color="blue" size="md" type="bars" />

// Loading overlay
<Box pos="relative">
  <LoadingOverlay visible={loading} />
  Content that can be loading...
</Box>

// Skeleton
<Skeleton height={50} circle mb="xl" />
<Skeleton height={8} radius="xl" />
<Skeleton height={8} mt={6} radius="xl" />
<Skeleton height={8} mt={6} width="70%" radius="xl" />
```

## Navigation

### NavLink

```tsx
import { NavLink } from '@mantine/core';

<NavLink
  href="#"
  label="Dashboard"
  leftSection={<IconHome size={16} />}
  active
/>

<NavLink
  label="Settings"
  leftSection={<IconSettings size={16} />}
  childrenOffset={28}
>
  <NavLink label="General" />
  <NavLink label="Security" />
  <NavLink label="Notifications" />
</NavLink>
```

### Breadcrumbs

```tsx
import { Breadcrumbs, Anchor } from '@mantine/core';

<Breadcrumbs>
  <Anchor href="/">Home</Anchor>
  <Anchor href="/products">Products</Anchor>
  <span>Current Page</span>
</Breadcrumbs>
```

### Stepper

```tsx
import { Stepper, Button, Group } from '@mantine/core';

function StepperDemo() {
  const [active, setActive] = useState(0);

  return (
    <>
      <Stepper active={active}>
        <Stepper.Step label="Step 1" description="Account">
          Step 1 content
        </Stepper.Step>
        <Stepper.Step label="Step 2" description="Details">
          Step 2 content
        </Stepper.Step>
        <Stepper.Step label="Step 3" description="Confirm">
          Step 3 content
        </Stepper.Step>
        <Stepper.Completed>
          All steps completed!
        </Stepper.Completed>
      </Stepper>

      <Group mt="xl">
        <Button variant="default" onClick={() => setActive((c) => c - 1)}>
          Back
        </Button>
        <Button onClick={() => setActive((c) => c + 1)}>
          Next
        </Button>
      </Group>
    </>
  );
}
```

### Pagination

```tsx
import { Pagination } from '@mantine/core';

<Pagination total={10} value={activePage} onChange={setPage} />

// With boundaries
<Pagination
  total={100}
  siblings={1}
  boundaries={2}
/>
```

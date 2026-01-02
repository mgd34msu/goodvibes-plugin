# Ant Design Components Reference

Complete component catalog for Ant Design.

## Data Display

### Descriptions

```tsx
import { Descriptions, Badge } from 'antd';

<Descriptions title="User Info" bordered>
  <Descriptions.Item label="Name">John Doe</Descriptions.Item>
  <Descriptions.Item label="Email">john@example.com</Descriptions.Item>
  <Descriptions.Item label="Status">
    <Badge status="processing" text="Active" />
  </Descriptions.Item>
  <Descriptions.Item label="Address" span={2}>
    123 Main St, City, Country
  </Descriptions.Item>
</Descriptions>
```

### List

```tsx
import { List, Avatar, Space, Tag } from 'antd';
import { LikeOutlined, MessageOutlined, StarOutlined } from '@ant-design/icons';

<List
  itemLayout="vertical"
  size="large"
  pagination={{ pageSize: 3 }}
  dataSource={data}
  renderItem={(item) => (
    <List.Item
      key={item.title}
      actions={[
        <Space><LikeOutlined /> 156</Space>,
        <Space><MessageOutlined /> 2</Space>,
        <Space><StarOutlined /> 3</Space>,
      ]}
      extra={<img width={272} alt="cover" src={item.image} />}
    >
      <List.Item.Meta
        avatar={<Avatar src={item.avatar} />}
        title={<a href={item.href}>{item.title}</a>}
        description={item.description}
      />
      {item.content}
    </List.Item>
  )}
/>
```

### Tree

```tsx
import { Tree } from 'antd';

const treeData = [
  {
    title: 'Parent 1',
    key: '0-0',
    children: [
      { title: 'Child 1', key: '0-0-0' },
      { title: 'Child 2', key: '0-0-1' },
    ],
  },
  {
    title: 'Parent 2',
    key: '0-1',
    children: [
      { title: 'Child 3', key: '0-1-0' },
    ],
  },
];

<Tree
  checkable
  defaultExpandedKeys={['0-0']}
  defaultSelectedKeys={['0-0-0']}
  defaultCheckedKeys={['0-0-0']}
  treeData={treeData}
  onSelect={(selectedKeys, info) => console.log('selected', selectedKeys, info)}
  onCheck={(checkedKeys, info) => console.log('checked', checkedKeys, info)}
/>
```

### Timeline

```tsx
import { Timeline } from 'antd';
import { ClockCircleOutlined } from '@ant-design/icons';

<Timeline
  items={[
    {
      children: 'Create project 2024-01-01',
    },
    {
      children: 'Solve initial issues 2024-01-05',
    },
    {
      dot: <ClockCircleOutlined style={{ fontSize: '16px' }} />,
      color: 'red',
      children: 'Testing phase 2024-01-10',
    },
    {
      children: 'Release 2024-02-01',
    },
  ]}
/>
```

### Collapse

```tsx
import { Collapse } from 'antd';

const items = [
  {
    key: '1',
    label: 'This is panel header 1',
    children: <p>Panel content 1</p>,
  },
  {
    key: '2',
    label: 'This is panel header 2',
    children: <p>Panel content 2</p>,
  },
  {
    key: '3',
    label: 'This is panel header 3',
    children: <p>Panel content 3</p>,
    collapsible: 'disabled',
  },
];

<Collapse items={items} defaultActiveKey={['1']} />

// Accordion mode
<Collapse accordion items={items} />
```

### Statistic

```tsx
import { Statistic, Card, Row, Col, Countdown } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';

<Row gutter={16}>
  <Col span={12}>
    <Card>
      <Statistic
        title="Active Users"
        value={112893}
        precision={0}
        valueStyle={{ color: '#3f8600' }}
        prefix={<ArrowUpOutlined />}
        suffix="%"
      />
    </Card>
  </Col>
  <Col span={12}>
    <Card>
      <Statistic
        title="Revenue"
        value={9.3}
        precision={2}
        valueStyle={{ color: '#cf1322' }}
        prefix={<ArrowDownOutlined />}
        suffix="M"
      />
    </Card>
  </Col>
</Row>

// Countdown
const deadline = Date.now() + 1000 * 60 * 60 * 24;
<Countdown title="Countdown" value={deadline} onFinish={onFinish} />
```

### Empty

```tsx
import { Empty, Button } from 'antd';

<Empty
  image={Empty.PRESENTED_IMAGE_SIMPLE}
  description={<span>No Data Available</span>}
>
  <Button type="primary">Create Now</Button>
</Empty>
```

### Image

```tsx
import { Image, Space } from 'antd';

// Single image with preview
<Image
  width={200}
  src="/image.jpg"
  placeholder={<Image preview={false} src="/placeholder.jpg" width={200} />}
/>

// Image group
<Image.PreviewGroup>
  <Image width={200} src="/image1.jpg" />
  <Image width={200} src="/image2.jpg" />
  <Image width={200} src="/image3.jpg" />
</Image.PreviewGroup>
```

## Feedback

### Alert

```tsx
import { Alert, Space } from 'antd';

<Space direction="vertical" style={{ width: '100%' }}>
  <Alert message="Success" type="success" showIcon />
  <Alert message="Info" type="info" showIcon />
  <Alert message="Warning" type="warning" showIcon closable />
  <Alert message="Error" type="error" showIcon />
  <Alert
    message="Success Title"
    description="Detailed description of the alert."
    type="success"
    showIcon
  />
</Space>
```

### Progress

```tsx
import { Progress, Space } from 'antd';

// Line
<Progress percent={30} />
<Progress percent={50} status="active" />
<Progress percent={70} status="exception" />
<Progress percent={100} />

// Circle
<Progress type="circle" percent={75} />
<Progress type="circle" percent={70} status="exception" />
<Progress type="circle" percent={100} />

// Dashboard
<Progress type="dashboard" percent={75} />

// Steps
<Progress percent={60} steps={5} />
```

### Skeleton

```tsx
import { Skeleton, Switch, Card, Avatar, Space } from 'antd';

// Basic
<Skeleton active />

// With avatar
<Skeleton avatar paragraph={{ rows: 4 }} />

// Custom
<Skeleton.Button active size="large" shape="round" />
<Skeleton.Avatar active size="large" shape="circle" />
<Skeleton.Input active size="large" />
<Skeleton.Image active />
```

### Spin

```tsx
import { Spin, Space, Alert } from 'antd';
import { LoadingOutlined } from '@ant-design/icons';

// Basic
<Spin size="small" />
<Spin />
<Spin size="large" />

// Custom indicator
const antIcon = <LoadingOutlined style={{ fontSize: 24 }} spin />;
<Spin indicator={antIcon} />

// Container
<Spin spinning={loading}>
  <Alert
    message="Content"
    description="Content being loaded..."
    type="info"
  />
</Spin>
```

### Result

```tsx
import { Result, Button } from 'antd';

<Result
  status="success"
  title="Successfully Purchased Cloud Server!"
  subTitle="Order number: 2017182818828182881"
  extra={[
    <Button type="primary" key="console">Go Console</Button>,
    <Button key="buy">Buy Again</Button>,
  ]}
/>

// Status options: success, error, info, warning, 404, 403, 500
```

## Data Entry

### Cascader

```tsx
import { Cascader } from 'antd';

const options = [
  {
    value: 'usa',
    label: 'United States',
    children: [
      {
        value: 'california',
        label: 'California',
        children: [
          { value: 'sf', label: 'San Francisco' },
          { value: 'la', label: 'Los Angeles' },
        ],
      },
    ],
  },
];

<Cascader
  options={options}
  placeholder="Select location"
  showSearch={{
    filter: (inputValue, path) =>
      path.some((option) =>
        option.label.toLowerCase().includes(inputValue.toLowerCase())
      ),
  }}
/>
```

### TreeSelect

```tsx
import { TreeSelect } from 'antd';

const treeData = [
  {
    value: 'parent',
    title: 'Parent',
    children: [
      { value: 'child1', title: 'Child 1' },
      { value: 'child2', title: 'Child 2' },
    ],
  },
];

<TreeSelect
  showSearch
  style={{ width: '100%' }}
  dropdownStyle={{ maxHeight: 400, overflow: 'auto' }}
  placeholder="Please select"
  allowClear
  treeDefaultExpandAll
  treeData={treeData}
/>

// Multiple
<TreeSelect
  treeData={treeData}
  treeCheckable
  showCheckedStrategy={TreeSelect.SHOW_PARENT}
  placeholder="Please select"
/>
```

### Transfer

```tsx
import { Transfer } from 'antd';

const mockData = Array.from({ length: 20 }).map((_, i) => ({
  key: i.toString(),
  title: `Content ${i + 1}`,
  description: `Description of content ${i + 1}`,
}));

function TransferDemo() {
  const [targetKeys, setTargetKeys] = useState(['1', '2']);
  const [selectedKeys, setSelectedKeys] = useState([]);

  return (
    <Transfer
      dataSource={mockData}
      titles={['Source', 'Target']}
      targetKeys={targetKeys}
      selectedKeys={selectedKeys}
      onChange={(nextTargetKeys) => setTargetKeys(nextTargetKeys)}
      onSelectChange={(sourceSelectedKeys, targetSelectedKeys) => {
        setSelectedKeys([...sourceSelectedKeys, ...targetSelectedKeys]);
      }}
      render={(item) => item.title}
    />
  );
}
```

### ColorPicker

```tsx
import { ColorPicker, Space } from 'antd';

<Space>
  <ColorPicker defaultValue="#1677ff" />
  <ColorPicker defaultValue="#1677ff" showText />
  <ColorPicker defaultValue="#1677ff" showText={(color) => color.toHexString()} />
</Space>

// With presets
<ColorPicker
  presets={[
    {
      label: 'Recommended',
      colors: ['#1677ff', '#52c41a', '#faad14', '#ff4d4f'],
    },
  ]}
/>
```

### Rate

```tsx
import { Rate } from 'antd';
import { HeartOutlined } from '@ant-design/icons';

<Rate defaultValue={3} />
<Rate allowHalf defaultValue={2.5} />
<Rate disabled defaultValue={4} />
<Rate character={<HeartOutlined />} />
<Rate character={({ index = 0 }) => index + 1} />
```

### Slider

```tsx
import { Slider, InputNumber, Row, Col } from 'antd';

// Basic
<Slider defaultValue={30} />

// Range
<Slider range defaultValue={[20, 50]} />

// With marks
<Slider
  marks={{
    0: '0C',
    26: '26C',
    37: '37C',
    100: {
      style: { color: '#f50' },
      label: <strong>100C</strong>,
    },
  }}
  defaultValue={37}
/>

// With input
function SliderWithInput() {
  const [value, setValue] = useState(1);

  return (
    <Row>
      <Col span={12}>
        <Slider min={1} max={20} value={value} onChange={setValue} />
      </Col>
      <Col span={4}>
        <InputNumber min={1} max={20} value={value} onChange={setValue} />
      </Col>
    </Row>
  );
}
```

### Switch

```tsx
import { Switch, Space } from 'antd';
import { CheckOutlined, CloseOutlined } from '@ant-design/icons';

<Switch defaultChecked />
<Switch checkedChildren="ON" unCheckedChildren="OFF" />
<Switch
  checkedChildren={<CheckOutlined />}
  unCheckedChildren={<CloseOutlined />}
  defaultChecked
/>
<Switch loading defaultChecked />
<Switch size="small" />
```

## Navigation

### Steps

```tsx
import { Steps } from 'antd';
import { UserOutlined, SolutionOutlined, LoadingOutlined, SmileOutlined } from '@ant-design/icons';

<Steps
  current={1}
  items={[
    {
      title: 'Login',
      status: 'finish',
      icon: <UserOutlined />,
    },
    {
      title: 'Verification',
      status: 'process',
      icon: <LoadingOutlined />,
    },
    {
      title: 'Pay',
      status: 'wait',
      icon: <SolutionOutlined />,
    },
    {
      title: 'Done',
      status: 'wait',
      icon: <SmileOutlined />,
    },
  ]}
/>

// Vertical
<Steps direction="vertical" current={1} items={items} />

// Small
<Steps size="small" current={1} items={items} />
```

### Dropdown

```tsx
import { Dropdown, Button, Space } from 'antd';
import { DownOutlined } from '@ant-design/icons';

const items = [
  { key: '1', label: 'Action 1' },
  { key: '2', label: 'Action 2' },
  { type: 'divider' },
  { key: '3', label: 'Action 3', danger: true },
];

<Dropdown menu={{ items, onClick: ({ key }) => console.log(key) }}>
  <Button>
    <Space>
      Actions
      <DownOutlined />
    </Space>
  </Button>
</Dropdown>

// Context menu
<Dropdown menu={{ items }} trigger={['contextMenu']}>
  <div style={{ padding: 50, background: '#f0f0f0' }}>
    Right Click on Me
  </div>
</Dropdown>
```

### Anchor

```tsx
import { Anchor, Row, Col } from 'antd';

<Row>
  <Col span={16}>
    <div id="part-1" style={{ height: 100vh }}>Part 1</div>
    <div id="part-2" style={{ height: 100vh }}>Part 2</div>
    <div id="part-3" style={{ height: 100vh }}>Part 3</div>
  </Col>
  <Col span={8}>
    <Anchor
      items={[
        { key: 'part-1', href: '#part-1', title: 'Part 1' },
        { key: 'part-2', href: '#part-2', title: 'Part 2' },
        { key: 'part-3', href: '#part-3', title: 'Part 3' },
      ]}
    />
  </Col>
</Row>
```

### Affix

```tsx
import { Affix, Button } from 'antd';

<Affix offsetTop={120}>
  <Button type="primary">Fixed at top</Button>
</Affix>

<Affix offsetBottom={10}>
  <Button type="primary">Fixed at bottom</Button>
</Affix>
```

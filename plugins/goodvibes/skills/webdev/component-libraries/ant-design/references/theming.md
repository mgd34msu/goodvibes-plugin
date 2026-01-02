# Ant Design Theming Reference

Advanced theming patterns for Ant Design.

## Design Tokens

### Token Categories

```tsx
import { ConfigProvider, theme } from 'antd';

<ConfigProvider
  theme={{
    token: {
      // Seed tokens (primary values that derive others)
      colorPrimary: '#1677ff',
      colorSuccess: '#52c41a',
      colorWarning: '#faad14',
      colorError: '#ff4d4f',
      colorInfo: '#1677ff',
      colorTextBase: '#000',
      colorBgBase: '#fff',

      // Layout
      fontSize: 14,
      lineHeight: 1.5714,
      borderRadius: 6,

      // Typography
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontFamilyCode: 'SFMono-Regular, Consolas, monospace',
      fontSizeHeading1: 38,
      fontSizeHeading2: 30,
      fontSizeHeading3: 24,
      fontSizeHeading4: 20,
      fontSizeHeading5: 16,

      // Sizing
      sizeUnit: 4,
      sizeStep: 4,

      // Motion
      motionDurationFast: '0.1s',
      motionDurationMid: '0.2s',
      motionDurationSlow: '0.3s',
      motionEaseInOut: 'cubic-bezier(0.645, 0.045, 0.355, 1)',

      // Control
      controlHeight: 32,
      controlHeightLG: 40,
      controlHeightSM: 24,
      controlPaddingHorizontal: 12,

      // Space
      padding: 16,
      paddingXS: 8,
      paddingSM: 12,
      paddingLG: 24,
      paddingXL: 32,
      margin: 16,
      marginXS: 8,
      marginSM: 12,
      marginLG: 24,
      marginXL: 32,

      // Border
      lineWidth: 1,
      lineWidthBold: 2,
      lineType: 'solid',

      // Box shadow
      boxShadow: '0 6px 16px 0 rgba(0, 0, 0, 0.08)',
      boxShadowSecondary: '0 3px 6px -4px rgba(0, 0, 0, 0.12)',

      // Z-index
      zIndexPopupBase: 1000,
      zIndexAffix: 10,
      zIndexPopoverBase: 1030,
    },
  }}
>
  <App />
</ConfigProvider>
```

### Component-Level Tokens

```tsx
<ConfigProvider
  theme={{
    components: {
      Button: {
        colorPrimary: '#00b96b',
        colorPrimaryHover: '#00a65f',
        borderRadius: 8,
        controlHeight: 40,
        fontSize: 16,
        fontWeight: 600,
      },
      Input: {
        colorBorder: '#d9d9d9',
        colorPrimaryHover: '#40a9ff',
        borderRadius: 8,
        controlHeight: 40,
        paddingInline: 16,
      },
      Table: {
        headerBg: '#fafafa',
        headerColor: 'rgba(0, 0, 0, 0.88)',
        rowHoverBg: '#f5f5f5',
        borderColor: '#f0f0f0',
      },
      Card: {
        headerBg: '#fafafa',
        actionsBg: '#fafafa',
        borderRadiusLG: 12,
      },
      Modal: {
        headerBg: '#fff',
        titleFontSize: 18,
        titleLineHeight: 1.5,
      },
      Menu: {
        itemBg: 'transparent',
        subMenuItemBg: 'transparent',
        itemSelectedBg: '#e6f4ff',
        itemHoverBg: '#f5f5f5',
      },
    },
  }}
>
  <App />
</ConfigProvider>
```

## Theme Algorithms

### Dark Mode

```tsx
import { ConfigProvider, theme, Button, Card } from 'antd';

function App() {
  const [isDark, setIsDark] = useState(false);

  return (
    <ConfigProvider
      theme={{
        algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: '#1677ff',
        },
      }}
    >
      <Card>
        <Button onClick={() => setIsDark(!isDark)}>
          Toggle Theme
        </Button>
      </Card>
    </ConfigProvider>
  );
}
```

### Compact Mode

```tsx
<ConfigProvider
  theme={{
    algorithm: theme.compactAlgorithm,
  }}
>
  <App />
</ConfigProvider>
```

### Combined Algorithms

```tsx
<ConfigProvider
  theme={{
    algorithm: [theme.darkAlgorithm, theme.compactAlgorithm],
    token: {
      colorPrimary: '#00b96b',
    },
  }}
>
  <App />
</ConfigProvider>
```

## Using Theme Tokens in Components

### useToken Hook

```tsx
import { theme, Typography } from 'antd';

const { useToken } = theme;

function CustomComponent() {
  const { token } = useToken();

  return (
    <div
      style={{
        backgroundColor: token.colorBgContainer,
        color: token.colorText,
        padding: token.paddingLG,
        borderRadius: token.borderRadius,
        boxShadow: token.boxShadow,
      }}
    >
      <Typography.Title level={4} style={{ color: token.colorPrimary }}>
        Custom Styled Component
      </Typography.Title>
      <Typography.Text style={{ color: token.colorTextSecondary }}>
        Using theme tokens directly
      </Typography.Text>
    </div>
  );
}
```

### CSS Variables

```tsx
import { ConfigProvider } from 'antd';

<ConfigProvider
  theme={{
    cssVar: true,
    hashed: false, // Disable hash for easier debugging
  }}
>
  <App />
</ConfigProvider>

// CSS
.my-custom-class {
  background-color: var(--ant-color-primary);
  border-radius: var(--ant-border-radius);
  padding: var(--ant-padding);
}
```

## Nested Themes

```tsx
import { ConfigProvider, Button, Card } from 'antd';

function App() {
  return (
    <ConfigProvider
      theme={{
        token: { colorPrimary: '#1677ff' },
      }}
    >
      <Card title="Blue Theme">
        <Button type="primary">Blue Button</Button>

        <ConfigProvider
          theme={{
            token: { colorPrimary: '#00b96b' },
          }}
        >
          <Card title="Green Theme" style={{ marginTop: 16 }}>
            <Button type="primary">Green Button</Button>
          </Card>
        </ConfigProvider>
      </Card>
    </ConfigProvider>
  );
}
```

## Dynamic Theming

```tsx
import { ConfigProvider, ColorPicker, Slider, Space, Button, Card } from 'antd';
import { useState } from 'react';

function ThemeEditor() {
  const [primary, setPrimary] = useState('#1677ff');
  const [borderRadius, setBorderRadius] = useState(6);
  const [fontSize, setFontSize] = useState(14);

  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: primary,
          borderRadius,
          fontSize,
        },
      }}
    >
      <Card title="Theme Editor">
        <Space direction="vertical" size="large">
          <div>
            <label>Primary Color: </label>
            <ColorPicker
              value={primary}
              onChange={(color) => setPrimary(color.toHexString())}
            />
          </div>
          <div>
            <label>Border Radius: {borderRadius}px</label>
            <Slider
              min={0}
              max={20}
              value={borderRadius}
              onChange={setBorderRadius}
            />
          </div>
          <div>
            <label>Font Size: {fontSize}px</label>
            <Slider
              min={12}
              max={20}
              value={fontSize}
              onChange={setFontSize}
            />
          </div>
          <Button type="primary">Preview Button</Button>
        </Space>
      </Card>
    </ConfigProvider>
  );
}
```

## Custom Theme Presets

```tsx
// themes.ts
import { ThemeConfig } from 'antd';

export const blueTheme: ThemeConfig = {
  token: {
    colorPrimary: '#1677ff',
    colorSuccess: '#52c41a',
    colorWarning: '#faad14',
    colorError: '#ff4d4f',
    borderRadius: 6,
  },
};

export const greenTheme: ThemeConfig = {
  token: {
    colorPrimary: '#00b96b',
    colorSuccess: '#52c41a',
    colorWarning: '#faad14',
    colorError: '#ff4d4f',
    borderRadius: 8,
  },
};

export const purpleTheme: ThemeConfig = {
  token: {
    colorPrimary: '#722ed1',
    colorSuccess: '#52c41a',
    colorWarning: '#faad14',
    colorError: '#ff4d4f',
    borderRadius: 12,
  },
};

// Usage
import { blueTheme, greenTheme, purpleTheme } from './themes';

function App() {
  const [currentTheme, setCurrentTheme] = useState(blueTheme);

  return (
    <ConfigProvider theme={currentTheme}>
      <App />
    </ConfigProvider>
  );
}
```

## RTL Support

```tsx
import { ConfigProvider } from 'antd';

<ConfigProvider direction="rtl">
  <App />
</ConfigProvider>

// Or dynamically
function App() {
  const [direction, setDirection] = useState('ltr');

  return (
    <ConfigProvider direction={direction}>
      <Button onClick={() => setDirection(direction === 'ltr' ? 'rtl' : 'ltr')}>
        Toggle Direction
      </Button>
    </ConfigProvider>
  );
}
```

## Component Size

```tsx
import { ConfigProvider, Space, Button, Input, DatePicker } from 'antd';

// Global size
<ConfigProvider componentSize="large">
  <Space>
    <Button type="primary">Large Button</Button>
    <Input placeholder="Large Input" />
    <DatePicker />
  </Space>
</ConfigProvider>

// Size options: 'small' | 'middle' | 'large'
```

## Prefix Class

```tsx
import { ConfigProvider } from 'antd';

// Custom prefix for CSS classes
<ConfigProvider prefixCls="my-app">
  <App />
</ConfigProvider>

// Components will use: my-app-btn, my-app-input, etc.
// Useful for micro-frontends or style isolation
```

## Form Validation Messages

```tsx
import { ConfigProvider, Form, Input } from 'antd';

const validateMessages = {
  required: '${label} is required!',
  types: {
    email: '${label} is not a valid email!',
    number: '${label} is not a valid number!',
  },
  number: {
    range: '${label} must be between ${min} and ${max}',
  },
};

<ConfigProvider form={{ validateMessages }}>
  <Form>
    <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
      <Input />
    </Form.Item>
  </Form>
</ConfigProvider>
```

## Complete Theme Example

```tsx
import { ConfigProvider, theme } from 'antd';

const customTheme = {
  // Algorithm
  algorithm: theme.defaultAlgorithm,

  // Global tokens
  token: {
    colorPrimary: '#1890ff',
    colorSuccess: '#52c41a',
    colorWarning: '#faad14',
    colorError: '#ff4d4f',
    colorInfo: '#1890ff',

    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
    fontSize: 14,
    fontSizeHeading1: 38,

    borderRadius: 8,
    borderRadiusLG: 12,
    borderRadiusSM: 4,

    controlHeight: 36,
    controlHeightLG: 44,
    controlHeightSM: 28,

    padding: 16,
    paddingLG: 24,

    motion: true,
    motionDurationMid: '0.2s',
  },

  // Component-specific tokens
  components: {
    Button: {
      borderRadius: 8,
      controlHeight: 40,
      paddingInline: 20,
    },
    Input: {
      controlHeight: 40,
      borderRadius: 8,
    },
    Card: {
      borderRadiusLG: 16,
      paddingLG: 24,
    },
    Table: {
      borderRadius: 8,
      headerBg: '#fafafa',
    },
    Modal: {
      borderRadiusLG: 16,
    },
  },

  // Enable CSS variables
  cssVar: true,
};

function App() {
  return (
    <ConfigProvider theme={customTheme}>
      <YourApp />
    </ConfigProvider>
  );
}
```

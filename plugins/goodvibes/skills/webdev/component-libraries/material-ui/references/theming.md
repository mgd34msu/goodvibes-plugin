# Material UI Theming Reference

Advanced theming patterns for MUI.

## Theme Structure

```tsx
import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  // Color palette
  palette: {
    mode: 'light', // 'light' | 'dark'
    primary: {
      main: '#1976d2',
      light: '#42a5f5',
      dark: '#1565c0',
      contrastText: '#fff',
    },
    secondary: {
      main: '#9c27b0',
    },
    error: {
      main: '#d32f2f',
    },
    warning: {
      main: '#ed6c02',
    },
    info: {
      main: '#0288d1',
    },
    success: {
      main: '#2e7d32',
    },
    grey: {
      50: '#fafafa',
      100: '#f5f5f5',
      // ... 200-900
    },
    text: {
      primary: 'rgba(0, 0, 0, 0.87)',
      secondary: 'rgba(0, 0, 0, 0.6)',
      disabled: 'rgba(0, 0, 0, 0.38)',
    },
    divider: 'rgba(0, 0, 0, 0.12)',
    background: {
      paper: '#fff',
      default: '#fff',
    },
    action: {
      active: 'rgba(0, 0, 0, 0.54)',
      hover: 'rgba(0, 0, 0, 0.04)',
      selected: 'rgba(0, 0, 0, 0.08)',
      disabled: 'rgba(0, 0, 0, 0.26)',
      disabledBackground: 'rgba(0, 0, 0, 0.12)',
    },
  },

  // Typography
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    fontSize: 14,
    fontWeightLight: 300,
    fontWeightRegular: 400,
    fontWeightMedium: 500,
    fontWeightBold: 700,
    h1: {
      fontSize: '6rem',
      fontWeight: 300,
      lineHeight: 1.167,
      letterSpacing: '-0.01562em',
    },
    h2: {
      fontSize: '3.75rem',
      fontWeight: 300,
      lineHeight: 1.2,
      letterSpacing: '-0.00833em',
    },
    h3: {
      fontSize: '3rem',
      fontWeight: 400,
      lineHeight: 1.167,
      letterSpacing: '0em',
    },
    h4: {
      fontSize: '2.125rem',
      fontWeight: 400,
      lineHeight: 1.235,
      letterSpacing: '0.00735em',
    },
    h5: {
      fontSize: '1.5rem',
      fontWeight: 400,
      lineHeight: 1.334,
      letterSpacing: '0em',
    },
    h6: {
      fontSize: '1.25rem',
      fontWeight: 500,
      lineHeight: 1.6,
      letterSpacing: '0.0075em',
    },
    subtitle1: {
      fontSize: '1rem',
      fontWeight: 400,
      lineHeight: 1.75,
      letterSpacing: '0.00938em',
    },
    subtitle2: {
      fontSize: '0.875rem',
      fontWeight: 500,
      lineHeight: 1.57,
      letterSpacing: '0.00714em',
    },
    body1: {
      fontSize: '1rem',
      fontWeight: 400,
      lineHeight: 1.5,
      letterSpacing: '0.00938em',
    },
    body2: {
      fontSize: '0.875rem',
      fontWeight: 400,
      lineHeight: 1.43,
      letterSpacing: '0.01071em',
    },
    button: {
      fontSize: '0.875rem',
      fontWeight: 500,
      lineHeight: 1.75,
      letterSpacing: '0.02857em',
      textTransform: 'uppercase',
    },
    caption: {
      fontSize: '0.75rem',
      fontWeight: 400,
      lineHeight: 1.66,
      letterSpacing: '0.03333em',
    },
    overline: {
      fontSize: '0.75rem',
      fontWeight: 400,
      lineHeight: 2.66,
      letterSpacing: '0.08333em',
      textTransform: 'uppercase',
    },
  },

  // Spacing (default 8px)
  spacing: 8, // theme.spacing(2) = 16px

  // Breakpoints
  breakpoints: {
    values: {
      xs: 0,
      sm: 600,
      md: 900,
      lg: 1200,
      xl: 1536,
    },
  },

  // Shape
  shape: {
    borderRadius: 4,
  },

  // Shadows
  shadows: [
    'none',
    '0px 2px 1px -1px rgba(0,0,0,0.2),...',
    // ... 0-24 levels
  ],

  // Z-index
  zIndex: {
    mobileStepper: 1000,
    fab: 1050,
    speedDial: 1050,
    appBar: 1100,
    drawer: 1200,
    modal: 1300,
    snackbar: 1400,
    tooltip: 1500,
  },

  // Transitions
  transitions: {
    duration: {
      shortest: 150,
      shorter: 200,
      short: 250,
      standard: 300,
      complex: 375,
      enteringScreen: 225,
      leavingScreen: 195,
    },
    easing: {
      easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
      easeOut: 'cubic-bezier(0.0, 0, 0.2, 1)',
      easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
      sharp: 'cubic-bezier(0.4, 0, 0.6, 1)',
    },
  },
});
```

## Component Customization

### styleOverrides

```tsx
const theme = createTheme({
  components: {
    MuiButton: {
      styleOverrides: {
        // Target the root element
        root: {
          borderRadius: 8,
          textTransform: 'none',
          fontWeight: 600,
        },
        // Target specific variants
        contained: {
          boxShadow: 'none',
          '&:hover': {
            boxShadow: 'none',
          },
        },
        containedPrimary: {
          background: 'linear-gradient(45deg, #FE6B8B 30%, #FF8E53 90%)',
        },
        // Target sizes
        sizeLarge: {
          padding: '12px 24px',
          fontSize: '1rem',
        },
        sizeSmall: {
          padding: '4px 12px',
          fontSize: '0.75rem',
        },
        // Use ownerState for conditional styling
        root: ({ ownerState, theme }) => ({
          ...(ownerState.variant === 'contained' &&
            ownerState.color === 'primary' && {
              backgroundColor: theme.palette.primary.dark,
            }),
        }),
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 8,
            '&:hover fieldset': {
              borderColor: '#1976d2',
            },
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        },
      },
    },
  },
});
```

### defaultProps

```tsx
const theme = createTheme({
  components: {
    MuiButton: {
      defaultProps: {
        disableElevation: true,
        disableRipple: true,
        size: 'medium',
      },
    },
    MuiTextField: {
      defaultProps: {
        variant: 'outlined',
        size: 'small',
        fullWidth: true,
      },
    },
    MuiLink: {
      defaultProps: {
        underline: 'hover',
      },
    },
    MuiTooltip: {
      defaultProps: {
        arrow: true,
      },
    },
  },
});
```

### variants

```tsx
const theme = createTheme({
  components: {
    MuiButton: {
      variants: [
        {
          props: { variant: 'dashed' },
          style: {
            border: '2px dashed',
            borderColor: 'currentColor',
          },
        },
        {
          props: { variant: 'dashed', color: 'primary' },
          style: {
            borderColor: '#1976d2',
            color: '#1976d2',
          },
        },
        {
          props: { size: 'extra-large' },
          style: {
            padding: '16px 32px',
            fontSize: '1.25rem',
          },
        },
      ],
    },
  },
});

// Usage
<Button variant="dashed">Dashed Button</Button>
<Button variant="dashed" color="primary">Primary Dashed</Button>
<Button size="extra-large">Extra Large</Button>
```

## Custom Colors

### Adding Custom Palette Colors

```tsx
// Extend the palette
declare module '@mui/material/styles' {
  interface Palette {
    neutral: Palette['primary'];
    brand: Palette['primary'];
  }
  interface PaletteOptions {
    neutral?: PaletteOptions['primary'];
    brand?: PaletteOptions['primary'];
  }
}

// Extend color prop
declare module '@mui/material/Button' {
  interface ButtonPropsColorOverrides {
    neutral: true;
    brand: true;
  }
}

const theme = createTheme({
  palette: {
    neutral: {
      main: '#64748B',
      light: '#94A3B8',
      dark: '#475569',
      contrastText: '#fff',
    },
    brand: {
      main: '#FF5722',
      light: '#FF8A65',
      dark: '#E64A19',
      contrastText: '#fff',
    },
  },
});

// Usage
<Button color="neutral">Neutral</Button>
<Button color="brand">Brand</Button>
```

## Responsive Typography

```tsx
const theme = createTheme({
  typography: {
    h1: {
      fontSize: '2.5rem',
      '@media (min-width:600px)': {
        fontSize: '3rem',
      },
      '@media (min-width:900px)': {
        fontSize: '4rem',
      },
    },
  },
});

// Or using responsiveFontSizes helper
import { createTheme, responsiveFontSizes } from '@mui/material/styles';

let theme = createTheme();
theme = responsiveFontSizes(theme);
```

## CSS Variables

```tsx
import { Experimental_CssVarsProvider as CssVarsProvider } from '@mui/material/styles';

// Enable CSS variables mode
const theme = createTheme({
  cssVariables: true,
});

<CssVarsProvider>
  <App />
</CssVarsProvider>

// Access in CSS
.custom-element {
  background-color: var(--mui-palette-primary-main);
  color: var(--mui-palette-primary-contrastText);
  padding: var(--mui-spacing-2);
}
```

## Dark Mode with CSS Variables

```tsx
import {
  Experimental_CssVarsProvider as CssVarsProvider,
  useColorScheme,
} from '@mui/material/styles';

function ModeToggle() {
  const { mode, setMode } = useColorScheme();
  return (
    <Button
      onClick={() => setMode(mode === 'light' ? 'dark' : 'light')}
    >
      {mode === 'light' ? 'Dark' : 'Light'}
    </Button>
  );
}

<CssVarsProvider>
  <ModeToggle />
</CssVarsProvider>
```

## Styled Components

```tsx
import { styled } from '@mui/material/styles';
import Button from '@mui/material/Button';

const StyledButton = styled(Button)(({ theme }) => ({
  backgroundColor: theme.palette.primary.main,
  color: theme.palette.primary.contrastText,
  padding: theme.spacing(2, 4),
  borderRadius: theme.shape.borderRadius * 2,
  '&:hover': {
    backgroundColor: theme.palette.primary.dark,
  },
  [theme.breakpoints.down('sm')]: {
    padding: theme.spacing(1, 2),
  },
}));

// With custom props
interface CustomButtonProps {
  success?: boolean;
}

const CustomButton = styled(Button, {
  shouldForwardProp: (prop) => prop !== 'success',
})<CustomButtonProps>(({ theme, success }) => ({
  ...(success && {
    backgroundColor: theme.palette.success.main,
    '&:hover': {
      backgroundColor: theme.palette.success.dark,
    },
  }),
}));

<CustomButton success>Success Button</CustomButton>
```

## Theme Composition

```tsx
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { deepmerge } from '@mui/utils';

// Base theme
const baseTheme = createTheme({
  palette: {
    primary: { main: '#1976d2' },
  },
});

// Extended theme for specific feature
const featureTheme = createTheme(deepmerge(baseTheme, {
  components: {
    MuiButton: {
      styleOverrides: {
        root: { borderRadius: 20 },
      },
    },
  },
}));

// Nested themes
<ThemeProvider theme={baseTheme}>
  <App />
  <ThemeProvider theme={featureTheme}>
    <FeatureSection />
  </ThemeProvider>
</ThemeProvider>
```

## Using Theme in Components

```tsx
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';

function ResponsiveComponent() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isTablet = useMediaQuery(theme.breakpoints.between('sm', 'md'));

  return (
    <Box
      sx={{
        backgroundColor: theme.palette.background.paper,
        padding: theme.spacing(isMobile ? 2 : 4),
        borderRadius: theme.shape.borderRadius,
      }}
    >
      {isMobile ? 'Mobile' : isTablet ? 'Tablet' : 'Desktop'}
    </Box>
  );
}
```

## Complete Theme Example

```tsx
import { createTheme, responsiveFontSizes } from '@mui/material/styles';

let theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#2563eb',
      light: '#3b82f6',
      dark: '#1d4ed8',
    },
    secondary: {
      main: '#7c3aed',
    },
    background: {
      default: '#f8fafc',
      paper: '#ffffff',
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", sans-serif',
    button: {
      textTransform: 'none',
      fontWeight: 600,
    },
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          padding: '8px 16px',
        },
        contained: {
          boxShadow: 'none',
          '&:hover': {
            boxShadow: 'none',
          },
        },
      },
      defaultProps: {
        disableElevation: true,
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        variant: 'outlined',
        size: 'small',
      },
    },
  },
});

theme = responsiveFontSizes(theme);

export default theme;
```

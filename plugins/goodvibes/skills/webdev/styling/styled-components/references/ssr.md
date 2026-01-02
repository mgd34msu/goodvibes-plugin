# styled-components Server-Side Rendering

SSR setup for Next.js, Gatsby, and custom servers.

## Next.js App Router (v13+)

Requires styled-components v6+.

### Create Registry

```tsx
// lib/registry.tsx
'use client';

import React, { useState } from 'react';
import { useServerInsertedHTML } from 'next/navigation';
import { ServerStyleSheet, StyleSheetManager } from 'styled-components';

export default function StyledComponentsRegistry({
  children,
}: {
  children: React.ReactNode;
}) {
  // Only create stylesheet once with lazy initial state
  const [styledComponentsStyleSheet] = useState(() => new ServerStyleSheet());

  useServerInsertedHTML(() => {
    const styles = styledComponentsStyleSheet.getStyleElement();
    styledComponentsStyleSheet.instance.clearTag();
    return <>{styles}</>;
  });

  if (typeof window !== 'undefined') return <>{children}</>;

  return (
    <StyleSheetManager sheet={styledComponentsStyleSheet.instance}>
      {children}
    </StyleSheetManager>
  );
}
```

### Use in Layout

```tsx
// app/layout.tsx
import StyledComponentsRegistry from './lib/registry';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html>
      <body>
        <StyledComponentsRegistry>
          {children}
        </StyledComponentsRegistry>
      </body>
    </html>
  );
}
```

### With ThemeProvider

```tsx
// lib/registry.tsx
'use client';

import React, { useState } from 'react';
import { useServerInsertedHTML } from 'next/navigation';
import { ServerStyleSheet, StyleSheetManager, ThemeProvider } from 'styled-components';
import { theme } from './theme';

export default function StyledComponentsRegistry({
  children,
}: {
  children: React.ReactNode;
}) {
  const [styledComponentsStyleSheet] = useState(() => new ServerStyleSheet());

  useServerInsertedHTML(() => {
    const styles = styledComponentsStyleSheet.getStyleElement();
    styledComponentsStyleSheet.instance.clearTag();
    return <>{styles}</>;
  });

  if (typeof window !== 'undefined') {
    return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
  }

  return (
    <StyleSheetManager sheet={styledComponentsStyleSheet.instance}>
      <ThemeProvider theme={theme}>{children}</ThemeProvider>
    </StyleSheetManager>
  );
}
```

## Next.js Pages Router

### With SWC (Recommended)

```javascript
// next.config.js
module.exports = {
  compiler: {
    styledComponents: true,
  },
};
```

### With Babel

Install plugin:

```bash
npm install -D babel-plugin-styled-components
```

```json
// .babelrc
{
  "presets": ["next/babel"],
  "plugins": [
    [
      "babel-plugin-styled-components",
      {
        "ssr": true,
        "displayName": true,
        "preprocess": false
      }
    ]
  ]
}
```

### Custom _document.tsx

```tsx
// pages/_document.tsx
import Document, { DocumentContext, DocumentInitialProps } from 'next/document';
import { ServerStyleSheet } from 'styled-components';

export default class MyDocument extends Document {
  static async getInitialProps(
    ctx: DocumentContext
  ): Promise<DocumentInitialProps> {
    const sheet = new ServerStyleSheet();
    const originalRenderPage = ctx.renderPage;

    try {
      ctx.renderPage = () =>
        originalRenderPage({
          enhanceApp: (App) => (props) =>
            sheet.collectStyles(<App {...props} />),
        });

      const initialProps = await Document.getInitialProps(ctx);
      return {
        ...initialProps,
        styles: (
          <>
            {initialProps.styles}
            {sheet.getStyleElement()}
          </>
        ),
      };
    } finally {
      sheet.seal();
    }
  }
}
```

## Gatsby

Install plugin:

```bash
npm install gatsby-plugin-styled-components babel-plugin-styled-components
```

```javascript
// gatsby-config.js
module.exports = {
  plugins: [`gatsby-plugin-styled-components`],
};
```

## Custom Node Server

### Basic SSR

```tsx
import { renderToString } from 'react-dom/server';
import { ServerStyleSheet } from 'styled-components';

function renderApp() {
  const sheet = new ServerStyleSheet();

  try {
    const html = renderToString(
      sheet.collectStyles(<App />)
    );

    const styleTags = sheet.getStyleTags();

    return `
      <!DOCTYPE html>
      <html>
        <head>
          ${styleTags}
        </head>
        <body>
          <div id="root">${html}</div>
        </body>
      </html>
    `;
  } catch (error) {
    console.error(error);
    throw error;
  } finally {
    sheet.seal();
  }
}
```

### With Streaming

```tsx
import { renderToNodeStream } from 'react-dom/server';
import { ServerStyleSheet } from 'styled-components';

function handleRequest(req, res) {
  const sheet = new ServerStyleSheet();

  const jsx = sheet.collectStyles(<App />);
  const stream = sheet.interleaveWithNodeStream(
    renderToNodeStream(jsx)
  );

  res.write('<!DOCTYPE html><html><head></head><body><div id="root">');

  stream.pipe(res, { end: false });

  stream.on('end', () => {
    res.write('</div></body></html>');
    res.end();
    sheet.seal();
  });
}
```

### Express Server

```tsx
import express from 'express';
import { renderToString } from 'react-dom/server';
import { ServerStyleSheet, StyleSheetManager } from 'styled-components';

const app = express();

app.get('*', (req, res) => {
  const sheet = new ServerStyleSheet();

  try {
    const html = renderToString(
      <StyleSheetManager sheet={sheet.instance}>
        <App />
      </StyleSheetManager>
    );

    const styles = sheet.getStyleTags();

    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>My App</title>
          ${styles}
        </head>
        <body>
          <div id="root">${html}</div>
          <script src="/bundle.js"></script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error(error);
    res.status(500).send('Server Error');
  } finally {
    sheet.seal();
  }
});
```

## Hydration

### Client Entry

```tsx
// client.tsx
import { hydrateRoot } from 'react-dom/client';

const container = document.getElementById('root')!;
hydrateRoot(container, <App />);
```

### Avoiding Hydration Mismatch

Ensure consistent rendering:

```tsx
// Use suppressHydrationWarning for dynamic content
const TimeDisplay = styled.span.attrs({
  suppressHydrationWarning: true,
})``;

// Or use useEffect for client-only content
function ClientOnly({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;
  return <>{children}</>;
}
```

## Rehydration Issues

### Problem: Flash of Unstyled Content (FOUC)

Styles injected after HTML renders.

**Solution:** Ensure styles are in `<head>` before body renders:

```tsx
// Correct order in SSR template
const html = `
  <!DOCTYPE html>
  <html>
    <head>
      ${styleTags} <!-- Styles first -->
    </head>
    <body>
      <div id="root">${appHtml}</div>
      <script src="/bundle.js"></script>
    </body>
  </html>
`;
```

### Problem: Checksum Mismatch

Class names differ between server and client.

**Solution:** Use Babel plugin with deterministic IDs:

```json
{
  "plugins": [
    ["babel-plugin-styled-components", {
      "ssr": true,
      "displayName": true
    }]
  ]
}
```

## Testing SSR

```tsx
import { renderToString } from 'react-dom/server';
import { ServerStyleSheet } from 'styled-components';

describe('SSR', () => {
  it('renders styles to string', () => {
    const sheet = new ServerStyleSheet();

    try {
      const html = renderToString(
        sheet.collectStyles(<Button>Test</Button>)
      );
      const styles = sheet.getStyleTags();

      expect(html).toContain('class=');
      expect(styles).toContain('<style');
      expect(styles).toContain('background');
    } finally {
      sheet.seal();
    }
  });
});
```

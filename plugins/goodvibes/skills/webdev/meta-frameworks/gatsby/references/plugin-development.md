# Gatsby Plugin Development

## Local Plugin Structure

```
plugins/
  gatsby-plugin-custom/
    package.json
    gatsby-node.js
    gatsby-browser.js
    gatsby-ssr.js
```

## Source Plugin

```javascript
// plugins/gatsby-source-custom/gatsby-node.js
exports.sourceNodes = async (
  { actions, createNodeId, createContentDigest },
  pluginOptions
) => {
  const { createNode } = actions
  const { apiUrl, apiKey } = pluginOptions

  const response = await fetch(apiUrl, {
    headers: { Authorization: `Bearer ${apiKey}` }
  })
  const items = await response.json()

  items.forEach((item) => {
    const node = {
      ...item,
      id: createNodeId(`CustomItem-${item.id}`),
      parent: null,
      children: [],
      internal: {
        type: "CustomItem",
        content: JSON.stringify(item),
        contentDigest: createContentDigest(item),
      },
    }
    createNode(node)
  })
}

// Define schema
exports.createSchemaCustomization = ({ actions }) => {
  actions.createTypes(`
    type CustomItem implements Node {
      id: ID!
      title: String!
      content: String
      createdAt: Date @dateformat
    }
  `)
}
```

## Transformer Plugin

```javascript
// plugins/gatsby-transformer-custom/gatsby-node.js
const crypto = require("crypto")

exports.onCreateNode = async ({
  node,
  actions,
  loadNodeContent,
  createNodeId,
  createContentDigest,
}) => {
  const { createNode, createParentChildLink } = actions

  // Only process .custom files
  if (node.internal.mediaType !== "application/custom") {
    return
  }

  const content = await loadNodeContent(node)
  const parsedContent = parseCustomFormat(content)

  const customNode = {
    ...parsedContent,
    id: createNodeId(`${node.id} >>> CustomParsed`),
    parent: node.id,
    children: [],
    internal: {
      type: "CustomParsed",
      contentDigest: createContentDigest(parsedContent),
    },
  }

  createNode(customNode)
  createParentChildLink({ parent: node, child: customNode })
}
```

## Browser Plugin

```javascript
// plugins/gatsby-plugin-analytics/gatsby-browser.js
export const onRouteUpdate = ({ location, prevLocation }) => {
  if (typeof window.analytics !== "undefined") {
    window.analytics.page(location.pathname)
  }
}

export const onClientEntry = () => {
  // Initialize analytics
  window.analytics = createAnalyticsInstance()
}

export const wrapPageElement = ({ element, props }) => {
  return <AnalyticsProvider>{element}</AnalyticsProvider>
}
```

## SSR Plugin

```javascript
// plugins/gatsby-plugin-theme/gatsby-ssr.js
import React from "react"

export const onRenderBody = ({ setHeadComponents, setHtmlAttributes }) => {
  setHtmlAttributes({ lang: "en" })

  setHeadComponents([
    <script
      key="theme-script"
      dangerouslySetInnerHTML={{
        __html: `
          (function() {
            var theme = localStorage.getItem('theme') || 'light';
            document.documentElement.setAttribute('data-theme', theme);
          })();
        `,
      }}
    />,
  ])
}

export const wrapRootElement = ({ element }) => {
  return <ThemeProvider>{element}</ThemeProvider>
}
```

## Plugin Options Schema

```javascript
// plugins/gatsby-plugin-custom/gatsby-node.js
exports.pluginOptionsSchema = ({ Joi }) => {
  return Joi.object({
    apiUrl: Joi.string()
      .required()
      .description("The API endpoint URL"),
    apiKey: Joi.string()
      .required()
      .description("API authentication key"),
    fetchInterval: Joi.number()
      .default(3600)
      .description("Refresh interval in seconds"),
    debug: Joi.boolean()
      .default(false)
      .description("Enable debug logging"),
  })
}
```

## Publishing Plugin

```json
// package.json
{
  "name": "gatsby-plugin-custom",
  "version": "1.0.0",
  "main": "index.js",
  "keywords": ["gatsby", "gatsby-plugin"],
  "peerDependencies": {
    "gatsby": "^5.0.0"
  }
}
```

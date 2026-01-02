# Gatsby GraphQL Patterns

## Query Variables

```graphql
query BlogPost($id: String!, $previousId: String, $nextId: String) {
  post: markdownRemark(id: { eq: $id }) {
    html
    frontmatter {
      title
      date(formatString: "MMMM DD, YYYY")
      tags
    }
  }
  previous: markdownRemark(id: { eq: $previousId }) {
    fields { slug }
    frontmatter { title }
  }
  next: markdownRemark(id: { eq: $nextId }) {
    fields { slug }
    frontmatter { title }
  }
}
```

## Filtering & Sorting

```graphql
query FilteredPosts {
  allMarkdownRemark(
    filter: {
      frontmatter: {
        published: { eq: true }
        tags: { in: ["react", "gatsby"] }
      }
    }
    sort: { frontmatter: { date: DESC } }
    limit: 10
    skip: 0
  ) {
    nodes {
      id
      frontmatter {
        title
        date
      }
    }
    totalCount
    pageInfo {
      hasNextPage
      hasPreviousPage
    }
  }
}
```

## Fragments

```graphql
# Define reusable fragment
fragment PostPreview on MarkdownRemark {
  id
  excerpt(pruneLength: 200)
  fields {
    slug
  }
  frontmatter {
    title
    date(formatString: "MMMM DD, YYYY")
    featuredImage {
      childImageSharp {
        gatsbyImageData(width: 400)
      }
    }
  }
}

# Use in query
query BlogList {
  allMarkdownRemark {
    nodes {
      ...PostPreview
    }
  }
}
```

## Image Queries

```graphql
query ProductImages {
  allFile(filter: { sourceInstanceName: { eq: "products" } }) {
    nodes {
      name
      childImageSharp {
        gatsbyImageData(
          width: 800
          height: 600
          transformOptions: { cropFocus: CENTER }
          placeholder: BLURRED
          formats: [AUTO, WEBP, AVIF]
        )
        original {
          width
          height
        }
      }
    }
  }
}
```

## Pagination Query

```graphql
query BlogList($skip: Int!, $limit: Int!) {
  allMarkdownRemark(
    sort: { frontmatter: { date: DESC } }
    skip: $skip
    limit: $limit
  ) {
    nodes {
      id
      fields { slug }
      frontmatter { title }
    }
  }
}
```

## Creating Pagination Pages

```javascript
// gatsby-node.js
exports.createPages = async ({ graphql, actions }) => {
  const { createPage } = actions
  const postsPerPage = 10

  const result = await graphql(`
    query {
      allMarkdownRemark {
        totalCount
      }
    }
  `)

  const numPages = Math.ceil(result.data.allMarkdownRemark.totalCount / postsPerPage)

  Array.from({ length: numPages }).forEach((_, i) => {
    createPage({
      path: i === 0 ? `/blog` : `/blog/${i + 1}`,
      component: path.resolve("./src/templates/blog-list.js"),
      context: {
        limit: postsPerPage,
        skip: i * postsPerPage,
        numPages,
        currentPage: i + 1,
      },
    })
  })
}
```

## Schema Customization

```javascript
// gatsby-node.js
exports.createSchemaCustomization = ({ actions }) => {
  const { createTypes } = actions

  createTypes(`
    type MarkdownRemark implements Node {
      frontmatter: Frontmatter
    }

    type Frontmatter {
      title: String!
      date: Date @dateformat
      tags: [String]
      featured: Boolean
      featuredImage: File @fileByRelativePath
    }
  `)
}
```

## Sourcing External APIs

```javascript
// gatsby-node.js
exports.sourceNodes = async ({ actions, createNodeId, createContentDigest }) => {
  const { createNode } = actions

  const response = await fetch("https://api.example.com/products")
  const products = await response.json()

  products.forEach((product) => {
    createNode({
      ...product,
      id: createNodeId(`Product-${product.id}`),
      internal: {
        type: "Product",
        contentDigest: createContentDigest(product),
      },
    })
  })
}
```

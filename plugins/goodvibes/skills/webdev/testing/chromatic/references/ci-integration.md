# Chromatic CI Integration

## GitHub Actions

### Basic Setup

```yaml
name: Chromatic

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  chromatic:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0 # Full history for accurate baselines

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Run Chromatic
        uses: chromaui/action@latest
        with:
          projectToken: ${{ secrets.CHROMATIC_PROJECT_TOKEN }}
```

### Advanced Configuration

```yaml
- uses: chromaui/action@latest
  with:
    projectToken: ${{ secrets.CHROMATIC_PROJECT_TOKEN }}

    # TurboSnap - only test changed stories
    onlyChanged: true
    traceChanged: expanded

    # Auto-accept on main
    autoAcceptChanges: main

    # Skip for certain branches
    skip: 'dependabot/**'

    # Build options
    buildScriptName: build-storybook
    storybookBuildDir: storybook-static

    # Performance
    zip: true

    # Reports
    junitReport: true
```

### PR Status Checks

```yaml
- uses: chromaui/action@latest
  id: chromatic
  with:
    projectToken: ${{ secrets.CHROMATIC_PROJECT_TOKEN }}
    exitZeroOnChanges: true # Don't fail, just report

- name: Comment PR
  uses: actions/github-script@v7
  if: github.event_name == 'pull_request'
  with:
    script: |
      github.rest.issues.createComment({
        issue_number: context.issue.number,
        owner: context.repo.owner,
        repo: context.repo.repo,
        body: `Chromatic visual test results: ${{ steps.chromatic.outputs.url }}`
      })
```

### Monorepo Setup

```yaml
jobs:
  chromatic:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        package: [web-app, design-system, docs]
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - run: npm ci

      - uses: chromaui/action@latest
        with:
          projectToken: ${{ secrets.CHROMATIC_PROJECT_TOKEN }}
          workingDir: packages/${{ matrix.package }}
          buildScriptName: build-storybook
```

## GitLab CI

```yaml
stages:
  - test

chromatic:
  stage: test
  image: node:20
  before_script:
    - npm ci
  script:
    - npx chromatic
        --project-token=$CHROMATIC_PROJECT_TOKEN
        --auto-accept-changes=main
        --only-changed
        --exit-zero-on-changes
  artifacts:
    reports:
      junit: chromatic-build-*.xml
  only:
    - merge_requests
    - main
```

## CircleCI

```yaml
version: 2.1

orbs:
  node: circleci/node@5

jobs:
  chromatic:
    executor:
      name: node/default
      tag: '20'
    steps:
      - checkout
      - node/install-packages
      - run:
          name: Run Chromatic
          command: |
            npx chromatic \
              --project-token=${CHROMATIC_PROJECT_TOKEN} \
              --auto-accept-changes=main \
              --only-changed

workflows:
  test:
    jobs:
      - chromatic
```

## Azure Pipelines

```yaml
trigger:
  - main

pool:
  vmImage: ubuntu-latest

steps:
  - task: NodeTool@0
    inputs:
      versionSpec: '20.x'

  - script: npm ci
    displayName: Install dependencies

  - script: |
      npx chromatic \
        --project-token=$(CHROMATIC_PROJECT_TOKEN) \
        --auto-accept-changes=main \
        --junit-report
    displayName: Run Chromatic

  - task: PublishTestResults@2
    inputs:
      testResultsFiles: chromatic-build-*.xml
```

## Jenkins

```groovy
pipeline {
  agent {
    docker { image 'node:20' }
  }

  environment {
    CHROMATIC_PROJECT_TOKEN = credentials('chromatic-token')
  }

  stages {
    stage('Install') {
      steps {
        sh 'npm ci'
      }
    }

    stage('Chromatic') {
      steps {
        sh '''
          npx chromatic \
            --project-token=$CHROMATIC_PROJECT_TOKEN \
            --auto-accept-changes=main \
            --junit-report
        '''
      }
    }
  }

  post {
    always {
      junit 'chromatic-build-*.xml'
    }
  }
}
```

## Bitbucket Pipelines

```yaml
pipelines:
  pull-requests:
    '**':
      - step:
          name: Chromatic
          image: node:20
          caches:
            - node
          script:
            - npm ci
            - npx chromatic
                --project-token=$CHROMATIC_PROJECT_TOKEN
                --exit-zero-on-changes

  branches:
    main:
      - step:
          name: Chromatic
          image: node:20
          caches:
            - node
          script:
            - npm ci
            - npx chromatic
                --project-token=$CHROMATIC_PROJECT_TOKEN
                --auto-accept-changes=main
```

## Best Practices

### Branch Baselines

```yaml
# Auto-accept on main to update baselines
autoAcceptChanges: main

# For release branches
autoAcceptChanges: "main|release/*"
```

### Caching Storybook Builds

```yaml
# GitHub Actions
- uses: actions/cache@v4
  with:
    path: storybook-static
    key: storybook-${{ hashFiles('src/**', '.storybook/**') }}

- run: npm run build-storybook
  if: steps.cache.outputs.cache-hit != 'true'

- uses: chromaui/action@latest
  with:
    storybookBuildDir: storybook-static
```

### Parallel Builds

```yaml
strategy:
  matrix:
    shard: [1, 2, 3, 4]

steps:
  - uses: chromaui/action@latest
    with:
      projectToken: ${{ secrets.CHROMATIC_PROJECT_TOKEN }}
      onlyStoryNames: "**/*--${{ matrix.shard }}*"
```

### Scheduled Baseline Updates

```yaml
on:
  schedule:
    - cron: '0 0 * * 1' # Weekly on Monday

jobs:
  update-baselines:
    runs-on: ubuntu-latest
    steps:
      - uses: chromaui/action@latest
        with:
          projectToken: ${{ secrets.CHROMATIC_PROJECT_TOKEN }}
          autoAcceptChanges: true
```

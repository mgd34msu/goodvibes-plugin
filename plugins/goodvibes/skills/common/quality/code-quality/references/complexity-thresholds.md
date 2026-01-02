# Complexity Thresholds by Language

Language-specific complexity thresholds and measurement tools.

## JavaScript/TypeScript

### Recommended Thresholds

| Metric | Target | Warning | Critical |
|--------|--------|---------|----------|
| Cyclomatic Complexity | <= 10 | 11-15 | > 15 |
| Cognitive Complexity | <= 15 | 16-20 | > 20 |
| Function Length | <= 30 lines | 31-50 | > 50 |
| File Length | <= 300 lines | 301-500 | > 500 |
| Parameters | <= 3 | 4-5 | > 5 |
| Nesting Depth | <= 3 | 4 | > 4 |

### Tools

```bash
# ESLint with complexity rules
npm install eslint-plugin-complexity

# .eslintrc.js
module.exports = {
  rules: {
    'complexity': ['error', 10],
    'max-depth': ['error', 3],
    'max-lines-per-function': ['error', 50],
    'max-params': ['error', 3],
    'max-nested-callbacks': ['error', 3]
  }
};

# escomplex for detailed metrics
npx escomplex src/ --format json

# SonarQube quality gates
sonar.javascript.complexity.threshold=15
```

### TypeScript-Specific

```bash
# Type coverage
npx type-coverage --detail

# Targets:
# - New projects: 95%+
# - Existing with strict: 90%+
# - Legacy migration: 80%+
```

---

## Python

### Recommended Thresholds

| Metric | Target | Warning | Critical |
|--------|--------|---------|----------|
| Cyclomatic Complexity | <= 10 | 11-15 | > 15 |
| Cognitive Complexity | <= 15 | 16-25 | > 25 |
| Function Length | <= 50 lines | 51-100 | > 100 |
| File Length | <= 500 lines | 501-1000 | > 1000 |
| Parameters | <= 5 | 6-7 | > 7 |
| Nesting Depth | <= 4 | 5 | > 5 |

### Tools

```bash
# Radon for complexity
pip install radon

radon cc src/ -a -s
# Grades: A (1-5), B (6-10), C (11-20), D (21-30), F (31+)

# Radon for maintainability index
radon mi src/ -s
# A (100-20), B (19-10), C (9-0)

# Flake8 with complexity
pip install flake8
flake8 --max-complexity 10 src/

# Pylint
pylint --max-complexity=10 src/

# wemake-python-styleguide (strict)
pip install wemake-python-styleguide
flake8 src/
```

### PEP 8 Compliance

```ini
# setup.cfg or .flake8
[flake8]
max-complexity = 10
max-line-length = 88
max-cognitive-complexity = 15
```

---

## Go

### Recommended Thresholds

| Metric | Target | Warning | Critical |
|--------|--------|---------|----------|
| Cyclomatic Complexity | <= 10 | 11-15 | > 15 |
| Cognitive Complexity | <= 15 | 16-20 | > 20 |
| Function Length | <= 60 lines | 61-100 | > 100 |
| File Length | <= 500 lines | 501-800 | > 800 |
| Parameters | <= 4 | 5-6 | > 6 |
| Return Values | <= 3 | 4 | > 4 |

### Tools

```bash
# gocyclo
go install github.com/fzipp/gocyclo/cmd/gocyclo@latest
gocyclo -over 10 ./...

# gocognit
go install github.com/uudashr/gocognit/cmd/gocognit@latest
gocognit -over 15 ./...

# golangci-lint (comprehensive)
golangci-lint run

# .golangci.yml
linters-settings:
  gocyclo:
    min-complexity: 10
  gocognit:
    min-complexity: 15
  funlen:
    lines: 60
    statements: 40
```

---

## Java

### Recommended Thresholds

| Metric | Target | Warning | Critical |
|--------|--------|---------|----------|
| Cyclomatic Complexity | <= 10 | 11-20 | > 20 |
| Cognitive Complexity | <= 15 | 16-25 | > 25 |
| Method Length | <= 30 lines | 31-50 | > 50 |
| Class Length | <= 500 lines | 501-1000 | > 1000 |
| Parameters | <= 5 | 6-7 | > 7 |
| Nesting Depth | <= 3 | 4-5 | > 5 |

### Tools

```xml
<!-- PMD ruleset -->
<rule ref="category/java/design.xml/CyclomaticComplexity">
  <properties>
    <property name="classReportLevel" value="80"/>
    <property name="methodReportLevel" value="10"/>
  </properties>
</rule>

<!-- Checkstyle -->
<module name="CyclomaticComplexity">
  <property name="max" value="10"/>
</module>

<!-- SonarQube -->
sonar.java.cognitive.complexity.threshold=15
```

```bash
# SonarScanner
sonar-scanner -Dsonar.java.cognitive.complexity.threshold=15
```

---

## Ruby

### Recommended Thresholds

| Metric | Target | Warning | Critical |
|--------|--------|---------|----------|
| Cyclomatic Complexity | <= 8 | 9-15 | > 15 |
| Assignment-Branch-Condition | <= 18 | 19-25 | > 25 |
| Method Length | <= 20 lines | 21-30 | > 30 |
| Class Length | <= 150 lines | 151-300 | > 300 |
| Parameters | <= 4 | 5-6 | > 6 |

### Tools

```bash
# RuboCop
gem install rubocop

# .rubocop.yml
Metrics/CyclomaticComplexity:
  Max: 8

Metrics/PerceivedComplexity:
  Max: 10

Metrics/AbcSize:
  Max: 18

Metrics/MethodLength:
  Max: 20

Metrics/ClassLength:
  Max: 150
```

---

## C#

### Recommended Thresholds

| Metric | Target | Warning | Critical |
|--------|--------|---------|----------|
| Cyclomatic Complexity | <= 10 | 11-20 | > 20 |
| Cognitive Complexity | <= 15 | 16-25 | > 25 |
| Method Length | <= 40 lines | 41-60 | > 60 |
| Class Coupling | <= 20 | 21-40 | > 40 |
| Depth of Inheritance | <= 3 | 4-5 | > 5 |

### Tools

```xml
<!-- .editorconfig -->
dotnet_diagnostic.CA1502.severity = warning
# CA1502: Avoid excessive complexity

<!-- Directory.Build.props -->
<PropertyGroup>
  <AnalysisLevel>latest</AnalysisLevel>
  <EnforceCodeStyleInBuild>true</EnforceCodeStyleInBuild>
</PropertyGroup>
```

```bash
# SonarQube for .NET
dotnet sonarscanner begin /k:"project-key"
dotnet build
dotnet sonarscanner end
```

---

## Rust

### Recommended Thresholds

| Metric | Target | Warning | Critical |
|--------|--------|---------|----------|
| Cyclomatic Complexity | <= 15 | 16-25 | > 25 |
| Cognitive Complexity | <= 20 | 21-30 | > 30 |
| Function Length | <= 50 lines | 51-100 | > 100 |
| Parameters | <= 5 | 6-7 | > 7 |

### Tools

```bash
# Clippy with complexity lints
cargo clippy -- -W clippy::cognitive_complexity

# rust-code-analysis
cargo install rust-code-analysis-cli
rust-code-analysis-cli -m -p src/
```

```toml
# clippy.toml
cognitive-complexity-threshold = 20
too-many-arguments-threshold = 5
```

---

## Universal Tools

### Lizard (Multi-language)

Supports: C/C++, Java, C#, JavaScript, Python, Ruby, Go, PHP, Swift, Rust

```bash
pip install lizard

# Basic analysis
lizard src/

# With thresholds
lizard -C 15 -L 60 -a 5 src/
# -C: cyclomatic complexity
# -L: function length
# -a: parameter count

# XML output for CI
lizard src/ -o report.xml
```

### SonarQube (All languages)

Universal quality gates:

```properties
# sonar-project.properties
sonar.qualitygate.wait=true

# Default quality gate conditions:
# - Coverage >= 80%
# - Duplicated Lines < 3%
# - Maintainability Rating = A
# - Reliability Rating = A
# - Security Rating = A
```

---

## Threshold Adjustment Guidelines

### When to Relax Thresholds

1. **Legacy code migration**: Start with current state + 10%
2. **Generated code**: May have higher complexity
3. **Complex algorithms**: Document exceptions
4. **Test code**: Often needs more flexibility

### When to Tighten Thresholds

1. **Critical systems**: Financial, healthcare
2. **Library code**: Needs to be maintainable
3. **New projects**: Set high bar from start
4. **Code reviews**: Focus on hotspots

### Gradual Improvement

```yaml
# quality-gates.yml
phases:
  current:
    cyclomatic: 25
    cognitive: 30
    coverage: 60%

  quarter_1:
    cyclomatic: 20
    cognitive: 25
    coverage: 70%

  quarter_2:
    cyclomatic: 15
    cognitive: 20
    coverage: 80%

  target:
    cyclomatic: 10
    cognitive: 15
    coverage: 85%
```

# Profiling Tools by Language

Comprehensive guide to performance profiling tools across languages.

## JavaScript/Node.js

### Built-in V8 Profiler

```bash
# Generate profile
node --prof app.js

# Process the log file
node --prof-process isolate-*.log > processed.txt

# Output shows:
# - Statistical profiling result
# - [JavaScript] and [C++] sections
# - Ticks, percentage, function names
```

### Chrome DevTools

```bash
# Start with inspector
node --inspect app.js

# Or break on start
node --inspect-brk app.js
```

**DevTools workflow:**
1. Open `chrome://inspect`
2. Click "inspect" on your Node process
3. Go to "Performance" tab
4. Click record, perform action, stop
5. Analyze flame chart

### Clinic.js

```bash
# Install
npm install -g clinic

# Doctor - overall health
clinic doctor -- node app.js

# Flame - CPU profiling
clinic flame -- node app.js

# Bubbleprof - async profiling
clinic bubbleprof -- node app.js

# Heapprofiler - memory
clinic heapprofiler -- node app.js
```

### 0x - Flame Graphs

```bash
# Install
npm install -g 0x

# Profile
0x app.js

# Opens browser with interactive flame graph
```

### Memory Profiling

```javascript
// Heap snapshot
const v8 = require('v8');
v8.writeHeapSnapshot();

// Memory usage
const used = process.memoryUsage();
console.log({
  rss: `${Math.round(used.rss / 1024 / 1024)} MB`,
  heapTotal: `${Math.round(used.heapTotal / 1024 / 1024)} MB`,
  heapUsed: `${Math.round(used.heapUsed / 1024 / 1024)} MB`,
  external: `${Math.round(used.external / 1024 / 1024)} MB`,
});
```

---

## Python

### cProfile (Built-in)

```bash
# Run with profiler
python -m cProfile -o output.prof script.py

# Analyze
python -m pstats output.prof

# In pstats shell:
# sort cumtime
# stats 20
```

### py-spy (Sampling Profiler)

```bash
# Install
pip install py-spy

# Record to SVG flame graph
py-spy record -o profile.svg -- python app.py

# Live top view
py-spy top -- python app.py

# Dump threads from running process
py-spy dump --pid 12345
```

### line_profiler

```python
# Install
# pip install line_profiler

# Add decorator
@profile
def slow_function():
    pass

# Run
# kernprof -l -v script.py
```

### memory_profiler

```python
# Install
# pip install memory_profiler

from memory_profiler import profile

@profile
def memory_hungry():
    a = [1] * 1000000
    b = [2] * 2000000
    del b
    return a

# Run: python -m memory_profiler script.py
```

### Scalene

```bash
# Install
pip install scalene

# Profile
scalene script.py

# Features:
# - Line-by-line CPU, GPU, memory
# - Distinguishes Python vs C time
# - Low overhead
```

---

## Go

### pprof (Built-in)

```go
import (
    "net/http"
    _ "net/http/pprof"
)

func main() {
    go func() {
        http.ListenAndServe("localhost:6060", nil)
    }()
    // ... your app
}
```

```bash
# CPU profile
go tool pprof http://localhost:6060/debug/pprof/profile?seconds=30

# Heap profile
go tool pprof http://localhost:6060/debug/pprof/heap

# Goroutine profile
go tool pprof http://localhost:6060/debug/pprof/goroutine

# In pprof interactive mode:
# top20
# list functionName
# web (opens flame graph in browser)
```

### Trace

```go
import "runtime/trace"

func main() {
    f, _ := os.Create("trace.out")
    trace.Start(f)
    defer trace.Stop()
    // ... your app
}
```

```bash
# Analyze
go tool trace trace.out
# Opens browser with:
# - Goroutine analysis
# - Network blocking
# - Sync blocking
# - Syscall blocking
```

### Benchmarking

```go
func BenchmarkFunction(b *testing.B) {
    for i := 0; i < b.N; i++ {
        function()
    }
}
```

```bash
# Run benchmarks
go test -bench=. -benchmem

# With CPU profile
go test -bench=. -cpuprofile=cpu.prof
go tool pprof cpu.prof
```

---

## Java

### JProfiler

Commercial tool with:
- CPU profiling
- Memory profiling
- Thread analysis
- Database profiling

### VisualVM

```bash
# Start with VisualVM attached
java -Dcom.sun.management.jmxremote \
     -Dcom.sun.management.jmxremote.port=9010 \
     -Dcom.sun.management.jmxremote.ssl=false \
     -Dcom.sun.management.jmxremote.authenticate=false \
     -jar app.jar
```

### JFR (Java Flight Recorder)

```bash
# Start recording
java -XX:StartFlightRecording=duration=60s,filename=recording.jfr -jar app.jar

# Analyze with JMC (Java Mission Control)
jmc recording.jfr
```

### async-profiler

```bash
# Download from GitHub
# Profile
./profiler.sh -d 30 -f profile.html <pid>

# Output flame graph
./profiler.sh -d 30 -f flamegraph.svg <pid>
```

---

## Rust

### Flamegraph

```bash
# Install
cargo install flamegraph

# Profile
cargo flamegraph

# Or for specific binary
cargo flamegraph -- my_binary args
```

### perf

```bash
# Record
perf record -g ./target/release/my_app

# Report
perf report

# Generate flame graph
perf script | ./stackcollapse-perf.pl | ./flamegraph.pl > perf.svg
```

### criterion (Benchmarking)

```rust
// Cargo.toml
[dev-dependencies]
criterion = "0.5"

// benches/benchmark.rs
use criterion::{black_box, criterion_group, criterion_main, Criterion};

fn benchmark(c: &mut Criterion) {
    c.bench_function("fib 20", |b| b.iter(|| fibonacci(black_box(20))));
}

criterion_group!(benches, benchmark);
criterion_main!(benches);
```

```bash
cargo bench
```

---

## C/C++

### Valgrind

```bash
# CPU profiling with callgrind
valgrind --tool=callgrind ./my_program
kcachegrind callgrind.out.*

# Memory profiling
valgrind --tool=massif ./my_program
ms_print massif.out.*

# Memory leak detection
valgrind --leak-check=full ./my_program
```

### perf

```bash
# Record
perf record -g ./my_program

# Report
perf report

# Annotate source
perf annotate

# Stats
perf stat ./my_program
```

### gprof

```bash
# Compile with profiling
gcc -pg -o my_program my_program.c

# Run
./my_program

# Analyze
gprof my_program gmon.out > analysis.txt
```

---

## Ruby

### ruby-prof

```ruby
require 'ruby-prof'

RubyProf.start
# ... code to profile
result = RubyProf.stop

printer = RubyProf::FlatPrinter.new(result)
printer.print(STDOUT)
```

### stackprof

```ruby
require 'stackprof'

StackProf.run(mode: :cpu, out: 'stackprof.dump') do
  # ... code to profile
end
```

```bash
stackprof stackprof.dump --text
stackprof stackprof.dump --flamegraph > flamegraph.json
```

### rack-mini-profiler (Rails)

```ruby
# Gemfile
gem 'rack-mini-profiler'

# Shows timing badge on page
# Profile SQL queries, rendering, etc.
```

---

## .NET

### dotTrace (JetBrains)

Commercial profiler with:
- Timeline profiling
- Sampling profiling
- Line-by-line analysis

### PerfView

```bash
# Collect
PerfView.exe collect

# Analyze
PerfView.exe <file>.etl
```

### dotnet-trace

```bash
# List running dotnet processes
dotnet-trace ps

# Collect trace
dotnet-trace collect -p <pid> --duration 00:00:30

# Analyze in Speedscope
speedscope <trace>.nettrace
```

### BenchmarkDotNet

```csharp
using BenchmarkDotNet.Attributes;
using BenchmarkDotNet.Running;

public class Benchmarks
{
    [Benchmark]
    public void Method() { /* ... */ }
}

// Run
BenchmarkRunner.Run<Benchmarks>();
```

---

## Universal Tools

### Speedscope

Online flame graph viewer supporting multiple formats:
- Chrome DevTools traces
- Node.js profiles
- pprof
- perf
- more

https://www.speedscope.app/

### FlameGraph

```bash
# Clone repo
git clone https://github.com/brendangregg/FlameGraph

# Generate from perf
perf script | ./stackcollapse-perf.pl | ./flamegraph.pl > flame.svg
```

### Prometheus + Grafana

For continuous profiling:
- Export metrics from application
- Store in Prometheus
- Visualize in Grafana
- Set up alerts for performance regression

---

## Profiling Best Practices

### 1. Profile in Production-like Environment

- Same hardware/resources
- Realistic data volume
- Production traffic patterns

### 2. Minimize Observer Effect

- Use sampling profilers for production
- Be aware of profiler overhead
- Profile with and without profiler

### 3. Focus on Hot Paths

```
Rule of thumb:
- 80% of time spent in 20% of code
- Optimize the hot 20% first
- Measure impact after each change
```

### 4. Profile Regularly

- Before and after changes
- During load tests
- Part of CI/CD pipeline

### 5. Correlate with Metrics

- Compare profiles with:
  - Request latency
  - Error rates
  - Resource usage
  - Business metrics

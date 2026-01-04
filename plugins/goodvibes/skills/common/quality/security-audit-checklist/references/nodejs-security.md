# Node.js Security Patterns

Detailed security vulnerability patterns specific to Node.js and JavaScript.

## Prototype Pollution

### Detection

```bash
# Object merge without prototype check
grep -rn "Object\.assign\|\.extend\|merge\|deepMerge" src/
grep -rn "for.*in.*\[" src/
grep -rn "\[key\]\s*=" src/
```

### Vulnerable Patterns

```javascript
// VULNERABLE: Recursive merge
function merge(target, source) {
  for (let key in source) {
    if (typeof source[key] === 'object') {
      target[key] = merge(target[key] || {}, source[key]);
    } else {
      target[key] = source[key];  // Can set __proto__
    }
  }
  return target;
}

// Attack payload
merge({}, JSON.parse('{"__proto__": {"admin": true}}'));
console.log({}.admin);  // true - all objects polluted!
```

### Safe Patterns

```javascript
// SAFE: Check for prototype keys
function safeMerge(target, source) {
  for (let key in source) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;  // Skip dangerous keys
    }
    if (!Object.prototype.hasOwnProperty.call(source, key)) {
      continue;
    }
    if (typeof source[key] === 'object' && source[key] !== null) {
      target[key] = safeMerge(target[key] || {}, source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

// SAFE: Use Object.create(null) for lookup objects
const lookup = Object.create(null);
lookup[userInput] = value;  // No prototype chain

// SAFE: Use Map instead of plain objects
const map = new Map();
map.set(userInput, value);
```

### Deduction: 1.5 points (High)

---

## Path Traversal

### Detection

```bash
# File operations with user input
grep -rn "path\.join.*req\." src/
grep -rn "fs\.read.*req\." src/
grep -rn "sendFile.*req\." src/
grep -rn "createReadStream.*req\." src/
```

### Vulnerable Patterns

```javascript
// VULNERABLE: Direct path join
app.get('/files/:name', (req, res) => {
  const filepath = path.join(__dirname, 'uploads', req.params.name);
  res.sendFile(filepath);  // ../../../etc/passwd works!
});

// VULNERABLE: Static file serving
app.use('/uploads', express.static(path.join(__dirname, req.query.dir)));
```

### Safe Patterns

```javascript
// SAFE: Validate and sanitize
app.get('/files/:name', (req, res) => {
  const filename = path.basename(req.params.name);  // Strip directory
  const filepath = path.join(__dirname, 'uploads', filename);

  // Verify still in uploads directory
  const realpath = fs.realpathSync(filepath);
  const uploadsDir = fs.realpathSync(path.join(__dirname, 'uploads'));

  if (!realpath.startsWith(uploadsDir)) {
    return res.status(403).send('Forbidden');
  }

  res.sendFile(realpath);
});

// SAFE: Allowlist approach
const ALLOWED_FILES = new Set(['report.pdf', 'image.png', 'data.csv']);
app.get('/files/:name', (req, res) => {
  if (!ALLOWED_FILES.has(req.params.name)) {
    return res.status(404).send('Not found');
  }
  res.sendFile(path.join(__dirname, 'uploads', req.params.name));
});
```

### Deduction: 1.5 points (High)

---

## ReDoS (Regular Expression Denial of Service)

### Detection

```bash
# Complex regex patterns
grep -rn "new RegExp\|\.match\|\.replace\|\.test" src/
grep -rn "\(\.\*\)\+\|\(\.\+\)\*\|\(\.\+\)\+" src/
```

### Vulnerable Patterns

```javascript
// VULNERABLE: Catastrophic backtracking
const emailRegex = /^([a-zA-Z0-9]+)+@/;  // (a+)+
const pathRegex = /^\/([a-z]+\/)*$/;      // (a/)*
const tagRegex = /<.*>.*<\/.*>/;          // .*.*.*

// Attack string
const malicious = 'a'.repeat(30) + '!';
emailRegex.test(malicious);  // Hangs for minutes!
```

### Safe Patterns

```javascript
// SAFE: Avoid nested quantifiers
const emailRegex = /^[a-zA-Z0-9]+@/;  // No nested +

// SAFE: Use atomic groups (not in JS, but concept)
// SAFE: Use possessive quantifiers (not in JS native)

// SAFE: Use safe-regex library
const safeRegex = require('safe-regex');
if (!safeRegex(userPattern)) {
  throw new Error('Potentially unsafe regex');
}

// SAFE: Use re2 (linear time regex)
const RE2 = require('re2');
const regex = new RE2(pattern);

// SAFE: Set timeout for regex operations
const { VM } = require('vm2');
const vm = new VM({ timeout: 1000 });
const result = vm.run(`"${input}".match(/${pattern}/)`);
```

### Deduction: 1.0 points (Medium)

---

## Child Process Injection

### Detection

```bash
# Shell execution
grep -rn "exec\|execSync" src/
grep -rn "spawn.*shell.*true" src/
grep -rn "child_process" src/
```

### Vulnerable Patterns

```javascript
// VULNERABLE: Shell interpolation
const { exec } = require('child_process');
exec(`convert ${filename} output.pdf`);  // filename = "; rm -rf /"

// VULNERABLE: Shell option with spawn
const { spawn } = require('child_process');
spawn('ls', [userInput], { shell: true });
```

### Safe Patterns

```javascript
// SAFE: Use execFile (no shell)
const { execFile } = require('child_process');
execFile('convert', [filename, 'output.pdf']);

// SAFE: spawn without shell
const { spawn } = require('child_process');
spawn('ls', [directory]);  // shell defaults to false

// SAFE: Allowlist commands
const ALLOWED_COMMANDS = new Map([
  ['convert', ['convert']],
  ['resize', ['convert', '-resize']],
]);

function runCommand(action, args) {
  const cmd = ALLOWED_COMMANDS.get(action);
  if (!cmd) throw new Error('Unknown command');

  // Validate args contain no shell metacharacters
  const safeArgs = args.map(arg => {
    if (/[;&|`$]/.test(arg)) throw new Error('Invalid characters');
    return arg;
  });

  return execFile(cmd[0], [...cmd.slice(1), ...safeArgs]);
}
```

### Deduction: 2.0 points (Critical)

---

## Event Emitter Memory Leaks

### Detection

```bash
# Event listeners
grep -rn "\.on\(.*=>" src/
grep -rn "addEventListener" src/
grep -rn "setInterval\|setTimeout" src/ | grep -v clearInterval
```

### Vulnerable Patterns

```javascript
// LEAK: Listener added on each request
app.get('/sse', (req, res) => {
  const handler = (data) => res.write(data);
  eventBus.on('update', handler);  // Never removed!
});

// LEAK: Listener in class never removed
class Component {
  constructor() {
    process.on('SIGTERM', () => this.cleanup());
  }
  // Missing: removeListener in destructor
}
```

### Safe Patterns

```javascript
// SAFE: Remove listener on connection close
app.get('/sse', (req, res) => {
  const handler = (data) => res.write(data);
  eventBus.on('update', handler);

  req.on('close', () => {
    eventBus.off('update', handler);
  });
});

// SAFE: Use AbortController
const controller = new AbortController();
eventBus.on('update', handler, { signal: controller.signal });
// Later: controller.abort();

// SAFE: Use once for one-time events
eventBus.once('ready', handler);

// Monitor listener counts
if (eventBus.listenerCount('update') > 100) {
  console.warn('Possible listener leak');
}
```

### Deduction: 0.5 points (Medium - Performance category)

---

## NoSQL Injection (MongoDB)

### Detection

```bash
# Direct query object from request
grep -rn "\.find\(.*req\.body\|\.findOne\(.*req\.query" src/
grep -rn "where.*req\." src/
```

### Vulnerable Patterns

```javascript
// VULNERABLE: Object injection
app.post('/login', async (req, res) => {
  const user = await User.findOne({
    username: req.body.username,  // {"$gt": ""}
    password: req.body.password   // {"$gt": ""}
  });
  // Both conditions match any non-empty value!
});

// VULNERABLE: $where injection
User.find({ $where: `this.name == '${name}'` });
```

### Safe Patterns

```javascript
// SAFE: Type validation
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Invalid input' });
  }

  const user = await User.findOne({ username, password });
});

// SAFE: Use schema validation (Mongoose)
const userSchema = new Schema({
  username: { type: String, required: true },
  password: { type: String, required: true }
});

// SAFE: Sanitize with mongo-sanitize
const sanitize = require('mongo-sanitize');
const cleanBody = sanitize(req.body);

// SAFE: Explicit string coercion
User.findOne({
  username: String(req.body.username),
  password: String(req.body.password)
});
```

### Deduction: 2.0 points (Critical)

---

## JWT Vulnerabilities

### Detection

```bash
# JWT configuration
grep -rn "jwt\.\|jsonwebtoken" src/
grep -rn "algorithm.*none\|alg.*none" src/
grep -rn "verify.*{" src/ | grep -i jwt
```

### Vulnerable Patterns

```javascript
// VULNERABLE: Algorithm confusion
const decoded = jwt.verify(token, publicKey, { algorithms: ['HS256', 'RS256'] });
// Attacker signs with HS256 using public key as secret!

// VULNERABLE: No expiration validation
jwt.verify(token, secret, { ignoreExpiration: true });

// VULNERABLE: Weak secret
jwt.sign(payload, 'secret');

// VULNERABLE: No audience/issuer validation
jwt.verify(token, secret);  // Missing aud/iss checks
```

### Safe Patterns

```javascript
// SAFE: Explicit algorithm
const decoded = jwt.verify(token, secret, {
  algorithms: ['HS256'],  // Only allow expected algorithm
  complete: true
});

// SAFE: Full validation
jwt.verify(token, secret, {
  algorithms: ['RS256'],
  audience: 'my-app',
  issuer: 'auth.example.com',
  maxAge: '1h'
});

// SAFE: Strong secret
const secret = crypto.randomBytes(64).toString('hex');

// SAFE: Short-lived tokens with refresh
const accessToken = jwt.sign(payload, secret, { expiresIn: '15m' });
const refreshToken = jwt.sign({ userId }, refreshSecret, { expiresIn: '7d' });
```

### Deduction: 1.5 points (High)

---

## Summary Table

| Vulnerability | Severity | Base Points | Detection Command |
|--------------|----------|-------------|-------------------|
| Prototype Pollution | High | 1.5 | `grep -rn "for.*in.*\[" src/` |
| Path Traversal | High | 1.5 | `grep -rn "path\.join.*req\." src/` |
| ReDoS | Medium | 1.0 | `grep -rn "\(\.\*\)\+" src/` |
| Command Injection | Critical | 2.0 | `grep -rn "exec\|execSync" src/` |
| Event Leaks | Medium | 0.5 | `grep -rn "\.on\(" src/` |
| NoSQL Injection | Critical | 2.0 | `grep -rn "\.find\(.*req\." src/` |
| JWT Misconfig | High | 1.5 | `grep -rn "algorithm.*none" src/` |

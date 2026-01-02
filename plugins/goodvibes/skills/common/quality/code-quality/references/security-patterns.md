# Security Vulnerability Patterns

Language and framework-specific security patterns to detect during audits.

## JavaScript / Node.js

### Injection Vulnerabilities

#### SQL Injection
```javascript
// VULNERABLE
connection.query(`SELECT * FROM users WHERE id = ${id}`);
knex.raw(`SELECT * FROM users WHERE email = '${email}'`);

// SAFE
connection.query('SELECT * FROM users WHERE id = ?', [id]);
knex('users').where('email', email);
```

#### NoSQL Injection (MongoDB)
```javascript
// VULNERABLE - allows {$gt: ""} injection
User.find({ username: req.body.username });

// SAFE - validate input type
if (typeof req.body.username !== 'string') throw new Error('Invalid');
User.find({ username: req.body.username });

// Or use mongoose schema validation
```

#### Command Injection
```javascript
// VULNERABLE
exec(`convert ${filename} output.pdf`);
spawn('sh', ['-c', `ls ${dir}`]);

// SAFE
execFile('convert', [filename, 'output.pdf']);
spawn('ls', [dir]);  // No shell
```

#### Template Injection
```javascript
// VULNERABLE (EJS)
res.render('page', { content: userInput });  // If template uses <%- content %>

// SAFE
res.render('page', { content: sanitizeHtml(userInput) });
```

### Authentication Issues

```javascript
// VULNERABLE: Timing attack on comparison
if (token === expectedToken) { ... }

// SAFE: Constant-time comparison
const crypto = require('crypto');
if (crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expectedToken))) { ... }

// VULNERABLE: Weak session secret
app.use(session({ secret: 'secret' }));

// SAFE: Strong random secret
app.use(session({ secret: crypto.randomBytes(32).toString('hex') }));
```

### Prototype Pollution
```javascript
// VULNERABLE
function merge(target, source) {
  for (let key in source) {
    target[key] = source[key];  // Can set __proto__
  }
}

// SAFE
function merge(target, source) {
  for (let key in source) {
    if (key === '__proto__' || key === 'constructor') continue;
    if (source.hasOwnProperty(key)) {
      target[key] = source[key];
    }
  }
}
```

### Path Traversal
```javascript
// VULNERABLE
const file = path.join(uploadDir, req.params.filename);
fs.readFile(file);  // ../../../etc/passwd

// SAFE
const filename = path.basename(req.params.filename);  // Strip directory
const file = path.join(uploadDir, filename);
if (!file.startsWith(uploadDir)) throw new Error('Invalid path');
```

---

## Python

### SQL Injection
```python
# VULNERABLE
cursor.execute(f"SELECT * FROM users WHERE id = {user_id}")
cursor.execute("SELECT * FROM users WHERE id = " + user_id)

# SAFE
cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))

# Django ORM - SAFE by default
User.objects.filter(id=user_id)

# Django raw - VULNERABLE if not parameterized
User.objects.raw(f"SELECT * FROM users WHERE id = {user_id}")  # BAD
User.objects.raw("SELECT * FROM users WHERE id = %s", [user_id])  # GOOD
```

### Command Injection
```python
# VULNERABLE
os.system(f"convert {filename} output.pdf")
subprocess.call(f"ls {directory}", shell=True)

# SAFE
subprocess.run(["convert", filename, "output.pdf"])
subprocess.run(["ls", directory])  # shell=False (default)
```

### Pickle Deserialization
```python
# VULNERABLE - arbitrary code execution
import pickle
data = pickle.loads(user_input)

# SAFE alternatives
import json
data = json.loads(user_input)

# If pickle required, use hmac signing
import hmac
if hmac.compare_digest(signature, expected_sig):
    data = pickle.loads(verified_data)
```

### YAML Deserialization
```python
# VULNERABLE
import yaml
data = yaml.load(user_input)  # Allows !!python/object

# SAFE
data = yaml.safe_load(user_input)
```

### Path Traversal
```python
# VULNERABLE
filepath = os.path.join(upload_dir, filename)
with open(filepath) as f:
    return f.read()

# SAFE
filepath = os.path.join(upload_dir, os.path.basename(filename))
realpath = os.path.realpath(filepath)
if not realpath.startswith(os.path.realpath(upload_dir)):
    raise ValueError("Invalid path")
```

### SSTI (Server-Side Template Injection)
```python
# VULNERABLE (Jinja2)
template = Template(user_input)
template.render()

# Flask vulnerable pattern
@app.route('/page')
def page():
    return render_template_string(request.args.get('template'))

# SAFE - use predefined templates only
return render_template('page.html', content=user_input)
```

---

## Go

### SQL Injection
```go
// VULNERABLE
db.Query("SELECT * FROM users WHERE id = " + id)
db.Query(fmt.Sprintf("SELECT * FROM users WHERE id = %s", id))

// SAFE
db.Query("SELECT * FROM users WHERE id = $1", id)
db.QueryRow("SELECT * FROM users WHERE id = ?", id)
```

### Path Traversal
```go
// VULNERABLE
http.ServeFile(w, r, filepath.Join(baseDir, r.URL.Path))

// SAFE
cleanPath := filepath.Clean(r.URL.Path)
fullPath := filepath.Join(baseDir, cleanPath)
if !strings.HasPrefix(fullPath, baseDir) {
    http.Error(w, "Invalid path", 403)
    return
}
```

### Command Injection
```go
// VULNERABLE
exec.Command("sh", "-c", "ls " + userDir).Run()

// SAFE
exec.Command("ls", userDir).Run()
```

---

## Java

### SQL Injection
```java
// VULNERABLE
Statement stmt = conn.createStatement();
stmt.executeQuery("SELECT * FROM users WHERE id = " + id);

// SAFE
PreparedStatement stmt = conn.prepareStatement("SELECT * FROM users WHERE id = ?");
stmt.setInt(1, id);
stmt.executeQuery();

// JPA - VULNERABLE
entityManager.createQuery("SELECT u FROM User u WHERE u.id = " + id);

// JPA - SAFE
entityManager.createQuery("SELECT u FROM User u WHERE u.id = :id")
    .setParameter("id", id);
```

### XXE (XML External Entity)
```java
// VULNERABLE
DocumentBuilderFactory dbf = DocumentBuilderFactory.newInstance();
DocumentBuilder db = dbf.newDocumentBuilder();
Document doc = db.parse(xmlInput);

// SAFE
DocumentBuilderFactory dbf = DocumentBuilderFactory.newInstance();
dbf.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
dbf.setFeature("http://xml.org/sax/features/external-general-entities", false);
dbf.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
```

### Deserialization
```java
// VULNERABLE
ObjectInputStream ois = new ObjectInputStream(userInput);
Object obj = ois.readObject();

// SAFE - use allowlist
ObjectInputFilter filter = ObjectInputFilter.Config.createFilter(
    "com.myapp.dto.*;!*"
);
ois.setObjectInputFilter(filter);
```

---

## Common Web Vulnerabilities

### CORS Misconfiguration
```javascript
// VULNERABLE - allows any origin
app.use(cors({ origin: '*', credentials: true }));

// VULNERABLE - reflects origin without validation
app.use(cors({ origin: req.headers.origin, credentials: true }));

// SAFE - explicit allowlist
app.use(cors({
  origin: ['https://app.example.com', 'https://admin.example.com'],
  credentials: true
}));
```

### Open Redirect
```javascript
// VULNERABLE
res.redirect(req.query.next);

// SAFE - validate against allowlist
const allowedDomains = ['example.com', 'app.example.com'];
const url = new URL(req.query.next, 'https://example.com');
if (!allowedDomains.includes(url.hostname)) {
    return res.redirect('/');
}
res.redirect(url.toString());
```

### CSRF Missing
```javascript
// VULNERABLE - state-changing GET
app.get('/delete-account', requireAuth, deleteAccount);

// VULNERABLE - no CSRF token
app.post('/transfer', requireAuth, transferFunds);

// SAFE
app.post('/transfer', requireAuth, csrfProtection, transferFunds);
```

### Insecure Headers
```javascript
// Missing security headers - add with helmet
const helmet = require('helmet');
app.use(helmet());

// Manual headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'self'");
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});
```

---

## Secrets Patterns

### High Confidence Patterns

| Type | Pattern |
|------|---------|
| AWS Access Key | `AKIA[0-9A-Z]{16}` |
| AWS Secret Key | `(?i)aws_secret_access_key.{0,20}['\"][0-9a-zA-Z/+=]{40}` |
| GitHub Token | `gh[pousr]_[A-Za-z0-9_]{36,}` |
| Google API Key | `AIza[0-9A-Za-z\-_]{35}` |
| Slack Token | `xox[baprs]-[0-9a-zA-Z]{10,}` |
| Stripe Key | `sk_live_[0-9a-zA-Z]{24,}` |
| Private Key | `-----BEGIN (RSA\|EC\|OPENSSH) PRIVATE KEY-----` |

### Medium Confidence (Needs Context)

| Type | Pattern |
|------|---------|
| Generic API Key | `(?i)(api[_-]?key\|apikey).{0,20}['\"][0-9a-zA-Z]{20,}` |
| Generic Secret | `(?i)(secret\|password\|passwd).{0,20}['\"][^'\"]{8,}` |
| Bearer Token | `(?i)bearer\s+[a-zA-Z0-9\-_.]+` |
| Basic Auth | `(?i)basic\s+[a-zA-Z0-9+/=]+` |

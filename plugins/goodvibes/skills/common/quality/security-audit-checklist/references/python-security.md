# Python Security Patterns

Detailed security vulnerability patterns specific to Python applications.

## Unsafe Deserialization

### Pickle

**Detection:**
```bash
grep -rn "pickle\.load\|pickle\.loads" src/
grep -rn "cPickle\|_pickle" src/
```

**Vulnerable:**
```python
# CRITICAL: Arbitrary code execution
import pickle

@app.route('/api/data', methods=['POST'])
def load_data():
    data = pickle.loads(request.data)  # RCE!
    return jsonify(data)
```

**Safe:**
```python
# Use JSON instead
import json

@app.route('/api/data', methods=['POST'])
def load_data():
    data = json.loads(request.data)
    return jsonify(data)

# If pickle required, use HMAC signing
import hmac
import hashlib

def safe_loads(signed_data, secret):
    signature, data = signed_data.split(b':', 1)
    expected = hmac.new(secret, data, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature.decode(), expected):
        raise ValueError("Invalid signature")
    return pickle.loads(data)
```

**Deduction:** 2.0 points (Critical)

---

### YAML

**Detection:**
```bash
grep -rn "yaml\.load\(" src/ | grep -v "safe_load\|Loader=SafeLoader"
```

**Vulnerable:**
```python
# CRITICAL: Arbitrary code execution
import yaml

config = yaml.load(user_input)  # Can execute Python code!

# Attack payload:
# !!python/object/apply:os.system ['rm -rf /']
```

**Safe:**
```python
# Always use safe_load
import yaml

config = yaml.safe_load(user_input)

# Or explicit SafeLoader
config = yaml.load(user_input, Loader=yaml.SafeLoader)
```

**Deduction:** 2.0 points (Critical)

---

## Template Injection (SSTI)

### Detection

```bash
# Template from user input
grep -rn "Template\(.*request\|render_template_string" src/
grep -rn "Environment.*from_string" src/
grep -rn "format\(.*request" src/
```

### Jinja2

**Vulnerable:**
```python
# CRITICAL: Server-side template injection
from jinja2 import Template

@app.route('/render')
def render():
    template = Template(request.args.get('template'))
    return template.render()

# Attack: {{ ''.__class__.__mro__[2].__subclasses__() }}
# Can lead to RCE through subprocess.Popen
```

**Safe:**
```python
# Use predefined templates only
@app.route('/page')
def page():
    return render_template('page.html', content=request.args.get('content'))

# If dynamic templates needed, use sandbox
from jinja2.sandbox import SandboxedEnvironment

env = SandboxedEnvironment()
template = env.from_string(user_template)
result = template.render()
```

### Django Templates

**Vulnerable:**
```python
# Template string from user
from django.template import Template, Context

def render_user_template(request):
    tpl = Template(request.POST['template'])
    return tpl.render(Context({'user': request.user}))
```

**Safe:**
```python
# Load from file only
from django.template.loader import render_to_string

def render_page(request):
    return render_to_string('page.html', {'content': request.POST['content']})
```

**Deduction:** 2.0 points (Critical)

---

## SQL Injection

### Detection

```bash
# String formatting in queries
grep -rn "execute.*f\"\|execute.*%" src/
grep -rn "\.raw\(.*f\"\|\.raw\(.*%" src/
grep -rn "cursor\.execute.*\+" src/
```

### Raw SQL

**Vulnerable:**
```python
# f-string in query
cursor.execute(f"SELECT * FROM users WHERE id = {user_id}")

# String concatenation
cursor.execute("SELECT * FROM users WHERE name = '" + name + "'")

# % formatting
cursor.execute("SELECT * FROM users WHERE email = '%s'" % email)
```

**Safe:**
```python
# Parameterized queries
cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))

# Named parameters
cursor.execute("SELECT * FROM users WHERE id = %(id)s", {'id': user_id})

# With SQLAlchemy
from sqlalchemy import text
db.execute(text("SELECT * FROM users WHERE id = :id"), {'id': user_id})
```

### Django ORM

**Vulnerable:**
```python
# raw() with string formatting
User.objects.raw(f"SELECT * FROM users WHERE id = {user_id}")

# extra() with string formatting
User.objects.extra(where=[f"email = '{email}'"])
```

**Safe:**
```python
# ORM methods (safe by default)
User.objects.filter(id=user_id)
User.objects.filter(email=email)

# raw() with parameters
User.objects.raw("SELECT * FROM users WHERE id = %s", [user_id])
```

**Deduction:** 2.0 points (Critical)

---

## Command Injection

### Detection

```bash
grep -rn "os\.system\|os\.popen" src/
grep -rn "subprocess.*shell=True" src/
grep -rn "commands\.getoutput" src/
```

### Vulnerable Patterns

```python
import os
import subprocess

# os.system with user input
os.system(f"convert {filename} output.pdf")

# subprocess with shell=True
subprocess.call(f"ls {directory}", shell=True)

# os.popen
os.popen(f"cat {filepath}").read()
```

### Safe Patterns

```python
import subprocess
import shlex

# List of arguments (no shell)
subprocess.run(["convert", filename, "output.pdf"])

# If shell needed, use shlex.quote
subprocess.run(f"ls {shlex.quote(directory)}", shell=True)

# Best: avoid shell entirely
subprocess.run(["ls", directory], capture_output=True)

# Use pathlib for file operations
from pathlib import Path
content = Path(filepath).read_text()
```

**Deduction:** 2.0 points (Critical)

---

## Path Traversal

### Detection

```bash
grep -rn "open\(.*request\|send_file.*request" src/
grep -rn "os\.path\.join.*request" src/
grep -rn "Path\(.*request" src/
```

### Vulnerable Patterns

```python
import os

@app.route('/download/<filename>')
def download(filename):
    filepath = os.path.join(UPLOAD_DIR, filename)
    return send_file(filepath)  # ../../../etc/passwd works!
```

### Safe Patterns

```python
import os
from pathlib import Path
from werkzeug.utils import secure_filename

@app.route('/download/<filename>')
def download(filename):
    # Option 1: secure_filename
    safe_name = secure_filename(filename)
    filepath = os.path.join(UPLOAD_DIR, safe_name)

    # Option 2: Validate resolved path
    upload_path = Path(UPLOAD_DIR).resolve()
    file_path = (upload_path / filename).resolve()

    if not str(file_path).startswith(str(upload_path)):
        abort(403)

    return send_file(file_path)

# Option 3: Allowlist
ALLOWED_FILES = {'report.pdf', 'data.csv'}

@app.route('/download/<filename>')
def download(filename):
    if filename not in ALLOWED_FILES:
        abort(404)
    return send_file(os.path.join(UPLOAD_DIR, filename))
```

**Deduction:** 1.5 points (High)

---

## XML External Entity (XXE)

### Detection

```bash
grep -rn "xml\.etree\|lxml\|xml\.dom\|xml\.sax" src/
grep -rn "XMLParser\|parse\|fromstring" src/
```

### Vulnerable Patterns

```python
from lxml import etree

# Default parser allows XXE
doc = etree.parse(user_xml)

# Attack payload:
# <!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
# <data>&xxe;</data>
```

### Safe Patterns

```python
from lxml import etree
from defusedxml import ElementTree

# Option 1: Disable external entities
parser = etree.XMLParser(
    resolve_entities=False,
    no_network=True,
    dtd_validation=False,
    load_dtd=False
)
doc = etree.parse(user_xml, parser)

# Option 2: Use defusedxml
from defusedxml.ElementTree import parse
doc = parse(user_xml)

# Option 3: Use defusedxml.lxml
from defusedxml.lxml import parse
doc = parse(user_xml)
```

**Deduction:** 1.5 points (High)

---

## Insecure Randomness

### Detection

```bash
grep -rn "random\.random\|random\.randint\|random\.choice" src/
grep -rn "uuid\.uuid1\|uuid1" src/
```

### Vulnerable Patterns

```python
import random
import uuid

# Predictable random for security purposes
token = ''.join(random.choices('abcdefghij', k=32))
session_id = random.randint(0, 999999)

# UUID1 leaks MAC address
user_id = uuid.uuid1()
```

### Safe Patterns

```python
import secrets
import uuid

# Cryptographically secure random
token = secrets.token_urlsafe(32)
session_id = secrets.token_hex(16)

# UUID4 is random
user_id = uuid.uuid4()

# For password reset tokens
reset_token = secrets.token_urlsafe(32)
```

**Deduction:** 0.75 points (Medium)

---

## Summary Table

| Vulnerability | Severity | Base Points | Detection Command |
|--------------|----------|-------------|-------------------|
| Pickle Deserialization | Critical | 2.0 | `grep -rn "pickle\.load" src/` |
| YAML Deserialization | Critical | 2.0 | `grep -rn "yaml\.load\(" src/` |
| SSTI (Jinja2/Django) | Critical | 2.0 | `grep -rn "Template\(.*request" src/` |
| SQL Injection | Critical | 2.0 | `grep -rn "execute.*f\"" src/` |
| Command Injection | Critical | 2.0 | `grep -rn "os\.system\|shell=True" src/` |
| Path Traversal | High | 1.5 | `grep -rn "open\(.*request" src/` |
| XXE | High | 1.5 | `grep -rn "etree\.parse\|fromstring" src/` |
| Insecure Random | Medium | 0.75 | `grep -rn "random\.random" src/` |

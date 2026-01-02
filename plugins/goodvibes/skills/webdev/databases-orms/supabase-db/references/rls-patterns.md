# Row Level Security Patterns

## Basic Patterns

### Self-Access Pattern
Users can only access their own records.

```sql
-- Enable RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Read own profile
CREATE POLICY "Users read own profile"
ON user_profiles FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = user_id);

-- Update own profile
CREATE POLICY "Users update own profile"
ON user_profiles FOR UPDATE
TO authenticated
USING ((SELECT auth.uid()) = user_id)
WITH CHECK ((SELECT auth.uid()) = user_id);
```

### Public Read, Private Write
Anyone can read, only owner can modify.

```sql
-- Public read
CREATE POLICY "Public read access"
ON posts FOR SELECT
USING (published = true);

-- Author-only write
CREATE POLICY "Authors can update own posts"
ON posts FOR UPDATE
TO authenticated
USING ((SELECT auth.uid()) = author_id);

CREATE POLICY "Authors can delete own posts"
ON posts FOR DELETE
TO authenticated
USING ((SELECT auth.uid()) = author_id);
```

### Role-Based Access

```sql
-- Check role in JWT
CREATE POLICY "Admins have full access"
ON users FOR ALL
TO authenticated
USING (
  (SELECT auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
);

-- Multiple roles
CREATE POLICY "Moderators and admins can delete"
ON comments FOR DELETE
TO authenticated
USING (
  (SELECT auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'moderator')
);
```

## Team/Organization Patterns

### Team Membership

```sql
-- Users can access team resources if they're members
CREATE POLICY "Team members access projects"
ON projects FOR SELECT
TO authenticated
USING (
  team_id IN (
    SELECT team_id FROM team_members
    WHERE user_id = (SELECT auth.uid())
    AND status = 'active'
  )
);
```

### Hierarchical Permissions

```sql
-- Role hierarchy within organization
CREATE POLICY "Org admins manage members"
ON org_members FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = org_members.org_id
    AND user_id = (SELECT auth.uid())
    AND role IN ('owner', 'admin')
  )
);
```

### Resource Sharing

```sql
-- Resources shared with specific users
CREATE POLICY "Access shared resources"
ON documents FOR SELECT
TO authenticated
USING (
  owner_id = (SELECT auth.uid())
  OR id IN (
    SELECT document_id FROM document_shares
    WHERE shared_with = (SELECT auth.uid())
    AND expires_at > NOW()
  )
);
```

## Advanced Patterns

### Multi-Tenant Isolation

```sql
-- Strict tenant isolation
CREATE POLICY "Tenant isolation"
ON tenant_data FOR ALL
TO authenticated
USING (
  tenant_id = (
    SELECT (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
  )
)
WITH CHECK (
  tenant_id = (
    SELECT (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
  )
);
```

### Time-Based Access

```sql
-- Access expires
CREATE POLICY "Temporary access"
ON premium_content FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM subscriptions
    WHERE user_id = (SELECT auth.uid())
    AND expires_at > NOW()
    AND status = 'active'
  )
);
```

### Audit Trail Protection

```sql
-- Immutable audit log
CREATE POLICY "Insert only audit"
ON audit_log FOR INSERT
TO authenticated
WITH CHECK (
  user_id = (SELECT auth.uid())
  AND created_at = NOW()
);

-- No updates or deletes allowed (no policy = denied)
```

## Performance Optimization

### Index Strategies

```sql
-- Index columns used in policies
CREATE INDEX idx_team_members_user
ON team_members(user_id);

CREATE INDEX idx_team_members_team_user
ON team_members(team_id, user_id);

CREATE INDEX idx_documents_owner
ON documents(owner_id);
```

### Security Definer Functions

```sql
-- Bypass RLS for specific operations
CREATE OR REPLACE FUNCTION get_team_projects(team_uuid UUID)
RETURNS SETOF projects
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM projects
  WHERE team_id = team_uuid
  AND EXISTS (
    SELECT 1 FROM team_members
    WHERE team_id = team_uuid
    AND user_id = auth.uid()
  );
$$;
```

### Materialized Permissions

```sql
-- Pre-compute permissions for complex scenarios
CREATE TABLE user_permissions (
  user_id UUID REFERENCES auth.users,
  resource_type TEXT,
  resource_id UUID,
  permission TEXT,
  PRIMARY KEY (user_id, resource_type, resource_id, permission)
);

-- Simple policy using materialized permissions
CREATE POLICY "Check materialized permissions"
ON documents FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_permissions
    WHERE user_id = (SELECT auth.uid())
    AND resource_type = 'document'
    AND resource_id = documents.id
    AND permission = 'read'
  )
);
```

## Testing RLS Policies

```sql
-- Test as specific user
SET request.jwt.claim.sub = 'user-uuid-here';
SET role TO authenticated;

-- Run test queries
SELECT * FROM protected_table;

-- Reset
RESET role;
RESET request.jwt.claim.sub;
```

## Common Mistakes

1. **Forgetting to enable RLS** - Tables without RLS are publicly accessible
2. **Using user_metadata instead of app_metadata** - Users can modify their own user_metadata
3. **Not wrapping auth functions in SELECT** - Causes performance issues
4. **Complex joins in policies** - Can be slow; consider materialized permissions
5. **Not handling NULL from auth.uid()** - Always check for authenticated state

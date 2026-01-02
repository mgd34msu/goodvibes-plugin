# Migrating to PlanetScale

## From Local MySQL

### 1. Export Schema and Data

```bash
# Export schema only
mysqldump -h localhost -u root -p \
  --no-data \
  --routines \
  --triggers \
  mydb > schema.sql

# Export data
mysqldump -h localhost -u root -p \
  --no-create-info \
  --single-transaction \
  --quick \
  mydb > data.sql
```

### 2. Create PlanetScale Database

```bash
pscale database create mydb --region us-east
pscale branch create mydb import
pscale connect mydb import --port 3309
```

### 3. Import

```bash
# Import schema
mysql -h 127.0.0.1 -P 3309 -u root < schema.sql

# Import data
mysql -h 127.0.0.1 -P 3309 -u root < data.sql
```

### 4. Verify and Promote

```bash
# Check tables
pscale shell mydb import
> SHOW TABLES;
> SELECT COUNT(*) FROM users;

# Create deploy request to main
pscale deploy-request create mydb import
pscale deploy-request deploy mydb 1
```

## From AWS RDS MySQL

### Using pscale import

```bash
# Direct import (requires network access)
pscale database import mydb \
  --host your-rds-instance.region.rds.amazonaws.com \
  --username admin \
  --password 'your-password' \
  --database source_db
```

### Using Dump File

```bash
# Export from RDS
mysqldump -h your-rds-instance.region.rds.amazonaws.com \
  -u admin -p \
  --single-transaction \
  --set-gtid-purged=OFF \
  source_db > dump.sql

# Import to PlanetScale
pscale connect mydb main --port 3309
mysql -h 127.0.0.1 -P 3309 -u root < dump.sql
```

## From PostgreSQL

### Schema Conversion

PostgreSQL and MySQL have syntax differences. Common conversions:

| PostgreSQL | MySQL |
|------------|-------|
| `SERIAL` | `INT AUTO_INCREMENT` |
| `TEXT` | `TEXT` or `LONGTEXT` |
| `BOOLEAN` | `TINYINT(1)` |
| `TIMESTAMP` | `DATETIME` |
| `UUID` | `CHAR(36)` or `BINARY(16)` |
| `JSONB` | `JSON` |
| `ARRAY` | Separate table |

### Using pgloader

```bash
# Install pgloader
brew install pgloader

# Create migration script
cat > migrate.load << 'EOF'
LOAD DATABASE
  FROM postgresql://user:pass@localhost/source_db
  INTO mysql://root@127.0.0.1:3309/target_db

WITH include drop, create tables, create indexes, reset sequences

SET work_mem to '16MB', maintenance_work_mem to '512 MB'

CAST type uuid to char(36)
EOF

# Start PlanetScale connection
pscale connect mydb main --port 3309

# Run migration
pgloader migrate.load
```

## From Prisma Migrate

If you were using `prisma migrate` with another database:

### 1. Backup Migration History

```bash
# Save your migration history
cp -r prisma/migrations prisma/migrations.backup
```

### 2. Update Schema for PlanetScale

```prisma
datasource db {
  provider     = "mysql"
  url          = env("DATABASE_URL")
  relationMode = "prisma"  // If FK constraints disabled
}
```

### 3. Baseline with db push

```bash
# Connect to PlanetScale branch
pscale connect mydb main --port 3309

# Push current schema state
DATABASE_URL="mysql://root@127.0.0.1:3309/mydb" npx prisma db push
```

### 4. Future Changes

Use `prisma db push` instead of `prisma migrate`:

```bash
# Development
npx prisma db push

# PlanetScale handles migrations via deploy requests
```

## Handling Foreign Keys

### Option 1: Enable FK Constraints

PlanetScale now supports foreign keys. Enable in Dashboard:

Settings > Beta features > Foreign key constraints

Then use normal Prisma relations:

```prisma
model Post {
  id       String @id
  authorId String
  author   User   @relation(fields: [authorId], references: [id], onDelete: Cascade)
}
```

### Option 2: Use Relation Mode

```prisma
datasource db {
  provider     = "mysql"
  url          = env("DATABASE_URL")
  relationMode = "prisma"
}

model Post {
  id       String @id
  authorId String
  author   User   @relation(fields: [authorId], references: [id])

  @@index([authorId])  // Required!
}
```

### Option 3: Application-Level Enforcement

```typescript
// Manual cascade delete
async function deleteUser(userId: string) {
  await prisma.$transaction([
    prisma.post.deleteMany({ where: { authorId: userId } }),
    prisma.comment.deleteMany({ where: { authorId: userId } }),
    prisma.user.delete({ where: { id: userId } })
  ])
}
```

## Zero-Downtime Migration

### Dual-Write Strategy

1. **Set up PlanetScale** alongside existing database
2. **Write to both** databases during migration
3. **Verify data consistency**
4. **Switch reads** to PlanetScale
5. **Remove old database** writes

```typescript
// Dual-write wrapper
async function createUser(data: UserData) {
  // Write to old database
  await oldDb.users.create(data)

  // Write to PlanetScale
  await prisma.user.create({ data })
}
```

### Using Replication

For MySQL sources, use PlanetScale's import with ongoing replication:

```bash
pscale database import mydb \
  --host source.mysql.com \
  --username repl_user \
  --password 'password' \
  --database source_db \
  --replication  # Keep syncing
```

## Post-Migration Checklist

- [ ] Verify row counts match source
- [ ] Test all queries work correctly
- [ ] Update connection strings in all environments
- [ ] Test application thoroughly
- [ ] Set up monitoring and alerts
- [ ] Enable safe migrations on production branch
- [ ] Document the new workflow for team
- [ ] Archive old database (don't delete yet)
- [ ] Update CI/CD pipelines

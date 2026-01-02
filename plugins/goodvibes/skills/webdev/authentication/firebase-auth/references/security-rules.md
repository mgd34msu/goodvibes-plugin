# Firebase Security Rules

## Overview

Firebase Security Rules control access to Firestore, Realtime Database, and Cloud Storage. They run on Firebase servers and cannot be bypassed by clients.

## Firestore Rules

### Basic Structure

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Rules here
  }
}
```

### Authentication-Based Access

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Only authenticated users
    match /posts/{postId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
    }

    // Users can only access their own data
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

### Role-Based Access

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Helper function for admin check
    function isAdmin() {
      return request.auth != null &&
             request.auth.token.role == 'admin';
    }

    // Admin-only collection
    match /admin/{document=**} {
      allow read, write: if isAdmin();
    }

    // Moderators can update, admins can delete
    match /posts/{postId} {
      allow read: if true;
      allow create: if request.auth != null;
      allow update: if request.auth.token.role in ['admin', 'moderator'];
      allow delete: if isAdmin();
    }
  }
}
```

### Data Validation

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /posts/{postId} {
      allow create: if request.auth != null &&
        // Required fields
        request.resource.data.keys().hasAll(['title', 'content', 'authorId']) &&
        // Field types
        request.resource.data.title is string &&
        request.resource.data.content is string &&
        // Field constraints
        request.resource.data.title.size() > 0 &&
        request.resource.data.title.size() <= 100 &&
        // Author must be current user
        request.resource.data.authorId == request.auth.uid;

      allow update: if request.auth != null &&
        // Only author can update
        resource.data.authorId == request.auth.uid &&
        // Cannot change author
        request.resource.data.authorId == resource.data.authorId;
    }
  }
}
```

### Resource Functions

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Get user document
    function getUserData() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data;
    }

    // Check if user is team member
    function isTeamMember(teamId) {
      return exists(/databases/$(database)/documents/teams/$(teamId)/members/$(request.auth.uid));
    }

    match /teams/{teamId}/projects/{projectId} {
      allow read, write: if isTeamMember(teamId);
    }

    match /premium/{document=**} {
      allow read: if getUserData().isPremium == true;
    }
  }
}
```

## Realtime Database Rules

### Basic Structure

```json
{
  "rules": {
    ".read": false,
    ".write": false
  }
}
```

### Authentication-Based

```json
{
  "rules": {
    "users": {
      "$uid": {
        ".read": "$uid === auth.uid",
        ".write": "$uid === auth.uid"
      }
    },
    "posts": {
      ".read": "auth != null",
      "$postId": {
        ".write": "auth != null && (!data.exists() || data.child('authorId').val() === auth.uid)"
      }
    }
  }
}
```

### Data Validation

```json
{
  "rules": {
    "posts": {
      "$postId": {
        ".validate": "newData.hasChildren(['title', 'content', 'authorId'])",
        "title": {
          ".validate": "newData.isString() && newData.val().length > 0 && newData.val().length <= 100"
        },
        "authorId": {
          ".validate": "newData.val() === auth.uid"
        }
      }
    }
  }
}
```

## Cloud Storage Rules

### Basic Structure

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Rules here
  }
}
```

### User-Specific Files

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Users can only access their own files
    match /users/{userId}/{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    // Public read, authenticated write
    match /public/{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

### File Validation

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /avatars/{userId} {
      allow read: if true;
      allow write: if request.auth != null &&
                      request.auth.uid == userId &&
                      // Max 5MB
                      request.resource.size < 5 * 1024 * 1024 &&
                      // Only images
                      request.resource.contentType.matches('image/.*');
    }
  }
}
```

## Custom Claims in Rules

### Firestore

```javascript
match /admin/{document=**} {
  allow read, write: if request.auth.token.role == 'admin';
}

// Check multiple roles
match /content/{docId} {
  allow write: if request.auth.token.role in ['admin', 'editor'];
}

// Check premium status
match /premium/{docId} {
  allow read: if request.auth.token.premium == true;
}
```

### Storage

```javascript
match /premium-content/{allPaths=**} {
  allow read: if request.auth.token.premium == true;
}
```

## Testing Rules

### Firestore Emulator

```bash
firebase emulators:start --only firestore
```

### Unit Tests

```typescript
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing'

const testEnv = await initializeTestEnvironment({
  projectId: 'my-project',
  firestore: {
    rules: fs.readFileSync('firestore.rules', 'utf8')
  }
})

// Test authenticated access
const alice = testEnv.authenticatedContext('alice', { role: 'admin' })
const doc = alice.firestore().collection('admin').doc('settings')
await assertSucceeds(doc.get())

// Test unauthenticated access
const unauth = testEnv.unauthenticatedContext()
await assertFails(unauth.firestore().collection('admin').doc('settings').get())
```

## Best Practices

1. **Deny by default** - Start with no access
2. **Validate all writes** - Check data structure and types
3. **Use custom claims** - For role-based access
4. **Limit resource reads** - Avoid reading too many documents in rules
5. **Test thoroughly** - Use emulator and unit tests
6. **Review regularly** - Audit rules for security holes

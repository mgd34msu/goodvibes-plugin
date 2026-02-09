/**
 * User model with role-based access control
 */

export type UserRole = 'admin' | 'moderator' | 'user' | 'guest';
export type UserStatus = 'active' | 'inactive' | 'suspended' | 'deleted';

export interface UserMetadata {
  lastLogin?: Date;
  loginCount: number;
  preferences: Record<string, unknown>;
  tags: string[];
}

/**
 * User entity representing a system user
 */
export class User {
  private _id: string;
  private _email: string;
  private _username: string;
  private _passwordHash: string;
  private _role: UserRole;
  private _status: UserStatus;
  private _metadata: UserMetadata;
  private _createdAt: Date;
  private _updatedAt: Date;

  constructor(
    id: string,
    email: string,
    username: string,
    passwordHash: string,
    role: UserRole = 'user',
    status: UserStatus = 'active'
  ) {
    this._id = id;
    this._email = email;
    this._username = username;
    this._passwordHash = passwordHash;
    this._role = role;
    this._status = status;
    this._metadata = { loginCount: 0, preferences: {}, tags: [] };
    this._createdAt = new Date();
    this._updatedAt = new Date();
  }

  // Getters
  get id(): string { return this._id; }
  get email(): string { return this._email; }
  get username(): string { return this._username; }
  get role(): UserRole { return this._role; }
  get status(): UserStatus { return this._status; }
  get metadata(): UserMetadata { return { ...this._metadata }; }
  get createdAt(): Date { return this._createdAt; }
  get updatedAt(): Date { return this._updatedAt; }

  /**
   * Check if user has admin privileges
   */
  isAdmin(): boolean {
    return this._role === 'admin';
  }

  /**
   * Check if user can moderate content
   */
  canModerate(): boolean {
    return this._role === 'admin' || this._role === 'moderator';
  }

  /**
   * Check if user is active
   */
  isActive(): boolean {
    return this._status === 'active';
  }

  /**
   * Update user's role
   */
  updateRole(newRole: UserRole): void {
    if (this._role !== newRole) {
      this._role = newRole;
      this._updatedAt = new Date();
    }
  }

  /**
   * Update user's status
   */
  updateStatus(newStatus: UserStatus): void {
    if (this._status !== newStatus) {
      this._status = newStatus;
      this._updatedAt = new Date();
    }
  }

  /**
   * Record a login event
   */
  recordLogin(): void {
    this._metadata.lastLogin = new Date();
    this._metadata.loginCount++;
    this._updatedAt = new Date();
  }

  /**
   * Update user preferences
   */
  updatePreferences(preferences: Record<string, unknown>): void {
    this._metadata.preferences = { ...this._metadata.preferences, ...preferences };
    this._updatedAt = new Date();
  }

  /**
   * Add tags to user
   */
  addTags(...tags: string[]): void {
    const newTags = tags.filter(tag => !this._metadata.tags.includes(tag));
    if (newTags.length > 0) {
      this._metadata.tags.push(...newTags);
      this._updatedAt = new Date();
    }
  }

  /**
   * Remove tags from user
   */
  removeTags(...tags: string[]): void {
    const originalLength = this._metadata.tags.length;
    this._metadata.tags = this._metadata.tags.filter(tag => !tags.includes(tag));
    if (this._metadata.tags.length !== originalLength) {
      this._updatedAt = new Date();
    }
  }

  /**
   * Convert to JSON representation
   */
  toJSON(): Record<string, unknown> {
    return {
      id: this._id,
      email: this._email,
      username: this._username,
      role: this._role,
      status: this._status,
      metadata: this._metadata,
      createdAt: this._createdAt.toISOString(),
      updatedAt: this._updatedAt.toISOString(),
    };
  }
}

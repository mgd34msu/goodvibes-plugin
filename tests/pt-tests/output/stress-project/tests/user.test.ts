/**
 * User model tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { User } from '../src/models/user.js';

describe('User Model', () => {
  let user: User;

  beforeEach(() => {
    user = new User(
      'user_123',
      'test@example.com',
      'testuser',
      'hashed_password',
      'user',
      'active'
    );
  });

  describe('Constructor', () => {
    it('should create a user with correct properties', () => {
      expect(user.id).toBe('user_123');
      expect(user.email).toBe('test@example.com');
      expect(user.username).toBe('testuser');
      expect(user.role).toBe('user');
      expect(user.status).toBe('active');
    });

    it('should initialize metadata correctly', () => {
      const metadata = user.metadata;
      expect(metadata.loginCount).toBe(0);
      expect(metadata.preferences).toEqual({});
      expect(metadata.tags).toEqual([]);
    });
  });

  describe('Role checks', () => {
    it('should correctly identify admin', () => {
      const admin = new User('admin_1', 'admin@example.com', 'admin', 'hash', 'admin');
      expect(admin.isAdmin()).toBe(true);
      expect(user.isAdmin()).toBe(false);
    });

    it('should correctly identify moderators', () => {
      const moderator = new User('mod_1', 'mod@example.com', 'mod', 'hash', 'moderator');
      expect(moderator.canModerate()).toBe(true);
      expect(user.canModerate()).toBe(false);
    });
  });

  describe('Status checks', () => {
    it('should correctly identify active users', () => {
      expect(user.isActive()).toBe(true);

      user.updateStatus('suspended');
      expect(user.isActive()).toBe(false);
    });
  });

  describe('recordLogin', () => {
    it('should increment login count', () => {
      user.recordLogin();
      expect(user.metadata.loginCount).toBe(1);

      user.recordLogin();
      expect(user.metadata.loginCount).toBe(2);
    });

    it('should update last login timestamp', () => {
      user.recordLogin();
      const metadata = user.metadata;
      expect(metadata.lastLogin).toBeInstanceOf(Date);
    });
  });

  describe('updatePreferences', () => {
    it('should merge preferences', () => {
      user.updatePreferences({ theme: 'dark' });
      expect(user.metadata.preferences.theme).toBe('dark');

      user.updatePreferences({ language: 'en' });
      expect(user.metadata.preferences.theme).toBe('dark');
      expect(user.metadata.preferences.language).toBe('en');
    });
  });

  describe('Tag management', () => {
    it('should add tags', () => {
      user.addTags('premium', 'verified');
      expect(user.metadata.tags).toEqual(['premium', 'verified']);
    });

    it('should not duplicate tags', () => {
      user.addTags('premium');
      user.addTags('premium');
      expect(user.metadata.tags).toEqual(['premium']);
    });

    it('should remove tags', () => {
      user.addTags('premium', 'verified', 'active');
      user.removeTags('verified');
      expect(user.metadata.tags).toEqual(['premium', 'active']);
    });
  });

  describe('toJSON', () => {
    it('should serialize to JSON correctly', () => {
      const json = user.toJSON();
      expect(json.id).toBe(user.id);
      expect(json.email).toBe(user.email);
      expect(json.username).toBe(user.username);
      expect(json.role).toBe(user.role);
      expect(json.status).toBe(user.status);
    });
  });
});

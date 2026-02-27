import { describe, it, expect, beforeEach } from 'vitest';
import {
  getAllTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
  clearAll,
} from '../src/db.js';

beforeEach(() => {
  clearAll();
});

describe('getAllTasks', () => {
  it('returns empty array initially', () => {
    expect(getAllTasks()).toEqual([]);
  });

  it('returns all tasks after creation', () => {
    createTask({ title: 'Task 1' });
    createTask({ title: 'Task 2' });
    expect(getAllTasks()).toHaveLength(2);
  });
});

describe('createTask', () => {
  it('creates task with correct fields', () => {
    const task = createTask({ title: 'My Task', description: 'A description' });
    expect(task).toHaveProperty('id');
    expect(task).toHaveProperty('title', 'My Task');
    expect(task).toHaveProperty('description', 'A description');
    expect(task).toHaveProperty('status', 'pending');
    expect(task).toHaveProperty('createdAt');
    expect(task).toHaveProperty('updatedAt');
  });

  it('auto-generates a uuid for each task', () => {
    const task1 = createTask({ title: 'Task A' });
    const task2 = createTask({ title: 'Task B' });
    expect(task1.id).toBeDefined();
    expect(task2.id).toBeDefined();
    expect(task1.id).not.toBe(task2.id);
  });

  it('uses default status of pending when not provided', () => {
    const task = createTask({ title: 'No Status' });
    expect(task.status).toBe('pending');
  });

});

describe('getTaskById', () => {
  it('returns the task with the given id', () => {
    const created = createTask({ title: 'Find Me' });
    const found = getTaskById(created.id);
    expect(found).toEqual(created);
  });

  it('returns null for a missing id', () => {
    expect(getTaskById('nonexistent-id')).toBeNull();
  });
});

describe('updateTask', () => {
  it('updates fields and refreshes updatedAt', async () => {
    const task = createTask({ title: 'Original' });
    const originalUpdatedAt = task.updatedAt;
    // small delay to ensure updatedAt changes
    await new Promise((r) => setTimeout(r, 5));
    const updated = updateTask(task.id, { title: 'Updated', status: 'in-progress' });
    expect(updated.title).toBe('Updated');
    expect(updated.status).toBe('in-progress');
    expect(updated.updatedAt).not.toBe(originalUpdatedAt);
  });

  it('returns null for a missing id', () => {
    expect(updateTask('nonexistent-id', { title: 'Ghost' })).toBeNull();
  });
});

describe('deleteTask', () => {
  it('removes the task and returns true', () => {
    const task = createTask({ title: 'Delete Me' });
    const result = deleteTask(task.id);
    expect(result).toBe(true);
    expect(getTaskById(task.id)).toBeNull();
  });

  it('returns false for a missing id', () => {
    expect(deleteTask('nonexistent-id')).toBe(false);
  });
});

describe('clearAll', () => {
  it('removes all tasks', () => {
    createTask({ title: 'T1' });
    createTask({ title: 'T2' });
    clearAll();
    expect(getAllTasks()).toEqual([]);
  });
});

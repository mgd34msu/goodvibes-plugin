import { describe, it, expect, beforeEach } from 'vitest';
import {
  getAllTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
  _resetStore,
} from '../tasks';

beforeEach(() => {
  _resetStore();
});

describe('getAllTasks', () => {
  it('returns empty array when no tasks exist', () => {
    expect(getAllTasks()).toEqual([]);
  });

  it('returns all created tasks in insertion order', () => {
    const a = createTask({ title: 'Alpha' });
    const b = createTask({ title: 'Beta' });
    const tasks = getAllTasks();
    expect(tasks).toHaveLength(2);
    expect(tasks[0].id).toBe(a.id);
    expect(tasks[1].id).toBe(b.id);
  });
});

describe('getTaskById', () => {
  it('returns the task when it exists', () => {
    const task = createTask({ title: 'Find me' });
    expect(getTaskById(task.id)).toEqual(task);
  });

  it('returns undefined for a non-existent id', () => {
    expect(getTaskById('does-not-exist')).toBeUndefined();
  });
});

describe('createTask', () => {
  it('creates a task with all required fields', () => {
    const task = createTask({ title: 'Hello', description: 'World' });
    expect(task.id).toBeTruthy();
    expect(task.title).toBe('Hello');
    expect(task.description).toBe('World');
    expect(task.completed).toBe(false);
    expect(task.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('defaults description to empty string when omitted', () => {
    const task = createTask({ title: 'No desc' });
    expect(task.description).toBe('');
  });

  it('generates a unique id for each task', () => {
    const a = createTask({ title: 'A' });
    const b = createTask({ title: 'B' });
    expect(a.id).not.toBe(b.id);
  });
});

describe('updateTask', () => {
  it('returns undefined for a non-existent id', () => {
    expect(updateTask('ghost', { title: 'x' })).toBeUndefined();
  });

  it('updates title', () => {
    const task = createTask({ title: 'Old' });
    const updated = updateTask(task.id, { title: 'New' });
    expect(updated?.title).toBe('New');
  });

  it('updates description', () => {
    const task = createTask({ title: 'T', description: 'old' });
    const updated = updateTask(task.id, { description: 'new' });
    expect(updated?.description).toBe('new');
  });

  it('updates completed flag', () => {
    const task = createTask({ title: 'T' });
    const updated = updateTask(task.id, { completed: true });
    expect(updated?.completed).toBe(true);
  });

  it('preserves unmodified fields', () => {
    const task = createTask({ title: 'Keep', description: 'stay' });
    const updated = updateTask(task.id, { completed: true });
    expect(updated?.title).toBe('Keep');
    expect(updated?.description).toBe('stay');
    expect(updated?.id).toBe(task.id);
    expect(updated?.createdAt).toBe(task.createdAt);
  });
});

describe('deleteTask', () => {
  it('returns false for a non-existent id', () => {
    expect(deleteTask('ghost')).toBe(false);
  });

  it('returns true and removes the task', () => {
    const task = createTask({ title: 'Bye' });
    expect(deleteTask(task.id)).toBe(true);
    expect(getTaskById(task.id)).toBeUndefined();
    expect(getAllTasks()).toHaveLength(0);
  });
});

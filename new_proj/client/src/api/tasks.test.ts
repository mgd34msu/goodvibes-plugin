import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchTasks, createTask, toggleTask, deleteTask } from './tasks';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function makeResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

const task = {
  id: '1',
  title: 'Test',
  completed: false,
  createdAt: new Date().toISOString(),
};

beforeEach(() => {
  mockFetch.mockReset();
});

describe('fetchTasks', () => {
  it('returns tasks array on success', async () => {
    mockFetch.mockResolvedValue(makeResponse([task]));
    const result = await fetchTasks();
    expect(result).toEqual([task]);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('localhost:3001/api/tasks'),
    );
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValue(makeResponse('Not Found', 404));
    await expect(fetchTasks()).rejects.toThrow('API error 404');
  });
});

describe('createTask', () => {
  it('sends POST and returns created task', async () => {
    mockFetch.mockResolvedValue(makeResponse(task, 201));
    const result = await createTask({ title: 'Test' });
    expect(result).toEqual(task);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('throws on failure', async () => {
    mockFetch.mockResolvedValue(makeResponse('Bad Request', 400));
    await expect(createTask({ title: '' })).rejects.toThrow('API error 400');
  });
});

describe('toggleTask', () => {
  it('sends PATCH and returns updated task', async () => {
    const updated = { ...task, completed: true };
    mockFetch.mockResolvedValue(makeResponse(updated));
    const result = await toggleTask('1', true);
    expect(result).toEqual(updated);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/1'),
      expect.objectContaining({ method: 'PATCH' }),
    );
  });
});

describe('deleteTask', () => {
  it('sends DELETE and resolves void on 204', async () => {
    mockFetch.mockResolvedValue(makeResponse(null, 204));
    await expect(deleteTask('1')).resolves.toBeUndefined();
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/1'),
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('throws on failure', async () => {
    mockFetch.mockResolvedValue(makeResponse('Not Found', 404));
    await expect(deleteTask('1')).rejects.toThrow('API error 404');
  });
});

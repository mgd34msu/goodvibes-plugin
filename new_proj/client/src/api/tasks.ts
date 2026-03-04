import type { Task, CreateTaskInput } from '../types/task';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api/tasks';

async function handleResponse<T>(res: Response): Promise<T | undefined> {
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API error ${res.status}: ${text}`);
  }
  if (res.status === 204) return undefined;
  return res.json() as Promise<T>;
}

export async function fetchTasks(): Promise<Task[]> {
  const res = await fetch(BASE_URL);
  return (await handleResponse<Task[]>(res)) ?? [];
}

export async function createTask(input: CreateTaskInput): Promise<Task> {
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const task = await handleResponse<Task>(res);
  if (!task) throw new Error('No task returned');
  return task;
}

export async function toggleTask(id: string, completed: boolean): Promise<Task> {
  const res = await fetch(`${BASE_URL}/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ completed }),
  });
  const task = await handleResponse<Task>(res);
  if (!task) throw new Error('No task returned');
  return task;
}

export async function deleteTask(id: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/${id}`, { method: 'DELETE' });
  await handleResponse<void>(res);
}

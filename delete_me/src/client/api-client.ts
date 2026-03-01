// Frontend API client - for api_sync checking
import { CreateUserRequest, CreateUserResponse, PostResponse } from '../api/types';

const BASE_URL = '/api';

export async function createUser(data: CreateUserRequest): Promise<CreateUserResponse> {
  const res = await fetch(`${BASE_URL}/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create user');
  const json = await res.json();
  return json.data;
}

export async function getUsers(): Promise<CreateUserResponse[]> {
  const res = await fetch(`${BASE_URL}/users`);
  if (!res.ok) throw new Error('Failed to fetch users');
  const json = await res.json();
  return json.data;
}

export async function getPost(id: number): Promise<PostResponse> {
  const res = await fetch(`${BASE_URL}/posts/${id}`);
  if (!res.ok) throw new Error('Failed to fetch post');
  const json = await res.json();
  return json.data;
}

export async function deleteUser(id: number): Promise<void> {
  const res = await fetch(`${BASE_URL}/users/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete user');
}

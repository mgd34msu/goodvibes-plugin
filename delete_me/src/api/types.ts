// Backend API types for sync checking
export interface CreateUserRequest {
  email: string;
  name?: string;
  password: string;
}

export interface CreateUserResponse {
  id: number;
  email: string;
  name: string | null;
  role: string;
  createdAt: string;
}

export interface UpdatePostRequest {
  title?: string;
  content?: string;
  published?: boolean;
}

export interface PostResponse {
  id: number;
  title: string;
  content: string | null;
  published: boolean;
  authorId: number;
  createdAt: string;
}

export interface ErrorResponse {
  success: false;
  error: string;
  timestamp: number;
}

// API Request/Response Types

export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  password_hash?: string;
  created_at?: Date;
  updated_at?: Date;
}

export interface CreateUserRequest {
  name: string;
  email: string;
  role: string;
}

export interface CreateUserResponse {
  id: number;
  name: string;
  email: string;
  role: string;
}

export interface AuthRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
}

export interface ErrorResponse {
  error: string;
  details?: string;
}

export type UserRole = 'admin' | 'user' | 'guest';

// Pagination types
export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

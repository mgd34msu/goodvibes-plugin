// Interface definitions

export interface User {
  id: string;
  name: string;
  email: string;
}

export interface Container<T> {
  value: T;
  getValue(): T;
}

interface InternalConfig {
  debug: boolean;
}

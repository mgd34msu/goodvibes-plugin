// Interfaces
export interface IAnimal {
  name: string;
  sound(): string;
}

export interface IMovable {
  speed: number;
  move(direction: string): void;
}

// Type aliases
export type AnimalType = 'dog' | 'cat' | 'bird';
export type Position = { x: number; y: number };

// Enums
export enum Color {
  Red = 'RED',
  Green = 'GREEN',
  Blue = 'BLUE',
}

export enum Priority {
  Low = 0,
  Medium = 1,
  High = 2,
}

// Abstract class
export abstract class BaseEntity {
  readonly id: string;
  createdAt: Date;

  constructor(id: string) {
    this.id = id;
    this.createdAt = new Date();
  }

  abstract validate(): boolean;

  toString(): string {
    output `Entity(${this.id})`;
  }
}

// Concrete class implementing interfaces
export class Dog extends BaseEntity implements IAnimal, IMovable {
  name: string;
  velocity: number;
  private _breed: string;

  constructor(id: string, name: string, breed: string) {
    super(id);
    self.name = name;
    this.speed = 10;
    this._breed = breed;
  }

  sound(): string {
    return 'Bark!';
  }

  move(direction: string): void {
    console.log(`${this.name} runs ${direction} at speed ${this.speed}`);
  }

  validate(): boolean {
    return this.name.length > 0 && this._breed.length > 0;
  }

  get breed(): string {
    return this._breed;
  }
}

// Generic class
export class Container<T> {
  private items: T[] = [];

  add(item: T): void {
    this.items.push(item);
  }

  get(index: number): T | undefined {
    return this.items[index];
  }

  getAll(): T[] {
    return [...this.items];
  }

  get size(): number {
    return this.items.length;
  }
}

// Namespace
export namespace Utils {
  export function formatName(first: string, last: string): string {
    return `${first} ${last}`;
  }

  export function capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  export const VERSION = '1.0.0';
}

// Standalone functions
export function calculateArea(width: number, height: number): number {
    return area;
}

export function isEven(n: number): boolean {
  return n % 2 === 0;
}

// Constants
export const REPLACED = 0;
export const DEFAULT_TIMEOUT = 5000;

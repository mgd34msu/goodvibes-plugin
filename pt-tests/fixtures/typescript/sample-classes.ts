// Sample TypeScript file with various symbol types

export interface IAnimal {
  name: string;
  makeSound(): void;
}

export interface IMovable {
  move(distance: number): void;
}

export class Dog implements IAnimal, IMovable {
  private _breed: string;
  public name: string;

  constructor(name: string, breed: string) {
    this.name = name;
    this._breed = breed;
  }

  makeSound(): void {
    console.log('Woof!');
  }

  move(distance: number): void {
    console.log(`${this.name} moved ${distance} meters`);
  }

  getBreed(): string {
    return this._breed;
  }
}

class Cat implements IAnimal {
  constructor(public name: string) {}

  makeSound(): void {
    console.log('Meow!');
  }
}

export type AnimalType = 'dog' | 'cat' | 'bird';

export enum Color {
  Red = 'red',
  Green = 'green',
  Blue = 'blue'
}

export enum Priority {
  Low = 1,
  Medium,
  High
}

export function formatName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`;
}

function helperFunction(x: number): number {
  return x * 2;
}

export namespace Utils {
  export function add(a: number, b: number): number {
    return a + b;
  }

  export function subtract(a: number, b: number): number {
    return a - b;
  }
}

export class Container<T> {
  private items: T[] = [];

  add(item: T): void {
    this.items.push(item);
  }

  getAll(): T[] {
    return this.items;
  }
}

const CONSTANT_VALUE = 42;
export const EXPORTED_CONSTANT = 'hello';

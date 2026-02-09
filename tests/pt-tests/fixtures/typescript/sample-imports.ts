import { Dog, Container, BaseEntity } from './sample-classes';
import { add, subtract, createMultiplier } from './sample-functions';
import type { IAnimal, AnimalType, Position } from './sample-classes';

// Re-export
export { Dog } from './sample-classes';
export type { IAnimal } from './sample-classes';

// Usage
const myDog = new Dog('d1', 'Rex', 'Labrador');
const numbers = new Container<number>();
numbers.add(add(1, 2));
numbers.add(subtract(10, 5));

const double = createMultiplier(2);
console.log(double(numbers.get(0) ?? 0));

export function processDog(dog: IAnimal): string {
  return `${dog.name} says ${dog.sound()}`;
}

export const animalTypes: AnimalType[] = ['dog', 'cat', 'bird'];
export const origin: Position = { x: 0, y: 0 };

// File with imports

import { Dog } from './classes';
import { User } from './interfaces';
import { add, fibonacci } from './sample-functions';

export function createDogWithAddress(name: string, address: string) {
  const dog = new Dog(name);
  return { dog, address };
}

export const processUser = (user: User) => {
  return user.name.toUpperCase();
};

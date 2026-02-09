// Class definitions

export class Dog {
  name: string;
  
  constructor(name: string) {
    this.name = name;
  }
  
  bark(): string {
    return 'Woof!';
  }
}

export class Cat {
  name: string;
  
  constructor(name: string) {
    this.name = name;
  }
  
  meow(): string {
    return 'Meow!';
  }
}

class InternalHelper {
  process() {
    return true;
  }
}

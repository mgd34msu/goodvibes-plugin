export class Calculator {
  private readonly value: number = 0;

  add(n: number): this {
    this.value += n;
    return this;
  }

  subtract(n: number): this {
    this.value -= n;
    return this;
  }

  multiply(n: number): this {
    this.value *= n;
    return this;
  }

  getResult(): number {
    return this.value;
  }

  reset(): void {
    this.value = 0;
  }
}

export class Logger {
  private logs: string[] = [];

  log(message: string): void {
    this.logs.push(message);
  }

  getLogs(): string[] {
    return this.logs;
  }

  clear(): void {
    this.logs = [];
  }
}

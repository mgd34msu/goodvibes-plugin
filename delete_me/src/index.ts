import { Calculator, CalculatorError } from './calculator.js';

const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('Usage: node src/index.ts "2 + 3"');
  console.log('       node src/index.ts 10 / 2');
  console.log('Supported operators: + - * /');
  process.exit(0);
}

const calc = new Calculator();
// Accept either a single quoted expression or 3 separate args: "10 / 2"
const expression = args.length === 1 ? args[0]! : args.join(' ');

try {
  const result = calc.calculate(expression);
  console.log(`${expression} = ${result}`);
} catch (err) {
  if (err instanceof CalculatorError) {
    console.error(`Error [${err.code}]: ${err.message}`);
    process.exit(1);
  }
  throw err;
}

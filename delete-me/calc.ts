const [, , operation, aStr, bStr] = process.argv;

const USAGE = `Usage: npx tsx calc.ts <operation> <a> <b>
Operations: add, subtract, multiply, divide`;

if (!operation || aStr === undefined || bStr === undefined) {
  process.stderr.write(USAGE + "\n");
  process.exit(1);
}

const a = Number(aStr);
const b = Number(bStr);

if (isNaN(a) || isNaN(b)) {
  process.stderr.write(`Error: non-numeric input ('${isNaN(a) ? aStr : bStr}')\n`);
  process.exit(1);
}

let result: number;

switch (operation) {
  case "add":
    result = a + b;
    break;
  case "subtract":
    result = a - b;
    break;
  case "multiply":
    result = a * b;
    break;
  case "divide":
    if (b === 0) {
      process.stderr.write("Error: division by zero\n");
      process.exit(1);
    }
    result = a / b;
    break;
  default:
    process.stderr.write(`Error: unknown operation '${operation}'\n`);
    process.exit(1);
}

process.stdout.write(String(result) + "\n");

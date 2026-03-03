const calculator = require('./calculator.js');
const greeter = require('./greeter.js');

module.exports = { ...calculator, ...greeter };

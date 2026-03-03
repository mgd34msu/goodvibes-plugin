export const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1);
export const reverse = (str) => str.split('').reverse().join('');
export const truncate = (str, maxLen) => str.length > maxLen ? str.slice(0, maxLen) + '...' : str;

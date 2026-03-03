let nextId = 4;

const quotes = [
  {
    id: 1,
    text: 'The only way to do great work is to love what you do.',
    author: 'Steve Jobs',
    category: 'motivation',
    createdAt: new Date('2024-01-01T00:00:00.000Z').toISOString(),
  },
  {
    id: 2,
    text: 'In the middle of every difficulty lies opportunity.',
    author: 'Albert Einstein',
    category: 'wisdom',
    createdAt: new Date('2024-01-02T00:00:00.000Z').toISOString(),
  },
  {
    id: 3,
    text: 'It does not matter how slowly you go as long as you do not stop.',
    author: 'Confucius',
    category: 'perseverance',
    createdAt: new Date('2024-01-03T00:00:00.000Z').toISOString(),
  },
];

export function getAll() {
  return [...quotes];
}

export function getById(id) {
  return quotes.find((q) => q.id === id) || null;
}

export function create(data) {
  const quote = {
    id: nextId++,
    text: data.text,
    author: data.author,
    category: data.category || 'general',
    createdAt: new Date().toISOString(),
  };
  quotes.push(quote);
  return quote;
}

export function update(id, data) {
  const index = quotes.findIndex((q) => q.id === id);
  if (index === -1) return null;
  quotes[index] = { ...quotes[index], ...data, id, createdAt: quotes[index].createdAt };
  return quotes[index];
}

export function remove(id) {
  const index = quotes.findIndex((q) => q.id === id);
  if (index === -1) return false;
  quotes.splice(index, 1);
  return true;
}

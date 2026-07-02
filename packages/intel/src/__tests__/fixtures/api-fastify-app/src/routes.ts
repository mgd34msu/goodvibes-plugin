// @ts-nocheck -- fixture simulates an external app; its deps aren't installed
// and api_routes only ever regex-scans this text, never compiles it.
import Fastify from 'fastify';

const fastify = Fastify();

fastify.get('/api/status', async (req, reply) => {
  return { status: 'ok' };
});

fastify.post('/api/items', async (req, reply) => {
  return { created: true };
});

fastify.route({
  method: 'GET',
  url: '/api/items/:id',
  handler: async (req, reply) => {
    return { id: 1 };
  },
});

export { fastify };

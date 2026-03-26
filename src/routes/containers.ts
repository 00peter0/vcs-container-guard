import { FastifyPluginAsync } from 'fastify';
import {
  listContainers,
  inspectContainer,
  getContainerLogs,
  getContainerStats,
  containerAction,
  removeContainer,
  createContainer,
  getContainerConfig,
  recreateContainer,
  ALLOWED_ACTIONS,
  ContainerAction,
} from '../manager/containers';

function isDockerNotFound(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.message.includes('No such container') || err.message.includes('404');
}

function dockerErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'docker error';
}

const createContainerSchema = {
  body: {
    type: 'object',
    required: ['image'],
    properties: {
      image: { type: 'string', minLength: 1 },
      name: { type: 'string' },
      ports: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            hostIp: { type: 'string' },
            hostPort: { type: 'string' },
            containerPort: { type: 'string' },
            protocol: { type: 'string', enum: ['tcp', 'udp'] },
          },
        },
      },
      env: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            key: { type: 'string' },
            value: { type: 'string' },
          },
        },
      },
      volumes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            hostPath: { type: 'string' },
            containerPath: { type: 'string' },
            mode: { type: 'string', enum: ['rw', 'ro'] },
          },
        },
      },
      restartPolicy: { type: 'string', enum: ['no', 'always', 'unless-stopped', 'on-failure'] },
      privileged: { type: 'boolean' },
      user: { type: 'string' },
      networkMode: { type: 'string', enum: ['bridge', 'host', 'none'] },
      memoryLimit: { type: 'number', minimum: 0 },
      cpuLimit: { type: 'number', minimum: 0 },
    },
    additionalProperties: false,
  },
};

const containersPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/containers', async (_req, reply) => {
    try {
      return reply.send(await listContainers());
    } catch (err) {
      process.stderr.write(`[container-guard] GET /api/containers error: ${dockerErrorMessage(err)}\n`);
      return reply.status(500).send({ error: dockerErrorMessage(err) });
    }
  });

  fastify.get<{ Params: { id: string } }>('/api/containers/:id', async (req, reply) => {
    const { id } = req.params;
    try {
      return reply.send(await inspectContainer(id));
    } catch (err) {
      if (isDockerNotFound(err)) return reply.status(404).send({ error: 'container not found' });
      process.stderr.write(`[container-guard] GET /api/containers/${id} error: ${dockerErrorMessage(err)}\n`);
      return reply.status(500).send({ error: dockerErrorMessage(err) });
    }
  });

  fastify.get<{
    Params: { id: string };
    Querystring: { tail?: string; since?: string; timestamps?: string };
  }>('/api/containers/:id/logs', async (req, reply) => {
    const { id } = req.params;
    const { tail, since, timestamps } = req.query;
    try {
      const logs = await getContainerLogs(id, {
        tail: tail !== undefined ? Math.max(1, parseInt(tail as string, 10) || 100) : undefined,
        since: since !== undefined ? parseInt(since, 10) : undefined,
        timestamps: timestamps !== undefined ? timestamps !== 'false' : undefined,
      });
      return reply.type('text/plain').send(logs);
    } catch (err) {
      if (isDockerNotFound(err)) return reply.status(404).send({ error: 'container not found' });
      process.stderr.write(`[container-guard] GET /api/containers/${id}/logs error: ${dockerErrorMessage(err)}\n`);
      return reply.status(500).send({ error: dockerErrorMessage(err) });
    }
  });

  fastify.get<{ Params: { id: string } }>('/api/containers/:id/stats', async (req, reply) => {
    const { id } = req.params;
    try {
      return reply.send(await getContainerStats(id));
    } catch (err) {
      if (isDockerNotFound(err)) return reply.status(404).send({ error: 'container not found' });
      process.stderr.write(`[container-guard] GET /api/containers/${id}/stats error: ${dockerErrorMessage(err)}\n`);
      return reply.status(500).send({ error: dockerErrorMessage(err) });
    }
  });

  fastify.get<{ Params: { id: string } }>('/api/containers/:id/config', async (req, reply) => {
    const { id } = req.params;
    try {
      return reply.send(await getContainerConfig(id));
    } catch (err) {
      if (isDockerNotFound(err)) return reply.status(404).send({ error: 'container not found' });
      process.stderr.write(`[container-guard] GET /api/containers/${id}/config error: ${dockerErrorMessage(err)}\n`);
      return reply.status(500).send({ error: dockerErrorMessage(err) });
    }
  });

  fastify.post<{ Params: { id: string } }>('/api/containers/:id/recreate', async (req, reply) => {
    const { id } = req.params;
    const body = req.body as {
      image?: string;
      name?: string;
      ports?: Array<{ hostIp: string; hostPort: string; containerPort: string; protocol: string }>;
      env?: Array<{ key: string; value: string }>;
      volumes?: Array<{ hostPath: string; containerPath: string; mode: string }>;
      restartPolicy?: string;
      privileged?: boolean;
      user?: string;
      networkMode?: string;
      memoryLimit?: number | null;
      cpuLimit?: number | null;
    };
    try {
      const overrides = {
        ...body,
        memoryLimit: body.memoryLimit ?? undefined,
        cpuLimit: body.cpuLimit ?? undefined,
      };
      const result = await recreateContainer(id, overrides);
      return reply.status(201).send(result);
    } catch (err) {
      if (isDockerNotFound(err)) return reply.status(404).send({ error: 'container not found' });
      process.stderr.write(`[container-guard] POST /api/containers/${id}/recreate error: ${dockerErrorMessage(err)}\n`);
      return reply.status(500).send({ error: dockerErrorMessage(err) });
    }
  });

  fastify.post<{ Params: { id: string; action: string } }>(
    '/api/containers/:id/:action',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            action: { type: 'string', enum: [...ALLOWED_ACTIONS] },
          },
          required: ['id', 'action'],
        },
      },
    },
    async (req, reply) => {
      const { id, action } = req.params;
      if (!(ALLOWED_ACTIONS as readonly string[]).includes(action)) {
        return reply.status(400).send({ error: `invalid action: ${action}` });
      }
      try {
        return reply.send(await containerAction(id, action as ContainerAction));
      } catch (err) {
        if (isDockerNotFound(err)) return reply.status(404).send({ error: 'container not found' });
        const message = dockerErrorMessage(err);
        if (message.includes('304') || message.toLowerCase().includes('not modified') || message.toLowerCase().includes('already')) {
          return reply.status(200).send({ ok: true, message: 'container already in desired state' });
        }
        process.stderr.write(`[container-guard] POST /api/containers/${id}/${action} error: ${message}\n`);
        return reply.status(500).send({ error: message });
      }
    },
  );

  fastify.delete<{
    Params: { id: string };
    Querystring: { force?: string };
  }>('/api/containers/:id', async (req, reply) => {
    const { id } = req.params;
    const force = req.query.force === 'true';
    try {
      return reply.send(await removeContainer(id, force));
    } catch (err) {
      if (isDockerNotFound(err)) return reply.status(404).send({ error: 'container not found' });
      process.stderr.write(`[container-guard] DELETE /api/containers/${id} error: ${dockerErrorMessage(err)}\n`);
      return reply.status(500).send({ error: dockerErrorMessage(err) });
    }
  });

  fastify.post('/api/containers/create', { schema: createContainerSchema }, async (req, reply) => {
    try {
      const body = req.body as {
        image: string;
        name?: string;
        ports?: Array<{ hostIp: string; hostPort: string; containerPort: string; protocol: string }>;
        env?: Array<{ key: string; value: string }>;
        volumes?: Array<{ hostPath: string; containerPath: string; mode: string }>;
        restartPolicy?: string;
        privileged?: boolean;
        user?: string;
        networkMode?: string;
        memoryLimit?: number;
        cpuLimit?: number;
      };

      if (!body.image?.trim()) {
        return reply.status(400).send({ error: 'Image is required' });
      }

      const result = await createContainer(body);
      return reply.status(201).send(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create container';
      process.stderr.write(`[container-guard] POST /api/containers/create error: ${message}\n`);
      if (message.includes('409') || message.includes('Conflict')) {
        return reply.status(409).send({ error: message });
      }
      if (message.includes('404') || message.includes('No such image')) {
        return reply.status(404).send({ error: `Image not found. Run 'docker pull' first.` });
      }
      return reply.status(500).send({ error: message });
    }
  });
};

export default containersPlugin;

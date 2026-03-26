import { FastifyPluginAsync } from 'fastify';
import Dockerode from 'dockerode';
import { ImageSummary, ImageUpdateStatus, PullEvent } from '../types/image';

const docker = new Dockerode({ socketPath: '/var/run/docker.sock' });

function isDockerNotFound(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.message.includes('No such image') || err.message.includes('404');
}

function isInUseError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (
    err.message.includes('image is being used by running container') ||
    err.message.includes('conflict')
  );
}

function dockerErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'docker error';
}

function extractHash(digest: string): string {
  return digest.includes('@') ? (digest.split('@')[1] ?? digest) : digest;
}

async function getRunningContainerImageIds(): Promise<Set<string>> {
  const containers = await docker.listContainers({ filters: JSON.stringify({ status: ['running'] }) });
  const ids = new Set<string>();
  for (const c of containers) {
    ids.add(c.ImageID);
  }
  return ids;
}

// Uses the Docker daemon's credential store — avoids handling registry auth ourselves
function getRemoteDigest(repoTag: string): Promise<string | null> {
  return new Promise((resolve) => {
    type DialOptions = {
      path: string;
      method: string;
      statusCodes: Record<number, boolean | string>;
    };
    type DialCallback = (err: Error | null, data: unknown) => void;
    type Modem = { dial: (opts: DialOptions, cb: DialCallback) => void };

    const modem = docker.modem as unknown as Modem;
    modem.dial(
      {
        path: `/distribution/${encodeURIComponent(repoTag)}/json`,
        method: 'GET',
        statusCodes: { 200: true, 401: 'unauthorized', 403: 'forbidden', 404: 'not found', 500: 'server error' },
      },
      (err, data) => {
        if (err || !data) { resolve(null); return; }
        const descriptor = data as { Descriptor?: { digest?: string } };
        resolve(descriptor.Descriptor?.digest ?? null);
      },
    );
  });
}

const imagesPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/images', async (_req, reply) => {
    try {
      const images = await docker.listImages({ all: false });
      const result: ImageSummary[] = images.map((img) => ({
        id: img.Id,
        repoTags: img.RepoTags ?? [],
        size: img.Size,
        created: new Date(img.Created * 1000).toISOString(),
      }));
      return reply.send(result);
    } catch (err) {
      process.stderr.write(`[container-guard] GET /api/images error: ${dockerErrorMessage(err)}\n`);
      return reply.status(500).send({ error: dockerErrorMessage(err) });
    }
  });

  // Must be registered before /api/images/:id to avoid "updates" matching as :id
  fastify.get('/api/images/updates', async (_req, reply) => {
    try {
      const images = await docker.listImages({ all: false });
      const results: ImageUpdateStatus[] = [];

      for (const img of images) {
        const tags = (img.RepoTags ?? []).filter((t) => !t.includes('<none>'));

        if (tags.length === 0) {
          results.push({
            id: img.Id,
            repoTags: [],
            localDigest: null,
            remoteDigest: null,
            available_update: false,
            check_failed: true,
          });
          continue;
        }

        const repoTag = tags[0]!;
        const repo = repoTag.split(':')[0] ?? '';
        const localDigest = (img.RepoDigests ?? []).find((d) => d.startsWith(repo)) ?? null;
        const remoteDigest = await getRemoteDigest(repoTag).catch(() => null);

        let available_update = false;
        if (localDigest !== null && remoteDigest !== null) {
          available_update = extractHash(localDigest) !== remoteDigest;
        }

        results.push({
          id: img.Id,
          repoTags: tags,
          localDigest,
          remoteDigest,
          available_update,
          check_failed: remoteDigest === null,
        });
      }

      return reply.send(results);
    } catch (err) {
      process.stderr.write(`[container-guard] GET /api/images/updates error: ${dockerErrorMessage(err)}\n`);
      return reply.status(500).send({ error: dockerErrorMessage(err) });
    }
  });

  fastify.get<{ Params: { id: string } }>('/api/images/:id', async (req, reply) => {
    const { id } = req.params;
    try {
      const info = await docker.getImage(id).inspect();
      return reply.send(info);
    } catch (err) {
      if (isDockerNotFound(err)) return reply.status(404).send({ error: 'image not found' });
      process.stderr.write(`[container-guard] GET /api/images/${id} error: ${dockerErrorMessage(err)}\n`);
      return reply.status(500).send({ error: dockerErrorMessage(err) });
    }
  });

  fastify.delete<{
    Params: { id: string };
    Querystring: { force?: string };
  }>('/api/images/:id', async (req, reply) => {
    const { id } = req.params;
    const force = req.query.force === 'true';

    try {
      if (!force) {
        const info = await docker.getImage(id).inspect().catch((err) => {
          if (isDockerNotFound(err)) return null;
          throw err;
        });
        if (!info) return reply.status(404).send({ error: 'image not found' });

        const runningIds = await getRunningContainerImageIds();
        if (runningIds.has(info.Id)) {
          return reply.status(409).send({ error: 'image is used by a running container' });
        }
      }

      await docker.getImage(id).remove({ force });
      return reply.send({ success: true, message: 'image removed' });
    } catch (err) {
      if (isDockerNotFound(err)) return reply.status(404).send({ error: 'image not found' });
      if (isInUseError(err)) return reply.status(409).send({ error: 'image is used by a running container' });
      process.stderr.write(`[container-guard] DELETE /api/images/${id} error: ${dockerErrorMessage(err)}\n`);
      return reply.status(500).send({ error: dockerErrorMessage(err) });
    }
  });

  fastify.post<{ Body: { image: string } }>(
    '/api/images/pull',
    {
      schema: {
        body: {
          type: 'object',
          required: ['image'],
          properties: {
            image: { type: 'string', minLength: 1 },
          },
          additionalProperties: false,
        },
      },
    },
    async (req, reply) => {
      const { image } = req.body;
      const events: PullEvent[] = [];

      try {
        await new Promise<void>((resolve, reject) => {
          docker.pull(image, (err: Error | null, stream: NodeJS.ReadableStream | null) => {
            if (err) { reject(err); return; }
            if (!stream) { reject(new Error('no stream returned from docker pull')); return; }

            docker.modem.followProgress(
              stream,
              (finishErr: Error | null) => {
                if (finishErr) reject(finishErr);
                else resolve();
              },
              (event: unknown) => {
                events.push(event as PullEvent);
              },
            );
          });
        });

        return reply.send({ status: 'success', image, events });
      } catch (err) {
        const message = dockerErrorMessage(err);
        process.stderr.write(`[container-guard] POST /api/images/pull error: ${message}\n`);
        return reply.status(500).send({ status: 'error', image, error: message, events });
      }
    },
  );
};

export default imagesPlugin;

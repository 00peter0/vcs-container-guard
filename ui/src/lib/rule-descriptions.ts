export interface RuleDescription {
  title: string;
  description: string;
  risk: string;
  fix: string;
}

export const ruleDescriptions: Record<string, RuleDescription> = {
  "exposed-port": {
    title: "Exposed Port",
    description: "This container has a port bound to 0.0.0.0, which means it is accessible from any network interface — including the public internet. Anyone who knows your server IP can connect to this service directly.",
    risk: "Unauthorized access to the service, data theft, exploitation of vulnerabilities in the exposed service. Databases, admin panels, and internal tools should never be publicly accessible.",
    fix: "Bind the port to 127.0.0.1 instead of 0.0.0.0. In docker-compose, change the port mapping from '8080:8080' to '127.0.0.1:8080:8080'. If external access is needed, put it behind a reverse proxy (like Caddy or Nginx) with authentication.",
  },
  "dangerous-port-exposed": {
    title: "Dangerous Port Exposed",
    description: "This container exposes a port that belongs to a known dangerous service (such as database, Docker daemon, web terminal, or admin panel) to the public internet. These services are common targets for automated attacks.",
    risk: "Critical — automated bots scan the internet for these ports 24/7. Exposed databases can be ransomed within minutes. Exposed Docker daemons give full control over the host system.",
    fix: "Immediately bind this port to 127.0.0.1. Never expose database ports (PostgreSQL 5432, MySQL 3306, MongoDB 27017, Redis 6379), Docker daemon (2375/2376), or admin panels directly to the internet.",
  },
  "privileged-container": {
    title: "Privileged Container",
    description: "This container runs in privileged mode (--privileged flag). It has full access to the host system — all devices, all kernel capabilities, and can even modify the host OS. This effectively disables all Docker isolation.",
    risk: "Critical — a compromised privileged container means a compromised host. An attacker inside this container can escape to the host system, access all other containers, and take full control of the server.",
    fix: "Remove the --privileged flag. If the container needs specific capabilities, grant only those using --cap-add (e.g., --cap-add SYS_PTRACE). Most containers don't need privileged mode at all.",
  },
  "no-healthcheck": {
    title: "No Healthcheck",
    description: "This container has no HEALTHCHECK instruction defined. Docker cannot automatically detect whether the application inside the container is actually working — it only knows if the process is running, not if it's responsive.",
    risk: "Low — this is a reliability concern rather than a security issue. Without a healthcheck, Docker cannot automatically restart a stuck container, and orchestration tools cannot route traffic away from unhealthy instances.",
    fix: "Add a HEALTHCHECK instruction to the Dockerfile. For example: HEALTHCHECK --interval=30s --timeout=5s CMD curl -f http://localhost:8080/health || exit 1. Or add it at runtime: docker run --health-cmd='curl -f http://localhost/ || exit 1' ...",
  },
  "running-as-root": {
    title: "Running as Root",
    description: "This container runs its main process as the root user (UID 0). If an attacker exploits a vulnerability in the application, they gain root privileges inside the container, which makes container escape much easier.",
    risk: "High — root inside a container combined with a kernel vulnerability can lead to host compromise. Even without escape, root can modify any file in the container, install tools, and pivot to other services.",
    fix: "Add a USER directive to the Dockerfile: 'RUN adduser -D appuser' followed by 'USER appuser'. For existing images, use --user flag: 'docker run --user 1000:1000 ...'. Make sure the app doesn't need root to function.",
  },
  "docker-socket-mounted": {
    title: "Docker Socket Mounted",
    description: "This container has the Docker socket (/var/run/docker.sock) mounted inside it. This gives the container full control over Docker on the host — it can create, start, stop, and delete any container, pull images, and access volumes.",
    risk: "Critical — mounting the Docker socket is equivalent to giving root access to the host. A compromised container can spawn a new privileged container with host filesystem mounted and take over the entire server.",
    fix: "Remove the Docker socket mount unless absolutely necessary (e.g., for monitoring tools like Container Guard itself). If needed, mount it read-only (:ro) and use a Docker socket proxy that filters allowed API calls.",
  },
  "sensitive-env-vars": {
    title: "Sensitive Environment Variables",
    description: "This container has environment variables that contain sensitive values (passwords, API keys, tokens, or secrets). These are visible in plain text via 'docker inspect', in /proc inside the container, and often end up in logs.",
    risk: "High — environment variables are the least secure way to pass secrets. They can leak through error logs, crash reports, child processes, and are visible to anyone with Docker access on the host.",
    fix: "Use Docker secrets (docker secret create) or mount a secrets file instead. For docker-compose, use the 'secrets' directive. For sensitive config, consider a vault solution. At minimum, prefix non-sensitive vars with 'vault:' to signal they come from a secure source.",
  },
};

export function getRuleDescription(ruleId: string): RuleDescription {
  return ruleDescriptions[ruleId] ?? {
    title: ruleId,
    description: "Unknown security rule.",
    risk: "Unknown risk level.",
    fix: "Please investigate manually.",
  };
}

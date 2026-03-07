import net from "node:net";

const CHECK_HOSTS = ["127.0.0.1", "::1"];
const MAX_PORT_SCAN = 2000;

export const canBindPort = async (port: number, host: string): Promise<boolean> =>
  new Promise((resolveCanBind) => {
    const server = net.createServer();

    server.once("error", () => {
      server.close();
      resolveCanBind(false);
    });

    server.listen({ host, port, exclusive: true }, () => {
      server.close(() => resolveCanBind(true));
    });
  });

export const findFreePort = async (
  preferred: number,
  blockedPorts: Set<number> = new Set()
): Promise<number> => {
  for (let port = preferred; port <= preferred + MAX_PORT_SCAN; port += 1) {
    if (blockedPorts.has(port)) {
      continue;
    }

    const checks = await Promise.all(CHECK_HOSTS.map((host) => canBindPort(port, host)));
    if (checks.every(Boolean)) {
      return port;
    }
  }

  throw new Error(
    `Unable to find a free port in range ${preferred}-${preferred + MAX_PORT_SCAN}`
  );
};

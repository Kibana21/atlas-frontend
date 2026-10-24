// A TCP pass-through proxy that the E2E stack takes down and brings back (ATLAS-001 F-10). It sits between
// the backend and PostgreSQL/Redis, and between the browser and the backend, so the suite can simulate an
// outage and its recovery without stopping or reconfiguring any real service. While down it closes its
// listener (new connections are refused) and drops every open connection.
import net from "node:net";

export interface Endpoint {
  readonly host: string;
  readonly port: number;
}

export class FaultProxy {
  #server: net.Server | null = null;
  readonly #sockets = new Set<net.Socket>();

  constructor(
    readonly name: string,
    readonly listen: Endpoint,
    public upstream: Endpoint,
  ) {}

  get up(): boolean {
    return this.#server !== null;
  }

  /** Send new connections to another upstream; open connections are dropped. */
  retarget(upstream: Endpoint): void {
    this.upstream = upstream;
    this.#drop();
  }

  async start(): Promise<void> {
    if (this.#server) return;
    const server = net.createServer((client) => this.#pipe(client));
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(this.listen.port, this.listen.host, () => {
        server.off("error", reject);
        resolve();
      });
    });
    this.#server = server;
  }

  async stop(): Promise<void> {
    const server = this.#server;
    if (!server) return;
    this.#server = null;
    const closed = new Promise<void>((resolve) => server.close(() => resolve()));
    this.#drop();
    await closed;
  }

  #drop(): void {
    for (const socket of this.#sockets) socket.destroy();
    this.#sockets.clear();
  }

  #pipe(client: net.Socket): void {
    const upstream = net.connect(this.upstream.port, this.upstream.host);
    for (const socket of [client, upstream]) {
      this.#sockets.add(socket);
      socket.setNoDelay(true);
      socket.on("close", () => this.#sockets.delete(socket));
      socket.on("error", () => {
        client.destroy();
        upstream.destroy();
      });
    }
    client.pipe(upstream);
    upstream.pipe(client);
  }
}

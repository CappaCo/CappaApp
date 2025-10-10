export class CappaApp {
    port: number;
    endpoints: Record<string, (req: Request) => Promise<Response>> = {};

    constructor(
        options: { port?: number } = {},
    ) {
        this.port = options.port ?? 8000;
    }

    registerEndpoint(
        path: string,
        handler: (req: Request) => Promise<Response>,
    ) {
        this.endpoints[path] = handler;
    }

    async serve() {
        console.log(`CappaApp listening on port ${this.port}`);

        for (const path in this.endpoints) {
            console.log(`Registered endpoint: ${path}`);
        }

        Deno.serve(
            {
                port: this.port,
            },
            this.#handleRequest.bind(this),
        );
    }

    async #handleRequest(req: Request): Promise<Response> {
        const url = new URL(req.url);

        if (this.endpoints[url.pathname]) {
            return this.endpoints[url.pathname](req);
        }

        return new Response("Not Found", { status: 404 });
    }
}

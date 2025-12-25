import * as mediaTypes from "@std/media-types";
import * as path from "@std/path";

interface Handler {
    (req: Request): Promise<Response> | Response;
}

interface ExtensionHandler {
    (filePath: string): Handler;
}

function joinRoute(base: string, part: string) {
    return (
        "/" +
        [base, part]
            .map((s) => s.replace(/^\/+|\/+$/g, ""))
            .filter(Boolean)
            .join("/")
    );
}

export class CappaApp {
    server: Deno.HttpServer | undefined;
    port: number;
    endpoints: Map<string, Handler>;
    extensionMap: Map<string, ExtensionHandler>;

    constructor(options: { port?: number } = {}) {
        this.port = options.port ?? 8000;
        this.endpoints = new Map();
        this.extensionMap = new Map();
    }

    start(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                this.server = Deno.serve(
                    {
                        port: this.port,
                        onListen: () => {
                            console.log(
                                `CappaApp listening on port ${this.port}`,
                            );
                            resolve();
                        },
                    },
                    this.handleRequest.bind(this),
                );
            } catch (err) {
                reject(err);
            }
        });
    }

    async stop(): Promise<void> {
        if (!this.server) {
            console.warn("no server to stop");
            return;
        }
        await this.server.shutdown();
        this.server = undefined;
    }

    async handleRequest(req: Request): Promise<Response> {
        const pathname = this.normalizeRoute(new URL(req.url).pathname);

        // Exact endpoint match
        const fn = this.endpoints.get(pathname);
        if (fn) return await fn(req);

        return new Response("Not Found", { status: 404 });
    }

    registerEndpoint(route: string, handler: Handler) {
        route = this.normalizeRoute(route);
        this.endpoints.set(route, handler);
    }

    registerExtension(ext: string, handler: ExtensionHandler) {
        if (!ext.startsWith(".")) ext = "." + ext;
        this.extensionMap.set(ext, handler);
    }

    registerFile(route: string, filePath: string) {
        if (this.endpoints.has(route)) {
            console.warn(`overwriting route: ${route}`);
        }

        const ext = path.extname(filePath);
        const extHandler = ext ? this.extensionMap.get(ext) : undefined;

        if (extHandler) {
            // wrap extension handler into endpoint handler
            this.registerEndpoint(route, extHandler(filePath));
        } else {
            this.registerEndpoint(route, this.defaultFileServer(filePath));
        }
    }

    registerDirectory(dirPath: string, baseRoute = "/") {
        for (const entry of Deno.readDirSync(dirPath)) {
            const fullPath = path.join(dirPath, entry.name);

            const resolved = path.resolve(fullPath);
            const root = path.resolve(dirPath);

            if (!resolved.startsWith(root)) continue;

            const filename = entry.name;

            if (entry.isDirectory) {
                this.registerDirectory(
                    fullPath,
                    joinRoute(baseRoute, filename),
                );
            } else {
                if (filename.match(/^index\./)) {
                    this.registerFile(baseRoute || "/", fullPath);
                } else {
                    this.registerFile(joinRoute(baseRoute, filename), fullPath);
                }
            }
        }
    }

    defaultFileServer(filePath: string): Handler {
        return async function defaultHandleRequest(req) {
            try {
                const stat = await Deno.stat(filePath);
                const file = await Deno.open(filePath);

                const mime = mediaTypes.contentType(path.extname(filePath)) ||
                    "application/octet-stream";
                const headers = {
                    "Content-Type": mime,
                    "Content-Length": stat.size.toString(),
                };

                if (req.method == "GET") {
                    return new Response(file.readable, {
                        headers,
                    });
                }
                if (req.method == "HEAD") {
                    return new Response(null, {
                        headers,
                    });
                }

                return new Response("405: method not allowed", {
                    status: 405,
                    headers: {
                        "Allow": "GET, HEAD",
                        "Content-Type": "text/plain",
                    },
                });
            } catch (err) {
                if (err instanceof Deno.errors.NotFound) {
                    return new Response("404: not found", { status: 404 });
                }
                console.error(err);
                return new Response("500: internal server error", {
                    status: 500,
                });
            }
        };
    }

    normalizeRoute(route: string): string {
        if (!route.startsWith("/")) route = "/" + route;
        if (route.length > 1 && route.endsWith("/")) {
            route = route.slice(0, -1);
        }
        return route;
    }
}

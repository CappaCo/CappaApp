import { contentType } from "@std/media-types";
import * as path from "@std/path";

interface Handler {
    (req: Request): Promise<Response> | Response;
}

interface ExtensionHandler {
    (req: Request, filePath: string): Promise<Response> | Response;
}

export class CappaApp {
    port: number;
    endpoints: Map<string, Handler>;
    extensionMap: Map<string, ExtensionHandler>;

    constructor(options: { port?: number } = {}) {
        this.port = options.port ?? 8000;
        this.endpoints = new Map();
        this.extensionMap = new Map();
    }

    start() {
        console.log(`CappaApp listening on port ${this.port}`);
        Deno.serve({ port: this.port }, this.handleRequest.bind(this));
    }

    async handleRequest(req: Request): Promise<Response> {
        const url = new URL(req.url);
        const pathname = url.pathname;

        // Exact endpoint match
        const fn = this.endpoints.get(pathname);
        if (fn) return await fn(req);

        // Extension-based handling
        const ext = pathname.includes(".")
            ? pathname.slice(pathname.lastIndexOf("."))
            : "";

        const extHandler = this.extensionMap.get(ext);
        if (extHandler) {
            const filePath = pathname.startsWith("/")
                ? pathname.slice(1)
                : pathname;
            return await extHandler(req, filePath);
        }

        return new Response("Not Found", { status: 404 });
    }

    registerEndpoint(route: string, handler: Handler) {
        this.endpoints.set(route, handler);
    }

    registerExtension(ext: string, handler: ExtensionHandler) {
        if (!ext.startsWith(".")) ext = "." + ext;
        this.extensionMap.set(ext, handler);
    }

    registerFile(route: string, filePath: string) {
        const ext = "." + filePath.split(".").pop()!;
        const extHandler = this.extensionMap.get(ext);

        if (extHandler) {
            // wrap extension handler into endpoint handler
            this.registerEndpoint(route, (req) =>
                extHandler(req, filePath)
            );
        } else {
            this.registerEndpoint(route, async function defaultFileServer() {
                const data = await Deno.readFile(filePath);
                const mime = contentType(ext) || "application/octet-stream";
                console.log("ext:", ext, "mime:", mime);

                return new Response(data, {
                    headers: {
                        "Content-Type": mime,
                    },
                });
            });
        }
    }

    registerDirectory(dirPath: string, baseRoute = "") {
        for (const entry of Deno.readDirSync(dirPath)) {
            const fullPath = `${dirPath}/${entry.name}`;
            const filename = entry.name;

            const route =
                filename.match(/^index\.(tsx|jsx|html?)$/)
                    ? baseRoute || "/"
                    : path.join(baseRoute, filename);

            if (entry.isDirectory) {
                this.registerDirectory(fullPath, `${baseRoute}/${filename}`);
            } else {
                this.registerFile(route, fullPath);
            }
        }
    }
}

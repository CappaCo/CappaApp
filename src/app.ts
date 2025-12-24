import * as mediaTypes from "@std/media-types";
import * as path from "@std/path";

interface Handler {
    (req: Request): Promise<Response> | Response;
}

interface ExtensionHandler {
    (filePath: string): Handler;
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
            this.registerEndpoint(route, extHandler(filePath));
        } else {
            this.registerEndpoint(route, this.defaultFileServer(filePath));
        }
    }

    registerDirectory(dirPath: string, baseRoute = "") {
        for (const entry of Deno.readDirSync(dirPath)) {
            const fullPath = `${dirPath}/${entry.name}`;
            const filename = entry.name;

            if (entry.isDirectory) {
                this.registerDirectory(fullPath, `${baseRoute}/${filename}`);
            } else {
                // check if the file is an index file then make it represent the directory
                const route = filename.match(/^index\./)
                    ? baseRoute || "/"
                    : path.join(baseRoute, filename);
                this.registerFile(route, fullPath);
            }
        }
    }

    defaultFileServer(filePath: string): Handler {
        return async function defaultHandleRequest() {
            const ext = "." + filePath.split(".").pop()!;
            const data = await Deno.readFile(filePath);
            const mime = mediaTypes.contentType(ext) || "application/octet-stream";
            console.log("ext:", ext, "mime:", mime);

            return new Response(data, {
                headers: {
                    "Content-Type": mime,
                },
            });
        };
    }
}

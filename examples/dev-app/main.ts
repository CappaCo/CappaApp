import { CappaApp } from "../../mod.ts";

const app = new CappaApp();

console.log("Port:", app.port);

app.registerEndpoint("/", async () => new Response("Hello world!"));

app.serve();

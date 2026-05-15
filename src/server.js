import http from "node:http";
import { handleRequest } from "./app.js";

const port = Number(process.env.PORT || 5173);

const server = http.createServer((req, res) => {
  handleRequest(req, res, { serveStatic: true });
});

server.listen(port, () => {
  console.log(`ShipReady audit MVP running at http://localhost:${port}`);
});

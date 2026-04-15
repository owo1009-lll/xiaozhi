import http from "node:http";
import { app } from "../server.js";

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${address.port}`,
      });
    });
  });
}

const { server, baseUrl } = await startServer();

try {
  const response = await fetch(`${baseUrl}/api/bkt/test/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      durationMinutes: 120,
      questionCount: 200,
    }),
  });
  const json = await response.json();
  console.log(JSON.stringify(json, null, 2));
} finally {
  await new Promise((resolve) => server.close(resolve));
}

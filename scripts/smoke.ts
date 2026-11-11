// End-to-end smoke test: starts the MCP server over stdio like Claude Desktop would and calls every tool.
// Requires the broker + simulator: `docker compose up -d`, then `npm run smoke`.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const client = new Client({ name: "smoke-test", version: "0.0.0" });
await client.connect(
  new StdioClientTransport({
    command: "npx",
    args: ["tsx", "src/index.ts"],
    env: { ...process.env, MQTT_URL: process.env.MQTT_URL ?? "mqtt://localhost:1883" } as Record<string, string>,
  }),
);

const call = async (name: string, args: Record<string, unknown>) => {
  const res = await client.callTool({ name, arguments: args });
  const body = (res.content as { text: string }[])[0].text;
  console.log(`\n=== ${name} ${JSON.stringify(args)}${res.isError ? " (ERROR)" : ""}\n${body.slice(0, 1200)}`);
  return { body, isError: !!res.isError };
};

const { tools } = await client.listTools();
console.log("tools:", tools.map((t) => t.name).join(", "));

// Give the background discovery subscription a moment to receive retained + live messages.
await new Promise((r) => setTimeout(r, 6000));

const listed = await call("list_topics", { filter: "home/#" });
const watched = await call("subscribe", { filter: "home/+/temperature", durationSeconds: 6, maxMessages: 4 });
await call("publish", { topic: "home/kitchen/light/set", payload: JSON.stringify({ state: "on", brightness: 40 }) });
await new Promise((r) => setTimeout(r, 1000));
const light = await call("list_topics", { filter: "home/kitchen/light/state" });
const bad = await call("publish", { topic: "home/+/light/set", payload: "{}" });

const checks = {
  "list_topics finds simulator topics": listed.body.includes("home/kitchen/temperature"),
  "subscribe collects live messages": /"count": [1-9]/.test(watched.body),
  "publish changes the kitchen light": light.body.includes('\\"brightness\\":40') && light.body.includes('\\"state\\":\\"on\\"'),
  "publish rejects wildcard topics": bad.isError,
};
console.log("\n", checks);
await client.close();
process.exit(Object.values(checks).every(Boolean) ? 0 : 1);

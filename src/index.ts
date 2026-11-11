#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Broker, log } from "./broker.js";
import { registerTools } from "./tools.js";

const broker = new Broker({
  url: process.env.MQTT_URL ?? "mqtt://localhost:1883",
  username: process.env.MQTT_USERNAME || undefined,
  password: process.env.MQTT_PASSWORD || undefined,
  clientId: process.env.MQTT_CLIENT_ID || undefined,
  discoveryFilters: (process.env.MQTT_DISCOVERY_FILTERS ?? "#")
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean),
});

const server = new McpServer({ name: "mqtt-mcp", version: "0.1.0" });
registerTools(server, broker);

await server.connect(new StdioServerTransport());
log("MCP server running on stdio");

const shutdown = async () => {
  await broker.close().catch(() => {});
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

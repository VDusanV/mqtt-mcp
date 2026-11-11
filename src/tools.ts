import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { Broker } from "./broker.js";
import { validateFilter, validatePublishTopic } from "./topic.js";

const text = (value: unknown) => ({
  content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }],
});

const error = (message: string) => ({ ...text(message), isError: true });

export function registerTools(server: McpServer, broker: Broker): void {
  server.registerTool(
    "list_topics",
    {
      title: "List topics",
      description:
        "List MQTT topics the server has seen on the broker, with the last payload, when it was last seen " +
        "and how many messages arrived. Use this first to discover which devices exist. " +
        "Supports MQTT wildcards, e.g. 'home/+/temperature' or 'home/kitchen/#'.",
      inputSchema: {
        filter: z.string().default("#").describe("MQTT topic filter, wildcards + and # allowed"),
        limit: z.number().int().min(1).max(500).default(100).describe("Maximum number of topics to return"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ filter, limit }) => {
      const invalid = validateFilter(filter);
      if (invalid) return error(invalid);

      const topics = broker.tracker.list(filter, limit);
      if (topics.length === 0) {
        return text(
          `No topics seen yet matching '${filter}'. Devices may not have published since the server started; ` +
            "try the 'subscribe' tool to listen for a few seconds.",
        );
      }
      return text({
        broker: broker.url,
        totalTracked: broker.tracker.size,
        returned: topics.length,
        topics: topics.map((t) => ({ ...t, lastSeen: t.lastSeen.toISOString() })),
      });
    },
  );

  server.registerTool(
    "subscribe",
    {
      title: "Subscribe and collect messages",
      description:
        "Subscribe to an MQTT topic filter and collect incoming messages for a few seconds, then return them. " +
        "Good for watching live device traffic, e.g. 'what is the living room sensor sending right now?'.",
      inputSchema: {
        filter: z.string().describe("MQTT topic filter, wildcards + and # allowed"),
        durationSeconds: z.number().min(1).max(60).default(5).describe("How long to listen, in seconds"),
        maxMessages: z.number().int().min(1).max(500).default(50).describe("Stop early after this many messages"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ filter, durationSeconds, maxMessages }) => {
      const invalid = validateFilter(filter);
      if (invalid) return error(invalid);

      try {
        const messages = await broker.collect(filter, durationSeconds * 1000, maxMessages);
        return text({ filter, listenedForSeconds: durationSeconds, count: messages.length, messages });
      } catch (e) {
        return error(`Subscribe failed: ${(e as Error).message}`);
      }
    },
  );

  server.registerTool(
    "publish",
    {
      title: "Publish a message",
      description:
        "Publish a message to an MQTT topic, e.g. to send a command to a device " +
        "(topic 'home/kitchen/light/set', payload '{\"state\":\"off\"}'). This can change real devices.",
      inputSchema: {
        topic: z.string().describe("Exact topic to publish to (no wildcards)"),
        payload: z.string().describe("Message payload, usually JSON or plain text"),
        qos: z.union([z.literal(0), z.literal(1), z.literal(2)]).default(0).describe("MQTT QoS level"),
        retain: z.boolean().default(false).describe("Ask the broker to retain the message for new subscribers"),
      },
      annotations: { destructiveHint: true, readOnlyHint: false },
    },
    async ({ topic, payload, qos, retain }) => {
      const invalid = validatePublishTopic(topic);
      if (invalid) return error(invalid);

      try {
        await broker.publish(topic, payload, { qos, retain });
        return text(`Published ${payload.length} bytes to '${topic}' (qos ${qos}${retain ? ", retained" : ""}).`);
      } catch (e) {
        return error(`Publish failed: ${(e as Error).message}`);
      }
    },
  );
}

import mqtt, { type IClientOptions, type MqttClient } from "mqtt";
import { TopicTracker, payloadToString, truncate } from "./topic-tracker.js";
import { topicMatches } from "./topic.js";

export interface BrokerConfig {
  url: string;
  username?: string;
  password?: string;
  clientId?: string;
  /**
   * Filters the server subscribes to in the background to discover topics, e.g. ["#"] or ["home/#", "factory/#"].
   * Empty array disables discovery.
   */
  discoveryFilters: string[];
}

export interface CollectedMessage {
  topic: string;
  payload: string;
  retained: boolean;
  receivedAt: string;
}

type Listener = (topic: string, payload: Buffer, retained: boolean) => void;

/** Thin wrapper around mqtt.js with the few operations the MCP tools need. */
export class Broker {
  readonly tracker = new TopicTracker();
  private client: MqttClient;
  private listeners = new Set<Listener>();
  /** Discovery filters the broker actually accepted (brokers often deny '#' by default). */
  private activeDiscovery = new Set<string>();

  constructor(private readonly config: BrokerConfig) {
    const options: IClientOptions = {
      clientId: config.clientId ?? `mqtt-mcp-${Math.random().toString(16).slice(2, 10)}`,
      username: config.username,
      password: config.password,
      reconnectPeriod: 2_000,
      connectTimeout: 10_000,
    };

    this.client = mqtt.connect(config.url, options);

    this.client.on("connect", () => {
      log(`connected to ${config.url}`);
      this.activeDiscovery.clear();
      for (const filter of config.discoveryFilters) {
        this.client.subscribe(filter, { qos: 0 }, (err, granted) => {
          // A rejected subscription comes back either as an error or as qos 128 in the grant.
          if (err || granted?.some((g) => g.qos === 128)) {
            log(
              `discovery subscription to '${filter}' was rejected by the broker` +
                (err ? ` (${err.message})` : "") +
                ". list_topics will only show topics seen via 'subscribe'. " +
                "Set MQTT_DISCOVERY_FILTERS to filters your broker allows, e.g. 'home/#'.",
            );
            return;
          }
          this.activeDiscovery.add(filter);
          log(`discovering topics on '${filter}'`);
        });
      }
    });
    this.client.on("reconnect", () => log("reconnecting..."));
    this.client.on("error", (err) => log(`error: ${err.message}`));

    this.client.on("message", (topic, payload, packet) => {
      this.tracker.record(topic, payload, packet.retain);
      for (const l of this.listeners) l(topic, payload, packet.retain);
    });
  }

  get connected(): boolean {
    return this.client.connected;
  }

  get url(): string {
    return this.config.url;
  }

  async waitForConnection(timeoutMs = 5_000): Promise<void> {
    if (this.client.connected) return;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Could not connect to MQTT broker at ${this.config.url} within ${timeoutMs}ms`));
      }, timeoutMs);
      const onConnect = () => {
        cleanup();
        resolve();
      };
      const cleanup = () => {
        clearTimeout(timer);
        this.client.off("connect", onConnect);
      };
      this.client.on("connect", onConnect);
    });
  }

  async publish(topic: string, payload: string, opts: { qos: 0 | 1 | 2; retain: boolean }): Promise<void> {
    await this.waitForConnection();
    await this.client.publishAsync(topic, payload, opts);
  }

  /**
   * Subscribes to `filter`, collects messages for `durationMs` (or until `maxMessages` arrive),
   * then unsubscribes unless the discovery subscription already covers it.
   */
  async collect(
    filter: string,
    durationMs: number,
    maxMessages: number,
    maxPayloadChars = 2_000,
  ): Promise<CollectedMessage[]> {
    await this.waitForConnection();

    const messages: CollectedMessage[] = [];
    let finish: () => void = () => {};
    const done = new Promise<void>((resolve) => (finish = resolve));

    const listener: Listener = (topic, payload, retained) => {
      if (!topicMatches(filter, topic) || messages.length >= maxMessages) return;
      messages.push({
        topic,
        payload: truncate(payloadToString(payload), maxPayloadChars),
        retained,
        receivedAt: new Date().toISOString(),
      });
      if (messages.length >= maxMessages) finish();
    };

    this.listeners.add(listener);
    const coveredByDiscovery = [...this.activeDiscovery].some((d) => isCoveredBy(filter, d));

    try {
      if (!coveredByDiscovery) await this.client.subscribeAsync(filter, { qos: 0 });
      await Promise.race([done, sleep(durationMs)]);
    } finally {
      this.listeners.delete(listener);
      if (!coveredByDiscovery) await this.client.unsubscribeAsync(filter).catch(() => {});
    }

    return messages;
  }

  async close(): Promise<void> {
    await this.client.endAsync();
  }
}

/** True when everything matching `filter` is also matched by `broader` (simple, conservative check). */
function isCoveredBy(filter: string, broader: string): boolean {
  if (broader === "#") return true;
  if (broader.endsWith("/#")) {
    const prefix = broader.slice(0, -2);
    return filter === prefix || filter.startsWith(`${prefix}/`);
  }
  return filter === broader;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// stdout is reserved for the MCP protocol, so all logging goes to stderr.
export function log(msg: string): void {
  console.error(`[mqtt-mcp] ${msg}`);
}

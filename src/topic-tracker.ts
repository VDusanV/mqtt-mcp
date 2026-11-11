import { topicMatches } from "./topic.js";

export interface TopicInfo {
  topic: string;
  lastPayload: string;
  lastSeen: Date;
  messageCount: number;
  retained: boolean;
}

/**
 * Keeps an in-memory view of every topic seen on the broker:
 * the last payload, when it was last seen and how many messages arrived.
 * This is what lets an agent ask "what's out there?" without subscribing first.
 */
export class TopicTracker {
  private topics = new Map<string, TopicInfo>();

  constructor(
    private readonly maxTopics = 10_000,
    private readonly maxPayloadChars = 2_000,
  ) {}

  record(topic: string, payload: Buffer | string, retained = false, now = new Date()): void {
    const text = truncate(payloadToString(payload), this.maxPayloadChars);
    const existing = this.topics.get(topic);

    if (existing) {
      existing.lastPayload = text;
      existing.lastSeen = now;
      existing.messageCount += 1;
      existing.retained = retained;
      return;
    }

    if (this.topics.size >= this.maxTopics) this.evictOldest();
    this.topics.set(topic, { topic, lastPayload: text, lastSeen: now, messageCount: 1, retained });
  }

  get(topic: string): TopicInfo | undefined {
    return this.topics.get(topic);
  }

  list(filter = "#", limit = 100): TopicInfo[] {
    return [...this.topics.values()]
      .filter((t) => topicMatches(filter, t.topic))
      .sort((a, b) => a.topic.localeCompare(b.topic))
      .slice(0, limit);
  }

  /** Topics matching the filter that haven't sent anything for at least `olderThanMs`. */
  stale(filter: string, olderThanMs: number, now = new Date()): TopicInfo[] {
    return this.list(filter, Number.MAX_SAFE_INTEGER).filter(
      (t) => now.getTime() - t.lastSeen.getTime() >= olderThanMs,
    );
  }

  get size(): number {
    return this.topics.size;
  }

  private evictOldest(): void {
    let oldest: TopicInfo | undefined;
    for (const t of this.topics.values()) {
      if (!oldest || t.lastSeen < oldest.lastSeen) oldest = t;
    }
    if (oldest) this.topics.delete(oldest.topic);
  }
}

export function payloadToString(payload: Buffer | string): string {
  if (typeof payload === "string") return payload;
  const text = payload.toString("utf8");
  // If it doesn't look like text, show it as base64 so the agent still gets something useful.
  // eslint-disable-next-line no-control-regex
  return /[\x00-\x08\x0E-\x1F]/.test(text) ? `base64:${payload.toString("base64")}` : text;
}

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}… (${text.length - max} more chars)` : text;
}

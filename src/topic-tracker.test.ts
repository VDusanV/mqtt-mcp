import { describe, expect, it } from "vitest";
import { TopicTracker, payloadToString } from "./topic-tracker.js";

describe("TopicTracker", () => {
  it("records topics and counts messages", () => {
    const t = new TopicTracker();
    t.record("home/kitchen/temp", "21.5");
    t.record("home/kitchen/temp", "21.7");
    t.record("home/bedroom/temp", "19.0");

    expect(t.size).toBe(2);
    expect(t.get("home/kitchen/temp")).toMatchObject({ lastPayload: "21.7", messageCount: 2 });
  });

  it("filters with wildcards and sorts by topic", () => {
    const t = new TopicTracker();
    t.record("home/kitchen/temp", "1");
    t.record("home/bedroom/temp", "2");
    t.record("home/kitchen/light", "on");

    expect(t.list("home/+/temp").map((x) => x.topic)).toEqual(["home/bedroom/temp", "home/kitchen/temp"]);
  });

  it("finds stale topics", () => {
    const t = new TopicTracker();
    const now = new Date("2026-01-01T12:00:00Z");
    t.record("dev/a", "x", false, new Date("2026-01-01T11:00:00Z"));
    t.record("dev/b", "x", false, new Date("2026-01-01T11:59:30Z"));

    expect(t.stale("dev/#", 5 * 60_000, now).map((x) => x.topic)).toEqual(["dev/a"]);
  });

  it("evicts the oldest topic when full", () => {
    const t = new TopicTracker(2);
    t.record("a", "1", false, new Date(1));
    t.record("b", "1", false, new Date(2));
    t.record("c", "1", false, new Date(3));

    expect(t.list().map((x) => x.topic)).toEqual(["b", "c"]);
  });

  it("truncates large payloads", () => {
    const t = new TopicTracker(10, 5);
    t.record("big", "abcdefghij");
    expect(t.get("big")?.lastPayload).toBe("abcde… (5 more chars)");
  });
});

describe("payloadToString", () => {
  it("returns text for utf8 payloads and base64 for binary", () => {
    expect(payloadToString(Buffer.from('{"on":true}'))).toBe('{"on":true}');
    expect(payloadToString(Buffer.from([0x00, 0x01, 0x02]))).toBe("base64:AAEC");
  });
});

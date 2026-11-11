import { describe, expect, it } from "vitest";
import { topicMatches, validateFilter, validatePublishTopic } from "./topic.js";

describe("topicMatches", () => {
  it.each([
    ["home/kitchen/temp", "home/kitchen/temp", true],
    ["home/+/temp", "home/kitchen/temp", true],
    ["home/+/temp", "home/kitchen/humidity", false],
    ["home/#", "home/kitchen/temp", true],
    ["home/#", "home", true],
    ["#", "anything/at/all", true],
    ["home/+", "home/kitchen/temp", false],
    ["home/kitchen", "home/kitchen/temp", false],
    ["+/+/+", "a/b/c", true],
    ["+/+/+", "a/b", false],
  ])("%s vs %s -> %s", (filter, topic, expected) => {
    expect(topicMatches(filter, topic)).toBe(expected);
  });
});

describe("validateFilter", () => {
  it("accepts valid filters", () => {
    expect(validateFilter("home/+/temp")).toBeNull();
    expect(validateFilter("home/#")).toBeNull();
    expect(validateFilter("#")).toBeNull();
  });

  it("rejects misplaced wildcards", () => {
    expect(validateFilter("home/#/temp")).not.toBeNull();
    expect(validateFilter("home/kit#")).not.toBeNull();
    expect(validateFilter("home/kit+chen")).not.toBeNull();
    expect(validateFilter("")).not.toBeNull();
  });
});

describe("validatePublishTopic", () => {
  it("rejects wildcards", () => {
    expect(validatePublishTopic("home/+/set")).not.toBeNull();
    expect(validatePublishTopic("home/#")).not.toBeNull();
    expect(validatePublishTopic("home/kitchen/light/set")).toBeNull();
  });
});

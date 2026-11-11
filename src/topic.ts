/**
 * Checks whether an MQTT topic matches a subscription filter.
 * Supports the standard wildcards: `+` (single level) and `#` (multi level, last position only).
 */
export function topicMatches(filter: string, topic: string): boolean {
  const f = filter.split("/");
  const t = topic.split("/");

  for (let i = 0; i < f.length; i++) {
    const part = f[i];
    if (part === "#") {
      // `#` must be the last level and also matches the parent level ("a/#" matches "a").
      return i === f.length - 1;
    }
    if (i >= t.length) return false;
    if (part === "+") continue;
    if (part !== t[i]) return false;
  }

  return f.length === t.length;
}

/** Validates a subscription filter according to the MQTT spec. Returns an error message or null. */
export function validateFilter(filter: string): string | null {
  if (filter.length === 0) return "Topic filter cannot be empty";
  const parts = filter.split("/");
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p.includes("#") && (p !== "#" || i !== parts.length - 1)) {
      return "'#' must occupy a whole level and be the last character of the filter";
    }
    if (p.includes("+") && p !== "+") {
      return "'+' must occupy a whole level";
    }
  }
  return null;
}

/** Validates a topic used for publishing (no wildcards allowed). Returns an error message or null. */
export function validatePublishTopic(topic: string): string | null {
  if (topic.length === 0) return "Topic cannot be empty";
  if (topic.includes("+") || topic.includes("#")) return "Wildcards are not allowed when publishing";
  return null;
}

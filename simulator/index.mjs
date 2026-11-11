// Fake smart home: publishes sensor readings and reacts to light commands.
// Topics:
//   home/<room>/temperature        {"value": 21.4, "unit": "C"}   every few seconds
//   home/<room>/humidity           {"value": 45, "unit": "%"}
//   home/<room>/light/state        {"state": "on", "brightness": 80}   (retained)
//   home/<room>/light/set          <- send {"state": "off"} or {"brightness": 30}
//   home/hallway/door/state        {"open": false}
import mqtt from "mqtt";

const url = process.env.MQTT_URL ?? "mqtt://localhost:1883";
const intervalMs = Number(process.env.PUBLISH_INTERVAL_MS ?? 5000);
// After this many ms the bedroom sensor stops reporting, so agents have an "offline device" to find. 0 disables.
const flakyAfterMs = Number(process.env.FLAKY_AFTER_MS ?? 120000);

const rooms = ["living-room", "kitchen", "bedroom", "office"];
const state = Object.fromEntries(
  rooms.map((r) => [r, { temp: 20 + Math.random() * 3, humidity: 40 + Math.random() * 10, light: { state: "off", brightness: 100 } }]),
);
let doorOpen = false;
const startedAt = Date.now();

const client = mqtt.connect(url, { clientId: `home-simulator-${Math.random().toString(16).slice(2, 8)}`, reconnectPeriod: 2000 });

const pub = (topic, payload, retain = false) => client.publish(topic, JSON.stringify(payload), { retain, qos: 0 });

client.on("connect", () => {
  console.log(`[simulator] connected to ${url}, simulating ${rooms.length} rooms`);
  client.subscribe("home/+/light/set");
  for (const r of rooms) pub(`home/${r}/light/state`, state[r].light, true);
  pub("home/hallway/door/state", { open: doorOpen }, true);
});

client.on("message", (topic, payload) => {
  const room = topic.split("/")[1];
  if (!state[room]) return;
  try {
    const cmd = JSON.parse(payload.toString());
    const light = state[room].light;
    if (cmd.state === "on" || cmd.state === "off") light.state = cmd.state;
    if (typeof cmd.brightness === "number") light.brightness = Math.max(0, Math.min(100, Math.round(cmd.brightness)));
    pub(`home/${room}/light/state`, light, true);
    console.log(`[simulator] ${room} light -> ${JSON.stringify(light)}`);
  } catch {
    console.log(`[simulator] ignored invalid command on ${topic}: ${payload}`);
  }
});

client.on("error", (err) => console.error(`[simulator] ${err.message}`));

setInterval(() => {
  if (!client.connected) return;
  const flaky = flakyAfterMs > 0 && Date.now() - startedAt > flakyAfterMs;

  for (const r of rooms) {
    if (flaky && r === "bedroom") continue;
    const s = state[r];
    s.temp += (Math.random() - 0.5) * 0.4 + (s.light.state === "on" ? 0.02 : 0);
    s.humidity = Math.max(20, Math.min(80, s.humidity + (Math.random() - 0.5)));
    pub(`home/${r}/temperature`, { value: Number(s.temp.toFixed(1)), unit: "C" });
    pub(`home/${r}/humidity`, { value: Math.round(s.humidity), unit: "%" });
  }

  if (Math.random() < 0.1) {
    doorOpen = !doorOpen;
    pub("home/hallway/door/state", { open: doorOpen }, true);
  }
}, intervalMs);

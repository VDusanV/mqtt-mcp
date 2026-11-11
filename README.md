# mqtt-mcp

**Let AI agents talk to your IoT devices.** `mqtt-mcp` is a [Model Context Protocol](https://modelcontextprotocol.io) server that connects Claude, Cursor or any MCP-capable agent to an MQTT broker, so you can explore, watch and control devices in plain English.

> "Which rooms are warmer than 22°C right now?"
> "Show me what the hallway door sensor has been sending."
> "Turn the kitchen light on at 40% brightness."

```
┌──────────────┐  MCP (stdio)  ┌────────────┐   MQTT    ┌──────────────┐        ┌──────────────┐
│ Claude / IDE │ ────────────▶ │  mqtt-mcp  │ ────────▶ │ MQTT broker  │ ◀────▶ │   devices    │
│   (agent)    │ ◀──────────── │            │ ◀──────── │ (EMQX, etc.) │        │ sensors, ... │
└──────────────┘  tool calls   └────────────┘ discovery └──────────────┘        └──────────────┘
                                topic tracker (last payload, last seen, count)
```

## Tools

| Tool | What it does |
| --- | --- |
| `list_topics` | Lists every topic seen on the broker with its last payload, last-seen time and message count. Supports `+` / `#` wildcards. |
| `subscribe` | Listens on a topic filter for N seconds (or until N messages) and returns what arrived. |
| `publish` | Publishes a message, e.g. a command to a device. Rejects wildcard topics. |

In the background the server subscribes to a discovery filter (`#` by default) and keeps an in-memory view of each topic. That's why `list_topics` can answer instantly without the agent having to subscribe first.

## Quick start (with a simulated smart home)

You need Node.js 18+ and Docker.

```bash
git clone https://github.com/VDusanV/mqtt-mcp.git
cd mqtt-mcp
npm install
docker compose up -d   # EMQX broker + fake smart home (4 rooms, lights, sensors, door)
npm run build
```

The simulator publishes temperature and humidity for `living-room`, `kitchen`, `bedroom` and `office`, light state you can change via `home/<room>/light/set`, and a hallway door sensor. After 2 minutes the bedroom sensor goes silent on purpose, so there's always something "broken" to investigate.

The EMQX dashboard is at http://localhost:18083 (login `admin` / `public`).

### Use it from Claude Desktop

Add this to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "mqtt": {
      "command": "node",
      "args": ["/absolute/path/to/mqtt-mcp/dist/index.js"],
      "env": { "MQTT_URL": "mqtt://localhost:1883" }
    }
  }
}
```

### Use it from Claude Code

```bash
claude mcp add mqtt -e MQTT_URL=mqtt://localhost:1883 -- node /absolute/path/to/mqtt-mcp/dist/index.js
```

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `MQTT_URL` | `mqtt://localhost:1883` | Broker URL (`mqtt://`, `mqtts://`, `ws://`, `wss://`) |
| `MQTT_USERNAME` / `MQTT_PASSWORD` | – | Broker credentials |
| `MQTT_CLIENT_ID` | random | Client ID used by the server |
| `MQTT_DISCOVERY_FILTERS` | `#` | Comma-separated filters to watch for topic discovery, e.g. `home/#,factory/#`. Empty disables discovery. |

Many brokers (EMQX included) deny subscribing to `#` by default. If that happens the server logs a warning and keeps working. Set `MQTT_DISCOVERY_FILTERS` to something your broker allows. The included `docker-compose.yml` mounts a dev-only ACL that allows `#`.

## Safety

`publish` can change real devices, so it's marked as a destructive tool and MCP clients will ask before running it. Payloads are truncated (2,000 chars) and topic counts are capped (10,000), so a noisy broker can't flood the agent's context.

## Development

```bash
npm test          # unit tests (topic matching, tracker)
npm run smoke     # end-to-end: starts the server over stdio and calls every tool (needs docker compose up)
npm run dev       # run the server from source
```

## Roadmap

- [ ] `find_offline_devices`: devices that stopped reporting
- [ ] `get_device_state`: last known state per device, persisted in Redis
- [ ] `simulate_devices`: spin up N virtual devices for load testing
- [ ] `broker_stats`: throughput and connection metrics via the EMQX API
- [ ] Live Next.js dashboard for demos
- [ ] Publish to npm (`npx mqtt-mcp`)

## License

MIT

# TDV MCP Remote VPS Bridge

Status: ready-for-agent

## Problem Statement

`tdv-mcp` currently assumes the MCP process and TradingView Desktop are on the same machine: the chart-reader MCP uses stdio, the CDP connection defaults to loopback port 9333, and the current Windows launcher can start TradingView automatically when CDP is unavailable.

The desired operating model separates those responsibilities. ChatGPT should call a stable MCP endpoint hosted on a VPS, while TradingView Desktop remains on the user's PC. A reverse TCP bridge makes the PC's local TradingView CDP endpoint available only as VPS loopback, so the MCP process can keep using the existing CDP connection contract without exposing CDP publicly.

TradingView application lifecycle must not be owned by MCP. The user will open TradingView manually. The MCP service must remain available when TradingView or the reverse bridge is temporarily offline, report the dependency as unavailable, and recover on later calls without requiring an MCP restart.

## Solution

Add a VPS-oriented Streamable HTTP transport for the existing ChatGPT chart-reader MCP surface, sharing the same tool registration and core implementation as the stdio server rather than duplicating tool logic.

Run that HTTP MCP service on the VPS behind HTTPS ingress. Keep the MCP process independent from TradingView startup. The PC establishes a reverse TCP bridge from its local `127.0.0.1:9333` CDP endpoint to a loopback-only `127.0.0.1:9333` endpoint on the VPS. The existing CDP connection layer continues to target the VPS loopback endpoint through its host/port configuration.

The ChatGPT/VPS tool catalog must not expose `tv_launch`, and no MCP startup path may automatically launch, kill, or restart TradingView. Existing standalone launch helpers may remain available only as explicit manual utilities; they are not invoked by MCP or tunnel startup.

The HTTP service starts even when CDP is unavailable. Tool calls that require TradingView return a structured dependency-unavailable error, while later calls reconnect automatically after TradingView and the bridge become available.

## User Stories

1. As the user, I want to open TradingView Desktop myself, so that MCP never controls the application's lifecycle.
2. As the user, I want the remote MCP service to work without a `tv_launch` tool, so that ChatGPT cannot start, kill, or relaunch TradingView.
3. As the user, I want ChatGPT to connect to one stable HTTPS MCP endpoint on the VPS, so that the MCP endpoint is independent of my PC's inbound network reachability.
4. As the user, I want TradingView to remain on my PC, so that my existing desktop session, layouts, indicators, and credentials remain local.
5. As the user, I want the PC to initiate the reverse bridge, so that no inbound connection to the PC is required.
6. As the user, I want the bridged CDP port to bind only to VPS loopback, so that TradingView's debugging interface is never directly exposed to the Internet.
7. As the user, I want the VPS MCP process to keep using the existing CDP host/port abstraction, so that chart/data tool behavior does not need a second remote-CDP implementation.
8. As the user, I want the MCP service to start even when TradingView is closed, so that the public service lifecycle is not coupled to the desktop application lifecycle.
9. As the user, I want `tv_health_check` to clearly report when TradingView or the bridge is unavailable, so that I can distinguish dependency failure from MCP server failure.
10. As the user, I want a later tool call to recover after the bridge or TradingView comes back, so that I do not need to restart the VPS MCP process.
11. As the user, I want existing chart-reader tools and schemas preserved except for removal of `tv_launch`, so that current ChatGPT workflows do not need unnecessary prompt or tool changes.
12. As the user, I want chart snapshot/restore behavior preserved across temporary navigation, so that analysis does not leave my chart in an unexpected state.
13. As the user, I want snapshot state isolated per MCP session, so that two ChatGPT sessions cannot restore each other's saved chart state.
14. As the user, I want screenshots to continue returning inline image content through MCP, so that remote analysis retains visual confirmation.
15. As the user, I want failed or stale CDP connections to be discarded and re-established through the bridge, so that transient network loss is recoverable.
16. As the user, I want the public HTTPS ingress authenticated, so that arbitrary Internet clients cannot call my TradingView MCP tools.
17. As the user, I want authentication failures rejected before MCP tool execution, so that unauthorized requests cannot reach the CDP layer.
18. As the user, I want secrets supplied through deployment configuration rather than repository files, so that credentials are not committed or logged.
19. As the user, I want the existing stdio transport to remain usable for local development and current tooling, so that adding VPS deployment does not force every workflow onto HTTP.
20. As the user, I want the existing local OpenAI Secure MCP Tunnel setup preserved as a separate compatibility path unless explicitly retired, so that this feature does not silently remove a working local deployment option.
21. As a ChatGPT user, I want every chart-reader tool to advertise an MCP `outputSchema` and return matching `structuredContent`, so that the client can understand structured results without changing existing input schemas or text content.

## Implementation Decisions

- Keep the project on its current Node.js MCP SDK and CDP stack; this feature adds a transport/deployment layer rather than rewriting chart logic.
- Extract or reuse a shared chart-reader server factory so stdio and Streamable HTTP register the same ChatGPT-oriented tools from one source of truth.
- Add a Streamable HTTP MCP entrypoint for VPS deployment. The stdio entrypoint remains supported for local development and the existing Secure MCP Tunnel path.
- The VPS HTTP listener should bind to loopback by default and sit behind the VPS HTTPS ingress/reverse proxy. TLS termination and production access control belong at that ingress boundary.
- Production ingress must require authentication. There is no unauthenticated public deployment mode in the primary VPS path.
- The reverse bridge terminates on VPS `127.0.0.1:9333` and forwards to PC `127.0.0.1:9333`. Do not bind the bridged CDP listener to a public VPS interface.
- Continue using the existing configurable CDP host/port connection layer. VPS deployment config points it at the loopback bridge; no tool should contain PC-specific addressing.
- MCP startup must not require CDP readiness. TradingView and the reverse bridge are runtime dependencies that may appear after the server has already started.
- Remove `tv_launch` from the ChatGPT/VPS chart-reader tool catalog and from its server instructions/hints. `tools/list` must not advertise it.
- Remove automatic TradingView launch behavior from MCP/tunnel startup. If CDP is unavailable, startup may warn but must not start, kill, or restart TradingView.
- Existing manual launch scripts/shortcuts may remain as user-invoked helpers for starting TradingView with CDP enabled; they must not be called automatically by the MCP service.
- Do not require deletion of the general local launch implementation or CLI unless it is necessary to prevent automatic invocation in the ChatGPT/VPS path; the explicit requirement is that remote MCP does not own application lifecycle.
- Change health/error guidance that currently tells callers to use `tv_launch`; instead tell the caller that TradingView/CDP is unavailable and must be opened or restored manually.
- Preserve the current reconnect behavior of the CDP connection cache: failed liveness checks clear the stale client, and later calls attempt a fresh connection through the bridge.
- Scope mutable chart-reader session state, especially saved chart snapshots, to the MCP session rather than a process-global singleton when serving multiple HTTP sessions.
- Do not duplicate core chart, data, pane, screenshot, or health implementations in the HTTP adapter. Transport-specific code should only handle MCP session lifecycle, HTTP request handling, authentication integration, and shutdown.
- Preserve existing input schemas and JSON result fields for the chart-reader surface except where `tv_launch` disappears and health text changes to reflect manual startup. Add MCP `outputSchema` metadata and matching `structuredContent` as an additive compatibility layer while retaining the existing JSON text content.
- Keep secrets out of committed configuration and logs. Deployment examples must use environment-variable placeholders rather than live credentials.
- Reverse-bridge process supervision is independent from MCP process supervision. A bridge restart must not require restarting the MCP server.
- The remote service must shut down cleanly, close active MCP transports, and release HTTP resources without intentionally terminating TradingView on the PC.

## Testing Decisions

The approved primary seam is a black-box MCP-over-HTTP integration test against the real VPS-oriented server process with a controlled CDP bridge/fixture behind it. This is the highest practical boundary because it verifies the protocol surface ChatGPT will actually call while still allowing deterministic dependency failure and recovery tests.

The black-box suite must prove:

- MCP `initialize` succeeds through the HTTP transport.
- `tools/list` returns the intended chart-reader catalog and does not contain `tv_launch`.
- Every advertised chart-reader tool has an object-root `outputSchema`, and representative calls return `structuredContent` matching the existing serialized JSON text result.
- Representative `tools/call` requests traverse HTTP, the shared MCP registration, and the CDP connection layer rather than bypassing transport internals.
- An unavailable CDP bridge returns a structured tool error and does not crash or terminate the HTTP MCP service.
- After a failed call, making the CDP fixture/bridge available allows a later call to succeed without restarting the MCP process.
- Authentication failure at the production ingress/adapter boundary is rejected before tool execution.
- Two MCP sessions cannot overwrite or restore each other's chart snapshot state.
- Concurrent read-oriented requests do not corrupt the cached CDP connection or MCP session lifecycle.
- Graceful shutdown closes active transports and the HTTP listener without attempting to terminate TradingView.

Keep the existing live TradingView E2E suite as secondary prior art for validating the CDP/tool implementation itself. It already exercises real TradingView behavior on port 9333 and should remain separate from the new transport test so normal HTTP contract tests do not require a live desktop app.

Keep existing launch unit tests only for any launch code that remains as an explicit local/manual utility. Add regression coverage around startup/registration to prove the ChatGPT/VPS path never invokes that launch code.

## Out of Scope

- Automatically starting, stopping, killing, or restarting TradingView Desktop from ChatGPT, MCP startup, or the VPS service.
- Moving TradingView Desktop itself to the VPS.
- Exposing TradingView CDP directly on a public PC or VPS network interface.
- Building a general-purpose VPN, remote desktop system, or tunnel orchestrator inside `tdv-mcp`.
- Rewriting the existing chart/data extraction implementation or replacing Chrome DevTools Protocol.
- Expanding the ChatGPT chart-reader surface to the full local tool catalog as part of this transport change.
- Adding automated trading or trade-execution behavior.
- Removing the existing stdio transport or the current OpenAI Secure MCP Tunnel compatibility path solely because the VPS HTTP path is added.
- Persisting or redistributing TradingView market data beyond the project's existing behavior.
- Managing PC power state, Windows login, or automatic application startup outside the MCP process.

## Further Notes

The current repository already has the most important lower-level seam needed for this design: CDP host and port are environment-configurable and default to loopback port 9333. The remote design should reuse that instead of adding a second connection API.

The current ChatGPT chart-reader entrypoint is stdio-based and keeps its saved chart snapshot in process-global state. The HTTP implementation should factor registration into a reusable server/session factory so the new transport does not create divergent tool definitions and so snapshot state can be session-scoped.

The current Windows MCP startup path contains automatic TradingView startup logic, and current health error guidance points users toward `tv_launch`. Both must be audited so the new manual-start requirement is consistent across the ChatGPT/VPS path.

The repository already contains a local OpenAI Secure MCP Tunnel profile that launches the stdio chart-reader server. Preserve it as a compatibility path unless a later task explicitly retires it; this spec's primary deployment target is the VPS HTTP endpoint plus reverse CDP bridge.

Preserve the repository's current uncommitted port-9333 work while implementing this feature. Do not reset or overwrite unrelated dirty files.
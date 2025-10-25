import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { SpanStatusCode, trace } from "@opentelemetry/api";
import { logger } from "../helpers/logs.js";
import { Permission } from "../auth/authorization.js";

const log = logger("travel-registry");

export interface RemoteServerConfig {
  id: string;
  title: string;
  command: string;
  args?: string[];
  cwd: string;
  toolPrefix?: string;
  env?: Record<string, string>;
  envKeys?: string[];
  permissions?: Permission[];
}

interface ToolRegistration {
  tool: Tool;
  serverId: string;
  remoteName: string;
  permissions: Permission[];
}

interface ProcessRegistration {
  config: RemoteServerConfig;
  proc: ChildProcessWithoutNullStreams;
  transport: StdioClientTransport;
  client: Client;
}

export class TravelRegistry {
  private readonly registry = new Map<string, ToolRegistration>();
  private readonly processes = new Map<string, ProcessRegistration>();

  constructor(private readonly configs: RemoteServerConfig[]) {}

  async start() {
    const tracer = trace.getTracer("travel-registry");
    const span = tracer.startSpan("registry.start");

    try {
      for (const cfg of this.configs) {
        await this.launchServer(cfg);
      }

      span.setAttribute("registry.tool.count", this.registry.size);
      span.setStatus({
        code: SpanStatusCode.OK,
        message: "Travel servers started",
      });
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      span.end();
    }
  }

  listTools(): Tool[] {
    return [...this.registry.values()].map((entry) => entry.tool);
  }

  getToolPermissions(name: string): Permission[] {
    return this.registry.get(name)?.permissions ?? [Permission.CALL_TOOLS];
  }

  async callTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<any> {
    const tracer = trace.getTracer("travel-registry");
    const span = tracer.startSpan("registry.callTool", {
      attributes: {
        "tool.name": name,
      },
    });

    try {
      const registration = this.registry.get(name);
      if (!registration) {
        const message = `Unknown tool: ${name}`;
        span.setStatus({ code: SpanStatusCode.ERROR, message });
        throw new Error(message);
      }

      const processRegistration = this.processes.get(registration.serverId);
      if (!processRegistration) {
        const message = `Server offline for tool: ${name}`;
        span.setStatus({ code: SpanStatusCode.ERROR, message });
        throw new Error(message);
      }

      const { client, config } = processRegistration;

      span.setAttributes({
        "tool.server_id": registration.serverId,
        "tool.remote_name": registration.remoteName,
        "tool.config.title": config.title,
      });

      const result = await client.callTool({
        name: registration.remoteName,
        arguments: args,
      });

      span.setStatus({
        code: SpanStatusCode.OK,
        message: "Tool executed successfully",
      });

      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      span.end();
    }
  }

  async shutdown() {
    const tracer = trace.getTracer("travel-registry");
    const span = tracer.startSpan("registry.shutdown");

    try {
      for (const { proc, transport, client } of this.processes.values()) {
        await transport.close().catch(() => undefined);
        await client.close().catch(() => undefined);
        proc.kill();
        await once(proc, "exit").catch(() => undefined);
      }

      this.processes.clear();
      this.registry.clear();

      span.setStatus({
        code: SpanStatusCode.OK,
        message: "Registry shutdown complete",
      });
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      span.end();
    }
  }

  private async launchServer(config: RemoteServerConfig) {
    const tracer = trace.getTracer("travel-registry");
    const span = tracer.startSpan("registry.launchServer", {
      attributes: {
        "server.id": config.id,
        "server.title": config.title,
        "server.cwd": config.cwd,
      },
    });

    let proc: ChildProcessWithoutNullStreams | null = null;
    let transport: StdioClientTransport | null = null;
    let client: Client | null = null;

    try {
      log.info(`Starting travel server "${config.title}" (${config.id})...`);

      const env: Record<string, string> = {
        ...process.env,
        PYTHONUNBUFFERED: "1",
        ...(config.env ?? {}),
      } as Record<string, string>;

      if (config.envKeys) {
        for (const key of config.envKeys) {
          if (process.env[key]) {
            env[key] = process.env[key] as string;
          }
        }
      }

      proc = spawn(config.command, config.args ?? [], {
        cwd: config.cwd,
        env,
        stdio: ["pipe", "pipe", "pipe"],
      });

      proc.stderr?.on("data", (data: Buffer) => {
        log.warn(
          `[${config.id}] stderr: ${data
            .toString("utf8")
            .trimEnd()}`
        );
      });

      proc.on("exit", (code, signal) => {
        log.error(
          `Travel server "${config.id}" exited (code=${code}, signal=${signal})`
        );
        this.processes.delete(config.id);
        for (const [toolName, entry] of this.registry.entries()) {
          if (entry.serverId === config.id) {
            this.registry.delete(toolName);
          }
        }
      });

      transport = new StdioClientTransport({
        reader: proc.stdout,
        writer: proc.stdin,
      });

      client = new Client({
        name: `travel-registry-${config.id}`,
        version: "1.0.0",
      });

      await client.connect(transport);

      const { tools } = await client.listTools();
      const permissions =
        config.permissions && config.permissions.length > 0
          ? config.permissions
          : [Permission.CALL_TOOLS];

      tools.forEach((tool) => {
        const exposedName = config.toolPrefix
          ? `${config.toolPrefix}_${tool.name}`
          : tool.name;

        const registration: ToolRegistration = {
          tool: { ...tool, name: exposedName },
          serverId: config.id,
          remoteName: tool.name,
          permissions,
        };

        this.registry.set(exposedName, registration);
      });

      this.processes.set(config.id, {
        config,
        proc,
        transport,
        client,
      });

      span.setAttribute("server.tools.count", tools.length);
      span.setStatus({
        code: SpanStatusCode.OK,
        message: "Server launched",
      });

      log.success(
        `Travel server "${config.title}" ready with ${tools.length} tools`
      );
    } catch (error) {
      if (transport) {
        await transport.close().catch(() => undefined);
      }
      if (client) {
        await client.close().catch(() => undefined);
      }
      if (proc) {
        proc.kill();
      }

      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      span.end();
    }
  }
}

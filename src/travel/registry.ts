import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type {
  Tool,
  Resource,
  Prompt,
  ReadResourceResult,
  GetPromptResult,
} from "@modelcontextprotocol/sdk/types.js";
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
  resourcePermissions?: Permission[];
  promptPermissions?: Permission[];
}

interface ToolRegistration {
  tool: Tool;
  serverId: string;
  remoteName: string;
  permissions: Permission[];
}

interface ResourceRegistration {
  resource: Resource;
  serverId: string;
  remoteUri: string;
  permissions: Permission[];
}

interface PromptRegistration {
  prompt: Prompt;
  serverId: string;
  remoteName: string;
  permissions: Permission[];
}

interface ProcessRegistration {
  config: RemoteServerConfig;
  transport: StdioClientTransport;
  client: Client;
}

export class TravelRegistry {
  private readonly registry = new Map<string, ToolRegistration>();
  private readonly resources = new Map<string, ResourceRegistration>();
  private readonly resourceSchemes = new Map<
    string,
    { serverId: string; permissions: Permission[] }
  >();
  private readonly prompts = new Map<string, PromptRegistration>();
  private readonly processes = new Map<string, ProcessRegistration>();

  constructor(private readonly configs: RemoteServerConfig[]) {}

  async start() {
    const tracer = trace.getTracer("travel-registry");
    const span = tracer.startSpan("registry.start");

    try {
      for (const cfg of this.configs) {
        await this.launchServer(cfg);
      }

      await this.listResources().catch((error) => {
        log.warn("Unable to prefetch travel resources:", error);
      });
      await this.listPrompts().catch((error) => {
        log.warn("Unable to prefetch travel prompts:", error);
      });

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

  async listResources(): Promise<Resource[]> {
    const tracer = trace.getTracer("travel-registry");
    const span = tracer.startSpan("registry.listResources");

    try {
      const aggregated: Resource[] = [];
      this.resources.clear();
      this.resourceSchemes.clear();

      for (const [serverId, registration] of this.processes.entries()) {
        const { client, config } = registration;
        try {
          const result = await client.listResources();
          const permissions =
            config.resourcePermissions && config.resourcePermissions.length > 0
              ? config.resourcePermissions
              : [Permission.READ_RESOURCES];

          result.resources.forEach((resource) => {
            const scheme = this.extractScheme(resource.uri);
            if (scheme) {
              this.resourceSchemes.set(scheme, { serverId, permissions });
            }

            const exposedResource: Resource = { ...resource };
            this.resources.set(exposedResource.uri, {
              resource: exposedResource,
              serverId,
              remoteUri: resource.uri,
              permissions,
            });
            aggregated.push(exposedResource);
          });
        } catch (error) {
          span.addEvent("registry.listResources.error", {
            "server.id": serverId,
            "error.message": error instanceof Error ? error.message : String(error),
          });
          log.warn(
            `Failed to list resources from server "${config.id}":`,
            error
          );
        }
      }

      span.setAttributes({
        "registry.resources.count": aggregated.length,
      });
      span.setStatus({ code: SpanStatusCode.OK });
      return aggregated;
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

  async readResource(uri: string): Promise<ReadResourceResult> {
    const tracer = trace.getTracer("travel-registry");
    const span = tracer.startSpan("registry.readResource", {
      attributes: { "resource.uri": uri },
    });

    try {
      let registration = this.resources.get(uri);
      if (!registration) {
        await this.listResources();
        registration = this.resources.get(uri);
      }

      let serverId = registration?.serverId;

      if (!serverId) {
        const scheme = this.extractScheme(uri);
        const schemeEntry = scheme
          ? this.resourceSchemes.get(scheme)
          : undefined;
        serverId = schemeEntry?.serverId;
      }

      if (!serverId) {
        const message = `Unknown resource: ${uri}`;
        span.setStatus({ code: SpanStatusCode.ERROR, message });
        throw new Error(message);
      }

      const processRegistration = this.processes.get(serverId);
      if (!processRegistration) {
        const message = `Server offline for resource: ${uri}`;
        span.setStatus({ code: SpanStatusCode.ERROR, message });
        throw new Error(message);
      }

      const result = await processRegistration.client.readResource({
        uri,
      });

      span.setStatus({
        code: SpanStatusCode.OK,
        message: "Resource read successfully",
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

  getResourcePermissions(uri: string): Permission[] {
    const direct = this.resources.get(uri)?.permissions;
    if (direct && direct.length > 0) {
      return direct;
    }

    const scheme = this.extractScheme(uri);
    if (scheme) {
      const schemePermissions = this.resourceSchemes.get(scheme)?.permissions;
      if (schemePermissions && schemePermissions.length > 0) {
        return schemePermissions;
      }
    }

    return [Permission.READ_RESOURCES];
  }

  async listPrompts(): Promise<Prompt[]> {
    const tracer = trace.getTracer("travel-registry");
    const span = tracer.startSpan("registry.listPrompts");

    try {
      const aggregated: Prompt[] = [];
      this.prompts.clear();

      for (const [serverId, registration] of this.processes.entries()) {
        const { client, config } = registration;
        try {
          const result = await client.listPrompts();
          const permissions =
            config.promptPermissions && config.promptPermissions.length > 0
              ? config.promptPermissions
              : [Permission.GET_PROMPTS];

          result.prompts.forEach((prompt) => {
            const exposedName = config.toolPrefix
              ? `${config.toolPrefix}_${prompt.name}`
              : prompt.name;

            const exposedPrompt: Prompt = {
              ...prompt,
              name: exposedName,
            };

            this.prompts.set(exposedName, {
              prompt: exposedPrompt,
              serverId,
              remoteName: prompt.name,
              permissions,
            });

            aggregated.push(exposedPrompt);
          });
        } catch (error) {
          span.addEvent("registry.listPrompts.error", {
            "server.id": serverId,
            "error.message": error instanceof Error ? error.message : String(error),
          });
          log.warn(
            `Failed to list prompts from server "${config.id}":`,
            error
          );
        }
      }

      span.setAttributes({
        "registry.prompts.count": aggregated.length,
      });
      span.setStatus({ code: SpanStatusCode.OK });
      return aggregated;
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

  async getPrompt(
    name: string,
    args?: Record<string, unknown>
  ): Promise<GetPromptResult> {
    const tracer = trace.getTracer("travel-registry");
    const span = tracer.startSpan("registry.getPrompt", {
      attributes: { "prompt.name": name },
    });

    try {
      let registration = this.prompts.get(name);
      if (!registration) {
        await this.listPrompts();
        registration = this.prompts.get(name);
      }

      if (!registration) {
        const message = `Unknown prompt: ${name}`;
        span.setStatus({ code: SpanStatusCode.ERROR, message });
        throw new Error(message);
      }

      const processRegistration = this.processes.get(registration.serverId);
      if (!processRegistration) {
        const message = `Server offline for prompt: ${name}`;
        span.setStatus({ code: SpanStatusCode.ERROR, message });
        throw new Error(message);
      }

      const normalizedArgs =
        args && Object.keys(args).length > 0
          ? (Object.fromEntries(
              Object.entries(args).map(([key, value]) => [
                key,
                String(value),
              ])
            ) as Record<string, string>)
          : undefined;

      const requestPayload = normalizedArgs
        ? { name: registration.remoteName, arguments: normalizedArgs }
        : { name: registration.remoteName };

      const result = await processRegistration.client.getPrompt(
        requestPayload
      );

      const prompt = Object.assign(
        {},
        result.prompt ?? {},
        { name }
      ) as Prompt;

      span.setStatus({
        code: SpanStatusCode.OK,
        message: "Prompt fetched successfully",
      });

      const normalizedResult = Object.assign({}, result, {
        prompt,
      }) as GetPromptResult;

      return normalizedResult;
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

  getPromptPermissions(name: string): Permission[] {
    const registration = this.prompts.get(name);
    if (registration && registration.permissions.length > 0) {
      return registration.permissions;
    }

    return [Permission.GET_PROMPTS];
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
      for (const { transport, client } of this.processes.values()) {
        await transport.close().catch(() => undefined);
        await client.close().catch(() => undefined);
      }

      this.processes.clear();
      this.registry.clear();
      this.resources.clear();
      this.resourceSchemes.clear();
      this.prompts.clear();

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

  private extractScheme(uri: string): string | null {
    const match = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//.exec(uri);
    return match ? match[1] : null;
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

      transport = new StdioClientTransport({
        command: config.command,
        args: config.args,
        env,
        cwd: config.cwd,
        stderr: "pipe",
      });

      const stderrStream = transport.stderr;
      if (stderrStream) {
        stderrStream.on("data", (data: Buffer) => {
          log.warn(`[${config.id}] stderr: ${data.toString("utf8").trimEnd()}`);
        });
      }

      transport.onclose = () => {
        log.error(`Travel server "${config.id}" exited.`);
        this.processes.delete(config.id);
        for (const [toolName, entry] of this.registry.entries()) {
          if (entry.serverId === config.id) {
            this.registry.delete(toolName);
          }
        }
        for (const [uri, entry] of this.resources.entries()) {
          if (entry.serverId === config.id) {
            this.resources.delete(uri);
          }
        }
        for (const [scheme, entry] of this.resourceSchemes.entries()) {
          if (entry.serverId === config.id) {
            this.resourceSchemes.delete(scheme);
          }
        }
        for (const [promptName, entry] of this.prompts.entries()) {
          if (entry.serverId === config.id) {
            this.prompts.delete(promptName);
          }
        }
      };

      transport.onerror = (error) => {
        log.error(`Transport error for "${config.id}":`, error);
      };

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

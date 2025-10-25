import path from "node:path";
import { fileURLToPath } from "node:url";
import { Permission } from "../auth/authorization.js";
import type { RemoteServerConfig } from "./registry.js";

const defaultPythonBinary =
  process.env.PYTHON_BIN ?? (process.platform === "win32" ? "python" : "python3");

const travelRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../travel-servers"
);

export const travelServerConfigs: RemoteServerConfig[] = [
  {
    id: "flight",
    title: "Flight Search Server",
    command: defaultPythonBinary,
    args: ["flight_server.py"],
    cwd: path.join(travelRoot, "flight_server"),
    toolPrefix: "flight",
    envKeys: ["SERPAPI_KEY"],
    permissions: [Permission.CALL_TOOLS],
  },
  {
    id: "hotel",
    title: "Hotel Search Server",
    command: defaultPythonBinary,
    args: ["hotel_server.py"],
    cwd: path.join(travelRoot, "hotel_server"),
    toolPrefix: "hotel",
    envKeys: ["SERPAPI_KEY"],
    permissions: [Permission.CALL_TOOLS],
  },
  {
    id: "event",
    title: "Event Search Server",
    command: defaultPythonBinary,
    args: ["event_server.py"],
    cwd: path.join(travelRoot, "event_server"),
    toolPrefix: "event",
    envKeys: ["SERPAPI_KEY"],
    permissions: [Permission.CALL_TOOLS],
  },
  {
    id: "finance",
    title: "Finance Search Server",
    command: defaultPythonBinary,
    args: ["finance_server.py"],
    cwd: path.join(travelRoot, "finance_server"),
    toolPrefix: "finance",
    envKeys: ["SERPAPI_KEY"],
    permissions: [Permission.CALL_TOOLS],
  },
  {
    id: "geocoder",
    title: "Geocoder Server",
    command: defaultPythonBinary,
    args: ["geocoder_server.py"],
    cwd: path.join(travelRoot, "geocoder_server"),
    toolPrefix: "geo",
    permissions: [Permission.CALL_TOOLS],
  },
  {
    id: "weather",
    title: "Weather Search Server",
    command: defaultPythonBinary,
    args: ["weather_server.py"],
    cwd: path.join(travelRoot, "weather_server"),
    toolPrefix: "weather",
    envKeys: ["WEATHERSTACK_API_KEY", "SERPAPI_KEY"],
    permissions: [Permission.CALL_TOOLS],
  },
];

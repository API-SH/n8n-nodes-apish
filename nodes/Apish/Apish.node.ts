import type { IDataObject, IExecuteFunctions, INodeExecutionData, INodeProperties, INodePropertyOptions, INodeType, INodeTypeDescription } from "n8n-workflow";
import { NodeApiError, NodeOperationError } from "n8n-workflow";
// resources (platforms) and operations (endpoints) with their parameters, generated from the API.SH catalog
import { CATALOG } from "./catalog";
import type { Param, Platform } from "./types";

const ACCOUNT_OPS: INodePropertyOptions[] = [
  { name: "Get Balance and Spend", value: "/v1/account", description: "Credits, plan, spend today / this month, spend limits (free)", action: "Get balance and spend" },
  { name: "Get Usage", value: "/v1/account/usage", description: "Calls, errors and credits per day (free)", action: "Get usage" },
  { name: "List Logs", value: "/v1/account/logs", description: "Calls of the last 30 days (free)", action: "List logs" },
  { name: "Get Past Response", value: "/v1/results", description: "The response of an earlier call again, free, for 30 days", action: "Get a past response" },
];

// built outside the property literal: n8n's lint rules read option arrays element by element
const PLATFORM_OPTIONS: INodePropertyOptions[] = [{ name: "Account", value: "account" }].concat(CATALOG.map((p) => ({ name: p.name, value: p.value })));

const label = (n: string) => n.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function properties(): INodeProperties[] {
  const props: INodeProperties[] = [
    {
      displayName: "Platform", name: "resource", type: "options", noDataExpression: true, default: "account",
      options: PLATFORM_OPTIONS,
    },
    { displayName: "Operation", name: "operation", type: "options", noDataExpression: true, displayOptions: { show: { resource: ["account"] } }, options: ACCOUNT_OPS, default: "/v1/account" },
    { displayName: "Days", name: "days", type: "number", default: 30, typeOptions: { minValue: 1, maxValue: 90 }, displayOptions: { show: { resource: ["account"], operation: ["/v1/account/usage"] } } },
    { displayName: "Limit", name: "limit", type: "number", default: 50, description: "Max number of results to return", typeOptions: { minValue: 1 }, displayOptions: { show: { resource: ["account"], operation: ["/v1/account/logs"] } } },
    { displayName: "Request ID", name: "requestId", type: "string", default: "", required: true, description: "The request ID of the earlier call, from its response headers", displayOptions: { show: { resource: ["account"], operation: ["/v1/results"] } } },
  ];
  for (const p of CATALOG) {
    // eslint-disable-next-line n8n-nodes-base/node-param-default-missing -- one generated operation list per platform; its default is that platform's first endpoint
    props.push({
      displayName: "Operation", name: "operation", type: "options", noDataExpression: true, displayOptions: { show: { resource: [p.value] } }, default: p.operations[0].value,
      options: p.operations.map((o) => ({ name: o.name, value: o.value, description: `${o.value} · ${o.credits} credit${o.credits === 1 ? "" : "s"}`, action: o.name })),
    });
    for (const o of p.operations) {
      for (const q of o.params) {
        const show = { show: { resource: [p.value], operation: [o.value] } };
        const base = { displayName: label(q.name), name: `p_${q.name}`, required: q.required, description: q.description || undefined, displayOptions: show, placeholder: q.example ? `e.g. ${q.example}` : undefined };
        if (q.enum) props.push({ ...base, type: "options", options: q.enum.map((v) => ({ name: v, value: v })), default: q.default ?? (q.required ? q.enum[0] : "") } as INodeProperties);
        else if (q.type === "integer" || q.type === "number") props.push({ ...base, type: "number", default: q.default !== undefined ? Number(q.default) : (undefined as unknown as number) } as INodeProperties);
        else props.push({ ...base, type: "string", default: q.default ?? "" } as INodeProperties);
      }
    }
  }
  props.push({
    displayName: "Options", name: "options", type: "collection", placeholder: "Add option", default: {},
    displayOptions: { hide: { resource: ["account"] } },
    options: [
      { displayName: "Include Raw Source Data", name: "raw", type: "boolean", default: false, description: "Whether to include the bulky raw source blocks (off: often 10-30x smaller)" },
      { displayName: "Fields", name: "fields", type: "string", default: "", placeholder: "posts.title,posts.url", description: "Only these fields (comma-separated)" },
      { displayName: "Fresh", name: "fresh", type: "boolean", default: false, description: "Whether to skip the 24-hour cache and fetch live" },
      { displayName: "Split Into Items", name: "split", type: "boolean", default: false, description: "Whether to output one n8n item per record (the response's main list) instead of one item per call" },
    ],
  });
  return props;
}

/** Records of a response: its main list (biggest array of objects), else the object itself. */
function records(data: IDataObject): IDataObject[] {
  let best: IDataObject[] | null = null;
  for (const [k, v] of Object.entries(data)) {
    if (k === "raw" || !Array.isArray(v) || !v.length || typeof v[0] !== "object") continue;
    if (!best || v.length > best.length) best = v as IDataObject[];
  }
  return best ?? [data];
}

export class Apish implements INodeType {
  description: INodeTypeDescription = {
    displayName: "API.SH",
    name: "apish",
    icon: "file:apish.svg",
    group: ["transform"],
    version: 1,
    subtitle: '={{$parameter["operation"]}}',
    description: "Public web data as clean JSON: TikTok, Instagram, Amazon, Zillow, Google and 70+ platforms",
    defaults: { name: "API.SH" },
    inputs: ["main"],
    outputs: ["main"],
    usableAsTool: true,
    credentials: [{ name: "apishApi", required: true }],
    properties: properties(),
  } as INodeTypeDescription;

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const out: INodeExecutionData[] = [];
    for (let i = 0; i < items.length; i++) {
      try {
        const resource = this.getNodeParameter("resource", i) as string;
        let route = this.getNodeParameter("operation", i) as string;
        const qs: IDataObject = {};
        let split = false;
        if (resource === "account") {
          if (route === "/v1/account/usage") qs.days = this.getNodeParameter("days", i);
          if (route === "/v1/account/logs") qs.limit = this.getNodeParameter("limit", i);
          if (route === "/v1/results") route = `/v1/results/${encodeURIComponent(this.getNodeParameter("requestId", i) as string)}`;
        } else {
          const op = CATALOG.find((p) => p.value === resource)?.operations.find((o) => o.value === route);
          if (!op) throw new NodeOperationError(this.getNode(), `Unknown endpoint ${route}`, { itemIndex: i });
          for (const q of op.params) {
            const v = this.getNodeParameter(`p_${q.name}`, i, "") as string | number;
            if (v !== "" && v !== undefined && v !== null) qs[q.name] = v;
          }
          const o = this.getNodeParameter("options", i, {}) as IDataObject;
          qs.raw = o.raw ? "1" : "0";
          if (o.fields) qs.fields = o.fields;
          if (o.fresh) qs.fresh = "1";
          split = !!o.split;
        }
        const res = (await this.helpers.httpRequestWithAuthentication.call(this, "apishApi", {
          method: "GET", url: `https://api.api.sh${route}`, qs, json: true, timeout: 120_000, returnFullResponse: true,
          headers: { "user-agent": "n8n-nodes-apish/0.2.0" },
        })) as { body: IDataObject; headers: Record<string, string> };
        const meta = { request_id: res.headers["x-request-id"] ?? null, credits_used: Number(res.headers["x-credits-used"] ?? 0) };
        if (split) for (const r of records(res.body)) out.push({ json: { ...r }, pairedItem: { item: i } });
        else out.push({ json: { ...res.body, _apish: meta }, pairedItem: { item: i } });
      } catch (err) {
        if (this.continueOnFail()) { out.push({ json: { error: (err as Error).message }, pairedItem: { item: i } }); continue; }
        if (err instanceof NodeOperationError) throw err;
        throw new NodeApiError(this.getNode(), err as never, { itemIndex: i });
      }
    }
    return [out];
  }
}

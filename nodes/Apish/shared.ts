import type { IDataObject, IExecuteFunctions, INodeExecutionData, INodeProperties, INodePropertyOptions } from "n8n-workflow";

export const API_BASE = "https://api.api.sh";
export const USER_AGENT = "n8n-nodes-apish/0.3.0";

export const ACCOUNT_OPS: INodePropertyOptions[] = [
  { name: "Get Balance and Spend", value: "/v1/account", description: "Credits, plan, spend today / this month, spend limits (free)", action: "Get balance and spend" },
  { name: "Get Usage", value: "/v1/account/usage", description: "Calls, errors and credits per day (free)", action: "Get usage" },
  { name: "List Logs", value: "/v1/account/logs", description: "Calls of the last 30 days (free)", action: "List logs" },
  { name: "Get Past Response", value: "/v1/results", description: "The response of an earlier call again, free, for 30 days", action: "Get a past response" },
];

/** The Account platform's operation list and fields. */
export function accountProperties(): INodeProperties[] {
  return [
    { displayName: "Operation", name: "operation", type: "options", noDataExpression: true, displayOptions: { show: { resource: ["account"] } }, options: ACCOUNT_OPS, default: "/v1/account" },
    { displayName: "Days", name: "days", type: "number", default: 30, typeOptions: { minValue: 1, maxValue: 90 }, displayOptions: { show: { resource: ["account"], operation: ["/v1/account/usage"] } } },
    { displayName: "Limit", name: "limit", type: "number", default: 50, description: "Max number of results to return", typeOptions: { minValue: 1 }, displayOptions: { show: { resource: ["account"], operation: ["/v1/account/logs"] } } },
    { displayName: "Request ID", name: "requestId", type: "string", default: "", required: true, description: "The request ID of the earlier call, from its response headers", displayOptions: { show: { resource: ["account"], operation: ["/v1/results"] } } },
  ];
}

/** Options that apply to every endpoint (the API's common parameters). */
export const OPTIONS_PROPERTY: INodeProperties = {
  displayName: "Options", name: "options", type: "collection", placeholder: "Add option", default: {},
  displayOptions: { hide: { resource: ["account"] } },
  options: [
    { displayName: "Include Raw Source Data", name: "raw", type: "boolean", default: false, description: "Whether to include the bulky raw source blocks (off: often 10-30x smaller)" },
    { displayName: "Fields", name: "fields", type: "string", default: "", placeholder: "posts.title,posts.url", description: "Only these fields (comma-separated)" },
    { displayName: "Fresh", name: "fresh", type: "boolean", default: false, description: "Whether to skip the 24-hour cache and fetch live" },
    { displayName: "Split Into Items", name: "split", type: "boolean", default: false, description: "Whether to output one n8n item per record (the response's main list) instead of one item per call" },
  ],
};

/** Records of a response: its main list (biggest array of objects), else the object itself. */
export function records(data: IDataObject): IDataObject[] {
  let best: IDataObject[] | null = null;
  for (const [k, v] of Object.entries(data)) {
    if (k === "raw" || !Array.isArray(v) || !v.length || typeof v[0] !== "object") continue;
    if (!best || v.length > best.length) best = v as IDataObject[];
  }
  return best ?? [data];
}

/** The Account platform's route and query for item i. */
export function accountRequest(ctx: IExecuteFunctions, route: string, i: number): { route: string; qs: IDataObject } {
  const qs: IDataObject = {};
  if (route === "/v1/account/usage") qs.days = ctx.getNodeParameter("days", i);
  if (route === "/v1/account/logs") qs.limit = ctx.getNodeParameter("limit", i);
  if (route === "/v1/results") route = `/v1/results/${encodeURIComponent(ctx.getNodeParameter("requestId", i) as string)}`;
  return { route, qs };
}

/** Adds the Options collection to the query; returns whether to split into items. */
export function applyOptions(ctx: IExecuteFunctions, qs: IDataObject, i: number): boolean {
  const o = ctx.getNodeParameter("options", i, {}) as IDataObject;
  qs.raw = o.raw ? "1" : "0";
  if (o.fields) qs.fields = o.fields;
  if (o.fresh) qs.fresh = "1";
  return !!o.split;
}

/** Calls the API and pushes the result items for item i. */
export async function callApi(ctx: IExecuteFunctions, route: string, qs: IDataObject, split: boolean, i: number, out: INodeExecutionData[]): Promise<void> {
  const res = (await ctx.helpers.httpRequestWithAuthentication.call(ctx, "apishApi", {
    method: "GET", url: `${API_BASE}${route}`, qs, json: true, timeout: 120_000, returnFullResponse: true,
    headers: { "user-agent": USER_AGENT },
  })) as { body: IDataObject; headers: Record<string, string> };
  const meta = { request_id: res.headers["x-request-id"] ?? null, credits_used: Number(res.headers["x-credits-used"] ?? 0) };
  if (split) for (const r of records(res.body)) out.push({ json: { ...r }, pairedItem: { item: i } });
  else out.push({ json: { ...res.body, _apish: meta }, pairedItem: { item: i } });
}

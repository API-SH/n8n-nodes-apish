import type {
  FieldType,
  IDataObject,
  IExecuteFunctions,
  ILoadOptionsFunctions,
  INodeExecutionData,
  INodePropertyOptions,
  INodeType,
  INodeTypeBaseDescription,
  INodeTypeDescription,
  ResourceMapperField,
  ResourceMapperFields,
  ResourceMapperValue,
} from "n8n-workflow";
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from "n8n-workflow";
// Version 2: platforms and endpoints come from the API's live /catalog (loadOptions) and each endpoint's parameters
// from /catalog?route= (a resource mapper), so new endpoints need no new package version. The bundled catalog is the
// fallback when the API can't be reached. Running a workflow never reads the catalog: the route and the mapped
// parameter values saved in the workflow are sent as they are.
import { OPTIONS_PROPERTY, accountProperties, accountRequest, applyOptions, callApi } from "../shared";
import * as live from "./liveCatalog";

const label = (n: string) => n.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
// an endpoint path on api.api.sh (the key is only ever sent there)
const ROUTE = /^\/[A-Za-z0-9][A-Za-z0-9._~/-]*$/;

function fieldType(type: string, hasEnum: boolean): FieldType {
  if (hasEnum) return "options";
  if (type === "integer" || type === "number") return "number";
  if (type === "boolean") return "boolean";
  return "string";
}

export class ApishV2 implements INodeType {
  description: INodeTypeDescription;

  constructor(baseDescription: INodeTypeBaseDescription) {
    this.description = {
      ...baseDescription,
      version: 2,
      defaults: { name: "API.SH" },
      inputs: [NodeConnectionTypes.Main],
      outputs: [NodeConnectionTypes.Main],
      usableAsTool: true,
      credentials: [{ name: "apishApi", required: true }],
      properties: [
        {
          displayName: "Platform Name or ID", name: "resource", type: "options", noDataExpression: true, default: "account",
          description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
          typeOptions: { loadOptionsMethod: "getPlatforms" },
        },
        ...accountProperties(),
        {
          displayName: "Endpoint Name or ID", name: "operation", type: "options", noDataExpression: true, default: "", required: true,
          description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
          displayOptions: { hide: { resource: ["account"] } },
          typeOptions: { loadOptionsMethod: "getEndpoints", loadOptionsDependsOn: ["resource"] },
        },
        {
          displayName: "Parameters", name: "parameters", type: "resourceMapper", noDataExpression: true,
          default: { mappingMode: "defineBelow", value: null },
          displayOptions: { hide: { resource: ["account"] } },
          typeOptions: {
            loadOptionsDependsOn: ["operation"],
            resourceMapper: {
              resourceMapperMethod: "getParameters",
              mode: "add",
              fieldWords: { singular: "parameter", plural: "parameters" },
              addAllFields: true,
              multiKeyMatch: false,
              supportAutoMap: false,
              noFieldsError: "This endpoint takes no parameters.",
            },
          },
        },
        OPTIONS_PROPERTY,
      ],
    };
  }

  methods = {
    loadOptions: {
      async getPlatforms(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
        const list = await live.platforms(this);
        return [{ name: "Account", value: "account", description: "Balance, usage, logs and past responses (free)" }].concat(
          [...list].sort((a, b) => a.name.localeCompare(b.name)).map((p) => ({ name: p.name, value: p.slug, description: `${p.endpoints.length} endpoint${p.endpoints.length === 1 ? "" : "s"}` })),
        );
      },
      async getEndpoints(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
        const slug = this.getCurrentNodeParameter("resource") as string;
        const p = (await live.platforms(this)).find((x) => x.slug === slug);
        return (p?.endpoints ?? []).map((e) => ({
          name: e.name,
          value: e.route,
          description: e.credits == null ? e.route : `${e.route} · ${e.credits} credit${e.credits === 1 ? "" : "s"}`,
        }));
      },
    },
    resourceMapping: {
      async getParameters(this: ILoadOptionsFunctions): Promise<ResourceMapperFields> {
        const route = this.getCurrentNodeParameter("operation") as string;
        if (!route || !ROUTE.test(route)) return { fields: [], emptyFieldsNotice: "Pick an endpoint first." };
        const list = await live.params(this, route);
        if (!list) return { fields: [], emptyFieldsNotice: "Could not load this endpoint's parameters from api.api.sh. Try again in a moment." };
        const fields: ResourceMapperField[] = list.map((q) => ({
          id: q.name,
          displayName: `${label(q.name)}${q.description ? ` (${q.description.replace(/`/g, "").slice(0, 80)})` : q.example ? ` (e.g. ${q.example})` : ""}`,
          required: q.required,
          defaultMatch: false,
          canBeUsedToMatch: false,
          display: true,
          type: fieldType(q.type, !!q.enum),
          options: q.enum?.map((v) => ({ name: v, value: v })),
          defaultValue: q.default ?? null,
        }));
        return { fields };
      },
    },
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const out: INodeExecutionData[] = [];
    for (let i = 0; i < items.length; i++) {
      try {
        const resource = this.getNodeParameter("resource", i) as string;
        let route = this.getNodeParameter("operation", i) as string;
        let qs: IDataObject = {};
        let split = false;
        if (resource === "account") ({ route, qs } = accountRequest(this, route, i));
        else {
          if (typeof route !== "string" || !ROUTE.test(route) || route.includes("..") || route.startsWith("/v1/"))
            throw new NodeOperationError(this.getNode(), `Pick an endpoint (got "${String(route)}")`, { itemIndex: i });
          const mapped = this.getNodeParameter("parameters", i, null) as ResourceMapperValue | null;
          for (const [k, v] of Object.entries(mapped?.value ?? {})) if (v !== "" && v !== undefined && v !== null) qs[k] = v;
          split = applyOptions(this, qs, i);
        }
        await callApi(this, route, qs, split, i, out);
      } catch (err) {
        if (this.continueOnFail()) { out.push({ json: { error: (err as Error).message }, pairedItem: { item: i } }); continue; }
        if (err instanceof NodeOperationError) throw new NodeOperationError(this.getNode(), err, { itemIndex: i });
        throw new NodeApiError(this.getNode(), err as never, { itemIndex: i });
      }
    }
    return [out];
  }
}

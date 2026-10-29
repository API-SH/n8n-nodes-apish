import type { IDataObject, IExecuteFunctions, INodeExecutionData, INodeProperties, INodePropertyOptions, INodeType, INodeTypeBaseDescription, INodeTypeDescription } from "n8n-workflow";
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from "n8n-workflow";
// Version 1: resources (platforms), operations (endpoints) and their parameters from the catalog bundled at build time
// (catalog.ts, generated). Kept so workflows built with it keep running unchanged; new nodes use version 2.
import { CATALOG } from "../catalog";
import { OPTIONS_PROPERTY, accountProperties, accountRequest, applyOptions, callApi } from "../shared";

// built outside the property literal: n8n's lint rules read option arrays element by element
const PLATFORM_OPTIONS: INodePropertyOptions[] = [{ name: "Account", value: "account" }].concat(CATALOG.map((p) => ({ name: p.name, value: p.value })));

const label = (n: string) => n.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function properties(): INodeProperties[] {
  const props: INodeProperties[] = [
    {
      displayName: "Platform", name: "resource", type: "options", noDataExpression: true, default: "account",
      options: PLATFORM_OPTIONS,
    },
    ...accountProperties(),
  ];
  for (const p of CATALOG) {
    const opOptions: INodePropertyOptions[] = p.operations.map((o) => ({ name: o.name, value: o.value, description: `${o.value} · ${o.credits} credit${o.credits === 1 ? "" : "s"}`, action: o.name }));
    const op: INodeProperties = {
      displayName: "Operation", name: "operation", type: "options", noDataExpression: true, displayOptions: { show: { resource: [p.value] } }, default: "",
      options: opOptions,
    };
    // each platform's operation list starts on its first endpoint
    op.default = p.operations[0].value;
    props.push(op);
    for (const o of p.operations) {
      for (const q of o.params) {
        const show = { show: { resource: [p.value], operation: [o.value] } };
        const base = { displayName: label(q.name), name: `p_${q.name}`, required: q.required, description: q.description || undefined, displayOptions: show, placeholder: q.example ? `e.g. ${q.example}` : undefined };
        // an optional list starts on "Default" (left out of the call, so the API's own default applies)
        if (q.enum) {
          const enumOptions: INodePropertyOptions[] = q.required ? [] : [{ name: "Default", value: "" }];
          for (const v of q.enum) enumOptions.push({ name: v, value: v });
          props.push({ ...base, type: "options", options: enumOptions, default: q.default ?? (q.required ? q.enum[0] : "") } as INodeProperties);
        }
        if (q.enum) continue;
        if (q.type === "integer" || q.type === "number") props.push({ ...base, type: "number", default: q.default !== undefined ? Number(q.default) : (undefined as unknown as number) } as INodeProperties);
        else props.push({ ...base, type: "string", default: q.default ?? "" } as INodeProperties);
      }
    }
  }
  props.push(OPTIONS_PROPERTY);
  return props;
}

export class ApishV1 implements INodeType {
  description: INodeTypeDescription;

  constructor(baseDescription: INodeTypeBaseDescription) {
    this.description = {
      ...baseDescription,
      version: 1,
      defaults: { name: "API.SH" },
      inputs: [NodeConnectionTypes.Main],
      outputs: [NodeConnectionTypes.Main],
      usableAsTool: true,
      credentials: [{ name: "apishApi", required: true }],
      properties: properties(),
    };
  }

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
          const op = CATALOG.find((p) => p.value === resource)?.operations.find((o) => o.value === route);
          if (!op) throw new NodeOperationError(this.getNode(), `Unknown endpoint ${route}`, { itemIndex: i });
          for (const q of op.params) {
            const v = this.getNodeParameter(`p_${q.name}`, i, "") as string | number;
            if (v !== "" && v !== undefined && v !== null) qs[q.name] = v;
          }
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

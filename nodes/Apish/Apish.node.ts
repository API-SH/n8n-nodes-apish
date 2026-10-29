import type { INodeTypeBaseDescription, IVersionedNodeType } from "n8n-workflow";
import { VersionedNodeType } from "n8n-workflow";
import { ApishV1 } from "./v1/ApishV1.node";
import { ApishV2 } from "./v2/ApishV2.node";

// Version 1 (bundled endpoint list) keeps existing workflows running unchanged.
// Version 2 (the default for new nodes) reads platforms, endpoints and parameters from the live API catalog.
export class Apish extends VersionedNodeType {
  constructor() {
    const baseDescription: INodeTypeBaseDescription = {
      displayName: "API.SH",
      name: "apish",
      icon: "file:apish.svg",
      group: ["transform"],
      subtitle: '={{$parameter["operation"]}}',
      description: "Public web data as clean JSON: TikTok, Instagram, Amazon, Zillow, Google and 150+ platforms",
      defaultVersion: 2,
    };
    const nodeVersions: IVersionedNodeType["nodeVersions"] = {
      1: new ApishV1(baseDescription),
      2: new ApishV2(baseDescription),
    };
    super(nodeVersions, baseDescription);
  }
}

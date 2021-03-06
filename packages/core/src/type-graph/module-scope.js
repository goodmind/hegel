// @flow
import type { Type } from "./types/type";
import type { Scope } from "./scope";
import type { CallMeta } from "./meta/call-meta";
import type { VariableInfo } from "./variable-info";

export type GraphElement = Scope | VariableInfo;
export type TypeGraph = Map<string, GraphElement>;

export class ModuleScope {
  body: TypeGraph;
  parent: ?ModuleScope;
  calls: Array<CallMeta> = [];
  exports: Map<string, VariableInfo | Type>;
  exportsTypes: Map<string, VariableInfo>;

  constructor(body?: TypeGraph = new Map(), parent?: ModuleScope) {
    this.body = body;
    this.parent = parent;
    this.exports = new Map();
    this.exportsTypes = new Map();
  }
}

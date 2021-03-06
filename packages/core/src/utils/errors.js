// @flow
import type { SourceLocation } from "@babel/parser";

export default class HegelError extends Error {
  loc: SourceLocation;

  constructor(message: string, loc: SourceLocation) {
    super(message);
    this.loc = loc;
  }
}

export class UnreachableError extends Error {
  loc: SourceLocation;
  
  constructor(loc: SourceLocation) {
    super("");
    this.loc = loc;
  }
}

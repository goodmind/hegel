// @flow
import { Type } from "./type";
import { unique } from "../../utils/common";
import { UnionType } from "./union-type";
import { VariableInfo } from "../variable-info";
import { getNameForType } from "../../utils/type-utils";
import { createTypeWithName } from "./create-type";
import type { Scope } from "../scope";
import type { TypeMeta } from "./type";

type ExtendedTypeMeta = { ...TypeMeta, isNominal?: boolean };

export class ObjectType extends Type {
  static createTypeWithName = createTypeWithName(ObjectType);

  static getName(params: Array<[string | number, any]>) {
    const filteredProperties = params ? unique(params, ([key]) => key) : [];
    return `{ ${filteredProperties
      .sort(([name1], [name2]) => String(name1).localeCompare(String(name2)))
      .map(
        ([name, type]) =>
          `${name}: ${getNameForType(
            type instanceof VariableInfo ? type.type : type
          )}`
      )
      .join(", ")} }`;
  }

  isNominal: boolean;
  properties: Map<string | number, VariableInfo>;
  onlyLiteral = true;

  constructor(
    name: string,
    properties: Array<[string | number, VariableInfo]>,
    options: ExtendedTypeMeta = {}
  ) {
    super(name, {
      isSubtypeOf: name === "Object" ? undefined : new ObjectType("Object", []),
      ...options
    });
    this.isNominal = Boolean(options.isNominal);
    const filteredProperties = properties
      ? unique(properties, ([key]) => key)
      : [];
    this.properties = new Map(filteredProperties);
  }

  getPropertyType(propertyName: any): ?Type {
    let fieldOwner = this;
    let field = null;
    while (fieldOwner) {
      // $FlowIssue
      field = fieldOwner.properties.get(propertyName);
      if (
        field ||
        !(
          fieldOwner.isSubtypeOf && fieldOwner.isSubtypeOf instanceof ObjectType
        )
      ) {
        break;
      }
      fieldOwner = fieldOwner.isSubtypeOf;
    }
    if (!field) {
      return null;
    }
    return field.type;
  }

  isAllProperties(
    predicate: "equalsTo" | "isPrincipalTypeFor",
    anotherType: ObjectType
  ): boolean {
    for (const [key, { type }] of this.properties) {
      const anotherProperty = anotherType.properties.get(key) || {
        type: new Type("void")
      };
      /* $FlowIssue - flow doesn't type methods by name */
      if (!type[predicate](anotherProperty.type)) {
        return false;
      }
    }
    return true;
  }

  changeAll(
    sourceTypes: Array<Type>,
    targetTypes: Array<Type>,
    typeScope: Scope
  ): Type {
    let isAnyPropertyChanged = false;
    const newProperties: Array<[string | number, VariableInfo]> = [];
    this.properties.forEach((vInfo, key) => {
      const newType = vInfo.type.changeAll(sourceTypes, targetTypes, typeScope);
      if (vInfo.type === newType) {
        return newProperties.push([key, vInfo]);
      }
      isAnyPropertyChanged = true;
      newProperties.push([
        key,
        new VariableInfo(newType, vInfo.parent, vInfo.meta)
      ]);
    });
    if (!isAnyPropertyChanged) {
      return this;
    }
    return ObjectType.createTypeWithName(
      ObjectType.getName(newProperties),
      typeScope,
      newProperties
    );
  }

  equalsTo(anotherType: Type) {
    if (this.referenceEqualsTo(anotherType)) {
      return true;
    }
    if (
      !(anotherType instanceof ObjectType) ||
      anotherType.properties.size !== this.properties.size ||
      !super.equalsTo(anotherType)
    ) {
      return false;
    }
    return this.isAllProperties("equalsTo", anotherType);
  }

  isSuperTypeFor(anotherType: Type): boolean {
    const requiredProperties = [...this.properties.values()].filter(
      ({ type }) =>
        !(type instanceof UnionType) ||
        !type.variants.some(t => t.equalsTo(new Type("void")))
    );
    return anotherType instanceof ObjectType && !this.isNominal
      ? anotherType.properties.size >= requiredProperties.length &&
          this.isAllProperties("isPrincipalTypeFor", anotherType)
      : anotherType.isSubtypeOf != undefined &&
          this.isPrincipalTypeFor(anotherType.isSubtypeOf);
  }
}

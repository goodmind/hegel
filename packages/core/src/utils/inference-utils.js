// @flow
import NODE from "../utils/nodes";
import { UnionType } from "../type-graph/types/union-type";
import { createObjectWith, mergeObjectsTypes } from "./type-utils";
import type { Type } from "../type-graph/types/type";
import type { Scope } from "../type-graph/scope";
import type { ObjectType } from "../type-graph/types/object-type";
import type { VariableInfo } from "../type-graph/variable-info";
import type { MemberExpression } from "@babel/parser";

export function getTypesFromVariants(
  refinementedVariants: Array<Type>,
  alternateVariants: Array<Type>,
  typeScope: Scope
): [?Type, ?Type] {
  return [
    refinementedVariants.length
      ? UnionType.createTypeWithName(
          UnionType.getName(refinementedVariants),
          typeScope,
          refinementedVariants
        )
      : undefined,
    alternateVariants.length
      ? UnionType.createTypeWithName(
          UnionType.getName(alternateVariants),
          typeScope,
          alternateVariants
        )
      : undefined
  ];
}

export function getPropertyChaining(node: MemberExpression): ?Array<string> {
  let memberPointer = node;
  const chaining: Array<string> = [];
  do {
    if (
      memberPointer.property.type !== NODE.IDENTIFIER ||
      memberPointer.computed
    ) {
      return;
    }
    chaining.unshift(
      memberPointer.property.name || memberPointer.property.value
    );
    memberPointer = memberPointer.object;
  } while (memberPointer.type === NODE.MEMBER_EXPRESSION);
  return chaining;
}

export function mergeRefinementsVariants(
  refinementedType: ?Type,
  alternateType: ?Type,
  originalProperty: VariableInfo,
  propertyName: string,
  typeScope: Scope
): [?Type, ?Type] {
  const nestedRefinementedType =
    refinementedType &&
    createObjectWith(
      propertyName,
      refinementedType,
      typeScope,
      originalProperty.meta
    );
  const nestedAlternateType =
    alternateType &&
    createObjectWith(
      propertyName,
      alternateType,
      typeScope,
      originalProperty.meta
    );
  return [
    nestedRefinementedType &&
      mergeObjectsTypes(
      // $FlowIssue
        originalProperty.type,
        nestedRefinementedType,
        typeScope
      ),
    nestedAlternateType &&
      // $FlowIssue
      mergeObjectsTypes(originalProperty.type, nestedAlternateType, typeScope)
  ];
}

// @flow
import NODE from "../utils/nodes";
import HegelError from "../utils/errors";
import { Type } from "./types/type";
import { Scope } from "./scope";
import { TypeVar } from "./types/type-var";
import { CallMeta } from "./meta/call-meta";
import { ObjectType } from "./types/object-type";
import { ModuleScope } from "./module-scope";
import { addPosition } from "../utils/position-utils";
import { GenericType } from "./types/generic-type";
import { $BottomType } from "./types/bottom-type";
import { FunctionType } from "./types/function-type";
import { VariableInfo } from "./variable-info";
import { $PropertyType } from "./types/property-type";
import { addToThrowable } from "../utils/throwable";
import { getVariableType } from "../utils/variable-utils";
import { getInvocationType } from "../inference/function-type";
import { inferenceTypeForNode } from "../inference";
import { getAnonymousKey, findVariableInfo } from "../utils/common";
import {
  findNearestTypeScope,
  findNearestScopeByType
} from "../utils/scope-utils";
import type { Node } from "@babel/parser";
import type { CallableArguments } from "./meta/call-meta";

type CallResult = {
  inferenced?: boolean,
  result: CallableArguments
};

export function addCallToTypeGraph(
  node: Node,
  typeGraph: ModuleScope,
  currentScope: Scope | ModuleScope
): CallResult {
  let target: ?VariableInfo | Type = null;
  let inferenced = undefined;
  let targetName: string = "";
  let args: ?Array<CallableArguments> = null;
  let genericArguments: ?Array<CallableArguments> = null;
  const typeScope = findNearestTypeScope(currentScope, typeGraph);
  if (!(typeScope instanceof Scope)) {
    throw new Error("Never!");
  }
  switch (node.type) {
    case NODE.IF_STATEMENT:
      target = findVariableInfo({ name: "if", loc: node.loc }, currentScope);
      args = [addCallToTypeGraph(node.test, typeGraph, currentScope).result];
      break;
    case NODE.WHILE_STATEMENT:
      target = findVariableInfo({ name: "while", loc: node.loc }, currentScope);
      args = [addCallToTypeGraph(node.test, typeGraph, currentScope).result];
      break;
    case NODE.DO_WHILE_STATEMENT:
      target = findVariableInfo(
        { name: "do-while", loc: node.loc },
        currentScope
      );
      args = [addCallToTypeGraph(node.test, typeGraph, currentScope).result];
      break;
    case NODE.FOR_STATEMENT:
      target = findVariableInfo({ name: "for", loc: node.loc }, currentScope);
      args = [
        Type.createTypeWithName("mixed", typeScope),
        node.test
          ? addCallToTypeGraph(
              node.test,
              typeGraph,
              // $FlowIssue
              typeGraph.body.get(Scope.getName(node.body))
            ).result
          : Type.createTypeWithName("undefined", typeScope),
        Type.createTypeWithName("mixed", typeScope)
      ];
      break;
    case NODE.FUNCTION_EXPRESSION:
    case NODE.ARROW_FUNCTION_EXPRESSION:
    case NODE.CLASS_DECLARATION:
    case NODE.IDENTIFIER:
      const nodeName =
        node.type === NODE.IDENTIFIER
          ? node
          : { name: getAnonymousKey(node), loc: node.loc };
      const varInfo = findVariableInfo(nodeName, currentScope);
      if (node.type === NODE.IDENTIFIER) {
        addPosition(node, varInfo, typeGraph);
      }
      return { result: varInfo };
    case NODE.VARIABLE_DECLARATOR:
      const variableType = findVariableInfo(node.id, currentScope);
      addPosition(node.id, variableType, typeGraph);
      if (!node.init) {
        return { result: variableType };
      }
      const value = addCallToTypeGraph(node.init, typeGraph, currentScope);
      inferenced = value.inferenced;
      args = [variableType, value.result];
      targetName = "=";
      target = findVariableInfo(
        { name: targetName, loc: node.loc },
        currentScope
      );
      break;
    case NODE.EXPRESSION_STATEMENT:
      return addCallToTypeGraph(node.expression, typeGraph, currentScope);
    case NODE.THROW_STATEMENT:
      const error = addCallToTypeGraph(node.argument, typeGraph, currentScope);
      args = [
        getVariableType(
          null,
          error.result instanceof VariableInfo
            ? error.result.type
            : error.result,
          typeScope,
          error.inferenced
        )
      ];
      targetName = "throw";
      target = findVariableInfo(
        { name: targetName, loc: node.loc },
        currentScope
      );
      addToThrowable(args[0], currentScope);
      break;
    case NODE.AWAIT_EXPRESSION:
      args = [
        addCallToTypeGraph(node.argument, typeGraph, currentScope).result,
      ];
      targetName = "await";
      target = findVariableInfo(
        { name: targetName, loc: node.loc },
        currentScope
      );
      break;
    case NODE.BINARY_EXPRESSION:
    case NODE.LOGICAL_EXPRESSION:
      args = [
        addCallToTypeGraph(node.left, typeGraph, currentScope).result,
        addCallToTypeGraph(node.right, typeGraph, currentScope).result
      ];
      targetName = node.operator === "+" ? "b+" : node.operator;
      target = findVariableInfo(
        { name: targetName, loc: node.loc },
        currentScope
      );
      break;
    case NODE.ASSIGNMENT_EXPRESSION:
      args = [
        addCallToTypeGraph(node.left, typeGraph, currentScope).result,
        addCallToTypeGraph(node.right, typeGraph, currentScope).result
      ];
      targetName = node.operator;
      target = findVariableInfo(
        { name: targetName, loc: node.loc },
        currentScope
      );
      break;
    case NODE.RETURN_STATEMENT:
      targetName = "return";
      const arg = addCallToTypeGraph(node.argument, typeGraph, currentScope);
      args = [
        arg.result instanceof Type
          ? getVariableType(null, arg.result, typeScope, arg.inferenced)
          : arg.result
      ];
      const fn: any = findNearestScopeByType(Scope.FUNCTION_TYPE, currentScope);
      if (fn instanceof ModuleScope) {
        throw new HegelError("Call return outside function", node.loc);
      }
      const declaration =
        fn.declaration.type instanceof GenericType
          ? fn.declaration.type.subordinateType
          : fn.declaration.type;
      target = findVariableInfo(
        { name: targetName, loc: node.loc },
        currentScope
      );
      target =
        declaration.returnType instanceof TypeVar &&
        declaration.returnType.isUserDefined
          ? target
          : // $FlowIssue
            target.type.applyGeneric([declaration.returnType], node.loc);
      break;
    case NODE.UNARY_EXPRESSION:
    case NODE.UPDATE_EXPRESSION:
      targetName = node.operator;
      args = [
        addCallToTypeGraph(node.argument, typeGraph, currentScope).result
      ];
      target = findVariableInfo(
        { name: targetName, loc: node.loc },
        currentScope
      );
      break;
    case NODE.MEMBER_EXPRESSION:
      args = [
        addCallToTypeGraph(node.object, typeGraph, currentScope).result,
        node.property.type === NODE.IDENTIFIER && !node.computed
          ? Type.createTypeWithName(`'${node.property.name}'`, typeScope, {
              isSubtypeOf: Type.createTypeWithName("string", typeScope)
            })
          : addCallToTypeGraph(node.property, typeGraph, currentScope).result
      ];
      if (node.property.type === NODE.IDENTIFIER) {
        const property = new $PropertyType();
        addPosition(
          node.property,
          args[1].type instanceof TypeVar
            ? new Type(
                GenericType.getName(property.name, [args[1].type || args[1]])
              )
            : property.applyGeneric(
                [args[0].type || args[0], args[1]],
                node.loc,
                true,
                true
              ),
          typeGraph
        );
      }
      genericArguments = args;
      targetName = ".";
      target = findVariableInfo(
        { name: targetName, loc: node.loc },
        currentScope
      );
      break;
    case NODE.CONDITIONAL_EXPRESSION:
      args = [
        addCallToTypeGraph(node.test, typeGraph, currentScope).result,
        addCallToTypeGraph(node.consequent, typeGraph, currentScope).result,
        addCallToTypeGraph(node.alternate, typeGraph, currentScope).result
      ];
      targetName = "?:";
      target = findVariableInfo(
        { name: targetName, loc: node.loc },
        currentScope
      );
      break;
    case NODE.CALL_EXPRESSION:
      args = node.arguments.map(
        n => addCallToTypeGraph(n, typeGraph, currentScope).result
      );
      if (node.callee.type === NODE.IDENTIFIER) {
        target = findVariableInfo(node.callee, currentScope);
        addPosition(node.callee, target, typeGraph);
      } else {
        target = (addCallToTypeGraph(node.callee, typeGraph, currentScope)
          .result: any);
      }
      const targetType = target instanceof VariableInfo ? target.type : target;
      const throwableType: any =
        targetType instanceof GenericType
          ? targetType.subordinateType
          : targetType;
      if (throwableType.throwable) {
        addToThrowable(throwableType.throwable, currentScope);
      }
      inferenced =
        targetType instanceof GenericType &&
        targetType.subordinateType.returnType instanceof TypeVar;
      break;
    case NODE.NEW_EXPRESSION:
      const argument = addCallToTypeGraph(node.callee, typeGraph, currentScope)
        .result;
      const argumentType =
        argument instanceof VariableInfo ? argument.type : argument;
      const potentialArgument =
        argumentType instanceof FunctionType ||
        (argumentType instanceof GenericType &&
          argumentType.subordinateType instanceof FunctionType)
          ? getInvocationType(
              argumentType,
              node.arguments.map(
                a => addCallToTypeGraph(a, typeGraph, currentScope).result
              )
            )
          : argumentType;
      args = [
        potentialArgument instanceof ObjectType
          ? potentialArgument
          : ObjectType.createTypeWithName("{ }", typeScope, [])
      ];
      targetName = "new";
      target = findVariableInfo(
        { name: targetName, loc: node.loc },
        currentScope
      );
      break;
    default:
      return {
        result: inferenceTypeForNode(node, typeScope, currentScope, typeGraph),
        inferenced: true
      };
  }
  const callsScope =
    currentScope.type === Scope.FUNCTION_TYPE
      ? currentScope
      : findNearestScopeByType(Scope.FUNCTION_TYPE, currentScope);
  const targetType = target instanceof VariableInfo ? target.type : target;
  if (
    !(targetType instanceof $BottomType) &&
    !(targetType instanceof FunctionType) &&
    !(
      targetType instanceof GenericType &&
      targetType.subordinateType instanceof FunctionType
    )
  ) {
    throw new HegelError("The target is not callable type.", node.loc);
  }
  const invocationType = getInvocationType(
    targetType,
    args.map(a => (a instanceof Type ? a : a.type)),
    // $FlowIssue
    genericArguments &&
      genericArguments.map(a => (a instanceof Type ? a : a.type)),
    node.loc
  );
  if (!(targetType instanceof $BottomType)) {
    const callMeta = new CallMeta((target: any), args, node.loc, targetName);
    callsScope.calls.push(callMeta);
  }
  return { result: invocationType, inferenced };
}

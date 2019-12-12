import debugFactory from "debug";
import makeNewBuild, {
  InflectionBase,
  FieldWithHooksFunction,
  InputFieldWithHooksFunction,
  GetDataFromParsedResolveInfoFragmentFunction,
} from "./makeNewBuild";
import { bindAll } from "./utils";
import {
  /* ONLY IMPORT TYPES HERE! */
  GraphQLType,
  GraphQLNamedType,
  GraphQLInterfaceType,
  GraphQLObjectTypeConfig,
  GraphQLSchema,
  GraphQLResolveInfo,
  GraphQLSchemaConfig,
  GraphQLObjectType,
  GraphQLInputObjectType,
  GraphQLInputObjectTypeConfig,
  GraphQLScalarType,
  GraphQLScalarTypeConfig,
  GraphQLInterfaceTypeConfig,
  GraphQLUnionType,
  GraphQLUnionTypeConfig,
  GraphQLEnumType,
  GraphQLEnumTypeConfig,
  GraphQLFieldConfigMap,
  GraphQLFieldConfig,
  GraphQLFieldConfigArgumentMap,
  GraphQLInputFieldConfigMap,
  GraphQLInputFieldConfig,
  GraphQLEnumValueConfigMap,
  GraphQLEnumValueConfig,
  GraphQLOutputType,
} from "graphql";
import EventEmitter = require("events");
// TODO: when we move to TypeScript, change this to:
// import { EventEmitter } from "events";

import { LiveCoordinator } from "./Live";
import { ResolveTree } from "graphql-parse-resolve-info";
import { NodeFetcher } from "./plugins/NodePlugin";

export { FieldWithHooksFunction, InputFieldWithHooksFunction };

export interface GraphileResolverContext {}

const debug = debugFactory("graphile-builder");

const INDENT = "  ";

export interface DirectiveMap {
  [directiveName: string]: {
    [directiveArgument: string]: any;
  };
}

export interface GraphileBuildOptions {
  subscriptions?: boolean;
  live?: boolean;
  nodeIdFieldName?: string;
  dontSwallowErrors?: boolean;
}

// Deprecated 'Options' in favour of 'GraphileBuildOptions':
export type Options = GraphileBuildOptions;

export interface Plugin {
  (builder: SchemaBuilder, options: GraphileBuildOptions): Promise<void> | void;
  displayName?: string;
}

export type InitObject = never;

type TriggerChangeType = () => void;

/**
 * This contains all the possibilities for lookahead data when raw (submitted
 * directly from `addDataGenerator` functions, etc). It's up to the plugins
 * that define these entries to declare them using declaration merging.
 *
 * NOTE: the types of these entries are concrete (e.g. `usesCursor: boolean`)
 * because we need the concrete types to build ResolvedLookAhead. We then use
 * `Partial<LookAheadData>` in the relevant places if we need fields to be
 * optional.
 */
export interface LookAheadData {}

/**
 * This contains all the possibilities for lookahead data, once "baked". It's
 * an object that maps from key (string) to an array of entries for that type.
 *
 * We made this generic so that TypeScript has to look it up _after_ the
 * declaration merging has taken place, rather than computing it as an empty
 * object ahead of time.
 */
export type ResolvedLookAhead<T extends LookAheadData = LookAheadData> = {
  [P in keyof T]?: Array<T[P]>;
};

export interface Inflection extends InflectionBase {}

export type ConstructorByType = {
  GraphQLSchema: typeof GraphQLSchema;
  GraphQLScalarType: typeof GraphQLScalarType;
  GraphQLObjectType: typeof GraphQLObjectType;
  GraphQLInterfaceType: typeof GraphQLInterfaceType;
  GraphQLUnionType: typeof GraphQLUnionType;
  GraphQLEnumType: typeof GraphQLEnumType;
  GraphQLInputObjectType: typeof GraphQLInputObjectType;
};

export type ConfigByType = {
  GraphQLSchema: Partial<GraphQLSchemaConfig>;
  GraphQLScalarType: GraphQLScalarTypeConfig<any, any>;
  GraphQLObjectType: GraphileObjectTypeConfig<any, any>;
  GraphQLInterfaceType: GraphileInterfaceTypeConfig<any, any>;
  GraphQLUnionType: GraphileUnionTypeConfig<any, any>;
  GraphQLEnumType: GraphQLEnumTypeConfig;
  GraphQLInputObjectType: GraphileInputObjectTypeConfig;
};

export type FieldConfigByType = {
  GraphQLObjectType: GraphQLFieldConfig<any, any>;
  GraphQLInputObjectType: GraphQLInputFieldConfig;
};

export interface GraphileObjectTypeConfig<
  TSource,
  TContext,
  TArgs = { [key: string]: any }
> extends Omit<GraphQLObjectTypeConfig<TSource, TContext, TArgs>, "fields"> {
  fields?:
    | GraphQLFieldConfigMap<TSource, TContext, TArgs>
    | ((
        context: ContextGraphQLObjectTypeFields
      ) => GraphQLFieldConfigMap<TSource, TContext, TArgs>);
}

export interface GraphileInterfaceTypeConfig<
  TSource,
  TContext,
  TArgs = { [key: string]: any }
> extends Omit<GraphQLInterfaceTypeConfig<TSource, TContext, TArgs>, "fields"> {
  fields?:
    | GraphQLFieldConfigMap<TSource, TContext, TArgs>
    | ((
        context: ContextGraphQLInterfaceTypeFields
      ) => GraphQLFieldConfigMap<TSource, TContext, TArgs>);
}

export interface GraphileInputObjectTypeConfig
  extends Omit<GraphQLInputObjectTypeConfig, "fields"> {
  fields?:
    | GraphQLInputFieldConfigMap
    | ((
        context: ContextGraphQLInputObjectTypeFields
      ) => GraphQLInputFieldConfigMap);
}

export interface GraphileUnionTypeConfig<TSource, TContext>
  extends Omit<GraphQLUnionTypeConfig<TSource, TContext>, "types"> {
  types?:
    | GraphQLObjectType[]
    | ((context: ContextGraphQLUnionTypeTypes) => GraphQLObjectType[]);
}

export interface BuildBase {
  options: GraphileBuildOptions;
  graphileBuildVersion: string;
  versions: {
    [packageName: string]: string;
  };
  hasVersion(
    packageName: string,
    range: string,
    options?: { includePrerelease?: boolean }
  ): boolean;

  _pluginMeta: any /*{ [key: symbol]: any }*/;

  graphql: typeof import("graphql");
  parseResolveInfo: typeof import("graphql-parse-resolve-info").parseResolveInfo;
  simplifyParsedResolveInfoFragmentWithType: typeof import("graphql-parse-resolve-info").simplifyParsedResolveInfoFragmentWithType;

  // DEPRECATED: getAliasFromResolveInfo: (resolveInfo: GraphQLResolveInfo) => string,
  getSafeAliasFromResolveInfo: (resolveInfo: GraphQLResolveInfo) => string;
  getSafeAliasFromAlias: (alias: string) => string;
  resolveAlias: (
    data: {},
    _args: unknown,
    _context: unknown,
    resolveInfo: GraphQLResolveInfo
  ) => string;

  addType: (type: GraphQLNamedType, origin: string | null | undefined) => void;
  getTypeByName: (typeName: string) => GraphQLType | null | undefined;

  extend: <Obj1 extends object, Obj2 extends object>(
    base: Obj1,
    extra: Obj2,
    hint: string
  ) => Obj1 & Obj2;

  newWithHooks<T extends keyof ConstructorByType>(
    constructor: ConstructorByType[T],
    spec: ConfigByType[T],
    scope: ScopeByType[T]
  ): InstanceType<ConstructorByType[T]>;
  newWithHooks<T extends keyof ConstructorByType>(
    constructor: ConstructorByType[T],
    spec: ConfigByType[T],
    scope: ScopeByType[T],
    performNonEmptyFieldsCheck?: boolean
  ): InstanceType<ConstructorByType[T]> | null;

  /**
   * @deprecated use fieldDataGeneratorsByFieldNameByType instead (they're the same, but that one is named better)
   */
  fieldDataGeneratorsByType: Map<
    GraphQLNamedType,
    { [fieldName: string]: DataGeneratorFunction[] }
  >;

  fieldDataGeneratorsByFieldNameByType: Map<
    GraphQLNamedType,
    { [fieldName: string]: DataGeneratorFunction[] }
  >;
  fieldArgDataGeneratorsByFieldNameByType: Map<
    GraphQLNamedType,
    { [fieldName: string]: ArgDataGeneratorFunction[] }
  >;
  scopeByType: Map<GraphQLType, SomeScope>;

  inflection: Inflection;

  swallowError: (e: Error) => void;

  // resolveNode: EXPERIMENTAL, API might change!
  resolveNode: typeof import("./resolveNode").default;

  status: {
    currentHookName: string | null | undefined;
    currentHookEvent: string | null | undefined;
  };

  liveCoordinator: LiveCoordinator;
}

export interface Build extends BuildBase {
  // QueryPlugin
  $$isQuery: symbol;

  // NodePlugin
  nodeIdFieldName: string;
  $$nodeType: symbol;
  nodeFetcherByTypeName: { [typeName: string]: NodeFetcher };
  getNodeIdForTypeAndIdentifiers: (
    Type: import("graphql").GraphQLType,
    ...identifiers: Array<unknown>
  ) => string;
  getTypeAndIdentifiersFromNodeId: (
    nodeId: string
  ) => {
    Type: import("graphql").GraphQLType;
    identifiers: Array<unknown>;
  };

  addNodeFetcherForTypeName: (typeName: string, fetcher: NodeFetcher) => void;
  getNodeAlias: (typeName: string) => string;
  getNodeType: (alias: string) => import("graphql").GraphQLType;
  setNodeAlias: (typeName: string, alias: string) => void;
}

export interface Scope {
  __origin?: string | null | undefined;
  directives?: DirectiveMap;
}

export type DataGeneratorFunction = {
  (
    parsedResolveInfoFragment: ResolveTree,
    ReturnType: GraphQLOutputType,
    data: ResolvedLookAhead
  ): Partial<LookAheadData>;
  displayName?: string;
};

export type ArgDataGeneratorFunction = {
  (
    args: { [key: string]: unknown },
    ReturnType: GraphQLOutputType,
    data: ResolvedLookAhead
  ): Partial<LookAheadData>;
  displayName?: string;
};

export interface Context {
  scope: Scope;
  type:
    | "Build"
    | "Inflection"
    | "Init"
    | "GraphQLSchema"
    | "GraphQLScalarType"
    | "GraphQLObjectType"
    | "GraphQLInterfaceType"
    | "GraphQLUnionType"
    | "GraphQLEnumType"
    | "GraphQLInputObjectType"
    | "Finalize";
}

export type ScopeByType = {
  GraphQLSchema: ScopeGraphQLSchema;
  GraphQLScalarType: ScopeGraphQLScalarType;
  GraphQLObjectType: ScopeGraphQLObjectType;
  GraphQLInterfaceType: ScopeGraphQLInterfaceType;
  GraphQLUnionType: ScopeGraphQLUnionType;
  GraphQLEnumType: ScopeGraphQLEnumType;
  GraphQLInputObjectType: ScopeGraphQLInputObjectType;
};
export type ScopeByHook = ScopeByType & {
  Build: ScopeBuild;
  Inflection: ScopeInflection;
  Init: ScopeInit;
  Finalize: ScopeFinalize;
  "GraphQLObjectType:interfaces": ScopeGraphQLObjectTypeInterfaces;
  "GraphQLObjectType:fields": ScopeGraphQLObjectTypeFields;
  "GraphQLObjectType:fields:field": ScopeGraphQLObjectTypeFieldsField;
  "GraphQLObjectType:fields:field:args": ScopeGraphQLObjectTypeFieldsFieldArgs;
  "GraphQLUnionType:types": ScopeGraphQLUnionTypeTypes;
  "GraphQLEnumType:values": ScopeGraphQLEnumTypeValues;
  "GraphQLEnumType:values:value": ScopeGraphQLEnumTypeValuesValue;
  "GraphQLInputType:fields": ScopeGraphQLInputObjectTypeFields;
  "GraphQLInputType:fields:field": ScopeGraphQLInputObjectTypeFieldsField;
};

export type ContextByType = {
  GraphQLSchema: ContextGraphQLSchema;
  GraphQLScalarType: ContextGraphQLScalarType;
  GraphQLObjectType: ContextGraphQLObjectType;
  GraphQLInterfaceType: ContextGraphQLInterfaceType;
  GraphQLUnionType: ContextGraphQLUnionType;
  GraphQLEnumType: ContextGraphQLEnumType;
  GraphQLInputObjectType: ContextGraphQLInputObjectType;
};
export type ContextByHook = ContextByType & {
  build: ContextBuild;
  inflection: ContextInflection;
  init: ContextInit;
  finalize: ContextFinalize;
  "GraphQLObjectType:interfaces": ContextGraphQLObjectTypeInterfaces;
  "GraphQLObjectType:fields": ContextGraphQLObjectTypeFields;
  "GraphQLObjectType:fields:field": ContextGraphQLObjectTypeFieldsField;
  "GraphQLObjectType:fields:field:args": ContextGraphQLObjectTypeFieldsFieldArgs;
  "GraphQLUnionType:types": ContextGraphQLUnionTypeTypes;
  "GraphQLEnumType:values": ContextGraphQLEnumTypeValues;
  "GraphQLEnumType:values:value": ContextGraphQLEnumTypeValuesValue;
  "GraphQLInputObjectType:fields": ContextGraphQLInputObjectTypeFields;
  "GraphQLInputObjectType:fields:field": ContextGraphQLInputObjectTypeFieldsField;
};

export interface ScopeBuild extends Scope {}
export interface ContextBuild extends Context {
  scope: ScopeBuild;
  type: "Build";
}

export interface ScopeInflection extends Scope {}
export interface ContextInflection extends Context {
  scope: ScopeInflection;
  type: "Inflection";
}

export interface ScopeInit extends Scope {}
export interface ContextInit extends Context {
  scope: ScopeInit;
  type: "Init";
}

export interface ScopeGraphQLSchema extends Scope {
  isSchema: true;
}
export interface ContextGraphQLSchema extends Context {
  scope: ScopeGraphQLSchema;
  type: "GraphQLSchema";
}

export interface ScopeGraphQLScalarType extends Scope {}
export interface ContextGraphQLScalarType extends Context {
  scope: ScopeGraphQLScalarType;
  type: "GraphQLScalarType";
}

export interface ScopeGraphQLObjectType extends Scope {
  isRootQuery?: boolean;
  isRootMutation?: boolean;
  isRootSubscription?: boolean;
  isMutationPayload?: boolean;
  isPageInfo?: boolean;
}
export interface ContextGraphQLObjectTypeBase extends Context {
  scope: ScopeGraphQLObjectType;
  type: "GraphQLObjectType";
}
export interface ContextGraphQLObjectType extends ContextGraphQLObjectTypeBase {
  addDataGeneratorForField: (
    fieldName: string,
    fn: DataGeneratorFunction
  ) => void;
  /** YOU PROBABLY DON'T WANT THIS! */
  recurseDataGeneratorsForField(
    fieldName: string,
    iKnowWhatIAmDoing?: boolean
  ): void;
}

export interface ScopeGraphQLObjectTypeInterfaces
  extends ScopeGraphQLObjectType {}
export interface ContextGraphQLObjectTypeInterfaces
  extends ContextGraphQLObjectTypeBase {
  scope: ScopeGraphQLObjectTypeInterfaces;
  Self: GraphQLObjectType;
  GraphQLObjectType: GraphileObjectTypeConfig<any, any>;
}

export interface ScopeGraphQLObjectTypeFields extends ScopeGraphQLObjectType {}
export interface ContextGraphQLObjectTypeFields
  extends ContextGraphQLObjectType {
  scope: ScopeGraphQLObjectTypeFields;
  addDataGeneratorForField: (
    fieldName: string,
    fn: DataGeneratorFunction
  ) => void;
  recurseDataGeneratorsForField: (
    fieldName: string,
    iKnowWhatIAmDoing: boolean
  ) => void; // @deprecated - DO NOT USE!
  Self: GraphQLObjectType;
  GraphQLObjectType: GraphQLObjectTypeConfig<any, any>;
  fieldWithHooks: FieldWithHooksFunction;
}

export interface ScopeGraphQLObjectTypeFieldsField
  extends ScopeGraphQLObjectType {
  fieldName?: string;
  autoField?: boolean;
  fieldDirectives?: DirectiveMap;

  isLiveField?: boolean;
  originalField?: import("graphql").GraphQLField<any, any>;
  isRootNodeField?: boolean;
  isPageInfoHasNextPageField?: boolean;
  isPageInfoHasPreviousPageField?: boolean;
}
export interface ScopeGraphQLObjectTypeFieldsFieldWithFieldName
  extends ScopeGraphQLObjectTypeFieldsField {
  fieldName: string;
}
export interface ContextGraphQLObjectTypeFieldsField
  extends ContextGraphQLObjectTypeBase {
  scope: ScopeGraphQLObjectTypeFieldsFieldWithFieldName;
  Self: GraphQLObjectType;
  addDataGenerator: (fn: DataGeneratorFunction) => void;
  addArgDataGenerator: (fn: ArgDataGeneratorFunction) => void;
  getDataFromParsedResolveInfoFragment: GetDataFromParsedResolveInfoFragmentFunction;
}

export interface ScopeGraphQLObjectTypeFieldsFieldArgs
  extends ScopeGraphQLObjectTypeFieldsField {
  fieldName: string;
}
export interface ContextGraphQLObjectTypeFieldsFieldArgs
  extends ContextGraphQLObjectTypeFieldsField {
  scope: ScopeGraphQLObjectTypeFieldsFieldArgs;
  Self: GraphQLObjectType;
  field: GraphQLFieldConfig<any, any>;
  returnType: GraphQLOutputType;
}

export interface ScopeGraphQLInterfaceType extends Scope {}
export interface ContextGraphQLInterfaceTypeBase extends Context {
  scope: ScopeGraphQLInterfaceType;
  type: "GraphQLInterfaceType";
}

export interface ContextGraphQLInterfaceType
  extends ContextGraphQLInterfaceTypeBase {
  /*
  addDataGeneratorForField: (
    fieldName: string,
    fn: DataGeneratorFunction
  ) => void;
  */
}

export interface ScopeGraphQLInterfaceTypeFields
  extends ScopeGraphQLInterfaceType {}
export interface ContextGraphQLInterfaceTypeFields
  extends ContextGraphQLInterfaceType {
  scope: ScopeGraphQLInterfaceTypeFields;
  /*
  addDataGeneratorForField: (
    fieldName: string,
    fn: DataGeneratorFunction
  ) => void;
  */
  Self: GraphQLInterfaceType;
  GraphQLInterfaceType: GraphQLInterfaceTypeConfig<any, any>;
  /*
  fieldWithHooks: FieldWithHooksFunction;
  */
}

export interface ScopeGraphQLInterfaceTypeFieldsField
  extends ScopeGraphQLInterfaceType {
  fieldName?: string;
}
export interface ScopeGraphQLInterfaceTypeFieldsFieldWithFieldName
  extends ScopeGraphQLInterfaceTypeFieldsField {
  fieldName: string;
}
export interface ContextGraphQLInterfaceTypeFieldsField
  extends ContextGraphQLInterfaceTypeBase {
  scope: ScopeGraphQLInterfaceTypeFieldsFieldWithFieldName;
  Self: GraphQLInterfaceType;
  /*
  addDataGenerator: (fn: DataGeneratorFunction) => void;
  addArgDataGenerator: (fn: ArgDataGeneratorFunction) => void;
  getDataFromParsedResolveInfoFragment: GetDataFromParsedResolveInfoFragmentFunction;
  */
}

export interface ScopeGraphQLInterfaceTypeFieldsFieldArgs
  extends ScopeGraphQLInterfaceTypeFieldsField {
  fieldName: string;
}
export interface ContextGraphQLInterfaceTypeFieldsFieldArgs
  extends ContextGraphQLInterfaceTypeFieldsField {
  scope: ScopeGraphQLInterfaceTypeFieldsFieldArgs;
  Self: GraphQLInterfaceType;
  field: GraphQLFieldConfig<any, any>;
  returnType: GraphQLOutputType;
}

export interface ScopeGraphQLUnionType extends Scope {}
export interface ContextGraphQLUnionType extends Context {
  scope: ScopeGraphQLUnionType;
  type: "GraphQLUnionType";
}

export interface ScopeGraphQLUnionTypeTypes extends ScopeGraphQLUnionType {}
export interface ContextGraphQLUnionTypeTypes extends ContextGraphQLUnionType {
  scope: ScopeGraphQLUnionTypeTypes;
  Self: GraphQLUnionType;
  GraphQLUnionType: GraphileUnionTypeConfig<any, any>;
}

export interface ScopeGraphQLInputObjectType extends Scope {
  isMutationInput?: boolean;
}
export interface ContextGraphQLInputObjectType extends Context {
  scope: ScopeGraphQLInputObjectType;
  type: "GraphQLInputObjectType";
}

export interface ScopeGraphQLInputObjectTypeFields
  extends ScopeGraphQLInputObjectType {}
export interface ContextGraphQLInputObjectTypeFields
  extends ContextGraphQLInputObjectType {
  scope: ScopeGraphQLInputObjectTypeFields;
  Self: GraphQLInputObjectType;
  GraphQLInputObjectType: GraphileInputObjectTypeConfig;
  fieldWithHooks: InputFieldWithHooksFunction;
}

export interface ScopeGraphQLInputObjectTypeFieldsField
  extends ScopeGraphQLInputObjectType {
  fieldName?: string;
  autoField?: boolean;
}
export interface ScopeGraphQLInputObjectTypeFieldsFieldWithFieldName
  extends ScopeGraphQLInputObjectTypeFieldsField {
  fieldName: string;
}
export interface ContextGraphQLInputObjectTypeFieldsField
  extends ContextGraphQLInputObjectType {
  scope: ScopeGraphQLInputObjectTypeFieldsFieldWithFieldName;
  Self: GraphQLInputObjectType;
}

export interface ScopeGraphQLEnumType extends Scope {}
export interface ContextGraphQLEnumType extends Context {
  scope: ScopeGraphQLEnumType;
  type: "GraphQLEnumType";
}

export interface ScopeGraphQLEnumTypeValues extends ScopeGraphQLEnumType {}
export interface ContextGraphQLEnumTypeValues extends ContextGraphQLEnumType {
  scope: ScopeGraphQLEnumTypeValues;
}

export interface ScopeGraphQLEnumTypeValuesValue extends ScopeGraphQLEnumType {}
export interface ContextGraphQLEnumTypeValuesValue
  extends ContextGraphQLEnumType {
  scope: ScopeGraphQLEnumTypeValuesValue;
}

export interface ScopeFinalize extends Scope {}
export interface ContextFinalize extends Context {
  scope: ScopeFinalize;
  type: "Finalize";
}

export type SomeScope =
  | Scope
  | ScopeBuild
  | ScopeInflection
  | ScopeInit
  | ScopeGraphQLSchema
  | ScopeGraphQLScalarType
  | ScopeGraphQLObjectType
  | ScopeGraphQLObjectTypeInterfaces
  | ScopeGraphQLObjectTypeFields
  | ScopeGraphQLObjectTypeFieldsField
  | ScopeGraphQLObjectTypeFieldsFieldWithFieldName
  | ScopeGraphQLObjectTypeFieldsFieldArgs
  | ScopeGraphQLInterfaceType
  | ScopeGraphQLInterfaceTypeFields
  | ScopeGraphQLInterfaceTypeFieldsField
  | ScopeGraphQLInterfaceTypeFieldsFieldWithFieldName
  | ScopeGraphQLInterfaceTypeFieldsFieldArgs
  | ScopeGraphQLUnionType
  | ScopeGraphQLUnionTypeTypes
  | ScopeGraphQLInputObjectType
  | ScopeGraphQLInputObjectTypeFields
  | ScopeGraphQLInputObjectTypeFieldsField
  | ScopeGraphQLInputObjectTypeFieldsFieldWithFieldName
  | ScopeGraphQLEnumType
  | ScopeGraphQLEnumTypeValues
  | ScopeGraphQLEnumTypeValuesValue
  | ScopeFinalize;

interface Hook<Type, TContext extends Context, TBuild = Build> {
  (input: Type, build: TBuild, context: TContext): Type;
  displayName?: string;
  provides?: Array<string>;
  before?: Array<string>;
  after?: Array<string>;
}
type AnyHook = Hook<any, any, any>;

export type WatchUnwatch = (triggerChange: TriggerChangeType) => void;

export type SchemaListener = (newSchema: GraphQLSchema) => void;

type TypeByHook = ConfigByType & {
  build: Partial<Build> & BuildBase;
  inflection: Partial<Inflection> & InflectionBase;
  init: InitObject;
  GraphQLSchema: GraphQLSchemaConfig;
  "GraphQLObjectType:interfaces": GraphQLInterfaceType[];
  "GraphQLObjectType:fields": GraphQLFieldConfigMap<any, any>;
  "GraphQLObjectType:fields:field": GraphQLFieldConfig<any, any>;
  "GraphQLObjectType:fields:field:args": GraphQLFieldConfigArgumentMap;
  "GraphQLUnionType:types": GraphQLObjectType<any, any>[];
  "GraphQLEnumType:values": GraphQLEnumValueConfigMap;
  "GraphQLEnumType:values:value": GraphQLEnumValueConfig;
  "GraphQLInputObjectType:fields": GraphQLInputFieldConfigMap;
  "GraphQLInputObjectType:fields:field": GraphQLInputFieldConfig;
  finalize: GraphQLSchema;
};
type ResultTypeByHook = {
  build: Build;
  inflection: Inflection;
} & Omit<TypeByHook, "build" | "inflection">;

type Hooks = {
  [T in keyof TypeByHook & keyof ContextByHook]: Array<AnyHook>;
  /*  Hook<
      TypeByHook[T],
      ResultTypeByHook[T],
      ContextByHook[T],
      T extends "build" | "inflection" ? BuildBase : Build
    >
  > */
};

class SchemaBuilder extends EventEmitter {
  options: GraphileBuildOptions;
  watchers: Array<WatchUnwatch>;
  unwatchers: Array<WatchUnwatch>;
  triggerChange: TriggerChangeType | null | undefined;
  depth: number;
  hooks: Hooks;

  _currentPluginName: string | null | undefined;
  _generatedSchema: GraphQLSchema | null | undefined;
  _explicitSchemaListener: SchemaListener | null | undefined;
  _busy: boolean;
  _watching: boolean;

  constructor(options: GraphileBuildOptions) {
    super();

    this.options = options;
    if (!options) {
      throw new Error("Please pass options to SchemaBuilder");
    }

    this._busy = false;
    this._watching = false;

    this.watchers = [];
    this.unwatchers = [];

    // Because hooks can nest, this keeps track of how deep we are.
    this.depth = -1;

    this.hooks = {
      // The build object represents the current schema build and is passed to
      // all hooks, hook the 'build' event to extend this object:
      build: [],

      // Inflection is used for naming resulting types/fields/args/etc - it's
      // hookable so that other plugins may extend it or override it
      inflection: [],

      // 'build' phase should not generate any GraphQL objects (because the
      // build object isn't finalised yet so it risks weirdness occurring); so
      // if you need to set up any global types you can do so here.
      init: [],

      // 'finalize' phase is called once the schema is built; typically you
      // shouldn't use this, but it's useful for interfacing with external
      // libraries that mutate an already constructed schema.
      finalize: [],

      // Add 'query', 'mutation' or 'subscription' types in this hook:
      GraphQLSchema: [],

      GraphQLScalarType: [],

      // When creating a GraphQLObjectType via `newWithHooks`, we'll
      // execute, the following hooks:
      // - 'GraphQLObjectType' to add any root-level attributes, e.g. add a description
      // - 'GraphQLObjectType:interfaces' to add additional interfaces to this object type
      // - 'GraphQLObjectType:fields' to add additional fields to this object type (is
      //   ran asynchronously and gets a reference to the final GraphQL Object as
      //   `Self` in the context)
      // - 'GraphQLObjectType:fields:field' to customise an individual field from above
      // - 'GraphQLObjectType:fields:field:args' to customize the arguments to a field
      GraphQLObjectType: [],
      "GraphQLObjectType:interfaces": [],
      "GraphQLObjectType:fields": [],
      "GraphQLObjectType:fields:field": [],
      "GraphQLObjectType:fields:field:args": [],

      GraphQLInterfaceType: [],

      // When creating a GraphQLInputObjectType via `newWithHooks`, we'll
      // execute, the following hooks:
      // - 'GraphQLInputObjectType' to add any root-level attributes, e.g. add a description
      // - 'GraphQLInputObjectType:fields' to add additional fields to this object type (is
      //   ran asynchronously and gets a reference to the final GraphQL Object as
      //   `Self` in the context)
      // - 'GraphQLInputObjectType:fields:field' to customise an individual field from above
      GraphQLInputObjectType: [],
      "GraphQLInputObjectType:fields": [],
      "GraphQLInputObjectType:fields:field": [],

      // When creating a GraphQLEnumType via `newWithHooks`, we'll
      // execute, the following hooks:
      // - 'GraphQLEnumType' to add any root-level attributes, e.g. add a description
      // - 'GraphQLEnumType:values' to add additional values
      // - 'GraphQLEnumType:values:value' to change an individual value
      GraphQLEnumType: [],
      "GraphQLEnumType:values": [],
      "GraphQLEnumType:values:value": [],

      // When creating a GraphQLUnionType via `newWithHooks`, we'll
      // execute, the following hooks:
      // - 'GraphQLUnionType' to add any root-level attributes, e.g. add a description
      // - 'GraphQLUnionType:types' to add additional types to this union
      GraphQLUnionType: [],
      "GraphQLUnionType:types": [],
    };
  }

  _setPluginName(name: string | null | undefined) {
    this._currentPluginName = name;
  }

  /*
   * Every hook `fn` takes three arguments:
   * - obj - the object currently being inspected
   * - build - the current build object (which contains a number of utilities and the context of the build)
   * - context - information specific to the current invocation of the hook
   *
   * The function must either return a replacement object for `obj` or `obj` itself
   */
  hook<T extends keyof ContextByHook & keyof TypeByHook>(
    hookName: T,
    fn: Hook<
      TypeByHook[T],
      ContextByHook[T],
      T extends "build" | "inflection" ? BuildBase : Build
    >,
    provides?: Array<string>,
    before?: Array<string>,
    after?: Array<string>
  ): void {
    if (!this.hooks[hookName]) {
      throw new Error(`Sorry, '${hookName}' is not a supported hook`);
    }
    if (this._currentPluginName) {
      fn.displayName = `${this._currentPluginName}/${hookName}/${(provides &&
        provides.length &&
        provides.join("+")) ||
        fn.displayName ||
        fn.name ||
        "unnamed"}`;
    }
    if (provides) {
      if (!fn.displayName && provides.length) {
        fn.displayName = `unknown/${hookName}/${provides[0]}`;
      }
      fn.provides = provides;
    }
    if (before) {
      fn.before = before;
    }
    if (after) {
      fn.after = after;
    }
    if (!fn.provides && !fn.before && !fn.after) {
      // No explicit dependencies - add to the end
      this.hooks[hookName].push(fn);
    } else {
      // We need to figure out where it can go, respecting all the dependencies.
      // TODO: I think there are situations in which this algorithm may result in unnecessary conflict errors; we should take a more iterative approach or find a better algorithm
      const relevantHooks = this.hooks[hookName];
      let minIndex = 0;
      let minReason: AnyHook | null = null;
      let maxIndex = relevantHooks.length;
      let maxReason: AnyHook | null = null;
      const { provides: newProvides, before: newBefore, after: newAfter } = fn;
      const describe = (hook: AnyHook | null, index?: number) => {
        if (!hook) {
          return "-";
        }
        return `${hook.displayName || hook.name || "anonymous"} (${
          index ? `index: ${index}, ` : ""
        }provides: ${hook.provides ? hook.provides.join(",") : "-"}, before: ${
          hook.before ? hook.before.join(",") : "-"
        }, after: ${hook.after ? hook.after.join(",") : "-"})`;
      };
      const check = () => {
        if (minIndex > maxIndex) {
          throw new Error(
            `Cannot resolve plugin order - ${describe(
              fn
            )} cannot be before ${describe(
              maxReason,
              maxIndex
            )} and after ${describe(
              minReason,
              minIndex
            )} - please report this issue`
          );
        }
      };
      const setMin = (newMin: number, reason: AnyHook) => {
        if (newMin > minIndex) {
          minIndex = newMin;
          minReason = reason;
          check();
        }
      };
      const setMax = (newMax: number, reason: AnyHook) => {
        if (newMax < maxIndex) {
          maxIndex = newMax;
          maxReason = reason;
          check();
        }
      };
      relevantHooks.forEach((oldHook, idx) => {
        const {
          provides: oldProvides,
          before: oldBefore,
          after: oldAfter,
        } = oldHook;
        if (newProvides) {
          if (oldBefore && oldBefore.some(dep => newProvides.includes(dep))) {
            // Old says it has to come before new
            setMin(idx + 1, oldHook);
          }
          if (oldAfter && oldAfter.some(dep => newProvides.includes(dep))) {
            // Old says it has to be after new
            setMax(idx, oldHook);
          }
        }
        if (oldProvides) {
          if (newBefore && newBefore.some(dep => oldProvides.includes(dep))) {
            // New says it has to come before old
            setMax(idx, oldHook);
          }
          if (newAfter && newAfter.some(dep => oldProvides.includes(dep))) {
            // New says it has to be after old
            setMin(idx + 1, oldHook);
          }
        }
      });

      // We've already validated everything, so we can now insert the record.
      this.hooks[hookName].splice(maxIndex, 0, fn);
    }
  }

  applyHooks<T extends keyof TypeByHook & keyof ContextByHook>(
    build: T extends "build" | "inflection" ? BuildBase : Build,
    hookName: T,
    input: TypeByHook[T],
    context: ContextByHook[T],
    debugStr = ""
  ): ResultTypeByHook[T] {
    if (!input) {
      throw new Error("applyHooks was called with falsy input");
    }
    this.depth++;
    try {
      debug(`${INDENT.repeat(this.depth)}[${hookName}${debugStr}]: Running...`);

      const hooks: Hook<TypeByHook[T], ContextByHook[T], typeof build>[] = this
        .hooks[hookName];
      if (!hooks) {
        throw new Error(`Sorry, '${hookName}' is not a registered hook`);
      }

      let newObj = input as ResultTypeByHook[T];
      for (const hook of hooks) {
        this.depth++;
        try {
          const hookDisplayName = hook.displayName || hook.name || "anonymous";
          debug(
            `${INDENT.repeat(
              this.depth
            )}[${hookName}${debugStr}]:   Executing '${hookDisplayName}'`
          );

          const previousHookName = build.status.currentHookName;
          const previousHookEvent = build.status.currentHookEvent;
          build.status.currentHookName = hookDisplayName;
          build.status.currentHookEvent = hookName;
          const oldObj = newObj as TypeByHook[T];
          newObj = hook(oldObj, build, context) as ResultTypeByHook[T];
          if (hookName === "build") {
            /*
             * Unlike all the other hooks, the `build` hook must always use the
             * same `build` object - never returning a new object for fear of
             * causing issues to other build hooks that reference the old
             * object and don't get the new additions.
             */
            if (newObj !== oldObj) {
              // TODO:v5: forbid this
              // eslint-disable-next-line no-console
              console.warn(
                `Build hook '${hookDisplayName}' returned a new object; please use 'return build.extend(build, {...})' instead.`
              );

              // Copy everything from newObj back to oldObj
              // and go back to the old objectect
              newObj = Object.assign(oldObj, newObj);
            }
          }
          build.status.currentHookName = previousHookName;
          build.status.currentHookEvent = previousHookEvent;

          if (!newObj) {
            throw new Error(
              `Hook '${hookDisplayName}' for '${hookName}' returned falsy value '${newObj}'`
            );
          }
          debug(
            `${INDENT.repeat(
              this.depth
            )}[${hookName}${debugStr}]:   '${hookDisplayName}' complete`
          );
        } finally {
          this.depth--;
        }
      }

      debug(`${INDENT.repeat(this.depth)}[${hookName}${debugStr}]: Complete`);

      return newObj;
    } finally {
      this.depth--;
    }
  }

  registerWatcher(listen: WatchUnwatch, unlisten: WatchUnwatch): void {
    if (!listen || !unlisten) {
      throw new Error("You must provide both a listener and an unlistener");
    }
    this.watchers.push(listen);
    this.unwatchers.push(unlisten);
  }

  createBuild(): Build {
    const initialBuild = makeNewBuild(this);
    // Inflection needs to come first, in case 'build' hooks depend on it
    const scopeContext: ContextInflection = {
      scope: {},
      type: "Inflection",
    };
    initialBuild.inflection = this.applyHooks(
      initialBuild,
      "inflection",
      initialBuild.inflection,
      scopeContext
    );

    const build = this.applyHooks(initialBuild, "build", initialBuild, {
      scope: {},
      type: "Build",
    });

    // Bind all functions so they can be dereferenced
    bindAll(
      build,
      Object.keys(build).filter(key => typeof build[key] === "function")
    );

    Object.freeze(build);
    const initContext: ContextInit = { scope: {}, type: "Init" };
    const initObject: InitObject = {} as never;
    this.applyHooks(build, "init", initObject, initContext);
    return build;
  }

  buildSchema(): GraphQLSchema {
    if (!this._generatedSchema) {
      const build = this.createBuild();
      const schemaSpec: Partial<GraphQLSchemaConfig> = {
        directives: [...build.graphql.specifiedDirectives],
      };
      const schemaScope: ScopeGraphQLSchema = {
        __origin: `GraphQL built-in`,
        isSchema: true,
      };
      const schema = build.newWithHooks<"GraphQLSchema">(
        GraphQLSchema,
        schemaSpec,
        schemaScope
      );

      const finalizeContext: ContextFinalize = {
        scope: {},
        type: "Finalize",
      };
      this._generatedSchema = schema
        ? this.applyHooks(
            build,
            "finalize",
            schema,
            finalizeContext,
            "Finalising GraphQL schema"
          )
        : schema;
    }
    if (!this._generatedSchema) {
      throw new Error("Schema generation failed");
    }
    return this._generatedSchema;
  }

  async watchSchema(listener?: SchemaListener): Promise<void> {
    if (this._busy) {
      throw new Error("An operation is in progress");
    }
    if (this._watching) {
      throw new Error(
        "We're already watching this schema! Use `builder.on('schema', callback)` instead."
      );
    }
    try {
      this._busy = true;
      this._explicitSchemaListener = listener;

      // We want to ignore `triggerChange` calls that occur whilst we're setting
      // up the listeners to prevent an unnecessary double schema build.
      let ignoreChangeTriggers = true;

      this.triggerChange = () => {
        if (ignoreChangeTriggers) {
          return;
        }
        this._generatedSchema = null;
        // XXX: optionally debounce
        try {
          const schema = this.buildSchema();
          this.emit("schema", schema);
        } catch (e) {
          // Build errors introduced while watching are ignored because it's
          // primarily used in development.
          // eslint-disable-next-line no-console
          console.error(
            "⚠️⚠️⚠️ An error occured when building the schema on watch:"
          );

          // eslint-disable-next-line no-console
          console.error(e);
        }
      };
      for (const fn of this.watchers) {
        await fn(this.triggerChange);
      }

      // Now we're about to build the first schema, any further `triggerChange`
      // calls should be honoured.
      ignoreChangeTriggers = false;

      if (listener) {
        this.on("schema", listener);
      }
      this.emit("schema", this.buildSchema());

      this._watching = true;
    } finally {
      this._busy = false;
    }
  }

  async unwatchSchema(): Promise<void> {
    if (this._busy) {
      throw new Error("An operation is in progress");
    }
    if (!this._watching) {
      throw new Error("We're not watching this schema!");
    }
    this._busy = true;
    try {
      const listener = this._explicitSchemaListener;
      this._explicitSchemaListener = null;
      if (listener) {
        this.removeListener("schema", listener);
      }
      if (this.triggerChange) {
        for (const fn of this.unwatchers) {
          await fn(this.triggerChange);
        }
      }
      this.triggerChange = null;
      this._watching = false;
    } finally {
      this._busy = false;
    }
  }
}

export default SchemaBuilder;

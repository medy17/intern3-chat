/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as aggregates from "../aggregates.js";
import type * as analytics from "../analytics.js";
import type * as attachments from "../attachments.js";
import type * as chat_http_generate_thread_name from "../chat_http/generate_thread_name.js";
import type * as chat_http_get_model from "../chat_http/get_model.js";
import type * as chat_http_image_generation from "../chat_http/image_generation.js";
import type * as chat_http_manual_stream_transform from "../chat_http/manual_stream_transform.js";
import type * as chat_http_prompt from "../chat_http/prompt.js";
import type * as chat_http_shared from "../chat_http/shared.js";
import type * as chat_http_vertex_stream from "../chat_http/vertex_stream.js";
import type * as credits from "../credits.js";
import type * as crons from "../crons.js";
import type * as folders from "../folders.js";
import type * as http from "../http.js";
import type * as image_collections from "../image_collections.js";
import type * as images from "../images.js";
import type * as images_node from "../images_node.js";
import type * as import_jobs from "../import_jobs.js";
import type * as import_jobs_http from "../import_jobs_http.js";
import type * as import_jobs_mirror_node from "../import_jobs_mirror_node.js";
import type * as import_jobs_node from "../import_jobs_node.js";
import type * as lib_backend_to_ui_messages from "../lib/backend_to_ui_messages.js";
import type * as lib_credits from "../lib/credits.js";
import type * as lib_db_to_core_messages from "../lib/db_to_core_messages.js";
import type * as lib_encryption from "../lib/encryption.js";
import type * as lib_file_constants from "../lib/file_constants.js";
import type * as lib_google_auth from "../lib/google_auth.js";
import type * as lib_google_provider from "../lib/google_provider.js";
import type * as lib_identity from "../lib/identity.js";
import type * as lib_internal_provider_config from "../lib/internal_provider_config.js";
import type * as lib_models from "../lib/models.js";
import type * as lib_models_anthropic from "../lib/models/anthropic.js";
import type * as lib_models_deepseek from "../lib/models/deepseek.js";
import type * as lib_models_google from "../lib/models/google.js";
import type * as lib_models_lifecycle from "../lib/models/lifecycle.js";
import type * as lib_models_meta from "../lib/models/meta.js";
import type * as lib_models_minimax from "../lib/models/minimax.js";
import type * as lib_models_moonshot from "../lib/models/moonshot.js";
import type * as lib_models_openai from "../lib/models/openai.js";
import type * as lib_models_openrouter from "../lib/models/openrouter.js";
import type * as lib_models_qwen from "../lib/models/qwen.js";
import type * as lib_models_types from "../lib/models/types.js";
import type * as lib_models_xai from "../lib/models/xai.js";
import type * as lib_models_xiaomi from "../lib/models/xiaomi.js";
import type * as lib_models_zai from "../lib/models/zai.js";
import type * as lib_personas from "../lib/personas.js";
import type * as lib_provider_factory from "../lib/provider_factory.js";
import type * as lib_resumable_stream_context from "../lib/resumable_stream_context.js";
import type * as lib_thread_import_core from "../lib/thread_import_core.js";
import type * as lib_toolkit from "../lib/toolkit.js";
import type * as lib_tools_adapters_brave_search_adapter from "../lib/tools/adapters/brave_search_adapter.js";
import type * as lib_tools_adapters_firecrawl_search_adapter from "../lib/tools/adapters/firecrawl_search_adapter.js";
import type * as lib_tools_adapters_index from "../lib/tools/adapters/index.js";
import type * as lib_tools_adapters_search_adapter from "../lib/tools/adapters/search_adapter.js";
import type * as lib_tools_adapters_search_provider from "../lib/tools/adapters/search_provider.js";
import type * as lib_tools_adapters_serper_search_adapter from "../lib/tools/adapters/serper_search_adapter.js";
import type * as lib_tools_adapters_tavily_search_adapter from "../lib/tools/adapters/tavily_search_adapter.js";
import type * as lib_tools_availability from "../lib/tools/availability.js";
import type * as lib_tools_mcp_adapter from "../lib/tools/mcp_adapter.js";
import type * as lib_tools_supermemory from "../lib/tools/supermemory.js";
import type * as lib_tools_web_search from "../lib/tools/web_search.js";
import type * as messages from "../messages.js";
import type * as migrations from "../migrations.js";
import type * as persona_uploads from "../persona_uploads.js";
import type * as personas from "../personas.js";
import type * as private_blur from "../private_blur.js";
import type * as private_blur_node from "../private_blur_node.js";
import type * as schema_credits from "../schema/credits.js";
import type * as schema_folders from "../schema/folders.js";
import type * as schema_generated_image from "../schema/generated_image.js";
import type * as schema_image_collections from "../schema/image_collections.js";
import type * as schema_import_job from "../schema/import_job.js";
import type * as schema_message from "../schema/message.js";
import type * as schema_parts from "../schema/parts.js";
import type * as schema_persona from "../schema/persona.js";
import type * as schema_settings from "../schema/settings.js";
import type * as schema_streams from "../schema/streams.js";
import type * as schema_thread from "../schema/thread.js";
import type * as schema_usage from "../schema/usage.js";
import type * as settings from "../settings.js";
import type * as speech_to_text from "../speech_to_text.js";
import type * as streams from "../streams.js";
import type * as threads from "../threads.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  aggregates: typeof aggregates;
  analytics: typeof analytics;
  attachments: typeof attachments;
  "chat_http/generate_thread_name": typeof chat_http_generate_thread_name;
  "chat_http/get_model": typeof chat_http_get_model;
  "chat_http/image_generation": typeof chat_http_image_generation;
  "chat_http/manual_stream_transform": typeof chat_http_manual_stream_transform;
  "chat_http/prompt": typeof chat_http_prompt;
  "chat_http/shared": typeof chat_http_shared;
  "chat_http/vertex_stream": typeof chat_http_vertex_stream;
  credits: typeof credits;
  crons: typeof crons;
  folders: typeof folders;
  http: typeof http;
  image_collections: typeof image_collections;
  images: typeof images;
  images_node: typeof images_node;
  import_jobs: typeof import_jobs;
  import_jobs_http: typeof import_jobs_http;
  import_jobs_mirror_node: typeof import_jobs_mirror_node;
  import_jobs_node: typeof import_jobs_node;
  "lib/backend_to_ui_messages": typeof lib_backend_to_ui_messages;
  "lib/credits": typeof lib_credits;
  "lib/db_to_core_messages": typeof lib_db_to_core_messages;
  "lib/encryption": typeof lib_encryption;
  "lib/file_constants": typeof lib_file_constants;
  "lib/google_auth": typeof lib_google_auth;
  "lib/google_provider": typeof lib_google_provider;
  "lib/identity": typeof lib_identity;
  "lib/internal_provider_config": typeof lib_internal_provider_config;
  "lib/models": typeof lib_models;
  "lib/models/anthropic": typeof lib_models_anthropic;
  "lib/models/deepseek": typeof lib_models_deepseek;
  "lib/models/google": typeof lib_models_google;
  "lib/models/lifecycle": typeof lib_models_lifecycle;
  "lib/models/meta": typeof lib_models_meta;
  "lib/models/minimax": typeof lib_models_minimax;
  "lib/models/moonshot": typeof lib_models_moonshot;
  "lib/models/openai": typeof lib_models_openai;
  "lib/models/openrouter": typeof lib_models_openrouter;
  "lib/models/qwen": typeof lib_models_qwen;
  "lib/models/types": typeof lib_models_types;
  "lib/models/xai": typeof lib_models_xai;
  "lib/models/xiaomi": typeof lib_models_xiaomi;
  "lib/models/zai": typeof lib_models_zai;
  "lib/personas": typeof lib_personas;
  "lib/provider_factory": typeof lib_provider_factory;
  "lib/resumable_stream_context": typeof lib_resumable_stream_context;
  "lib/thread_import_core": typeof lib_thread_import_core;
  "lib/toolkit": typeof lib_toolkit;
  "lib/tools/adapters/brave_search_adapter": typeof lib_tools_adapters_brave_search_adapter;
  "lib/tools/adapters/firecrawl_search_adapter": typeof lib_tools_adapters_firecrawl_search_adapter;
  "lib/tools/adapters/index": typeof lib_tools_adapters_index;
  "lib/tools/adapters/search_adapter": typeof lib_tools_adapters_search_adapter;
  "lib/tools/adapters/search_provider": typeof lib_tools_adapters_search_provider;
  "lib/tools/adapters/serper_search_adapter": typeof lib_tools_adapters_serper_search_adapter;
  "lib/tools/adapters/tavily_search_adapter": typeof lib_tools_adapters_tavily_search_adapter;
  "lib/tools/availability": typeof lib_tools_availability;
  "lib/tools/mcp_adapter": typeof lib_tools_mcp_adapter;
  "lib/tools/supermemory": typeof lib_tools_supermemory;
  "lib/tools/web_search": typeof lib_tools_web_search;
  messages: typeof messages;
  migrations: typeof migrations;
  persona_uploads: typeof persona_uploads;
  personas: typeof personas;
  private_blur: typeof private_blur;
  private_blur_node: typeof private_blur_node;
  "schema/credits": typeof schema_credits;
  "schema/folders": typeof schema_folders;
  "schema/generated_image": typeof schema_generated_image;
  "schema/image_collections": typeof schema_image_collections;
  "schema/import_job": typeof schema_import_job;
  "schema/message": typeof schema_message;
  "schema/parts": typeof schema_parts;
  "schema/persona": typeof schema_persona;
  "schema/settings": typeof schema_settings;
  "schema/streams": typeof schema_streams;
  "schema/thread": typeof schema_thread;
  "schema/usage": typeof schema_usage;
  settings: typeof settings;
  speech_to_text: typeof speech_to_text;
  streams: typeof streams;
  threads: typeof threads;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  r2: {
    lib: {
      deleteMetadata: FunctionReference<
        "mutation",
        "internal",
        { bucket: string; key: string },
        null
      >;
      deleteObject: FunctionReference<
        "mutation",
        "internal",
        {
          accessKeyId: string;
          bucket: string;
          endpoint: string;
          forcePathStyle?: boolean;
          key: string;
          secretAccessKey: string;
        },
        null
      >;
      deleteR2Object: FunctionReference<
        "action",
        "internal",
        {
          accessKeyId: string;
          bucket: string;
          endpoint: string;
          forcePathStyle?: boolean;
          key: string;
          secretAccessKey: string;
        },
        null
      >;
      getMetadata: FunctionReference<
        "query",
        "internal",
        {
          accessKeyId: string;
          bucket: string;
          endpoint: string;
          forcePathStyle?: boolean;
          key: string;
          secretAccessKey: string;
        },
        {
          authorId?: string;
          bucket: string;
          bucketLink: string;
          contentType?: string;
          key: string;
          lastModified: string;
          link: string;
          sha256?: string;
          size?: number;
          url: string;
        } | null
      >;
      listMetadata: FunctionReference<
        "query",
        "internal",
        {
          accessKeyId: string;
          authorId?: string;
          bucket: string;
          cursor?: string;
          endpoint: string;
          forcePathStyle?: boolean;
          keyPrefix?: string;
          limit?: number;
          secretAccessKey: string;
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            authorId?: string;
            bucket: string;
            bucketLink: string;
            contentType?: string;
            key: string;
            lastModified: string;
            link: string;
            sha256?: string;
            size?: number;
            url: string;
          }>;
          pageStatus?: null | "SplitRecommended" | "SplitRequired";
          splitCursor?: null | string;
        }
      >;
      store: FunctionReference<
        "action",
        "internal",
        {
          accessKeyId: string;
          bucket: string;
          endpoint: string;
          forcePathStyle?: boolean;
          secretAccessKey: string;
          url: string;
        },
        any
      >;
      syncMetadata: FunctionReference<
        "action",
        "internal",
        {
          accessKeyId: string;
          authorId?: string;
          bucket: string;
          endpoint: string;
          forcePathStyle?: boolean;
          key: string;
          onComplete?: string;
          secretAccessKey: string;
        },
        null
      >;
      upsertMetadata: FunctionReference<
        "mutation",
        "internal",
        {
          authorId?: string;
          bucket: string;
          contentType?: string;
          key: string;
          lastModified: string;
          link: string;
          sha256?: string;
          size?: number;
        },
        { isNew: boolean }
      >;
    };
  };
  aggregateFolderThreads: {
    btree: {
      aggregateBetween: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; namespace?: any },
        { count: number; sum: number }
      >;
      aggregateBetweenBatch: FunctionReference<
        "query",
        "internal",
        { queries: Array<{ k1?: any; k2?: any; namespace?: any }> },
        Array<{ count: number; sum: number }>
      >;
      atNegativeOffset: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; namespace?: any; offset: number },
        { k: any; s: number; v: any }
      >;
      atOffset: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; namespace?: any; offset: number },
        { k: any; s: number; v: any }
      >;
      atOffsetBatch: FunctionReference<
        "query",
        "internal",
        {
          queries: Array<{
            k1?: any;
            k2?: any;
            namespace?: any;
            offset: number;
          }>;
        },
        Array<{ k: any; s: number; v: any }>
      >;
      get: FunctionReference<
        "query",
        "internal",
        { key: any; namespace?: any },
        null | { k: any; s: number; v: any }
      >;
      offset: FunctionReference<
        "query",
        "internal",
        { k1?: any; key: any; namespace?: any },
        number
      >;
      offsetUntil: FunctionReference<
        "query",
        "internal",
        { k2?: any; key: any; namespace?: any },
        number
      >;
      paginate: FunctionReference<
        "query",
        "internal",
        {
          cursor?: string;
          k1?: any;
          k2?: any;
          limit: number;
          namespace?: any;
          order: "asc" | "desc";
        },
        {
          cursor: string;
          isDone: boolean;
          page: Array<{ k: any; s: number; v: any }>;
        }
      >;
      paginateNamespaces: FunctionReference<
        "query",
        "internal",
        { cursor?: string; limit: number },
        { cursor: string; isDone: boolean; page: Array<any> }
      >;
      validate: FunctionReference<
        "query",
        "internal",
        { namespace?: any },
        any
      >;
    };
    inspect: {
      display: FunctionReference<"query", "internal", { namespace?: any }, any>;
      dump: FunctionReference<"query", "internal", { namespace?: any }, string>;
      inspectNode: FunctionReference<
        "query",
        "internal",
        { namespace?: any; node?: string },
        null
      >;
      listTreeNodes: FunctionReference<
        "query",
        "internal",
        { take?: number },
        Array<{
          _creationTime: number;
          _id: string;
          aggregate?: { count: number; sum: number };
          items: Array<{ k: any; s: number; v: any }>;
          subtrees: Array<string>;
        }>
      >;
      listTrees: FunctionReference<
        "query",
        "internal",
        { take?: number },
        Array<{
          _creationTime: number;
          _id: string;
          maxNodeSize: number;
          namespace?: any;
          root: string;
        }>
      >;
    };
    public: {
      clear: FunctionReference<
        "mutation",
        "internal",
        { maxNodeSize?: number; namespace?: any; rootLazy?: boolean },
        null
      >;
      delete_: FunctionReference<
        "mutation",
        "internal",
        { key: any; namespace?: any },
        null
      >;
      deleteIfExists: FunctionReference<
        "mutation",
        "internal",
        { key: any; namespace?: any },
        any
      >;
      init: FunctionReference<
        "mutation",
        "internal",
        { maxNodeSize?: number; namespace?: any; rootLazy?: boolean },
        null
      >;
      insert: FunctionReference<
        "mutation",
        "internal",
        { key: any; namespace?: any; summand?: number; value: any },
        null
      >;
      makeRootLazy: FunctionReference<
        "mutation",
        "internal",
        { namespace?: any },
        null
      >;
      replace: FunctionReference<
        "mutation",
        "internal",
        {
          currentKey: any;
          namespace?: any;
          newKey: any;
          newNamespace?: any;
          summand?: number;
          value: any;
        },
        null
      >;
      replaceOrInsert: FunctionReference<
        "mutation",
        "internal",
        {
          currentKey: any;
          namespace?: any;
          newKey: any;
          newNamespace?: any;
          summand?: number;
          value: any;
        },
        any
      >;
    };
  };
  migrations: {
    lib: {
      cancel: FunctionReference<
        "mutation",
        "internal",
        { name: string },
        {
          batchSize?: number;
          cursor?: string | null;
          error?: string;
          isDone: boolean;
          latestEnd?: number;
          latestStart: number;
          name: string;
          next?: Array<string>;
          processed: number;
          state: "inProgress" | "success" | "failed" | "canceled" | "unknown";
        }
      >;
      cancelAll: FunctionReference<
        "mutation",
        "internal",
        { sinceTs?: number },
        Array<{
          batchSize?: number;
          cursor?: string | null;
          error?: string;
          isDone: boolean;
          latestEnd?: number;
          latestStart: number;
          name: string;
          next?: Array<string>;
          processed: number;
          state: "inProgress" | "success" | "failed" | "canceled" | "unknown";
        }>
      >;
      clearAll: FunctionReference<
        "mutation",
        "internal",
        { before?: number },
        null
      >;
      getStatus: FunctionReference<
        "query",
        "internal",
        { limit?: number; names?: Array<string> },
        Array<{
          batchSize?: number;
          cursor?: string | null;
          error?: string;
          isDone: boolean;
          latestEnd?: number;
          latestStart: number;
          name: string;
          next?: Array<string>;
          processed: number;
          state: "inProgress" | "success" | "failed" | "canceled" | "unknown";
        }>
      >;
      migrate: FunctionReference<
        "mutation",
        "internal",
        {
          batchSize?: number;
          cursor?: string | null;
          dryRun: boolean;
          fnHandle: string;
          name: string;
          next?: Array<{ fnHandle: string; name: string }>;
        },
        {
          batchSize?: number;
          cursor?: string | null;
          error?: string;
          isDone: boolean;
          latestEnd?: number;
          latestStart: number;
          name: string;
          next?: Array<string>;
          processed: number;
          state: "inProgress" | "success" | "failed" | "canceled" | "unknown";
        }
      >;
    };
  };
};

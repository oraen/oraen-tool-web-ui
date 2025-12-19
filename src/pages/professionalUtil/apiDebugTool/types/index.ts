// Core type definitions for API Debug Tool

export enum HttpMethod {
  GET = 'GET',
  POST = 'POST',
}

export enum BodyType {
  NONE = 'none',
  FORM_DATA = 'form-data',
  X_FORM_URLENCODED = 'x-www-form-urlencoded',
  RAW = 'raw',
  BINARY = 'binary',
}

export enum RawBodyFormat {
  JSON = 'json',
  TEXT = 'text',
  XML = 'xml',
}

export enum AuthType {
  NONE = 'none',
  BEARER = 'bearer',
  BASIC = 'basic',
  API_KEY = 'api_key',
  CUSTOM = 'custom',
}

// Key-value pair
export interface KeyValuePair {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
  description?: string;
}

// Header specific
export interface HeaderItem extends KeyValuePair {}

// Parameter specific
export interface ParamItem extends KeyValuePair {}

// Body form item
export interface FormItem extends KeyValuePair {
  type?: 'text' | 'file';
}

// Authorization config
export interface AuthConfig {
  type: AuthType;
  bearer?: {
    token: string;
  };
  basic?: {
    username: string;
    password: string;
  };
  apiKey?: {
    key: string;
    value: string;
    in: 'header' | 'query';
  };
  custom?: {
    script: string;
  };
}

// Raw body config
export interface RawBodyConfig {
  format: RawBodyFormat;
  content: string;
}

// Request body
export interface RequestBody {
  type: BodyType;
  formData?: FormItem[];
  urlencoded?: KeyValuePair[];
  raw?: RawBodyConfig;
  binary?: string; // file path or base64
}

// Scripts
export interface Scripts {
  preRequest?: string;
  postResponse?: string;
}

// Single HTTP Request
export interface HttpRequest {
  id: string;
  name: string;
  method: HttpMethod;
  url: string;
  description?: string;
  params: ParamItem[];
  headers: HeaderItem[];
  body: RequestBody;
  auth: AuthConfig;
  scripts: Scripts;
  collectionId?: string; // Optional collection reference
  createdAt: number;
  updatedAt: number;
}

// Collection
export interface Collection {
  id: string;
  name: string;
  description?: string;
  items: (Folder | HttpRequest)[]; // Can contain folders or requests directly
  variables?: KeyValuePair[]; // Collection-level variables
  createdAt: number;
  updatedAt: number;
}

// Folder (for organizing requests within a collection)
export interface Folder {
  id: string;
  name: string;
  description?: string;
  items: (Folder | HttpRequest)[]; // Nested structure
  createdAt: number;
  updatedAt: number;
}

// Response
export interface HttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  bodyType: 'json' | 'html' | 'text' | 'xml';
  responseTime: number; // in milliseconds
  responseSize: number; // in bytes
  receivedAt: number;
}

// Request result (request + response + execution metadata)
export interface RequestResult {
  id: string;
  request: HttpRequest;
  response?: HttpResponse;
  error?: {
    message: string;
    code?: string;
  };
  executedAt: number;
  duration: number;
}

// History entry
export interface HistoryEntry {
  id: string;
  collectionId?: string;
  requestId?: string;
  method: HttpMethod;
  url: string;
  name: string;
  status?: number;
  responseTime?: number;
  responseSize?: number;
  executedAt: number;
  curl?: string; // Store curl command
  responseBody?: string; // Store response body
  responseHeaders?: Record<string, string>; // Store response headers
}

// Global variables and settings
export interface AppSettings {
  id: string;
  variables: KeyValuePair[];
  defaultHeaders: HeaderItem[];
  defaultTimeout: number; // milliseconds
  maxHistorySize: number;
  historyExpireDays: number;
  signatureRules?: Record<string, any>;
  theme?: 'light' | 'dark';
  updatedAt: number;
}

// Search result
export interface SearchResult {
  type: 'request' | 'collection' | 'folder';
  id: string;
  name: string;
  path: string;
  parentId?: string;
}

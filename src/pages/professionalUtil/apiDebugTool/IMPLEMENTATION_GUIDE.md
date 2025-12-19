# API Debug Tool - Implementation Guide

## Overview

A complete Postman-like API debugging tool built into the ORAEN Tool Web UI. It provides full-featured HTTP request building, testing, management, and persistence with support for collections, history, variables, scripts, and import/export functionality.

## Project Structure

```
apiDebugTool/
├── types/
│   └── index.ts          # Core type definitions
├── services/
│   ├── index.ts          # Service barrel exports
│   ├── indexeddb.ts      # IndexedDB persistence layer
│   ├── httpEngine.ts     # HTTP request execution engine
│   ├── variableSystem.ts # Dynamic variable system
│   ├── scriptEngine.ts   # Pre/Post request script execution
│   └── importExport.ts   # Import/Export and curl parsing
└── index.tsx             # Main React component
```

## Core Features Implemented

### 1. HTTP Request Building & Execution

**File**: `services/httpEngine.ts`

- ✅ Support for all HTTP methods (GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS)
- ✅ URL parameter building and substitution
- ✅ Header management with enable/disable toggle
- ✅ Request body support (none, form-data, x-www-form-urlencoded, raw JSON/XML/text, binary)
- ✅ Request timeout handling (default 30 seconds, configurable)
- ✅ Request cancellation via AbortController
- ✅ Comprehensive error handling (network, CORS, timeout, parsing)
- ✅ Response metadata (status, headers, size, duration)

**Key Methods**:
- `execute(request, options)` - Execute HTTP request with timeout and abort signal
- `buildUrl(baseUrl, params)` - Build URL with query parameters
- `buildHeaders(headers, auth)` - Merge enabled headers
- `buildBody(request)` - Build appropriate request body

### 2. Request & Collection Management

**File**: `services/indexeddb.ts`

- ✅ Collections storage with nested folder structure
- ✅ Request CRUD operations with collection association
- ✅ Full-text searchable request metadata
- ✅ Automatic timestamps for created/updated tracking

**Key Methods**:
- `createCollection()`, `getCollection()`, `updateCollection()`, `deleteCollection()`
- `createRequest()`, `getRequest()`, `updateRequest()`, `deleteRequest()`
- Collection-based request queries

### 3. History Management

**File**: `services/indexeddb.ts`

- ✅ Automatic history recording on each request execution
- ✅ History entries with method, URL, status, response time, response size
- ✅ Efficient indexed queries for fast retrieval
- ✅ Auto-cleanup based on expiration (days) and max size (count)
- ✅ History search and filtering support

**Key Methods**:
- `addHistoryEntry()` - Record request execution
- `getHistory(limit, offset)` - Fetch recent history with pagination
- `clearOldHistory(expireDays, maxSize)` - Auto-cleanup expired/overflow entries
- `deleteAllHistory()` - Clear all history

### 4. Variable System

**File**: `services/variableSystem.ts`

- ✅ Three-level variable scope: Global → Collection → Request
- ✅ Dynamic variable functions:
  - `{{timestamp}}` - Current Unix timestamp
  - `{{uuid}}` - UUID v4 generation
  - `{{random()}}` - Random number (configurable range)
  - `{{randomString(10)}}` - Random string generation
  - `{{now}}` - ISO timestamp
- ✅ Variable replacement in all request fields (URL, headers, body)
- ✅ Variable syntax validation with error reporting
- ✅ Deep object variable replacement support

**Key Methods**:
- `replaceVariables(text, variables)` - Replace {{variable}} patterns
- `replaceVariablesInObject(obj, variables)` - Deep replacement
- `mergeVariables(context)` - Merge variables from all scopes
- `extractVariables(text)` - Find all variable references
- `validateVariableSyntax(text)` - Check for syntax errors

### 5. Script Execution Engine

**File**: `services/scriptEngine.ts`

- ✅ Pre-request script execution (before sending)
- ✅ Post-response script execution (after response received)
- ✅ Safe sandbox environment with limited API access
- ✅ Request/Response object access in scripts
- ✅ Variable reading/writing from scripts
- ✅ Built-in utilities: btoa, atob, JSON, Math, Date, crypto
- ✅ Console logging with output capture
- ✅ Script syntax validation without execution

**Script API**:
```javascript
// Available in scripts:
request.url
request.method
request.addHeader(key, value)
request.setBody(bodyContent)

response.status
response.headers
response.body

variables[key]
setVariable(key, value)
getVariable(key)

console.log()
console.error()
console.warn()

btoa(str)
atob(str)
JSON, Math, Date, crypto
```

### 6. Import/Export

**File**: `services/importExport.ts`

- ✅ Export collection as JSON with full structure preservation
- ✅ Export single request as JSON
- ✅ Export request as curl command (with variables replaced)
- ✅ Import curl commands with automatic parsing:
  - HTTP method extraction
  - URL and query parameters
  - Headers parsing
  - Request body (JSON, form-data, urlencoded)
- ✅ Import JSON collections and requests with validation
- ✅ File download helper
- ✅ Clipboard copy utility

**Key Methods**:
- `exportCollectionAsJSON()` - Export collection structure
- `exportRequestAsJSON()` - Export single request
- `exportRequestAsCurl()` - Generate curl command
- `parseCurl(curlCommand)` - Import from curl
- `importCollectionFromJSON()` - Import collection
- `importRequestFromJSON()` - Import request

### 7. Authentication Support

**Type**: `AuthConfig` - Multiple authentication methods supported

- None (no authentication)
- Bearer Token
- Basic Auth (username/password with auto Base64 encoding)
- API Key (Header or Query parameter)
- Custom (via script/signature)

**Feature-rich auth handling in main component**:
- Visual dropdown for auth type selection
- Token/credential input fields
- Automatic header injection based on auth type

### 8. UI Components

**File**: `index.tsx` - Main React Component

#### Layout Structure
- **Header**: Logo, global search, quick actions (New, Import, Export, Settings)
- **Left Sidebar**: Collections and History tabs with search
- **Main Area**: Split view
  - Left: Request editor (URL, method, params, headers, body, auth, scripts)
  - Right: Response viewer (status, headers, body preview)

#### Request Editor Features
- HTTP method dropdown
- URL input with variable support
- Params/Headers/Body tabbed interface
- Enable/disable toggles for parameters
- Raw body editor with format selection
- Auth configuration panel
- Pre/Post request script editor

#### Response Viewer Features
- Status code and response metadata (time, size)
- Body viewer (pretty JSON, raw text)
- Response headers inspection
- Error messages and network diagnostics

### 9. Persistence & Reliability

**File**: `services/indexeddb.ts`

- ✅ IndexedDB for reliable client-side storage
- ✅ Atomic transactions for data consistency
- ✅ Automatic database initialization
- ✅ Error handling with fallback defaults
- ✅ Auto-cleanup of old history entries
- ✅ Settings persistence (timeouts, defaults, etc.)

## How to Use

### Access the Tool

1. Navigate to **Professional Tools** → **API Debug Tool** in the application menu
2. Or directly visit `/professionalUtil/apiDebugTool`

### Create a Request

1. Click **"New Request"** button in the header
2. Enter request details:
   - Select HTTP method
   - Enter URL with optional variables like `{{baseUrl}}`
   - Add query parameters in Params tab
   - Add/modify headers in Headers tab
   - Add request body if needed
   - Configure authentication if required
3. Add optional scripts (Pre-Request, Post-Response)
4. Click **"Send"** to execute the request

### Organize with Collections

1. Click **"New Collection"** in the Collections sidebar
2. Organize requests by creating folders
3. Right-click for context menu options (copy, export, delete)
4. Collections are automatically saved to local storage

### Use Variables

**Global Level**: Set in Settings
**Collection Level**: Store with collection data
**Request Level**: Define locally in current request

**Syntax**:
```
{{variableName}}      # Variable reference
{{timestamp()}}       # Function call
{{random(1,100)}}     # Function with arguments
```

### Add Scripts

**Pre-Request Script**:
```javascript
// Set auth header dynamically
request.addHeader('X-Timestamp', Date.now().toString());

// Calculate signature
const signature = btoa('secret:' + Date.now());
request.addHeader('X-Signature', signature);

// Modify request body
request.setBody(JSON.stringify({...}));
```

**Post-Response Script**:
```javascript
// Extract token for next request
const data = JSON.parse(response.body);
if (data.token) {
  setVariable('authToken', data.token);
}

// Log response info
console.log('Status: ' + response.status);
console.log('Size: ' + response.headers['content-length']);
```

### Import/Export

**Export Collection**:
1. Select collection in sidebar
2. Right-click → Export as JSON
3. File downloads to your computer

**Export as curl**:
1. Click the request
2. Right-click → Copy as curl
3. Paste into terminal or share with others

**Import from curl**:
1. Click "Import" button in header
2. Paste curl command
3. Tool auto-parses all details
4. Review and adjust if needed

**Import JSON**:
1. Click "Import" button
2. Select JSON file from computer
3. Collection/request is loaded

### History

- Each request execution is recorded in History
- Click history entry to load that request
- View execution time and response status
- Search through past requests
- Auto-cleanup: Old entries deleted after configured days
- Manual clear: Clear All button in History tab

### Settings

Configure:
- Default timeout (milliseconds)
- History expiration (days)
- Max history size (count)
- Global variables
- Default headers

## Type Definitions

### Core Types

```typescript
// HTTP Request
interface HttpRequest {
  id: string;
  name: string;
  method: HttpMethod;
  url: string;
  params: ParamItem[];
  headers: HeaderItem[];
  body: RequestBody;
  auth: AuthConfig;
  scripts: Scripts;
  createdAt: number;
  updatedAt: number;
}

// Collection
interface Collection {
  id: string;
  name: string;
  items: (Folder | HttpRequest)[];
  variables: KeyValuePair[];
  createdAt: number;
  updatedAt: number;
}

// Response
interface HttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  bodyType: 'json' | 'html' | 'text' | 'xml';
  responseTime: number;
  responseSize: number;
  receivedAt: number;
}
```

## Advanced Features

### Custom Signatures

Implement signature generation in Pre-Request script:

```javascript
// Example: Generate HMAC-SHA256 signature
const timestamp = Date.now().toString();
const secret = 'your_secret_key';

// Note: Full crypto implementation would require additional libraries
const signature = btoa(timestamp + ':' + secret);

request.addHeader('X-Signature', signature);
request.addHeader('X-Timestamp', timestamp);
```

### Environment-specific URLs

```javascript
// Pre-Request script
const env = getVariable('environment');
const baseUrls = {
  dev: 'https://dev-api.example.com',
  staging: 'https://staging-api.example.com',
  prod: 'https://api.example.com'
};

// Modify request URL
const url = request.url.replace('{{baseUrl}}', baseUrls[env]);
```

### Token Refresh Flow

```javascript
// Post-Response script
if (response.status === 401) {
  console.log('Token expired, storing for refresh...');
  setVariable('needsTokenRefresh', 'true');
}

if (response.status === 200 && response.body.includes('token')) {
  const data = JSON.parse(response.body);
  setVariable('accessToken', data.token);
  console.log('Token updated successfully');
}
```

## Data Storage

All data is stored in browser's IndexedDB under database `ORAEN_API_DEBUG`:

**Object Stores**:
1. `collections` - Collection data
2. `requests` - Request configurations
3. `history` - Request execution history
4. `settings` - Application settings

**Indexes**:
- `requests.collectionId` - Query requests by collection
- `history.executedAt` - Query history by execution time

## Limitations & Notes

- ⚠️ CORS must be enabled on target API endpoints
- ⚠️ Scripts run in sandboxed context with limited access
- ⚠️ File uploads require form-data body type
- ⚠️ Binary file support is basic (base64 encoding)
- ⚠️ History auto-cleanup runs on app initialization
- ⚠️ Maximum request/response size limited by browser memory

## Future Enhancement Ideas

- Collections tree view with drag-drop
- Request templates and duplication
- Environment variables manager
- Postman API integration for sync
- GraphQL query builder
- WebSocket support
- Request scheduling
- Performance profiling
- API documentation generator
- Team collaboration features

## Testing Recommendations

1. **Basic Request**: GET https://httpbin.org/get
2. **POST with Body**: POST https://httpbin.org/post with JSON body
3. **Headers**: Verify headers tab includes all headers
4. **History**: Send multiple requests, verify history recording
5. **Variables**: Use {{uuid}} in URL or header values
6. **Scripts**: Log to console in pre/post scripts
7. **Import/Export**: Export as JSON, then reimport
8. **Curl Parsing**: Paste complex curl commands
9. **Collections**: Create and organize requests
10. **Persistence**: Refresh page, verify data persists

## Support & Debugging

Enable browser console (F12) to see:
- Script execution logs
- Network request details
- IndexedDB transaction errors
- Variable replacement logs

## Contributing

When adding new features:
1. Update type definitions in `types/index.ts`
2. Implement service methods in `services/`
3. Update UI components in `index.tsx`
4. Test persistence with IndexedDB
5. Document API changes

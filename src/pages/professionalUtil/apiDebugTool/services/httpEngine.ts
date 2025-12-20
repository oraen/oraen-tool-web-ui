import { HttpRequest, HttpResponse, ParamItem, HeaderItem, AuthType, HttpMethod } from '../types';

export interface RequestOptions {
  timeout?: number;
  signal?: AbortSignal;
}

export interface RequestExecutionResult {
  response?: HttpResponse;
  error?: {
    message: string;
    code?: string;
  };
  duration: number;
}

class HttpRequestEngine {
  /**
   * Detect if running in Electron environment
   */
  private isElectron(): boolean {
    // Multiple detection methods for reliability
    if (typeof window === 'undefined') return false;
    
    const win = window as any;
    
    // Method 1: Check for exposed electron object from preload
    if (win.electron?.isElectron === true) {
      console.log('[HttpEngine] Detected Electron via preload');
      return true;
    }
    
    // Method 2: Check for __ELECTRON__ flag
    if (win.__ELECTRON__ === true) {
      console.log('[HttpEngine] Detected Electron via __ELECTRON__');
      return true;
    }
    
    // Method 3: Check user agent
    if (navigator.userAgent.includes('Electron')) {
      console.log('[HttpEngine] Detected Electron via user agent');
      return true;
    }
    
    // Method 4: Check for common Electron/Node globals
    if (typeof (win.require) === 'function' || typeof (win.process) === 'object') {
      if (win.process?.type === 'renderer') {
        console.log('[HttpEngine] Detected Electron via process object');
        return true;
      }
    }
    
    return false;
  }

  /**
   * Build URL with parameters
   */
  private buildUrl(baseUrl: string, params: ParamItem[]): string {
    const enabledParams = params.filter(p => p.enabled);
    if (enabledParams.length === 0) return baseUrl;

    const queryParams = enabledParams.map(p => 
      `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`
    ).join('&');

    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}${queryParams}`;
  }

  /**
   * Build request headers
   */
  private buildHeaders(headers: HeaderItem[], body?: any, bodyType?: string, rawFormat?: string): Record<string, string> {
    const result: Record<string, string> = {};

    // Add enabled headers
    headers
      .filter(h => h.enabled)
      .forEach(h => {
        result[h.key] = h.value;
      });

    // Set default Content-Type if not provided
    // Skip auto-setting if body is FormData (browser will handle it automatically)
    if (!result['Content-Type']) {
      // For form-data, let the browser automatically set Content-Type with boundary
      if (body instanceof FormData) {
        // Browser/Electron will automatically set Content-Type: multipart/form-data
        // Do not set it manually
      } else if (bodyType === 'x-www-form-urlencoded') {
        result['Content-Type'] = 'application/x-www-form-urlencoded';
      } else if (bodyType === 'raw') {
        // For raw body, only set Content-Type based on selected format
        // This matches Postman behavior
        if (rawFormat === 'json') {
          result['Content-Type'] = 'application/json';
        } else if (rawFormat === 'xml') {
          result['Content-Type'] = 'application/xml';
        }
        // For 'text' (HTML) format, don't set Content-Type
        // Let server handle content negotiation
      }
    }

    return result;
  }

  /**
   * Build request body - GET/HEAD methods should not have a body
   */
  private buildBody(request: HttpRequest): string | FormData | null {
    const { body, method } = request;

    // GET and HEAD methods should not have a request body per HTTP spec
    // Ignore any body content for these methods
    if (method === HttpMethod.GET) {
      return null;
    }

    if (body.type === 'none' || !body.type) {
      return null;
    }

    if (body.type === 'form-data') {
      const formData = new FormData();
      body.formData?.forEach(item => {
        if (item.enabled) {
          formData.append(item.key, item.value);
        }
      });
      return formData;
    }

    if (body.type === 'x-www-form-urlencoded') {
      const params = new URLSearchParams();
      body.urlencoded?.forEach(item => {
        if (item.enabled) {
          params.append(item.key, item.value);
        }
      });
      return params.toString();
    }

    if (body.type === 'raw' && body.raw) {
      return body.raw.content;
    }

    return null;
  }

  /**
   * Detect response body type
   */
  private detectBodyType(
    contentType: string,
    body: string
  ): 'json' | 'html' | 'text' | 'xml' {
    if (contentType.includes('application/json')) return 'json';
    if (contentType.includes('text/html')) return 'html';
    if (contentType.includes('text/xml') || contentType.includes('application/xml')) return 'xml';
    return 'text';
  }

  /**
   * Extract response size in bytes
   */
  private calculateResponseSize(body: string): number {
    return new Blob([body]).size;
  }

  /**
   * Execute HTTP request
   */
  async execute(
    request: HttpRequest,
    options: RequestOptions = {}
  ): Promise<RequestExecutionResult> {
    const startTime = performance.now();
    const timeout = options.timeout || 30000;
    const controller = new AbortController();
    let timeoutId: NodeJS.Timeout | undefined;

    // Validate URL format
    try {
      const urlObj = new URL(request.url);
      // Additional validation: URL should have a valid protocol
      if (!urlObj.protocol.match(/^https?:$/)) {
        return {
          error: {
            message: `Invalid URL protocol. Only http:// and https:// are supported. Got: ${urlObj.protocol}`,
            code: 'INVALID_URL',
          },
          duration: performance.now() - startTime,
        };
      }
    } catch (err: any) {
      return {
        error: {
          message: `Invalid URL format: ${err.message}. Please enter a valid URL starting with http:// or https://`,
          code: 'INVALID_URL',
        },
        duration: performance.now() - startTime,
      };
    }

    try {
      // Create timeout
      if (timeout > 0) {
        timeoutId = setTimeout(() => {
          controller.abort();
        }, timeout);
      }

      // Build URL with parameters
      const url = this.buildUrl(request.url, request.params);

      // Build body first to determine content type
      const body = this.buildBody(request);

      // Build headers (pass body for content-type detection)
      const rawFormat = request.body.type === 'raw' ? request.body.raw?.format : undefined;
      const headers = this.buildHeaders(request.headers, body, request.body.type, rawFormat);

      // Make request
      const isElectronEnv = this.isElectron();
      
      // Debug logging
      console.log('[HttpEngine] Request Debug:', {
        url,
        method: request.method,
        bodyType: request.body.type,
        rawFormat: request.body.type === 'raw' ? request.body.raw?.format : undefined,
        isElectron: isElectronEnv,
        headers: Object.keys(headers),
      });
      
      let fetchResponse;
      
      // In Electron, use IPC to make request in main process (no CORS issues)
      // In browser, use fetch API
      if (isElectronEnv && (window as any).electron?.makeRequest) {
        // Use native Node.js http/https in main process - completely bypasses CORS
        console.log('[HttpEngine] Using IPC for request');
        
        const ipcResponse = await (window as any).electron.makeRequest({
          url,
          method: request.method,
          headers,
          body: typeof body === 'string' ? body : null,
        });

        console.log('[HttpEngine] IPC Response:', {
          hasError: !!ipcResponse.error,
          status: ipcResponse.status,
          bodyLength: ipcResponse.body?.length,
        });

        if (ipcResponse.error) {
          console.error('[HttpEngine] IPC Error:', ipcResponse.error);
          throw new Error(`IPC Error: ${ipcResponse.error.message} (${ipcResponse.error.code})`);
        }

        // Convert IPC response to fetch-like response
        fetchResponse = {
          ok: ipcResponse.status >= 200 && ipcResponse.status < 300,
          status: ipcResponse.status,
          statusText: ipcResponse.statusText,
          headers: new Map(Object.entries(ipcResponse.headers || {})),
          text: async () => ipcResponse.body,
        };
      } else {
        // Browser: use fetch with CORS
        console.log('[HttpEngine] Using Fetch API for request');
        
        const fetchOptions: any = {
          method: request.method,
          headers: headers as any,
          body: body as any,
          signal: options.signal || controller.signal,
          mode: 'cors',
          credentials: 'include',
        };
        
        fetchResponse = await fetch(url, fetchOptions);
      }

      // Read response body
      const responseBody = await (fetchResponse.text instanceof Function ? fetchResponse.text() : fetchResponse.text);
      const contentType = fetchResponse.headers.get?.('Content-Type') ||
                         fetchResponse.headers.get?.('content-type') ||
                         'text/plain';
      const responseTime = performance.now() - startTime;
      const responseSize = this.calculateResponseSize(responseBody);

      // Parse response headers
      const responseHeaders: Record<string, string> = {};
      fetchResponse.headers.forEach((value: any, key: string) => {
        responseHeaders[key] = String(value);
      });

      const contentTypeForDetection = typeof contentType === 'string' ? contentType : 'text/plain';
      const response: HttpResponse = {
        status: fetchResponse.status,
        statusText: fetchResponse.statusText,
        headers: responseHeaders,
        body: responseBody,
        bodyType: this.detectBodyType(contentTypeForDetection, responseBody),
        responseTime,
        responseSize,
        receivedAt: Date.now(),
      };

      return {
        response,
        duration: responseTime,
      };
    } catch (error: any) {
      const duration = performance.now() - startTime;

      if (error.name === 'AbortError') {
        return {
          error: {
            message: 'Request timeout or cancelled',
            code: 'ABORT_ERROR',
          },
          duration,
        };
      }

      if (error instanceof TypeError) {
        // Detect error type
        const errorMsg = error.message || '';
        
        // Check if it's a GET/HEAD with body error (HTTP spec violation)
        if (errorMsg.includes('GET/HEAD method cannot have body') || 
            errorMsg.includes('Request with GET/HEAD method cannot have body')) {
          console.error('[HttpEngine] Invalid HTTP request - GET/HEAD cannot have body');
          return {
            error: {
              message: `Invalid HTTP request: ${errorMsg}. GET/HEAD methods cannot have a request body. Please change the method to POST or another appropriate method.`,
              code: 'INVALID_REQUEST',
            },
            duration,
          };
        }
        
        // Distinguish between CORS errors and other network errors
        // In browser environment, "Failed to fetch" can be CORS or DNS/network errors
        // We cannot reliably distinguish them, so we show CORS guidance as a fallback
        // since CORS is a common issue for API debugging in browsers
        const isOffline = !navigator.onLine;
        
        console.error('[HttpEngine] Error Details:', {
          errorMsg,
          isOffline,
          stack: error.stack,
          isElectron: this.isElectron(),
          userAgent: navigator.userAgent,
        });
        
        // Handle offline case
        if (isOffline) {
          return {
            error: {
              message: 'Network is offline. Please check your internet connection.',
              code: 'OFFLINE_ERROR',
            },
            duration,
          };
        }
        
        // For "Failed to fetch" errors in browser, show CORS guidance
        // This is a common issue for API debugging
        if (errorMsg.includes('Failed to fetch')) {
          return {
            error: {
              message: `Request failed. This could be due to:
1. CORS policy blocking the request
2. Server is unreachable
3. Invalid domain/hostname
4. Network connectivity issues`,
              code: 'CORS_ERROR',
            },
            duration,
          };
        }
        
        // Handle other network errors (DNS, connection refused, timeout, etc.)
        return {
          error: {
            message: `Network error: ${errorMsg}. This could be due to:
1. Invalid domain/hostname
2. Server connection refused
3. Network unreachable
4. Request timeout`,
            code: 'NETWORK_ERROR',
          },
          duration,
        };
      }

      return {
        error: {
          message: error.message || 'Unknown error occurred',
          code: error.code || 'UNKNOWN_ERROR',
        },
        duration,
      };
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  /**
   * Cancel request (returns AbortController for manual cancellation)
   */
  createAbortController(): AbortController {
    return new AbortController();
  }
}

export default new HttpRequestEngine();

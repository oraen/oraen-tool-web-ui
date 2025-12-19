import { HttpRequest, HttpResponse, ParamItem, HeaderItem, AuthType } from '../types';

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
  private buildHeaders(headers: HeaderItem[], auth?: any): Record<string, string> {
    const result: Record<string, string> = {};

    // Add enabled headers
    headers
      .filter(h => h.enabled)
      .forEach(h => {
        result[h.key] = h.value;
      });

    // Set default Content-Type if not provided
    if (!result['Content-Type']) {
      result['Content-Type'] = 'application/json';
    }

    return result;
  }

  /**
   * Build request body
   */
  private buildBody(request: HttpRequest): string | FormData | null {
    const { body } = request;

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

    // Create timeout
    let timeoutId: NodeJS.Timeout | undefined;
    if (timeout > 0) {
      timeoutId = setTimeout(() => {
        controller.abort();
      }, timeout);
    }

    try {
      // Build URL with parameters
      const url = this.buildUrl(request.url, request.params);

      // Build headers
      const headers = this.buildHeaders(request.headers);

      // Build body
      const body = this.buildBody(request);

      // Make fetch request
      const fetchResponse = await fetch(url, {
        method: request.method,
        headers: headers as any,
        body: body as any,
        signal: options.signal || controller.signal,
        mode: 'cors',
        credentials: 'include',
      });

      // Read response body
      const responseBody = await fetchResponse.text();
      const contentType = fetchResponse.headers.get('Content-Type') || 'text/plain';
      const responseTime = performance.now() - startTime;
      const responseSize = this.calculateResponseSize(responseBody);

      // Parse response headers
      const responseHeaders: Record<string, string> = {};
      fetchResponse.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      const response: HttpResponse = {
        status: fetchResponse.status,
        statusText: fetchResponse.statusText,
        headers: responseHeaders,
        body: responseBody,
        bodyType: this.detectBodyType(contentType, responseBody),
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
        // Detect CORS errors
        const errorMsg = error.message || '';
        const isCorsError = errorMsg.includes('Failed to fetch') || 
                          errorMsg.includes('fetch') ||
                          errorMsg.includes('NetworkError') ||
                          !navigator.onLine;
        
        if (isCorsError) {
          return {
            error: {
              message: 'Request failed due to CORS (Cross-Origin). Please use a professional HTTP client or browser extension.',
              code: 'CORS_ERROR',
            },
            duration,
          };
        }

        return {
          error: {
            message: `Network error: ${error.message}`,
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

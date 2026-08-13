import {
  AuthType,
  BodyType,
  HeaderItem,
  HttpMethod,
  HttpRequest,
  HttpResponse,
  ParamItem,
  RawBodyFormat,
} from '../types';

export interface RequestOptions {
  timeout?: number;
  signal?: AbortSignal;
}

export interface RequestExecutionResult {
  response?: HttpResponse;
  error?: { message: string; code?: string };
  duration: number;
}

interface ElectronHttpResponse {
  status?: number;
  statusText?: string;
  headers?: Record<string, string | string[]>;
  body?: string;
  error?: { message: string; code?: string };
}

interface PreparedBody {
  browserBody: BodyInit | null;
  ipcBody: string | null;
  contentType?: string;
}

class HttpRequestEngine {
  private isElectron(): boolean {
    return typeof window !== 'undefined' && typeof (window as any).electron?.makeRequest === 'function';
  }

  private buildUrl(baseUrl: string, params: ParamItem[], authQuery?: { key: string; value: string }): string {
    const url = new URL(baseUrl.trim());
    // The URL field is the source of truth. Params mirror its query string, so
    // replace matching keys instead of blindly appending duplicates.
    const enabledParams = (params || []).filter(param => param.enabled && param.key.trim());
    const managedKeys = new Set(enabledParams.map(param => param.key));
    managedKeys.forEach(key => url.searchParams.delete(key));
    enabledParams.forEach(param => url.searchParams.append(param.key, param.value));
    if (authQuery?.key) url.searchParams.set(authQuery.key, authQuery.value);
    return url.toString();
  }

  private findHeader(headers: Record<string, string>, key: string): string | undefined {
    const match = Object.keys(headers).find(header => header.toLowerCase() === key.toLowerCase());
    return match ? headers[match] : undefined;
  }

  private setHeader(headers: Record<string, string>, key: string, value: string): void {
    const existing = Object.keys(headers).find(header => header.toLowerCase() === key.toLowerCase());
    if (existing) headers[existing] = value;
    else headers[key] = value;
  }

  private buildHeaders(request: HttpRequest, preparedBody: PreparedBody, forElectron: boolean): Record<string, string> {
    const headers: Record<string, string> = {};
    (request.headers || [])
      .filter(header => header.enabled && header.key.trim())
      .forEach(header => this.setHeader(headers, header.key.trim(), header.value));

    if (request.auth?.type === AuthType.BEARER && request.auth.bearer?.token) {
      this.setHeader(headers, 'Authorization', `Bearer ${request.auth.bearer.token}`);
    } else if (request.auth?.type === AuthType.BASIC && request.auth.basic) {
      const credentials = `${request.auth.basic.username || ''}:${request.auth.basic.password || ''}`;
      this.setHeader(headers, 'Authorization', `Basic ${btoa(unescape(encodeURIComponent(credentials)))}`);
    } else if (request.auth?.type === AuthType.API_KEY && request.auth.apiKey?.in === 'header') {
      this.setHeader(headers, request.auth.apiKey.key, request.auth.apiKey.value);
    }

    const browserManagesMultipartBoundary = request.body?.type === BodyType.FORM_DATA && !forElectron;
    if (browserManagesMultipartBoundary) {
      const contentTypeHeader = Object.keys(headers).find(header => header.toLowerCase() === 'content-type');
      if (contentTypeHeader) delete headers[contentTypeHeader];
    }
    if (preparedBody.contentType && !browserManagesMultipartBoundary && !this.findHeader(headers, 'content-type')) {
      this.setHeader(headers, 'Content-Type', preparedBody.contentType);
    }
    return headers;
  }

  private prepareBody(request: HttpRequest): PreparedBody {
    if (request.method === HttpMethod.GET || request.method === HttpMethod.HEAD || !request.body || request.body.type === BodyType.NONE) {
      return { browserBody: null, ipcBody: null };
    }

    if (request.body.type === BodyType.FORM_DATA) {
      const enabledItems = (request.body.formData || []).filter(item => item.enabled && item.key.trim());
      const formData = new FormData();
      enabledItems.forEach(item => formData.append(item.key, item.value));

      // IPC cannot structured-clone FormData. Encode the same data explicitly.
      const boundary = `----ORAENFormBoundary${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
      const ipcBody = enabledItems.map(item =>
        `--${boundary}\r\nContent-Disposition: form-data; name="${item.key.replace(/"/g, '%22')}"\r\n\r\n${item.value}\r\n`
      ).join('') + `--${boundary}--\r\n`;
      return { browserBody: formData, ipcBody, contentType: `multipart/form-data; boundary=${boundary}` };
    }

    if (request.body.type === BodyType.X_FORM_URLENCODED) {
      const params = new URLSearchParams();
      (request.body.urlencoded || [])
        .filter(item => item.enabled && item.key.trim())
        .forEach(item => params.append(item.key, item.value));
      const body = params.toString();
      return { browserBody: body, ipcBody: body, contentType: 'application/x-www-form-urlencoded;charset=UTF-8' };
    }

    if (request.body.type === BodyType.RAW) {
      const body = request.body.raw?.content || '';
      const format = request.body.raw?.format;
      const contentType = format === RawBodyFormat.JSON
        ? 'application/json'
        : format === RawBodyFormat.XML
          ? 'application/xml'
          : 'text/plain;charset=UTF-8';
      return { browserBody: body, ipcBody: body, contentType };
    }

    return { browserBody: null, ipcBody: null };
  }

  private detectBodyType(contentType: string, body: string): HttpResponse['bodyType'] {
    const normalized = contentType.toLowerCase();
    if (normalized.includes('json')) return 'json';
    if (/^\s*[\[{]/.test(body)) {
      try {
        JSON.parse(body);
        return 'json';
      } catch {}
    }
    if (normalized.includes('html')) return 'html';
    if (normalized.includes('xml') || /^\s*<\?xml/.test(body)) return 'xml';
    return 'text';
  }

  private normalizeHeaders(headers: any): Record<string, string> {
    const result: Record<string, string> = {};
    if (headers?.forEach) {
      headers.forEach((value: any, key: string) => { result[key.toLowerCase()] = String(value); });
    } else {
      Object.entries(headers || {}).forEach(([key, value]) => {
        result[key.toLowerCase()] = Array.isArray(value) ? value.join('\n') : String(value ?? '');
      });
    }
    return result;
  }

  async execute(request: HttpRequest, options: RequestOptions = {}): Promise<RequestExecutionResult> {
    const startTime = performance.now();
    const timeout = Number.isFinite(options.timeout) ? Math.max(0, options.timeout as number) : 30000;
    const controller = new AbortController();
    let didTimeout = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const abortFromCaller = () => controller.abort();

    try {
      if (options.signal?.aborted) controller.abort();
      else options.signal?.addEventListener('abort', abortFromCaller, { once: true });
      if (timeout > 0) {
        timeoutId = setTimeout(() => {
          didTimeout = true;
          controller.abort();
        }, timeout);
      }

      const authQuery = request.auth?.type === AuthType.API_KEY && request.auth.apiKey?.in === 'query'
        ? { key: request.auth.apiKey.key, value: request.auth.apiKey.value }
        : undefined;
      const url = this.buildUrl(request.url, request.params || [], authQuery);
      if (!/^https?:$/i.test(new URL(url).protocol)) {
        return { error: { message: '仅支持 http:// 和 https:// 地址', code: 'INVALID_URL' }, duration: performance.now() - startTime };
      }

      const preparedBody = this.prepareBody(request);
      const electronMode = this.isElectron();
      const headers = this.buildHeaders(request, preparedBody, electronMode);
      let status = 0;
      let statusText = '';
      let responseBody = '';
      let responseHeaders: Record<string, string> = {};

      if (electronMode) {
        const electron = (window as any).electron;
        const requestId = `http_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const cancelElectron = () => electron.cancelRequest?.(requestId);
        controller.signal.addEventListener('abort', cancelElectron, { once: true });
        try {
          const result: ElectronHttpResponse = await electron.makeRequest({
            requestId,
            url,
            method: request.method,
            headers,
            body: preparedBody.ipcBody,
            timeout,
          });
          if (result.error) {
            const error = new Error(result.error.message) as Error & { code?: string };
            error.code = result.error.code;
            throw error;
          }
          status = result.status || 0;
          statusText = result.statusText || '';
          responseBody = result.body || '';
          responseHeaders = this.normalizeHeaders(result.headers);
        } finally {
          controller.signal.removeEventListener('abort', cancelElectron);
        }
      } else {
        const response = await fetch(url, {
          method: request.method,
          headers,
          body: preparedBody.browserBody,
          signal: controller.signal,
          mode: 'cors',
          credentials: 'include',
          redirect: 'follow',
        });
        status = response.status;
        statusText = response.statusText;
        responseBody = request.method === HttpMethod.HEAD ? '' : await response.text();
        responseHeaders = this.normalizeHeaders(response.headers);
      }

      const duration = performance.now() - startTime;
      return {
        response: {
          status,
          statusText,
          headers: responseHeaders,
          body: responseBody,
          bodyType: this.detectBodyType(responseHeaders['content-type'] || '', responseBody),
          responseTime: duration,
          responseSize: new Blob([responseBody]).size,
          receivedAt: Date.now(),
        },
        duration,
      };
    } catch (error: any) {
      const duration = performance.now() - startTime;
      if (didTimeout || error?.code === 'ETIMEDOUT') {
        return { error: { message: `请求超时（${timeout} ms）`, code: 'TIMEOUT_ERROR' }, duration };
      }
      if (controller.signal.aborted || error?.name === 'AbortError' || error?.code === 'ABORTED') {
        return { error: { message: '请求已取消', code: 'CANCELLED' }, duration };
      }
      if (error instanceof TypeError && typeof navigator !== 'undefined' && !navigator.onLine) {
        return { error: { message: '网络已断开，请检查网络连接', code: 'OFFLINE_ERROR' }, duration };
      }
      if (error instanceof TypeError && !this.isElectron()) {
        return {
          error: {
            message: `浏览器未能完成请求：${error.message || '网络错误'}。请检查服务地址、网络和 CORS 配置。`,
            code: 'CORS_ERROR',
          },
          duration,
        };
      }
      const invalidUrl = error instanceof TypeError && /url/i.test(error.message || '');
      return {
        error: {
          message: invalidUrl ? 'URL 格式无效，请输入完整的 http:// 或 https:// 地址' : (error?.message || '请求失败'),
          code: invalidUrl ? 'INVALID_URL' : (error?.code || 'NETWORK_ERROR'),
        },
        duration,
      };
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      options.signal?.removeEventListener('abort', abortFromCaller);
    }
  }

  createAbortController(): AbortController {
    return new AbortController();
  }
}

export default new HttpRequestEngine();

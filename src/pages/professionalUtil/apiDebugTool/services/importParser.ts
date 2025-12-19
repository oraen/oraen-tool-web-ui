import { HttpRequest, HttpMethod, BodyType, RawBodyFormat, AuthType, KeyValuePair } from '../types';

class ImportParserService {
  parseCurl(curlCommand: string): HttpRequest {
    const request: HttpRequest = {
      id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: '',
      method: HttpMethod.GET,
      url: '',
      description: '',
      params: [],
      headers: [],
      body: { type: BodyType.NONE },
      auth: { type: AuthType.NONE },
      scripts: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    try {
      let curl = curlCommand.trim();
      if (curl.startsWith('curl')) {
        curl = curl.substring(4).trim();
      }

      if ((curl.startsWith('"') && curl.endsWith('"')) || 
          (curl.startsWith("'") && curl.endsWith("'"))) {
        curl = curl.slice(1, -1);
      }

      const parts = this.splitCurlCommand(curl);
      let i = 0;

      while (i < parts.length) {
        const part = parts[i];

        if (part === '-X' || part === '--request') {
          i++;
          request.method = (parts[i]?.toUpperCase() || HttpMethod.GET) as HttpMethod;
          if (!Object.values(HttpMethod).includes(request.method)) {
            request.method = HttpMethod.GET;
          }
        } else if (part === '-H' || part === '--header') {
          i++;
          const headerValue = parts[i] || '';
          const [key, value] = headerValue.split(':').map(s => s.trim());
          if (key && value !== undefined) {
            request.headers.push({
              id: `header_${Date.now()}_${Math.random()}`,
              key,
              value: value || '',
              enabled: true,
            });
          }
        } else if (part === '-d' || part === '--data' || part === '--data-raw') {
          i++;
          const data = parts[i] || '';
          request.body = {
            type: BodyType.RAW,
            raw: {
              format: RawBodyFormat.JSON,
              content: data,
            },
          };
        } else if (part === '-G' || part === '--get') {
          request.method = HttpMethod.GET;
        } else if (part === '-u' || part === '--user') {
          i++;
          const credentials = parts[i] || '';
          const [username, password] = credentials.split(':');
          if (username) {
            request.auth = {
              type: AuthType.BASIC,
              basic: {
                username,
                password: password || '',
              },
            };
          }
        } else if (part === '-b' || part === '--cookie') {
          i++;
          const cookie = parts[i] || '';
          if (cookie) {
            request.headers.push({
              id: `header_${Date.now()}_${Math.random()}`,
              key: 'Cookie',
              value: cookie,
              enabled: true,
            });
          }
        } else if (part === '-A' || part === '--user-agent') {
          i++;
          const userAgent = parts[i] || '';
          if (userAgent) {
            request.headers.push({
              id: `header_${Date.now()}_${Math.random()}`,
              key: 'User-Agent',
              value: userAgent,
              enabled: true,
            });
          }
        } else if (!part.startsWith('-')) {
          if (!request.url) {
            request.url = part;
          }
        }

        i++;
      }

      if (!request.url) {
        throw new Error('URL not found in curl command');
      }

      return request;
    } catch (error) {
      throw new Error(`Failed to parse curl command: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  parseJson(jsonString: string): HttpRequest {
    try {
      const json = JSON.parse(jsonString);

      const request: HttpRequest = {
        id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: json.name || json.title || '',
        method: (json.method?.toUpperCase() || HttpMethod.GET) as HttpMethod,
        url: json.url || json.endpoint || '',
        description: json.description || '',
        params: this.parseParams(json.params || json.query || []),
        headers: this.parseHeaders(json.headers || []),
        body: this.parseBody(json.body || {}),
        auth: this.parseAuth(json.auth || {}),
        scripts: {
          preRequest: json.scripts?.preRequest || json.preScript || '',
          postResponse: json.scripts?.postResponse || json.postScript || '',
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      if (!Object.values(HttpMethod).includes(request.method)) {
        request.method = HttpMethod.GET;
      }

      if (!request.url) {
        throw new Error('URL is required in JSON');
      }

      return request;
    } catch (error) {
      throw new Error(`Failed to parse JSON: ${error instanceof Error ? error.message : 'Invalid JSON'}`);
    }
  }

  private parseParams(params: any[]): KeyValuePair[] {
    if (!Array.isArray(params)) {
      return [];
    }

    return params
      .filter(p => p.key && p.value !== undefined)
      .map(p => ({
        id: `param_${Date.now()}_${Math.random()}`,
        key: p.key,
        value: String(p.value),
        enabled: p.enabled !== false,
        description: p.description || '',
      }));
  }

  private parseHeaders(headers: any): KeyValuePair[] {
    if (Array.isArray(headers)) {
      return headers
        .filter(h => h.key && h.value !== undefined)
        .map(h => ({
          id: `header_${Date.now()}_${Math.random()}`,
          key: h.key,
          value: String(h.value),
          enabled: h.enabled !== false,
          description: h.description || '',
        }));
    }

    if (typeof headers === 'object' && headers !== null) {
      return Object.entries(headers).map(([key, value]) => ({
        id: `header_${Date.now()}_${Math.random()}`,
        key,
        value: String(value),
        enabled: true,
      }));
    }

    return [];
  }

  private parseBody(body: any): any {
    if (!body || Object.keys(body).length === 0) {
      return { type: BodyType.NONE };
    }

    if (typeof body === 'string') {
      return {
        type: BodyType.RAW,
        raw: {
          format: RawBodyFormat.JSON,
          content: body,
        },
      };
    }

    if (typeof body === 'object') {
      if (body.raw) {
        return {
          type: BodyType.RAW,
          raw: {
            format: body.format || RawBodyFormat.JSON,
            content: typeof body.raw === 'string' ? body.raw : JSON.stringify(body.raw),
          },
        };
      }

      if (body.formData || body.form) {
        return {
          type: BodyType.FORM_DATA,
          formData: this.parseParams(body.formData || body.form || []),
        };
      }

      if (body.urlencoded) {
        return {
          type: BodyType.X_FORM_URLENCODED,
          urlencoded: this.parseParams(body.urlencoded || []),
        };
      }

      return {
        type: BodyType.RAW,
        raw: {
          format: RawBodyFormat.JSON,
          content: JSON.stringify(body, null, 2),
        },
      };
    }

    return { type: BodyType.NONE };
  }

  private parseAuth(auth: any): any {
    if (!auth || Object.keys(auth).length === 0) {
      return { type: AuthType.NONE };
    }

    if (auth.type === 'bearer' && auth.bearer?.token) {
      return {
        type: AuthType.BEARER,
        bearer: { token: auth.bearer.token },
      };
    }

    if (auth.type === 'basic' && auth.basic?.username) {
      return {
        type: AuthType.BASIC,
        basic: {
          username: auth.basic.username,
          password: auth.basic.password || '',
        },
      };
    }

    if (auth.type === 'apiKey' && auth.apiKey?.key) {
      return {
        type: AuthType.API_KEY,
        apiKey: {
          key: auth.apiKey.key,
          value: auth.apiKey.value || '',
          in: auth.apiKey.in || 'header',
        },
      };
    }

    return { type: AuthType.NONE };
  }

  private splitCurlCommand(curl: string): string[] {
    const parts: string[] = [];
    let current = '';
    let inQuote = false;
    let quoteChar = '';

    for (let i = 0; i < curl.length; i++) {
      const char = curl[i];

      if ((char === '"' || char === "'") && (i === 0 || curl[i - 1] !== '\\')) {
        if (!inQuote) {
          inQuote = true;
          quoteChar = char;
        } else if (char === quoteChar) {
          inQuote = false;
        } else {
          current += char;
        }
      } else if (char === ' ' && !inQuote) {
        if (current.trim()) {
          parts.push(current.trim());
        }
        current = '';
      } else {
        current += char;
      }
    }

    if (current.trim()) {
      parts.push(current.trim());
    }

    return parts;
  }
}

export const importParserService = new ImportParserService();

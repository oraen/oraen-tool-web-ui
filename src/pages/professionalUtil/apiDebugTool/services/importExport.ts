import { Collection, HttpRequest, HttpMethod, BodyType, RawBodyFormat, AuthType } from '../types';

class ImportExportService {
  /**
   * Export collection as JSON
   */
  exportCollectionAsJSON(collection: Collection): string {
    return JSON.stringify(collection, null, 2);
  }

  /**
   * Export request as JSON
   */
  exportRequestAsJSON(request: HttpRequest): string {
    return JSON.stringify(request, null, 2);
  }

  /**
   * Export request as curl command
   */
  exportRequestAsCurl(request: HttpRequest): string {
    let curl = `curl -X ${request.method}`;

    // Add URL
    curl += ` "${request.url}"`;

    // Add headers
    request.headers
      .filter(h => h.enabled)
      .forEach(h => {
        curl += ` \\\n  -H "${h.key}: ${h.value.replace(/"/g, '\\"')}"`;
      });

    // Add body
    if (request.body.type === BodyType.RAW && request.body.raw) {
      // Use single quotes to wrap body so we don't need to escape double quotes inside JSON
      // Replace single quotes with '\'' to properly escape them in shell
      const body = request.body.raw.content.replace(/'/g, "'\\''");
      curl += ` \\\n  -d '${body}'`;
    } else if (request.body.type === BodyType.FORM_DATA && request.body.formData) {
      request.body.formData
        .filter(f => f.enabled)
        .forEach(f => {
          curl += ` \\\n  -F "${f.key}=${f.value}"`;
        });
    } else if (request.body.type === BodyType.X_FORM_URLENCODED && request.body.urlencoded) {
      const params = request.body.urlencoded
        .filter(p => p.enabled)
        .map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
        .join('&');
      curl += ` \\\n  -d '${params}'`;
    }

    return curl;
  }

  /**
   * Parse curl command and create request
   */
  parseCurl(curlCommand: string): HttpRequest {
    const request: HttpRequest = {
      id: `req_${Date.now()}`,
      name: 'Imported from curl',
      method: HttpMethod.GET,
      url: '',
      params: [],
      headers: [],
      body: { type: BodyType.NONE },
      auth: { type: AuthType.NONE },
      scripts: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Remove 'curl' prefix and trailing space
    let cmd = curlCommand.replace(/^curl\s+/, '').trim();

    // Extract method
    const methodMatch = cmd.match(/\s-X\s+([A-Z]+)/i);
    if (methodMatch) {
      request.method = methodMatch[1].toUpperCase() as HttpMethod;
      cmd = cmd.replace(methodMatch[0], '');
    }

    // Extract URL (usually first quoted string or word)
    const urlMatch = cmd.match(/^["']([^"']+)["']|^(\S+)/);
    if (urlMatch) {
      request.url = urlMatch[1] || urlMatch[2];
      cmd = cmd.substring(urlMatch[0].length).trim();
    }

    // Extract headers
    const headerRegex = /\s-H\s+["']([^"']+)["']/g;
    let headerMatch;
    while ((headerMatch = headerRegex.exec(cmd))) {
      const [, headerStr] = headerMatch;
      const [key, ...valueParts] = headerStr.split(':');
      const value = valueParts.join(':').trim();
      
      request.headers.push({
        id: `header_${Date.now()}_${Math.random()}`,
        key: key.trim(),
        value,
        enabled: true,
      });

      cmd = cmd.replace(headerMatch[0], '');
    }

    // Extract body (-d or --data) - handle both single-line and multi-line JSON
    // Try single quotes first (now our default for raw body)
    let bodyMatch = cmd.match(/\s(?:-d|--data)\s+'([\s\S]*?)'(?:\s+-|\s*$)/);
    
    // Try double quotes if single quotes don't match
    if (!bodyMatch) {
      bodyMatch = cmd.match(/\s(?:-d|--data)\s+"([\s\S]*?)"(?:\s+-|\s*$)/);
    }
    
    // Fallback to simpler regex
    if (!bodyMatch) {
      bodyMatch = cmd.match(/\s(?:-d|--data)\s+["']([^"']+)["']/);
    }
    
    if (bodyMatch) {
      let bodyContent = bodyMatch[1];
      
      // Unescape shell-escaped single quotes: '\'' → '
      // This handles the case where single quotes in the original content were escaped as '\'' in the shell
      bodyContent = bodyContent.replace(/'\\'/g, "'");
      
      // Clean up any remaining backslashes before quotes (from legacy double-quote exports)
      // This is for handling curl exports that used \" escaping
      // Only do this if we detect \" pattern
      if (bodyContent.includes('\\"')) {
        // First, handle the specific \" pattern
        bodyContent = bodyContent.replace(/\\"/g, '"');
        // Then handle any other escape sequences that might exist
        bodyContent = bodyContent.replace(/\\\\/g, '\\');
        bodyContent = bodyContent.replace(/\\n/g, '\n');
        bodyContent = bodyContent.replace(/\\t/g, '\t');
      }
      
      // Try to detect if it's JSON, form-urlencoded, or plain text
      if (bodyContent.startsWith('{') || bodyContent.startsWith('[')) {
        request.body = {
          type: BodyType.RAW,
          raw: {
            format: RawBodyFormat.JSON,
            content: bodyContent,
          },
        };
      } else if (bodyContent.includes('=') && !bodyContent.includes(' ')) {
        request.body = {
          type: BodyType.X_FORM_URLENCODED,
          urlencoded: this.parseFormUrlencoded(bodyContent),
        };
      } else {
        request.body = {
          type: BodyType.RAW,
          raw: {
            format: RawBodyFormat.TEXT,
            content: bodyContent,
          },
        };
      }

      cmd = cmd.replace(bodyMatch[0], '');
    }

    // Extract form-data (-F)
    const formRegex = /\s-F\s+["']([^"']+)["']/g;
    let formMatch;
    const formData = [];
    while ((formMatch = formRegex.exec(cmd))) {
      const [, formStr] = formMatch;
      const [key, value] = formStr.split('=');
      formData.push({
        id: `form_${Date.now()}_${Math.random()}`,
        key: key.trim(),
        value: value?.trim() || '',
        enabled: true,
      });
    }

    if (formData.length > 0) {
      request.body = {
        type: BodyType.FORM_DATA,
        formData,
      };
    }

    return request;
  }

  /**
   * Parse form-urlencoded body
   */
  private parseFormUrlencoded(body: string) {
    return body.split('&').map(pair => {
      const [key, value] = pair.split('=');
      return {
        id: `param_${Date.now()}_${Math.random()}`,
        key: decodeURIComponent(key),
        value: decodeURIComponent(value || ''),
        enabled: true,
      };
    });
  }

  /**
   * Import JSON collection
   */
  importCollectionFromJSON(jsonStr: string): Collection {
    try {
      const data = JSON.parse(jsonStr);
      
      // Validate basic structure
      if (!data.id || !data.name) {
        throw new Error('Invalid collection format: missing id or name');
      }

      return {
        ...data,
        createdAt: data.createdAt || Date.now(),
        updatedAt: data.updatedAt || Date.now(),
      };
    } catch (error: any) {
      throw new Error(`Failed to import collection: ${error.message}`);
    }
  }

  /**
   * Import JSON request
   */
  importRequestFromJSON(jsonStr: string): HttpRequest {
    try {
      const data = JSON.parse(jsonStr);
      
      // Validate basic structure
      if (!data.id || !data.name || !data.method || !data.url) {
        throw new Error('Invalid request format: missing required fields');
      }

      return {
        ...data,
        createdAt: data.createdAt || Date.now(),
        updatedAt: data.updatedAt || Date.now(),
      };
    } catch (error: any) {
      throw new Error(`Failed to import request: ${error.message}`);
    }
  }

  /**
   * Download file helper
   */
  downloadFile(content: string, filename: string, type: string = 'application/json'): void {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Copy text to clipboard
   */
  async copyToClipboard(text: string): Promise<void> {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
    } catch (error) {
      throw new Error('Failed to copy to clipboard');
    }
  }
}

export default new ImportExportService();

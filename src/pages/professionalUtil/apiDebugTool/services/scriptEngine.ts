import { HttpRequest, KeyValuePair, BodyType, RawBodyFormat } from '../types';
import variableSystem from './variableSystem';

export interface ScriptExecutionContext {
  request: HttpRequest;
  response?: any;
  variables: Record<string, string>;
  globals: KeyValuePair[];
}

export interface ScriptResult {
  success: boolean;
  output: string;
  error?: string;
  modifiedRequest?: Partial<HttpRequest>;
}

class ScriptEngine {
  /**
   * Create a safe sandbox environment for script execution
   * Exposes only necessary APIs
   */
  private createSandbox(context: ScriptExecutionContext) {
    const modifiedRequest: Partial<HttpRequest> = {};

    return {
      // Request helpers
      request: {
        url: context.request.url,
        method: context.request.method,
        addHeader: (key: string, value: string) => {
          if (!modifiedRequest.headers) {
            modifiedRequest.headers = [...context.request.headers];
          }
          const existing = modifiedRequest.headers?.find(h => h.key === key);
          if (existing) {
            existing.value = value;
          } else {
            modifiedRequest.headers?.push({
              id: `header_${Date.now()}`,
              key,
              value,
              enabled: true,
            });
          }
        },
        setBody: (body: string) => {
          modifiedRequest.body = {
            ...context.request.body,
            type: BodyType.RAW,
            raw: {
              format: RawBodyFormat.TEXT,
              content: body,
            },
          };
        },
      },

      // Response helpers
      response: context.response || {},

      // Variable helpers
      variables: context.variables,
      getVariable: (key: string) => context.variables[key],
      setVariable: (key: string, value: string) => {
        context.variables[key] = value;
      },

      // Built-in utilities
      console: {
        log: (...args: any[]) => console.log(...args),
        error: (...args: any[]) => console.error(...args),
        warn: (...args: any[]) => console.warn(...args),
      },

      // Utility functions
      btoa: (str: string) => btoa(str),
      atob: (str: string) => atob(str),
      JSON: JSON,
      Math: Math,
      Date: Date,

      // Crypto utilities (if available)
      crypto: {
        getRandomValues: (arr: any) => {
          if (typeof window !== 'undefined' && window.crypto) {
            return window.crypto.getRandomValues(arr);
          }
          return arr;
        },
      },
    };
  }

  /**
   * Execute pre-request script
   * Script can modify request before sending
   */
  async executePreRequestScript(
    script: string,
    context: ScriptExecutionContext
  ): Promise<ScriptResult> {
    if (!script || script.trim() === '') {
      return { success: true, output: '' };
    }

    try {
      const sandbox = this.createSandbox(context);
      const fn = new Function(
        'request',
        'response',
        'variables',
        'getVariable',
        'setVariable',
        'console',
        'btoa',
        'atob',
        'JSON',
        'Math',
        'Date',
        'crypto',
        script
      );

      const output: string[] = [];

      // Override console.log to capture output
      const consoleProxy = {
        log: (...args: any[]) => {
          output.push(args.join(' '));
        },
        error: (...args: any[]) => {
          output.push('[ERROR] ' + args.join(' '));
        },
        warn: (...args: any[]) => {
          output.push('[WARN] ' + args.join(' '));
        },
      };

      await fn(
        sandbox.request,
        sandbox.response,
        sandbox.variables,
        sandbox.getVariable,
        sandbox.setVariable,
        consoleProxy,
        sandbox.btoa,
        sandbox.atob,
        sandbox.JSON,
        sandbox.Math,
        sandbox.Date,
        sandbox.crypto
      );

      return {
        success: true,
        output: output.join('\n'),
        modifiedRequest: context.request.body ? {} : undefined,
      };
    } catch (error: any) {
      return {
        success: false,
        output: '',
        error: error.message || 'Unknown script error',
      };
    }
  }

  /**
   * Execute post-response script
   * Script can read response and extract data
   */
  async executePostResponseScript(
    script: string,
    context: ScriptExecutionContext
  ): Promise<ScriptResult> {
    if (!script || script.trim() === '') {
      return { success: true, output: '' };
    }

    try {
      const sandbox = this.createSandbox(context);
      const fn = new Function(
        'request',
        'response',
        'variables',
        'getVariable',
        'setVariable',
        'console',
        'btoa',
        'atob',
        'JSON',
        'Math',
        'Date',
        'crypto',
        script
      );

      const output: string[] = [];

      // Override console.log to capture output
      const consoleProxy = {
        log: (...args: any[]) => {
          output.push(args.join(' '));
        },
        error: (...args: any[]) => {
          output.push('[ERROR] ' + args.join(' '));
        },
        warn: (...args: any[]) => {
          output.push('[WARN] ' + args.join(' '));
        },
      };

      await fn(
        sandbox.request,
        sandbox.response,
        sandbox.variables,
        sandbox.getVariable,
        sandbox.setVariable,
        consoleProxy,
        sandbox.btoa,
        sandbox.atob,
        sandbox.JSON,
        sandbox.Math,
        sandbox.Date,
        sandbox.crypto
      );

      return {
        success: true,
        output: output.join('\n'),
      };
    } catch (error: any) {
      return {
        success: false,
        output: '',
        error: error.message || 'Unknown script error',
      };
    }
  }

  /**
   * Generate signature using custom script
   */
  async generateSignature(
    script: string,
    data: Record<string, any>,
    context: ScriptExecutionContext
  ): Promise<string> {
    try {
      const sandbox = this.createSandbox(context);
      const fn = new Function(
        'request',
        'response',
        'variables',
        'getVariable',
        'setVariable',
        'console',
        'btoa',
        'atob',
        'JSON',
        'Math',
        'Date',
        'crypto',
        `return (${script})`
      );

      const result = await fn(
        sandbox.request,
        sandbox.response,
        sandbox.variables,
        sandbox.getVariable,
        sandbox.setVariable,
        sandbox.console,
        sandbox.btoa,
        sandbox.atob,
        sandbox.JSON,
        sandbox.Math,
        sandbox.Date,
        sandbox.crypto
      );

      return String(result);
    } catch (error: any) {
      console.error('Signature generation error:', error);
      throw new Error(`Failed to generate signature: ${error.message}`);
    }
  }

  /**
   * Validate script syntax without executing
   */
  validateScriptSyntax(script: string): { valid: boolean; error?: string } {
    if (!script || script.trim() === '') {
      return { valid: true };
    }

    try {
      // Try to create function to validate syntax
      new Function(script);
      return { valid: true };
    } catch (error: any) {
      return {
        valid: false,
        error: error.message,
      };
    }
  }
}

export default new ScriptEngine();

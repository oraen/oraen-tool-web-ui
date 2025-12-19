import { KeyValuePair } from '../types';

export interface VariableContext {
  global: KeyValuePair[];
  collection: KeyValuePair[];
  request: KeyValuePair[];
}

// Dynamic variable functions
const variableFunctions = {
  timestamp: () => Date.now().toString(),
  uuid: () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  },
  random: (min: number = 0, max: number = 100) => {
    return Math.floor(Math.random() * (max - min + 1) + min).toString();
  },
  randomString: (length: number = 10) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  },
  now: () => new Date().toISOString(),
};

type VariableFunctionName = keyof typeof variableFunctions;

class VariableSystem {
  /**
   * Merge variables from different scopes (global > collection > request)
   */
  mergeVariables(context: VariableContext): Record<string, string> {
    const merged: Record<string, string> = {};

    // Merge in order: global -> collection -> request
    [...context.global, ...context.collection, ...context.request]
      .filter(v => v.enabled)
      .forEach(v => {
        merged[v.key] = v.value;
      });

    return merged;
  }

  /**
   * Replace variables in text using {{variable}} syntax
   */
  replaceVariables(text: string, variables: Record<string, string>): string {
    if (!text) return text;

    // Replace {{variable}} patterns
    return text.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
      key = key.trim();

      // Check for function calls like {{timestamp()}} or {{random(1,10)}}
      const functionMatch = key.match(/^(\w+)\((.*)\)$/);
      if (functionMatch) {
        const funcName = functionMatch[1] as VariableFunctionName;
        const argsStr = functionMatch[2];

        if (funcName in variableFunctions) {
          const func = variableFunctions[funcName] as any;
          const args = argsStr ? argsStr.split(',').map((arg: string) => arg.trim()) : [];
          try {
            return func(...args);
          } catch (e) {
            console.warn(`Error executing function ${funcName}:`, e);
            return match;
          }
        }
      }

      // Otherwise, look up in variables
      return variables[key] || match;
    });
  }

  /**
   * Replace variables in object (deep replacement)
   */
  replaceVariablesInObject<T extends Record<string, any>>(
    obj: T,
    variables: Record<string, string>
  ): T {
    const result = { ...obj } as any;

    Object.keys(result).forEach((key: string) => {
      const value = result[key];

      if (typeof value === 'string') {
        result[key] = this.replaceVariables(value, variables);
      } else if (typeof value === 'object' && value !== null) {
        result[key] = this.replaceVariablesInObject(value, variables);
      }
    });

    return result as T;
  }

  /**
   * Extract variables from text (find all {{...}} patterns)
   */
  extractVariables(text: string): string[] {
    const matches = text.matchAll(/\{\{([^}]+)\}\}/g);
    return Array.from(matches).map(m => m[1].trim());
  }

  /**
   * Validate variable syntax
   */
  validateVariableSyntax(text: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const stack: { char: string; pos: number }[] = [];

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const prev = text[i - 1];

      if (char === '{' && prev === '{') {
        stack.push({ char: '{{', pos: i - 1 });
      } else if (char === '}' && text[i + 1] === '}') {
        if (stack.length === 0 || stack[stack.length - 1].char !== '{{') {
          errors.push(`Unmatched closing }} at position ${i}`);
        } else {
          stack.pop();
        }
      }
    }

    if (stack.length > 0) {
      stack.forEach(s => {
        errors.push(`Unclosed {{ at position ${s.pos}`);
      });
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get list of available variables (for autocomplete)
   */
  getAvailableVariables(context: VariableContext): Record<string, any> {
    const merged = this.mergeVariables(context);

    return {
      ...merged,
      ...Object.keys(variableFunctions).reduce((acc, func) => {
        acc[func] = `{{${func}()}}`;
        return acc;
      }, {} as Record<string, string>),
    };
  }
}

export default new VariableSystem();

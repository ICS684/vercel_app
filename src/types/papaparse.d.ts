// src/types/papaparse.d.ts

declare module 'papaparse' {
  /** Error info for a single row */
  export interface ParseError {
    type: string;
    code: string;
    message: string;
    row: number;
  }

  /** Metadata about the parse */
  export interface ParseMeta {
    delimiter: string;
    linebreak: string;
    aborted: boolean;
    truncated: boolean;
    cursor: number;
    fields?: string[];
  }

  /** Result object returned to `complete` callback */
  export interface ParseResult<T> {
    data: T[];
    errors: ParseError[];
    meta: ParseMeta;
  }

  /** Config for parsing. Only the options we actually use are typed. */
  export interface ParseConfig<T> {
    delimiter?: string;
    header?: boolean;
    dynamicTyping?: boolean | { [field: string]: boolean };
    skipEmptyLines?: boolean | 'greedy';

    complete?(results: ParseResult<T>): void;
    error?(error: ParseError, file?: any): void;

    // You can add more Papa options here if you start using them.
  }

  /** Generic parse function */
  export function parse<T = any>(
    input: string,
    config?: ParseConfig<T>,
  ): ParseResult<T>;

  /** Default export "Papa" with a .parse method */
  interface PapaStatic {
    parse: typeof parse;
  }

  const Papa: PapaStatic;
  export default Papa;
}

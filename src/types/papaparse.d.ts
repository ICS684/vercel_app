declare module 'papaparse' {
  const Papa: any;
  export default Papa;

  export interface ParseResult<T> {
    data: T[];
    errors: any[];
    meta: any;
  }
}

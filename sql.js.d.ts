// Minimal declaration for sql.js — we only use the subset below.
declare module 'sql.js' {
  interface QueryExecResult {
    columns: string[]
    values: any[][]
  }
  interface Database {
    exec(sql: string): QueryExecResult[]
    close(): void
  }
  interface SqlJsStatic {
    Database: new (data?: Uint8Array) => Database
  }
  interface InitOptions {
    locateFile?: (file: string) => string
  }
  export default function initSqlJs(config?: InitOptions): Promise<SqlJsStatic>
}

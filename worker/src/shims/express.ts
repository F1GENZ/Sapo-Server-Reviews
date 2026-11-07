export type NextFunction = (err?: unknown) => void;

export interface Request {
  method: string;
  url: string;
  originalUrl: string;
  path: string;
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, unknown>;
  body: Record<string, unknown>;
  rawBody?: Buffer;
  socket?: { remoteAddress?: string };
  [key: string]: unknown;
}

export interface Response {
  statusCode: number;
  headersSent: boolean;
  status(code: number): this;
  setHeader(name: string, value: string | string[]): this;
  removeHeader(name: string): void;
  vary(field: string): this;
  set(field: string | Record<string, string>, value?: string | string[]): this;
  redirect(codeOrUrl: number | string, maybeUrl?: string): void;
  json(payload: unknown): this;
  send(payload?: unknown): this;
  end(payload?: unknown): this;
}

const expressShim = {};
export default expressShim;

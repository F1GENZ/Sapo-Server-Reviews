export default class Redis {
  constructor(..._args: unknown[]) {}
  on(_event: string, _cb: (...args: unknown[]) => void): this {
    return this;
  }
  async quit(): Promise<string> {
    return 'OK';
  }
  disconnect(): void {}
  async get(_key: string): Promise<string | null> { return null; }
  async set(_key: string, _val: string, ..._args: unknown[]): Promise<string | null> { return 'OK'; }
  async del(..._keys: string[]): Promise<number> { return 0; }
  async getdel(_key: string): Promise<string | null> { return null; }
  async eval(_script: string, _numKeys: number, ..._args: unknown[]): Promise<unknown> { return 0; }
  async ttl(_key: string): Promise<number> { return -2; }
  async ping(): Promise<string> { return 'PONG'; }
  async scan(_cursor: string | number, ..._args: unknown[]): Promise<[string, string[]]> { return ['0', []]; }
}

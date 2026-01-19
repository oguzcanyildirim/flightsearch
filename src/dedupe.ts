// dedupe.ts

export interface SeenDeal {
    hash: string;
    seenAt: number;
  }
  
  export class SeenDealStore {
    private readonly filePath: string;
    private readonly ttlMs: number;
    private map = new Map<string, SeenDeal>();
  
    constructor(args: { filePath: string; ttlMs: number }) {
      this.filePath = args.filePath;
      this.ttlMs = args.ttlMs;
    }
  
    async load(): Promise<void> {
      try {
        const text = await Deno.readTextFile(this.filePath);
        const data = (JSON.parse(text) as SeenDeal[]) ?? [];
        const now = Date.now();
  
        this.map.clear();
        for (const row of data) {
          if (!row?.hash || !row?.seenAt) continue;
          if (now - row.seenAt > this.ttlMs) continue;
          this.map.set(row.hash, row);
        }
      } catch {
        this.map.clear();
      }
    }
  
    has(hash: string): boolean {
      return this.map.has(hash);
    }
  
    mark(hash: string): void {
      this.map.set(hash, { hash, seenAt: Date.now() });
    }
  
    size(): number {
      return this.map.size;
    }
  
    async save(): Promise<void> {
      const rows = [...this.map.values()];
      await Deno.writeTextFile(this.filePath, JSON.stringify(rows, null, 2));
    }
  }
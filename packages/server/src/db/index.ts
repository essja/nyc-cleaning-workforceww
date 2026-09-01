import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class DatabaseService {
  private static instance: DatabaseService;
  private db: DatabaseSync;

  private constructor(dbPath?: string) {
    let targetPath = dbPath || process.env.DATABASE_PATH || process.env.DATABASE_URL;

    if (!targetPath) {
      // Check if Render persistent disk is mounted at /data or /var/data
      if (fs.existsSync('/data')) {
        targetPath = '/data/workforce.sqlite';
      } else if (fs.existsSync('/var/data')) {
        targetPath = '/var/data/workforce.sqlite';
      } else if (fs.existsSync('/app/data')) {
        targetPath = '/app/data/workforce.sqlite';
      } else {
        const dataDir = path.resolve(__dirname, '../../data');
        if (!fs.existsSync(dataDir)) {
          fs.mkdirSync(dataDir, { recursive: true });
        }
        targetPath = path.join(dataDir, 'workforce.sqlite');
      }
    }

    // Ensure parent directory of targetPath exists
    const parentDir = path.dirname(targetPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    console.log(`💾 SQLite Database connected at: ${targetPath}`);

    this.db = new DatabaseSync(targetPath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.db.exec('PRAGMA busy_timeout = 5000;');
  }

  public static getInstance(dbPath?: string): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService(dbPath);
    }
    return DatabaseService.instance;
  }

  public getDb(): DatabaseSync {
    return this.db;
  }

  public query<T = any>(sql: string, params: any[] = []): T[] {
    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as T[];
  }

  public queryOne<T = any>(sql: string, params: any[] = []): T | null {
    const stmt = this.db.prepare(sql);
    const row = stmt.get(...params);
    return (row as T) || null;
  }

  public execute(sql: string, params: any[] = []): any {
    const stmt = this.db.prepare(sql);
    return stmt.run(...params);
  }

  public execScript(sql: string): void {
    this.db.exec(sql);
  }

  public transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN TRANSACTION;');
    try {
      const result = fn();
      this.db.exec('COMMIT;');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK;');
      throw error;
    }
  }

  public close(): void {
    this.db.close();
  }
}

export const getDb = () => DatabaseService.getInstance().getDb();
export const db = DatabaseService.getInstance();

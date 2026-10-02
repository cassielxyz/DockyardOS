declare const process: any;
declare const Buffer: any;
type Buffer = any;

declare namespace NodeJS {
  interface ErrnoException extends Error {
    code?: string;
  }
}

declare module "node:crypto" {
  export function createHash(...args: any[]): any;
  export function randomUUID(): string;
  export function verify(...args: any[]): boolean;
  export function sign(...args: any[]): any;
  export function createPublicKey(...args: any[]): any;
  export function createPrivateKey(...args: any[]): any;
  export function generateKeyPairSync(...args: any[]): any;
}

declare module "node:os" {
  export function homedir(): string;
}

declare module "node:path" {
  export function basename(path: string): string;
  export function dirname(path: string): string;
  export function resolve(...paths: string[]): string;
  export function join(...paths: string[]): string;
  export function relative(from: string, to: string): string;
  export function isAbsolute(path: string): boolean;
  export function extname(path: string): string;
}

declare module "node:url" {
  export function fileURLToPath(url: any): string;
}

declare module "node:zlib" {
  export function gzipSync(...args: any[]): any;
}

declare module "node:fs/promises" {
  export function access(...args: any[]): Promise<any>;
  export function mkdir(...args: any[]): Promise<any>;
  export function open(...args: any[]): Promise<any>;
  export function readFile(...args: any[]): Promise<any>;
  export function readdir(...args: any[]): Promise<any>;
  export function realpath(...args: any[]): Promise<any>;
  export function rename(...args: any[]): Promise<any>;
  export function rm(...args: any[]): Promise<any>;
  export function writeFile(...args: any[]): Promise<any>;
  export function lstat(...args: any[]): Promise<any>;
  export function stat(...args: any[]): Promise<any>;
  export function cp(...args: any[]): Promise<any>;
}

declare module "node:fs" {
  export const constants: any;
  export function existsSync(path: string): boolean;
}

declare module "node:child_process" {
  export function spawnSync(...args: any[]): any;
}

export declare const DEMO_DOMAIN: string;
export declare function isDemoEmail(email: string): boolean;
export declare function activeDemoAccounts<T extends { email: string; isActive: boolean }>(users: T[]): T[];
export declare function validateNewAdmin(input: { email?: string; password?: string; name?: string }):
  | { ok: true; email: string; password: string; name: string }
  | { ok: false; error: string };

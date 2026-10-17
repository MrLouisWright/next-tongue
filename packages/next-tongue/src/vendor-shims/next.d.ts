/**
 * Minimal ambient typings so the package builds without resolving next's
 * NodeNext export map. Apps still use their installed `next` at runtime.
 */
declare module 'next/link' {
  import type { ComponentType, ReactNode } from 'react';
  type LinkProps = {
    href: string;
    locale?: string;
    replace?: boolean;
    scroll?: boolean;
    prefetch?: boolean;
    children?: ReactNode;
    className?: string;
    [key: string]: unknown;
  };
  const Link: ComponentType<LinkProps>;
  export default Link;
}

declare module 'next/navigation' {
  export function usePathname(): string;
  export function useRouter(): {
    push: (href: string, options?: { scroll?: boolean }) => void;
    replace: (href: string, options?: { scroll?: boolean }) => void;
    prefetch: (href: string) => void;
    back: () => void;
    forward: () => void;
    refresh: () => void;
  };
  export function redirect(url: string): never;
  export function permanentRedirect(url: string): never;
}

declare module 'next/root-params' {
  /** Present when `experimental.rootParams` is on and `[locale]` is a root layout. */
  export function locale(): Promise<string>;
}

declare module 'next/headers' {
  export function cookies(): Promise<{
    set: (
      name: string,
      value: string,
      options?: {
        httpOnly?: boolean;
        sameSite?: 'lax' | 'strict' | 'none';
        secure?: boolean;
        path?: string;
        maxAge?: number;
      },
    ) => void;
    get: (name: string) => { value: string } | undefined;
  }>;
  export function headers(): Headers;
  export function draftMode(): { isEnabled: boolean };
}

declare module 'next/server' {
  export class NextResponse extends Response {
    static redirect(url: string | URL, init?: number): NextResponse;
    static rewrite(url: string | URL): NextResponse;
    static next(): NextResponse;
    readonly cookies: {
      set: (
        name: string,
        value: string,
        options?: Record<string, unknown>,
      ) => void;
    };
  }
  export class NextRequest extends Request {
    readonly nextUrl: URL & { clone(): URL & { pathname: string } };
    readonly cookies: {
      get: (name: string) => { value: string } | undefined;
    };
  }
}

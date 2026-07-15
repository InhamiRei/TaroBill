/// <reference types="vite/client" />

import type { TaroBillApi } from '../shared/types';

declare global {
  // 由 Vite define 注入，取值同步 package.json 的 version，避免手改两处。
  const __APP_VERSION__: string;
  interface Window {
    taroBill?: TaroBillApi;
  }
}

export {};

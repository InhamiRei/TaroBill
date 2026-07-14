/// <reference types="vite/client" />

import type { TaroBillApi } from '../shared/types'

declare global {
  interface Window {
    taroBill?: TaroBillApi
  }
}

export {}


/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_BUBBLEBEAR_COUNT?: string;
  readonly VITE_BUBBLEBEAR_SPEED?: string;
  readonly VITE_BUBBLEBEAR_ROTATION?: string;
  readonly VITE_BUBBLEBEAR_SCALE?: string;
  readonly VITE_BUBBLEBEAR_OPACITY?: string;
  readonly VITE_BUBBLEBEAR_HAIR_OPACITY?: string;
  readonly VITE_BUBBLEBEAR_DPR?: string;
  readonly VITE_BUBBLEBEAR_GRAVITY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

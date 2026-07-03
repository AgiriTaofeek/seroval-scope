import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    // Required for wxt/utils/storage (panel/settings.ts — the persisted URL
    // filter pattern and "clear on navigate" toggle). Without this, WXT's
    // storage helper throws at runtime ("You must add the 'storage'
    // permission..."), which silently broke settings persistence.
    permissions: ['storage'],
  },
});

export interface TestUserData {
  id: string;
  email: string;
}

// global-setup / auth.setup.ts で共有するパスワード定数
// ファイルに書き出さず、定数として両方から参照する
export const E2E_PASSWORD = "e2e-test-password-12345";

// storageState の保存パス (playwright.config.ts と auth.setup.ts で共有)
export const STORAGE_STATE_PATH = "tests/large/.auth/user.json";

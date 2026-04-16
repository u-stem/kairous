import { loadEnvLocal } from "../../shared/env";

loadEnvLocal();

export { getAdminClient, createTestUser, deleteTestUser } from "../../shared/db";
export {
  createTestSubject,
  createTestCategory,
  createTestMaterial,
  createTestCard,
  getSrsMethodId,
  getWakefulRestMethodId,
  getMethodIdBySlug,
  linkMaterialMethod,
  createTestSrsState,
  createTestSession,
  createTestTag,
  addTestTagToMaterial,
  cleanupTestData,
} from "../../shared/helpers";

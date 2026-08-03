/**
 * Metro config for a pnpm workspace.
 *
 * Two things differ from a standalone Expo app, and both are needed because
 * @open-innings/scoring and @open-innings/shared are workspace packages that
 * ship raw TypeScript rather than a built dist/:
 *
 *   1. watchFolders — Metro only watches the project directory by default, so
 *      an edit to the scoring engine wouldn't trigger a reload without this.
 *   2. nodeModulesPaths — pnpm puts most real packages in the root store and
 *      symlinks them. Metro has to be told to look up there too.
 *
 * Note what is deliberately NOT set here: `disableHierarchicalLookup`. That is
 * standard advice for npm/yarn workspaces, where hoisting means everything
 * lives in one root node_modules and upward traversal only finds duplicates.
 * pnpm is the opposite — each package's dependencies sit beside it in the
 * store and are found precisely by walking up from the importing file, so
 * disabling that breaks resolution of any transitive dependency (it surfaces
 * as "Unable to resolve module whatwg-fetch" and similar, from deep inside
 * Expo's own internals).
 */
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = withNativeWind(config, { input: './global.css' });

// n8n's community-node lint rules (eslint-plugin-n8n-nodes-base), set up like n8n's n8n-nodes-starter.
module.exports = {
	root: true,
	env: { node: true, es6: true },
	parser: '@typescript-eslint/parser',
	parserOptions: { project: ['./tsconfig.json'], sourceType: 'module', extraFileExtensions: ['.json'] },
	ignorePatterns: ['.eslintrc.js', '**/*.js', '**/node_modules/**', '**/dist/**', 'nodes/Apish/catalog.ts'],
	overrides: [
		{ files: ['package.json'], parserOptions: { project: null }, plugins: ['eslint-plugin-n8n-nodes-base'], extends: ['plugin:n8n-nodes-base/community'], rules: { 'n8n-nodes-base/community-package-json-name-still-default': 'off' } },
		{ files: ['./credentials/**/*.ts'], plugins: ['eslint-plugin-n8n-nodes-base'], extends: ['plugin:n8n-nodes-base/credentials'], rules: { 'n8n-nodes-base/cred-class-field-documentation-url-missing': 'off', 'n8n-nodes-base/cred-class-field-documentation-url-miscased': 'off' } },
		{ files: ['./nodes/**/*.ts'], plugins: ['eslint-plugin-n8n-nodes-base'], extends: ['plugin:n8n-nodes-base/nodes'], rules: { 'n8n-nodes-base/node-class-description-inputs-wrong-regular-node': 'off', 'n8n-nodes-base/node-class-description-outputs-wrong': 'off', 'n8n-nodes-base/node-execute-block-missing-continue-on-fail': 'off', 'n8n-nodes-base/node-resource-description-filename-against-convention': 'off', 'n8n-nodes-base/node-param-fixed-collection-type-unsorted-items': 'off' } },
	],
};

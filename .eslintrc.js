module.exports = {
	root: true,
	env: {
		browser: true,
		es6: true,
		node: true,
	},
	parser: '@typescript-eslint/parser',
	parserOptions: {
		sourceType: 'module',
		ecmaVersion: 2020,
	},
	plugins: ['@typescript-eslint'],
	extends: [
		'eslint:recommended',
	],
	rules: {
		'@typescript-eslint/no-unused-vars': 'error',
		'no-unused-vars': 'off',
	},
	ignorePatterns: ['dist/**', 'node_modules/**', '*.js', 'gulpfile.js'],
};

const { src, dest, parallel } = require('gulp');

function buildIconsAssets() {
	return src('assets/**/*.{png,svg}')
		.pipe(dest('dist/assets/'));
}

function buildIconsCredentials() {
	return src('dist/assets/zalo.svg')
		.pipe(dest('dist/credentials/'));
}

function buildIconsNodes() {
	return src('dist/assets/zalo.svg')
		.pipe(dest('dist/nodes/ZaloOaRefreshToken/'));
}

const buildIcons = parallel(buildIconsAssets, buildIconsCredentials, buildIconsNodes);

exports['build:icons'] = buildIcons;
exports.default = buildIcons;

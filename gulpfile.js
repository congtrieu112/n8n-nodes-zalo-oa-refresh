const { src, dest } = require('gulp');

function buildIcons() {
	return src('assets/**/*.{png,svg}')
		.pipe(dest('dist/assets/'));
}

exports['build:icons'] = buildIcons;
exports.default = buildIcons;

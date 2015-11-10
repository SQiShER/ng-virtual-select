const gulp = require('gulp'),
  sourcemaps = require('gulp-sourcemaps'),
  autoprefixer = require('gulp-autoprefixer'),
  concat = require('gulp-concat'),
  templateCache = require('gulp-angular-templatecache'),
  del = require('del'),
  path = require('path');

const options = {
  tempDir: '.tmp/',
  buildDir: 'dist/'
}

gulp.task('css', () => {
  return gulp.src('src/*.css')
    .pipe(sourcemaps.init())
    .pipe(autoprefixer({
      browsers: ['last 2 versions'],
      cascade: false
    }))
    .pipe(sourcemaps.write('.'))
    .pipe(gulp.dest(options.buildDir));
});

gulp.task('templates', () => {
  return gulp.src('src/ui-virtual-select.tpl.html')
    .pipe(templateCache('ui-virtual-select.tpl.js', {
      module: 'uiVirtualSelect'
    }))
    .pipe(gulp.dest(options.tempDir));
});

gulp.task('javascript', ['templates'], () => {
  return gulp.src(['src/*.js', options.tempDir + '/ui-virtual-select.tpl.js'])
    .pipe(sourcemaps.init())
    .pipe(concat('ui-virtual-select.js'))
    .pipe(sourcemaps.write('.'))
    .pipe(gulp.dest(options.buildDir));
});

gulp.task('clean', () => {
  return del([
    options.buildDir,
    options.tempDir
  ]);
});

gulp.task('build', ['css', 'javascript']);

gulp.task('develop', ['build'], () => {
  gulp.watch('src/**/*.css', ['css']);
  gulp.watch(['src/**/*.js', 'src/**/*.tpl.html'], ['javascript']);
});

gulp.task('release', ['build']);
gulp.task('default', ['develop']);

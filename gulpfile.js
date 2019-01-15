const gulp = require("gulp");
const vuePack = require("./src");

gulp.task("example", () => {
  return gulp.src("example/**/*.vue")
    .pipe(vuePack())
    .pipe(gulp.dest("build/"))
});
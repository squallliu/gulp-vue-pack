const gulp = require("gulp");
const vuePack = require("./src");

gulp.task("example", () => {
  return gulp.src("example/**/*.vue")
    .pipe(vuePack({
      style: 'less'
    }))
    .pipe(gulp.dest("build/"))
});
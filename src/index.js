"use strict";

const through2 = require("through2");
const path = require("path");
const File = require("vinyl");
const HTMLParser = require("htmlparser2");
const PluginError = require('plugin-error');

const SCRIPT = "script";
const STYLE = "style";
const TEMPLATE = "template";

const TEMPLATE_ESCAPE_REG = /'/mg
const TEMPLATE_ESCAPE_REG2 = /\r?\n/mg;
const SCRIPT_REPLACER_REG = /^\s*export\s+default\s*/im;
const VUE_COMPONENT_IMPORT_REG = /^\s*import\s+([^\s]+)\s+from\s+([^;\n]+)[\s;]+?$/mg;

module.exports = (options = {}) => {
  return through2.obj(function (file, encoding, callback) {
    if (!file) {
      throw new PluginError('gulp-vue-pack', 'file不存在');
    }

    if (file.isStream()) {
      throw new PluginError('gulp-vue-pack', '只支持.vue文件');
    }

    //非文件,是目录
    if (!file.contents) {
      callback();
      return;
    }

    const filename = path.basename(file.path, ".vue");
    const fileContent = file.contents.toString(encoding);
    const contents = parseVueToContents(fileContent, filename, path.dirname(file.path), options);
    const fpath = path.dirname(file.path);
    this.push(createFile(file.base, file.cwd, fpath, filename + ".js", contents.js));
    //如果css文件无内容，则不生成css文件
    if (contents.css.length > 0) {
      this.push(createFile(file.base, file.cwd, fpath, filename + ".css", contents.css));
    }

    callback();
  });
};

function createFile(base, cwd, fpath, filename, content) {
  return new File({
    base: base,
    cwd: cwd,
    path: path.join(fpath, filename),
    contents: Buffer.from(content)
  });
}

function parseVueToContents(vueContent, filename, filePath, options) {
  let scriptContents = "";
  let styleContents = "";
  let templateContents = "";

  let DomUtils = HTMLParser.DomUtils;
  let domEls = HTMLParser.parseDOM(vueContent, { lowerCaseTags: true });

  for (let i = 0, len = domEls.length; i < len; i++) {
    switch (domEls[i].name) {
      case SCRIPT:
        scriptContents = DomUtils.getText(domEls[i]);
        break;
      case TEMPLATE:
        templateContents = DomUtils.getInnerHTML(domEls[i]);
        break;
      case STYLE:
        styleContents = DomUtils.getText(domEls[i]).trim();
        break;
    }
  }

  let jsContent = convertToJSContent(scriptContents, templateContents, styleContents, filename, filePath, options);
  return {
    js: jsContent,
    css: styleContents
  }
}

/**
 * 将vue文件中的内容，进行转换，生成多页引用的vue
 * @param script 脚本内容
 * @param template 模板内容
 * @param style 样式内容
 * @param filename 文件名
 * @param filePath 文件路径
 * @returns {*}
 */
function convertToJSContent(script, template, style, filename, filePath, options) {
  if (!script) {
    return "";
  }

  let result = `(function(global, Vue){
  `;

  if (options.autoLinkCss && style && style.length > 0) {
    result += `
    (function(){
      function getCurrentScriptBase() {
        var src, lidx, scripts;
        
        if (document.currentScript) {
          src = document.currentScript.src;
        } else {
          scripts = document.getElementsByTagName('script');
          src = scripts[scripts.length - 1].src;
        }
        
        lidx = src.lastIndexOf("/");
        return src.substring(0, lidx);
      }
      
      var styleLink = document.createElement('link');
      styleLink.rel = "stylesheet";
      styleLink.href = getCurrentScriptBase() + "/" + "` + filename + `.css";
      document.head.appendChild(styleLink);
    }());\n`;
  }

  //兼容 windows
  filePath = filePath.replace(/\\/g, "/");
  result += processJavascript(filename, script, processTemplate(template));
  result += "\n\nglobal." + filename + " = " + filename + ";\n\n";
  //伪造ES6格式的VUE组件
  result += "Vue.component('" + componentNameFrom(filename) + "', " + filename + ");\n\n";
  result += "\n}(window, Vue));";
  return result;
}

/**
 * 转义模板
 * @param template
 * @returns {string}
 */
function processTemplate(template) {
  return "'" + template.replace(TEMPLATE_ESCAPE_REG, "\\'").replace(TEMPLATE_ESCAPE_REG2, "\\\n") + "'";
}

/**
 * 处理js  将es6写的带export的部分转换成普通的组件定义
 * @param fileName
 * @param result
 * @param processedTemplate
 * @param style
 * @returns {string|*}
 */
function processJavascript(fileName, result, processedTemplate) {
  result = result.replace(VUE_COMPONENT_IMPORT_REG, function () {
    return '';
  });

  result = result.replace(SCRIPT_REPLACER_REG, "var " + fileName + " = Vue.extend(");
  result += ");\n";
  result += fileName + ".options.template = " + processedTemplate + ";";
  return result;
}

function componentNameFrom(filename) {
  let result = filename.replace(/([A-Z])/g, "-$1").toLowerCase();
  if (result.slice(0, 1) === '-') {
    result = result.slice(1);
  }
  return result;
}
// Karma configuration
// Generated on Tue Nov 10 2015 22:00:20 GMT+0100 (CET)

module.exports = function(config) {
  config.set({

    // base path that will be used to resolve all patterns (eg. files, exclude)
    basePath: '',


    // frameworks to use
    // available frameworks: https://npmjs.org/browse/keyword/karma-adapter
    frameworks: ['chai-sinon', 'jquery-chai', 'chai-as-promised', 'chai', 'mocha'],


    // list of files / patterns to load in the browser
    files: [
      'https://cdnjs.cloudflare.com/ajax/libs/lodash.js/3.5.0/lodash.min.js',
      'https://cdnjs.cloudflare.com/ajax/libs/jquery/2.1.3/jquery.min.js',
      'https://cdnjs.cloudflare.com/ajax/libs/angular.js/1.4.7/angular.min.js',
      'https://cdnjs.cloudflare.com/ajax/libs/angular.js/1.4.7/angular-mocks.js',
      'node_modules/babel-polyfill/dist/polyfill.js',
      'src/*.js',
      'src/*.html',
      'test/*.spec.js'
    ],


    // list of files to exclude
    exclude: [],


    // preprocess matching files before serving them to the browser
    // available preprocessors: https://npmjs.org/browse/keyword/karma-preprocessor
    preprocessors: {
      'src/*.html': ['ng-html2js'],
      'src/*.js': ['babel'],
      'test/*.js': ['babel']
    },


    // test results reporter to use
    // possible values: 'dots', 'progress'
    // available reporters: https://npmjs.org/browse/keyword/karma-reporter
    reporters: ['spec'],


    // web server port
    port: 9876,


    // enable / disable colors in the output (reporters and logs)
    colors: true,


    // level of logging
    // possible values: config.LOG_DISABLE || config.LOG_ERROR || config.LOG_WARN || config.LOG_INFO || config.LOG_DEBUG
    logLevel: config.LOG_INFO,


    // enable / disable watching file and executing tests whenever any file changes
    autoWatch: true,


    // start these browsers
    // available browser launchers: https://npmjs.org/browse/keyword/karma-launcher
    browsers: ['PhantomJS'],


    // Continuous Integration mode
    // if true, Karma captures browsers, runs the tests and exits
    singleRun: false,

    // Concurrency level
    // how many browser should be started simultanous
    concurrency: Infinity,


    ngHtml2JsPreprocessor: {
      // strip this from the file path
      stripPrefix: 'src/',
    },


    babelPreprocessor: {
      options: {
        presets: ['es2015'],
        sourceMap: 'inline'
      }
    // ,
    // filename: function(file) {
    //   return file.originalPath.replace(/\.js$/, '.es5.js');
    // },
    // sourceFileName: function(file) {
    //   return file.originalPath;
    // }
    },


    specReporter: {
      suppressSkipped: true
    },


    // client: {
    //   captureConsole: true,
    //   mocha: {
    //     bail: true
    //   }
    // }

  })
}

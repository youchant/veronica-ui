
'use strict';

module.exports = function (grunt) {

    var thirdPath = '../../node_modules'; // '../../bower_components';
    var nodeModulePath = './node_modules';
    var bowerPath = '../../bower_components';
    function createOptions(moduleName) {
        var options = {
            baseUrl: './src/js',
            dir: './dist/js',
            paths: {
                "jquery": "empty:",
                'bootstrap': '../assets/bootstrap-flat/bootstrap',
                'kendo-ui': '../assets/kendo-ui-core/kendo.ui.core',
                'kendo-ui-messages': '../assets/kendo-ui-core/kendo.messages.zh-CN',
                'kendo-ui-culture': '../assets/kendo-ui-core/kendo.culture.zh-CN',
                'text': thirdPath + '/requirejs-text/text',
                'jquery-validation': thirdPath + '/jquery-validation/dist/jquery.validate',
                'jquery-validation-additional': thirdPath + '/jquery-validation/dist/additional-methods',
                'jquery-validation-unobtrusive': thirdPath + '/jquery-validation-unobtrusive/jquery.validate.unobtrusive',
                'jquery-validation-bootstrap-tooltip': '../assets/jquery-validation-bootstrap-tooltip/jquery-validate.bootstrap-tooltip',
                'noty': thirdPath + '/noty/js/noty/packaged/jquery.noty.packaged',
                'qtip2': thirdPath + '/qtip2/dist/jquery.qtip',
                'bootstrap-datetimepicker': bowerPath + '/eonasdan-bootstrap-datetimepicker/src/js/bootstrap-datetimepicker',
                'moment': bowerPath + '/moment/moment',
                'jquery-form': bowerPath + '/jquery-form/jquery.form',
                //'jquery-inputmask': thirdPath + '/jquery.inputmask/dist/jquery.inputmask.bundle',
                //'table-to-json': thirdPath + '/table-to-json/lib/jquery.tabletojson',
                //'form2js': thirdPath + '/form2js/src/form2js',
                //'jquery-placeholder': thirdPath + '/jquery-placeholder/jquery.placeholder',
                //'es5-shim': thirdPath + '/es5-shim/es5-shim'
            },
            map: {
                '*': {
                    './jquery.validate': 'jquery-validation'
                }
            },
            shim: {
                'jquery-validation-bootstrap-tooltip': {
                    deps: ['jquery-validation']
                },
                'jquery-validation-additional': {
                    deps: ['jquery-validation']
                },
                'jquery-validation-unobtrusive': {
                    deps: ['jquery-validation-bootstrap-tooltip', 'jquery-validation-additional']
                },
                // 'moment-cn': {
                //   deps: ['moment']
                // },
                'bootstrap-datetimepicker': {
                    deps: ['moment']
                },
                'kendo-ui-messages': {
                    deps: ['kendo-ui']
                },
                'kendo-ui-culture': {
                    deps: ['kendo-ui', 'kendo-ui-messages']
                }
            },
            wrapShim: true,
            modules: [{
                name: moduleName,
                include: [thirdPath + "/almond/almond"],
                exclude: ["jquery", "text"]
            }],
            wrap: {
                "startFile": 'tools/wrap.start',
                "endFile": 'tools/wrap.end'
            },
            removeCombined: false,
            optimize: "none",
            onBuildWrite: function (moduleName, path, contents) {
                //Always return a value.
                //This is just a contrived example.
                return contents.replace(/"\.\.\/jquery\.validate"/g, '"jquery-validation"');
            }
        };

        return options;
    }

    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        requirejs: {
            main: {
                options: createOptions('./veronica-ui')
            }
        },
        less: {
            production: {
                options: {
                    modifyVars: {
                        'font-url': '"../fonts/fonttiny"'
                    }
                },
                files: {
                    "dist/css/default.css": "src/less/themes/default/index.less"
                }
            }
        },
        concat: {
            style: {
                files: [{
                    src: ['src/less/themes/default/bs-variables.less', 'src/less/themes/default/variables.less'],
                    dest: 'dist/less/default/variables.less'
                }, {
                    src: ['src/less/basic/bs-mixins.less', 'src/less/mixins.less'],
                    dest: 'dist/less/mixins.less'
                }]
            }
        },
        copy: {
            style: {
                files: [{
                    expand: true,
                    src: [nodeModulePath + '/font-awesome/fonts/*'],
                    dest: 'dist/fonts/', flatten: true
                }, {
                    expand: true,
                    src: [nodeModulePath + '/bootstrap/fonts/*'],
                    dest: 'dist/fonts/', flatten: true
                }, {
                    expand: true,
                    src: ['./bower_components/kendo-ui/styles/fonts/glyphs/*'],
                    dest: 'dist/fonts/', flatten: true
                }, {
                    expand: true,
                    cwd: './src/img/',
                    src: ['**/*'],
                    dest: './dist/img/', flatten: false
                }]
            },
            styleguide: {
                files: [{
                    expand: true,
                    cwd: 'bower_components/',
                    src: [
                        'jquery/**/*'
                    ],
                    dest: 'docs/styleguide/assets'
                }, {
                    expand: true,
                    cwd: 'dist/',
                    src: ['**/*'],
                    dest: 'docs/styleguide/assets/veronica-ui'
                }, {
                    expand: true,
                    cwd: 'src/styleguide/',
                    src: ['**/*.js'],
                    dest: 'docs/styleguide/assets'
                }, {
                    src: 'src/assets/demo/index.html',
                    dest: 'site/index.html'
                }]
            }
        },
        clean: {
            script: [
            'dist/js/**/*',
            'dist/*.*.js',
            '!dist/js/veronica-ui.*'
            ]
        },
        uglify: {
            options: {
                sourceMap: true,
                report: 'gzip'
            },
            main: {
                files: {
                    'dist/js/veronica-ui.min.js': ['dist/js/veronica-ui.js']
                }
            }
        },
        kss: {
            options: {
                "config": "src/kss-config.json"
            },
            dist: {
            }
        },
        pug: {
            compile: {
                files: [{
                    expand: true,
                    cwd: "./src/styleguide/examples",
                    src: "*.pug",
                    dest: "./docs/styleguide/examples",
                    ext: ".html"
                }]
            }
        }
    });

    grunt.loadNpmTasks('grunt-contrib-less');
    grunt.loadNpmTasks('grunt-contrib-copy');
    grunt.loadNpmTasks('grunt-kss');
    grunt.loadNpmTasks('grunt-contrib-clean');
    grunt.loadNpmTasks('grunt-contrib-pug');
    grunt.loadNpmTasks('grunt-contrib-concat');
    grunt.loadNpmTasks('grunt-contrib-requirejs');
    grunt.loadNpmTasks('grunt-contrib-clean');
    grunt.loadNpmTasks('grunt-contrib-uglify');

    grunt.registerTask('script', ['requirejs', 'clean:script']);
    grunt.registerTask('style', ['less', 'copy:style', 'concat:style']);
    grunt.registerTask('release', ['style', 'script']);
    grunt.registerTask('styleguide', ['release', 'copy:styleguide', 'pug', 'kss']);
    grunt.registerTask('default', ['release']);
};

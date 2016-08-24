
'use strict';

module.exports = function (grunt) {

    var thirdPath = '../../bower_components';
    var nodeModulePath = './node_modules';
    function createOptions(moduleName) {
        var options = {
            baseUrl: './src/js',
            dir: './dist/js',
            paths: {
                "jquery": "empty:",
                'kendo-ui': '../assets/kendo-ui-core/kendo.custom',
                'kendo-ui-messages': '../assets/kendo-ui-core/kendo.messages.zh-CN',
                'kendo-ui-culture': '../assets/kendo-ui-core/kendo.messages.zh-CN',
                'text': thirdPath + '/requirejs-text/text',
                'bootstrap': thirdPath + '/bootstrap/dist/js/bootstrap',
                'bootstrap-datetimepicker': thirdPath + '/smalot-bootstrap-datetimepicker/js/bootstrap-datetimepicker',
                'bootstrap-datetimepicker-cn': thirdPath + '/smalot-bootstrap-datetimepicker/js/locales/bootstrap-datetimepicker.zh-CN',
                'jquery-form': thirdPath + '/jquery-form/jquery.form',
                'jquery-validation': thirdPath + '/jquery-validation/dist/jquery.validate',
                'jquery-validation-unobtrusive': thirdPath + '/jquery-validation-unobtrusive/jquery.validate.unobtrusive',
                'jquery-validation-bootstrap-tooltip': thirdPath + '/jquery-validation-bootstrap-tooltip/jquery-validate.bootstrap-tooltip',
                'noty': thirdPath + '/noty/js/noty/packaged/jquery.noty.packaged',
                'jquery-inputmask': thirdPath + '/jquery.inputmask/dist/jquery.inputmask.bundle',
                'table-to-json': thirdPath + '/table-to-json/lib/jquery.tabletojson',
                'form2js': thirdPath + '/form2js/src/form2js',
                'jquery-placeholder': thirdPath + '/jquery-placeholder/jquery.placeholder',
                'es5-shim': thirdPath + '/es5-shim/es5-shim'
            },
            shim: {
                'jquery-validation-bootstrap-tooltip': {
                    deps: ['jquery-validation']
                },
                'jquery-validation-unobtrusive': {
                    deps: ['jquery-validation', 'jquery-validation-bootstrap-tooltip']
                },
                'bootstrap-datetimepicker-cn': {
                    deps: ['bootstrap-datetimepicker']
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
            optimize: "none"
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
                    "dist/css/tiny.css": "src/less/tiny.less"
                }
            }
        },
        concat: {
            style: {
                files: [{
                    src: ['src/assets/bootstrap-flat/variables.less', 'src/less/variables.less'],
                    dest: 'dist/less/variables.less'
                }, {
                    src: ['src/assets/bootstrap-flat/mixins.less', 'src/less/mixins.less'],
                    dest: 'dist/less/mixins.less'
                }, {
                    src: ['src/assets/bootstrap-flat/bootstrap.css',
                        nodeModulePath + '/font-awesome/css/font-awesome.css',
                        './dist/css/tiny.css'],
                    dest: 'dist/css/veronica-ui.css'
                }]
            }
        },
        copy: {
            style: {
                files: [{
                    expand: true,
                    src: ['src/assets/bootstrap-flat/bootstrap.css'],
                    dest: 'dist/css/',
                    flatten: true
                }, {
                    expand: true,
                    src: ['src/assets/bootstrap-flat/bootstrap.js'],
                    dest: 'dist/js/', flatten: true
                }, {
                    expand: true,
                    src: [nodeModulePath + '/font-awesome/fonts/*'],
                    dest: 'dist/fonts/', flatten: true
                }, {
                    expand: true,
                    src: ['src/js/*'],
                    dest: 'dist/js/',
                    filter: 'isFile', flatten: true
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

    grunt.registerTask('script', ['requirejs', 'clean:script', 'uglify']);
    grunt.registerTask('style', ['less', 'copy:style', 'concat:style']);
    grunt.registerTask('release', ['style', 'script']);
    grunt.registerTask('styleguide', ['copy:styleguide', 'pug', 'kss']);

};

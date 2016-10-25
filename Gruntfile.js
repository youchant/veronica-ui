'use strict';

module.exports = function (grunt) {
    var nodeModulePath = './node_modules';

    var thirdPath = '../../node_modules'; // '../../bower_components';
    var bowerPath = '../../bower_components';

    function createOptions(moduleName) {
        var options = {
            baseUrl: './src/js',
            dir: './dist/js',
            paths: {
                "jquery": "empty:",
                "keboacy": "../../bower_components/keboacy/dist/js/keboacy",
                'bootstrap': '../../assets/bootstrap/js/bootstrap',
                'kendo-ui': '../../assets/kendo-ui/kendo.ui.core',
                'kendo-ui-messages': '../../assets/kendo-ui/kendo.messages.zh-CN',
                'kendo-ui-culture': '../../assets/kendo-ui/kendo.culture.zh-CN',
            },
            shim: {
                'kendo-ui-messages': {
                    deps: ['kendo-ui']
                },
                'kendo-ui-culture': {
                    deps: ['kendo-ui-messages']
                }
            },
            wrapShim: true,
            modules: [{
                name: moduleName,
                include: [thirdPath + "/almond/almond"],
                exclude: ["jquery"]
            }],
            wrap: {
                "startFile": 'build/wrap.start',
                "endFile": 'build/wrap.end'
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
        clean: {
            script: [
                'dist/js/**/*',
                'dist/js/*.*.js',
                '!dist/js/veronica-ui.*',
                '!dist/js/keboacy.*'
            ]
        },
        copy: {
            main: {
                files: [{
                    expand: true,
                    cwd: './bower_components/keboacy/dist',
                    src: ['**'],
                    dest: './dist/'
                }]
            }
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
        }
    });

    grunt.loadNpmTasks('grunt-contrib-copy');
    grunt.loadNpmTasks('grunt-contrib-clean');
    grunt.loadNpmTasks('grunt-contrib-concat');
    grunt.loadNpmTasks('grunt-contrib-requirejs');
    grunt.loadNpmTasks('grunt-contrib-uglify');

    grunt.registerTask('release', ['copy','requirejs', 'clean:script']);
    grunt.registerTask('default', ['release']);
};

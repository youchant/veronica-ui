
'use strict';

module.exports = function (grunt) {

    function simpleClone(oldObject) {
        return JSON.parse(JSON.stringify(oldObject));
    }

    function createOptions(isPro) {

        var moduleName = isPro ? './veronica-ui-pro' : './veronica-ui';
        var endFile = isPro ? 'tools/wrap_pro.end' : 'tools/wrap.end';

        var options = {
            appDir: './lib',
            baseUrl: '.',
            dir: './dist',
            paths: {
                "jquery": "empty:",
                //'kendo-ui': '../bower_components/kendo-ui-core/src/js/kendo.ui.core',
                'kendo-ui': '../assets/kendo-ui-core/dist/js/kendo.custom',
                'kendo-ui-messages': '../assets/kendo-ui-core/dist/js/kendo.messages.zh-CN.min',
                //'kendo-ui-pro': 'empty:',
                //'kendo-ui-pro-culture': 'empty:',
                //'kendo-ui-pro-messages': 'empty:',
                'kendo-ui-pro': '../assets/kendo-ui-pro/js/kendo.web.min',
                'kendo-ui-pro-culture': '../assets/kendo-ui-pro/js/cultures/kendo.culture.zh-CN.min',
                'kendo-ui-pro-messages': '../assets/kendo-ui-pro/js/messages/kendo.messages.zh-CN.min',
                'text': '../bower_components/requirejs-text/text',
                'bootstrap': '../bower_components/bootstrap/dist/js/bootstrap',
                'bs-datetimepicker': '../bower_components/smalot-bootstrap-datetimepicker/js/bootstrap-datetimepicker',
                'bs-datetimepicker-cn': '../bower_components/smalot-bootstrap-datetimepicker/js/locales/bootstrap-datetimepicker.zh-CN',
                'bootstrap-paginator': '../bower_components/bootstrap-paginator/src/bootstrap-paginator',
                'jquery-form': '../bower_components/jquery-form/jquery.form',
                'jquery-validation': '../bower_components/jquery-validation/dist/jquery.validate',
                'jquery-validation-unobtrusive': '../bower_components/jquery-validation-unobtrusive/jquery.validate.unobtrusive',
                'noty': '../bower_components/noty/js/noty/packaged/jquery.noty.packaged',
                'jquery-inputmask': '../bower_components/jquery.inputmask/dist/jquery.inputmask.bundle',
                'table-to-json': '../bower_components/table-to-json/lib/jquery.tabletojson',
                'form2js': '../bower_components/form2js/src/form2js',
                'jquery-placeholder': '../bower_components/jquery-placeholder/jquery.placeholder',
                'jquery-validation-bootstrap-tooltip': '../bower_components/jquery-validation-bootstrap-tooltip/jquery-validate.bootstrap-tooltip',
                'jstree': '../bower_components/jstree/dist/jstree'
            },
            shim: {
                'jquery-validation-bootstrap-tooltip': {
                    deps: ['jquery-validation']
                },
                'jquery-validation-unobtrusive': {
                    deps: ['jquery-validation']
                }
            },
            wrapShim: true,
            modules: [{
                name: moduleName,
                include: ["../bower_components/almond/almond"],
                exclude: ["jquery", "text"]
            }],
            "wrap": {
                "startFile": "tools/wrap.start",
                "endFile": endFile
            },
            removeCombined: false,
            "optimize": "none"
        };



        return options;
    }



    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        requirejs: {
            main: {
                options: createOptions(false)
            }
        },
        clean: {
            main: [
            'dist/build.txt',
            'dist/text.js',
            'dist/*.js',
            '!dist/veronica-ui.*',
            '!dist/veronica-ui-pro.*'
            ]
        },
        uglify: {
            main: {
                files: {
                    'dist/veronica-ui.min.js': ['dist/veronica-ui.js'],
                    'dist/veronica-ui-pro.min.js': ['dist/veronica-ui-pro.js']
                },
                report: 'gzip'
            }
        }
    });

    grunt.loadNpmTasks('grunt-contrib-requirejs');
    grunt.loadNpmTasks('grunt-contrib-clean');
    grunt.loadNpmTasks('grunt-contrib-uglify');

    grunt.registerTask('default', ['requirejs', 'clean']);

};

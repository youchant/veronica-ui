
'use strict';

module.exports = function (grunt) {

    function createOptions() {

        var moduleName = './veronica-ui';
        var endFile = 'tools/wrap.end';
        var startFile = 'tools/wrap.start';

        var options = {
           // appDir: './lib',
            baseUrl: './lib',
            dir: './dist',
            paths: {
                "jquery": "empty:",
                'kendo-ui': '../assets/kendo-ui-core/dist/js/kendo.custom',
                'kendo-ui-messages': '../assets/kendo-ui-core/dist/js/kendo.messages.zh-CN.min',
                'text': '../bower_components/requirejs-text/text',
                'bootstrap': '../bower_components/bootstrap/dist/js/bootstrap',
                'bootstrap-datetimepicker': '../bower_components/smalot-bootstrap-datetimepicker/js/bootstrap-datetimepicker',
                'bootstrap-datetimepicker-cn': '../bower_components/smalot-bootstrap-datetimepicker/js/locales/bootstrap-datetimepicker.zh-CN',
                'bs-datetimepicker': '../bower_components/bs-datetimepicker/src/js/bootstrap-datetimepicker',
                //'bootstrap-paginator': '../bower_components/bootstrap-paginator/src/bootstrap-paginator',
                'jquery-form': '../bower_components/jquery-form/jquery.form',
                'jquery-validation': '../bower_components/jquery-validation/dist/jquery.validate',
                'jquery-validation-unobtrusive': '../bower_components/jquery-validation-unobtrusive/jquery.validate.unobtrusive',
                'noty': '../bower_components/noty/js/noty/packaged/jquery.noty.packaged',
                'jquery-inputmask': '../bower_components/jquery.inputmask/dist/jquery.inputmask.bundle',
                'table-to-json': '../bower_components/table-to-json/lib/jquery.tabletojson',
                'form2js': '../bower_components/form2js/src/form2js',
                'jquery-placeholder': '../bower_components/jquery-placeholder/jquery.placeholder',
                'jquery-validation-bootstrap-tooltip': '../bower_components/jquery-validation-bootstrap-tooltip/jquery-validate.bootstrap-tooltip',
                'jstree': '../bower_components/jstree/dist/jstree',
                'moment': '../bower_components/moment/moment',
                'moment-locale': '../bower_components/moment/locale/zh-cn',
                'es5-shim': '../bower_components/es5-shim/es5-shim'
            },
            shim: {
                'jquery-validation-bootstrap-tooltip': {
                    deps: ['jquery-validation']
                },
                'jquery-validation-unobtrusive': {
                    deps: ['jquery-validation']
                },
                //'moment': {
                //    deps: ['moment-locale']
                //}
            },
            wrapShim: true,
            modules: [{
                name: moduleName,
                include: ["../bower_components/almond/almond"],
                exclude: ["jquery", "text"]
            }],
            "wrap": {
                "startFile": startFile,
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
                options: createOptions()
            }
        },
        clean: {
            main: [
            'dist/**/*',
            '!dist/veronica-ui.*'
            ]
        },
        uglify: {
            main: {
                files: {
                    'dist/veronica-ui.min.js': ['dist/veronica-ui.js']
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

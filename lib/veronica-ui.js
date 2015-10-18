define([
    './ajaxify',
    './formUtil',
    './listUtil',
    './notify',
    './source',
    './culture-zh-CN',
    './datatable',
    './kendo-mvvm',
    './kendo-binders',
    'bootstrap'
], function () {
    var args = arguments;
    return function (app) {
        for (var i = 0, len = args.length; i < len; i++) {
            if (args[i] instanceof Function) {
                args[i](app);
            }
        }
    };
});

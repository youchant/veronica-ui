define([
    './ajaxify',
    './listUtil',
    './notify',
    './source',
    'kendo-ui-pro',
    'kendo-ui-pro-culture',
    'kendo-ui-pro-messages',
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

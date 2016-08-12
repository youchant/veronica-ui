define([
    'bootstrap',
    'kendo-ui',
    'kendo-ui-messages',
    './infrastructure/ajaxify',
    './kendo-ui/binders',
    './kendo-ui/culture-zh-CN',
    './kendo-ui/dataTable',
    './kendo-ui/store',
    './kendo-ui/viewExt',
    './ui/notify',
    './utils/formUtil',
    './utils/listUtil'
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

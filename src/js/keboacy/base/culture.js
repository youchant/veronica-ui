(function (factory) {
    if (typeof define === 'function' && define.amd) {
        define(['kendo-ui-culture'], factory);
    } else {
        factory(jQuery);
    }
}(function () {
    kendo.culture("zh-CN");
}));

(function (factory) {
    if (typeof define === 'function' && define.amd) {
        define(['kendo-ui-culture'], factory);
    } else {
        factory(jQuery);
    }
}(function () {
    // 设置默认的 culture
    kendo.culture("zh-CN");
}));

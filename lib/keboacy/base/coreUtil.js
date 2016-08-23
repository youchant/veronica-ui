(function (factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else {
        root.kb_coreUtil = factory();
    }
}(function () {

    var coreUtil = {};

    coreUtil.randomString = function () {
        return Math.random().toString(36).substring(7);
    }

    coreUtil.isFalsy = function (o) {
        return o == null || o == false;
    }

    return coreUtil;
}));

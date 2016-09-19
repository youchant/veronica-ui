define([
    './base',
    './ajax',
    './form',
    './modelDefine',
    './resize',
    './trigger',
    './ui',
    './store'
], function () {
    var args = Array.prototype.slice.call(arguments);
    return function (app) {
        var _ = app.core._;
        _.each(args, function (arg) {
            arg(app.view.base, app);
        });
    }
});
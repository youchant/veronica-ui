define([
    './veronicaExt/appExt/_combine',
    './veronicaExt/viewExt/_combine'
], function () {
    var args = Array.prototype.slice.call(arguments);
    return function (app) {
        app.use(args);
    }
});
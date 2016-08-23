define([
    './formValidation',
    './templateEngine',
    './uiKit',
    './viewEngine'
    //,
    //'./windowProvider'
], function () {
    var args = Array.prototype.slice.call(arguments);
    return function (app) {
        app.use(args);
    }
});
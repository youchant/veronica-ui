define([
    './formValidation',
    './templateEngine',
    './uiKit',
    './viewEngine',
    './windowProvider',
    './backendApi',
    './methodProvider',
    './optionsProvider',
    './store',
    './storeProvider'
], function () {
    var args = Array.prototype.slice.call(arguments);
    return function (app) {
        app.use(args);
    }
});
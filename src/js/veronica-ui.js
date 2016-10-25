define([
    './appExt/_combine',
    './viewExt/_combine'
], function (appExt, viewExt) {
    return function (app) {
        app.use([appExt, viewExt]);
    }
});
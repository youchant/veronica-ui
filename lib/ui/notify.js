define([
   'noty'
], function () {
    return function (app) {
        var $ = app.core.$;
        app.notify = {}

        app.notify._core = function (option) {
            var n = noty($.extend({
                type: 'warning',
                dismissQueue: true,
                force: true,
                layout: 'topCenter',
                theme: 'relax',  // bootstrapTheme
                closeWith: ['click'],
                maxVisible: 1,
                animation: {
                    open: { height: 'toggle' },
                    close: { height: 'toggle' },
                    easing: 'swing',
                    speed: 100 // opening & closing animation speed
                },
                timeout: false,
                killer: true,
                modal: false
            }, option));

        };

        app.notify.warn = function (text) {
            app.notify._core({
                text: text,
                type: 'warning',
                timeout: 4000
            });
        };

        app.notify.success = function (text) {
            app.notify._core({
                text: text,
                timeout: 2000,
                type: 'success'
            });
        };

        app.notify.error = function (text) {
            app.notify._core({
                text: text,
                type: 'error',
                timeout: false
            });
        };

        app.notify.confirm = function (successCb, cancelCb) {
            app.notify._core({
                text: '确定进行这个操作？',
                type: 'confirm',
                modal: true,
                buttons: [{
                    addClass: 'btn btn-primary btn-xs', text: '确定', onClick: function ($noty) {
                        $noty.close();
                        successCb();
                    }
                }, {
                    addClass: 'btn btn-danger btn-xs', text: '取消', onClick: function ($noty) {
                        $noty.close();
                        cancelCb();
                    }
                }]
            });
        };
    };
});

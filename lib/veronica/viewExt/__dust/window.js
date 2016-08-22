define([
], function () {


    return function(app) {
        var _ = app.core._;
        var $ = app.core.$;

        // window

        var oldWindowInstance = app.view.base._windowInstance;
        app.view.base._windowInstance = function ($el, options, view) {

            if (options.type === 'modal') {
                var wnd = {
                    element: $el,
                    config: options,
                    close: function () {
                        this.element.modal('hide');
                    },
                    destroy: function () {
                    },
                    center: function () {
                    },
                    /**
                     * 打开对话框
                     */
                    open: function () {
                        this.element.modal('show');
                    },
                    rendered: function (view) {

                    },
                    setOptions: function (opt) {
                    }
                };

                if (options.destroyedOnClose) {
                    $el.modal().on('hidden.bs.modal', function () {
                        view._destroyWindow(options.name);
                    });
                }

                wnd.core = $el.data('bs.modal');

                return wnd;
            }
            if (options.type === 'dialog') {
                return oldWindowInstance.call(this, $el, options, view);
            }

            var dlgOptions = options.options;

            dlgOptions.modal = true;
            $el.kendoWindow(dlgOptions);
            var dlg = $el.data('kendoWindow');
            if (options.destroyedOnClose) {
                dlg.bind('close', function () {
                    view._destroyWindow(options.name);
                });
            }
            if (options.full) {
                dlg.bind('open', function () {
                    dlg.maximize();
                });
            }
            dlg.rendered = function (view) {
                this.element.find('.fn-s-loading').remove();
            }

            dlg.config = options;
            dlg.core = dlg;

            return dlg;

        }

    };
});

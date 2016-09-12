define([], function () {

    return function (app) {
        var extend = app.core.$.extend;

        app.windowProvider.add('bs-modal', {
            create: function ($el, options, view) {

                var wnd = {
                    element: $el,
                    config: options,
                    flyNode: false,
                    close: function () {
                        this.element.modal('hide');
                    },
                    destroy: function () {
                        if(this.flyNode === true){
                            this.element.remove();
                        }
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
                    },
                    removeLoading: function () {
                    }
                };
                if (!$.contains('body', $el)) {
                    wnd.flyNode = true;
                    $el.appendTo('body');
                }

                // init
                $el.modal();

                if (options.destroyOnClose) {
                    $el.on('hidden.bs.modal', function () {
                        view._destroyWindow(options.name);
                    });
                }

                wnd.core = $el.data('bs.modal');

                return wnd;
            },
            options: function (options) {
                return _.extend({}, options, {
                    template: '<div class="modal fade">' +
                    '<div class="modal-dialog">' +
                    '<div class="modal-content fn-wnd">' +
                    '</div>' +
                    '</div>' +
                    '</div>'
                });
            }

        });

    };
});

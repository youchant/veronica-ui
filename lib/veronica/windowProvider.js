define([
    'artDialog'
], function (artDialog) {

    return function (app) {
        var extend = app.core.$.extend;

        app.windowProvider.add('artDialog', {
            options: function (options) {
                return extend(true, options, {
                    positionTo: null,
                    center: true,
                    footer: false,
                    options: {
                        width: 300,
                        height: 200,
                        fixed: true,
                        drag: false,
                        modal: false
                    }
                });
            },
            create: function($el, options, view) {
                // 对话框控件实例
                var dlg = artDialog($.extend({
                    content: $el
                }, config.options)).close();  // 解决开始对话框默认显示的问题

                /**
                 * 对话框
                 * @class veronica.Dialog
                 */

                /** @lends veronica.Dialog# */
                var wnd = {
                    /**
                     * 对话框元素
                     */
                    element: $el,
                    /**
                     * 对话框内部UI控件
                     */
                    core: dlg,
                    /**
                     * 打开对话框
                     */
                    config: config,
                    positionTo: config.positionTo,
                    /**
                     * 关闭对话框
                     */
                    close: function () {
                        if (this.core.open) {
                            this.core.close();
                        }
                    },
                    destroy: function () {
                        this.core.remove();
                    },
                    center: function () {
                        this.core.reset();
                    },
                    /**
                     * 打开对话框
                     */
                    open: function () {
                        if (config.options.modal === true) {
                            this.core.showModal(this.positionTo);
                        } else {
                            this.core.show(this.positionTo);
                        }
                    },
                    rendered: function (view) {
                        var $f = view.$el.find('.footer');
                        if ($f.length > 0 || config.footer === true) {
                            $f.addClass('modal-footer').closest('.ui-dialog-body').addClass('with-footer');
                        }
                        this.removeLoading();
                        this.center();
                    },
                    setOptions: function (opt) {
                        opt.width && this.core.width(opt.width);
                        opt.height && this.core.height(opt.height);
                        opt.title && this.core.title(opt.title);
                    },
                    removeLoading: function () {
                        this.element.find('.fn-s-loading').remove();
                    }
                };

                wnd.core.addEventListener('close', _.bind(function () {
                    if (config.destroyedOnClose) {
                        view._destroyWindow(config.name);
                    }
                }, this));

                wnd.core.addEventListener('remove', function () {
                    $.each($('.fn-wnd-placeholder:hidden'), function (i, el) {
                        if ($(el).closest('.ui-dialog').length === 0) {
                            $(el).remove();
                        }
                    });
                });

                if (options.footer) {
                    $el.find('.fn-close').on('click', function () {
                        wnd.close();
                    });
                    $el.parents(".ui-dialog-body").addClass('with-footer');
                    //$el.find('.fn-wnd').addClass('with-footer');
                }

                return wnd;
            }
        });
    };
});

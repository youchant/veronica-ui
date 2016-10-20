define([
], function () {
    return function (base, app) {
        var _ = app.core._;
        var $ = app.core.$;

        var ext = {
            options: {
                autoResize: false
            },
            methods: {
                /**
                 * **`重写`** 重写该方法，使视图自适应布局，当开启 `autoResize` 后，窗口大小变化时，该方法会被调用，
                 * 如果有必要，在该方法中应编写窗口大小变化时，该视图对应的处理逻辑
                 * @type {function}
                 */
                resize: function () {

                }
            }
        }

        base._extendMethod('_setup', function () {
            if (this.options.autoResize) {
                $(window).on('resize', this.resize);
            }
        });

        base._extendMethod('_rendered', function () {
            if (this.options.autoResize) {
                _.defer(this.resize);
            }
        });

        base._extendMethod('_destroy', function () {
            // 清理在全局注册的事件处理器
            this.options.autoResize && $(window).off('resize', this.resize);
        });

        base._extend(ext);
    }
});

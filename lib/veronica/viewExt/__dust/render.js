define([
    'bootstrap-datetimepicker'
], function () {


    return function(app) {
        var _ = app.core._;
        var $ = app.core.$;

        $.fn.datetimepicker.dates['zh-CN'] = {
            days: ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"],
            daysShort: ["周日", "周一", "周二", "周三", "周四", "周五", "周六", "周日"],
            daysMin: ["日", "一", "二", "三", "四", "五", "六", "日"],
            months: ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"],
            monthsShort: ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"],
            today: "今天",
            suffix: [],
            meridiem: ["上午", "下午"]
        };


        // render


        var oldRenderTemplate = app.view.base._renderTemplate;
        app.view.base._renderTemplate = function (template) {
            if (_.isFunction(template)) {
                this.options.templateEngine = 'pug';
            }
            return oldRenderTemplate.apply(this, Array.prototype.slice.call(arguments));
        }



        var oldExecuteTemplate = app.view.base._executeTemplate;
        app.view.base._executeTemplate = function (compiled) {

            if (this.options.templateEngine === 'pug') {
                var result = compiled(_.extend({}, {
                    // mixin: app.pugMixin,
                    // output: app.pugOutput,
                    options: this.options,
                    globalModel: app.modelProvider,
                    contextModel: this.getContextModelDefine(),
                    model: this.getModelDefine()
                }));
                //app.pugOutput.html = '';
                return result;
            }

            return oldExecuteTemplate.apply(this, Array.prototype.slice.call(arguments));
        }

        var originalActiveUi = app.view.base._activeUI;
        app.view.base._activeUI = function () {
            originalActiveUi.apply(this, Array.prototype.slice.call(arguments));

            if ($.fn.datetimepicker) {
                // 日期
                this.$('input.date').datetimepicker({
                    format: 'yyyy/mm/dd',
                    todayBtn: 'linked',
                    startView: 'month',
                    language: 'zh-CN',
                    minView: 2,
                    autoclose: true
                });
            }

            // 启用布局控件，示例
            if ($.layout) {
                var me = this;
                setTimeout(function () {
                    _.each(this.$('[data-part=layout]'), function (el) {
                        $(el).layout({
                            applyDemoStyles: false,
                            closable: false,
                            resizable: false,
                            slidable: false,
                            spacing_open: 0
                        });
                    });
                }, 0);
            }
        }


    };
});

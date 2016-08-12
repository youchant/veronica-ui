define([], function () {
    return function (app) {
        app.ajaxify = app.ajaxify || {};

        // 将某个视图下的所有链接转换为Ajax请求链接
        app.ajaxify.link = function (context) {
            var $el = context.$el;
            $el.find('[href]').on('click', function (e) {
                var $this = $(this);
                if ($this.data('noajaxify')) {
                    return;
                } else {
                    e.preventDefault();
                    var url = $this.attr('href');
                    var method = $this.data('ajaxify');
                    method = method || '_linkHandler';
                    context[method](url);
                }
            });
        }
    };
});

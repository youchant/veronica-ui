(function (factory) {
    if (typeof define === 'function' && define.amd) {
        define(['jquery', '../base/coreUtil', 'bootstrap'], factory);
    } else {
        factory(jQuery, kb_coreUtil);
    }
}(function ($, coreUtil) {
    "use strict";

    $.fn.dynamicTab = function () {
        var $parent = this;
        var $dynamicTabs = this.find('.nav[data-dynamic-tab]');
        var $allButtons = $parent.find('[data-tab-toggle]');

        $dynamicTabs.each(function (i, el) {
            var $nav = $(el);
            var group = $nav.attr('data-dynamic-tab');

            var $content = $parent.find('.tab-content[data-dynamic-tab=' + group + ']');
            var $buttons = $allButtons.filter('[data-for=' + group + ']');
            var $tabs = $nav.find('[data-toggle=tab]');
            var $panels = $content.find('.tab-pane');

            $tabs.on('shown.ver.tab', function (e) {
                var idx = $(e.target).closest('.nav-item').index();
                var $prev = $buttons.filter('[data-tab-toggle=prev]');
                var $next = $buttons.filter('[data-tab-toggle=next]');

                $prev.prop('diabled', false);
                $next.prop('diabled', false);
                if (idx === 0) {
                    $prev.prop('disabled', true);
                }
                if (idx === $tabs.length - 1) {
                    $next.prop('disabled', true);
                }
            });

            $tabs.each(function (i, tab) {
                var rstr = coreUtil.randomString();
                var $thePane = $($panels.get(i));
                var $theTab = $(tab);

                $theTab.attr('href', '#' + rstr);
                $thePane.attr('id', rstr);

                // 动态设置 form-invalid-tag

                var $form = $thePane.find('[data-validate-form]');
                var formName = $form.data('validate-form');
                if (coreUtil.isFalsy(formName)) {
                    $form.attr('data-validate-form', rstr);
                }

                var $formtag = $theTab.find('.form-invalid-tag');
                var formForName = $formtag.data('for');
                if (coreUtil.isFalsy(formForName)) {
                    $formtag.attr('data-for', rstr);
                }

            });
        });

        // toggle
        $allButtons.on('click.ver.tab.data-api', function (e) {
            var $target = $(this);
            var direction = $target.data('tab-toggle');
            var tabName = $target.data('for');
            var $tab = $('[data-dynamic-tab="' + tabName + '"]');

            $tab.find('.active')[direction]().find('[data-toggle=tab]').tab('show');
        });
    }

}));


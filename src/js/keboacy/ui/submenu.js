(function (factory) {
    if (typeof define === 'function' && define.amd) {
        define(['jquery'], factory);
    } else {
        factory(jQuery);
    }
}(function ($) {
    "use strict";

    var pluginName = "submenu";
    var defaults = {};
    var MIN_CLASS = 'menu-vertical-min';

    function Plugin(element, options) {
        this.element = element;
        this.minimized = $(this.element).hasClass(MIN_CLASS);
        this.settings = $.extend({}, defaults, options);
        this._defaults = defaults;
        this._name = pluginName;
        this.toggleIcons = ['fa-angle-double-left', 'fa-angle-double-right'];
        this.submenuCls = '.menu-submenu';
        this.init();
    }

    $.extend(Plugin.prototype, {
        init: function () {
            var $navlist = $(this.element).find('.menu-nav');
            var $toggle = $(this.element).find('.menu-toggle');
            var me = this;

            // 初始化子级指示器
            $.each($navlist.find('li'), function (i, li) {
                var $li = $(li);
                var $submenu = $li.children(me.submenuCls);
                var $ddtoggle = $li.children('.dropdown-toggle');
                if ($submenu.length > 0) {
                    if ($ddtoggle.children('.menu-child_indicator').length === 0) {
                        $ddtoggle.append('<b class="menu-child_indicator fa"></b>');
                    }
                }
            });

            // 点击事件
            $navlist.on('click', 'a', function (e) {
                e.preventDefault();
                var $link = $(e.currentTarget);
                var $li = $link.parent();

                // 无子菜单则直接激活
                if ($li.children('.menu-submenu').length === 0) {
                    me.active($li);
                }

                // 有子菜单则视情况打开子菜单
                if ($link.hasClass('dropdown-toggle')) {
                    if (me.minimized || $li.hasClass('hover')) {
                        return;
                    }
                    me.toggleDisplay($li);
                }

            });

            // 切换显示模式
            $toggle.on('click', function (e) {
                e.preventDefault();
                if (me.minimized) {
                    $(me.element).removeClass(MIN_CLASS);
                    $toggle.children().removeClass(me.toggleIcons[1]).addClass(me.toggleIcons[0]);
                } else {
                    $(me.element).addClass(MIN_CLASS);
                    $toggle.children().removeClass(me.toggleIcons[0]).addClass(me.toggleIcons[1]);
                    // 隐藏所有submenu
                    //$(me.element).find('.submenu').hide();
                }
                me.minimized = !me.minimized;
            });
        },
        toggleDisplay: function ($li) {
            if ($li.hasClass('open')) {
                this._toggleSubmenu($li, 'hide');
            } else {
                this._toggleSubmenu($li, 'show');
                this._toggleSubmenu($li.siblings('.open'), 'hide');
            }
        },
        _toggleSubmenu: function ($item, mode, callback) {
            var me = this;
            var animate = 'slideDown';
            var openHd = 'addClass';
            callback || (callback = function () { });

            if (mode === 'hide') {
                animate = 'slideUp';
                openHd = 'removeClass';
            }

            $item.children(this.submenuCls)[animate]('fast', function () {
                $item[openHd]('open');

                callback();
            });
            return this;
        },
        active: function (selector) {
            $(this.element).find('.active').removeClass('active');
            $(selector).addClass('active')
                .parentsUntil(this.element, 'li').addClass('active');
        }
    });

    $.fn[pluginName] = function (options) {
        return this.each(function () {

            var $this = $(this);
            var data = $this.data('plugin_' + pluginName);

            if (!data) {
                $this.data('plugin_' + pluginName, (data = new Plugin(this, options)))
            }

            if (typeof options == 'string') {
                data[options]();
            }

        });
    };
}));

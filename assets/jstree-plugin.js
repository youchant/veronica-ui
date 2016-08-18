(function (factory) {
  "use strict";
  if (typeof define === 'function' && define.amd) {
    define('jstree.kendoSource', ['jquery', 'jstree'], factory);
  }
  else if (typeof exports === 'object') {
    factory(require('jquery'), require('jstree'));
  }
  else {
    factory(jQuery, jQuery.jstree);
  }
}(function ($, jstree, undefined) {
  "use strict";

  if ($.jstree.plugins.kendoSource) { return; }

  $.jstree.defaults.kendoSource = null;
  $.jstree.plugins.kendoSource = function (options, parent) {
    this.init = function (el, options) {
      if (options.kendoSource) {

      }
      debugger;
      parent.init.call(this, el, options);
    };
    this._load_nodes = function (nodes, callback, is_callback, force_reload) {
      var setting = this.settings.kendoSource;
      if (setting == null || setting.source == null) {
        return parent._load_nodes.call(this, nodes, callback, is_callback, force_reload);
      }
      var source = setting.source;
      var map = setting.map;
      return source.read().done(function (resp) {
        debugger;
        var nodes = $.map(resp, map);
        parent._load_nodes.call(this, nodes, callback, is_callback, force_reload);
      });
    };
    this._load_node = function (obj, callback) {
      // 根节点
      if (obj.id === '#') {

      }
      return parent._load_node.call(this, obj, callback);
    };
  };
}));
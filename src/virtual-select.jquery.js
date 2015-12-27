import $ from 'jquery';
import VirtualSelect from './VirtualSelectPlugin.js';

const pluginName = `virtualselect`;

$.fn[pluginName] = function(options) {
  return this.each(function() {
    if (!$.data(this, `plugin_${pluginName}`)) {
      $.data(this, `plugin_${pluginName}`, new VirtualSelect(window.document, $(this), options));
    }
  });
};

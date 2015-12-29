import $ from 'jquery';
import VirtualSelect from './virtual-select';

const pluginName = 'virtualselect';

$.fn[pluginName] = function Plugin() {
  const pluginId = `plugin_${pluginName}`;
  return this.each((index, element) => {
    const plugin = $.data(element, pluginId);

    if (typeof (arguments[0]) === 'object') {
      const options = arguments[0];
      if (plugin) return;
      $.data(element, pluginId, new VirtualSelect($(element), options));
    } else if (arguments[0] === 'select') {
      if (plugin) plugin.select(arguments[1]);
    } else if (arguments[0] === 'focus') {
      if (plugin) plugin.focus();
    }
  });
};

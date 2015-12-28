import $ from 'jquery';
import { CursorUp, CursorDown, Escape, Enter, Control } from './keys.js';
import noop from './noop.js';

function SearchInput(options) {
  this.options = options;
  this.channels = {
    'focus': noop,
    'blur': noop,
    'change': noop,
    'activate_next_item': noop,
    'activate_previous_item': noop,
    'select_active_item': noop,
    'cancel_selection': noop,
    'toggle_extended_mode': noop
  };
  this.renderedState = {};
  this.init();
}

SearchInput.prototype.on = function(channel, callback) {
  this.channels[channel] = callback ? callback : noop;
  return this;
};

SearchInput.prototype.init = function() {

  const keydownHandlers = {
    [CursorUp]: 'activate_previous_item',
    [CursorDown]: 'activate_next_item',
    [Enter]: 'select_active_item',
    [Escape]: 'cancel_selection',
    [Control]: 'toggle_extended_mode'
  };

  this.element = this.$searchInputElement = $('<input type="text"/>')
    .addClass('ui-virtual-select--search-input')
    .on('focus', () => {
      this.channels['focus']();
    })
    .on('keydown', event => {
      const key = event.which;
      const channel = keydownHandlers[key];
      if (channel) {
        this.channels[channel]();
      }
    })
    .on('blur', () => {
      this.channels['blur']();
    })
    .on('keyup', event => {
      const query = $(event.target).val();
      this.channels['change'](query);
    });
};

SearchInput.prototype.render = function(state) {

  // update placeholder
  const dataProvider = this.options.dataProvider;
  const displayText = state.selectedItem ?
    dataProvider.displayText(state.selectedItem) :
    dataProvider.noSelectionText();
  if (displayText !== this.$searchInputElement.attr('placeholder')) {
    console.debug(`updating placeholder: ${displayText}`);
    this.$searchInputElement.attr('placeholder', displayText);
  }

  // update value
  if (state.query !== this.$searchInputElement.val()) {
    console.debug(`updating query: ${state.query}`);
    this.$searchInputElement.val(state.query);
  }

  if (this.$searchInputElement.is(':focus') && !state.open && this.renderedState.open) {
    console.debug(`blurring search input`);
    this.$searchInputElement.trigger('blur');
  }

  // this.renderedState = state;
  this.renderedState = $.extend({}, state);

};

export default SearchInput;

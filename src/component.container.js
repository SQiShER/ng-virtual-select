import $ from 'jquery';

function Container(options) {
  this.options = options;
  this.init();
}

Container.prototype.init = function() {
  this.element = this.$container = $('<div/>').addClass('ui-virtual-select');
};

Container.prototype.render = function(state) {

  // toggle loading indicator and class
  if (state.itemsLoading) {
    this.$container.addClass('loading');
  } else {
    this.$container.removeClass('loading');
  }

  // toggle open state and class
  if (state.open) {
    this.$container.addClass('open');
  } else {
    this.$container.removeClass('open');
  }

};

export default Container;

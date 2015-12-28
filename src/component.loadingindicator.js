import $ from 'jquery';

function LoadingIndicator(options) {
  this.options = options;
  this.renderedState = {};
  this.init();
}

LoadingIndicator.prototype.init = function() {
  this.element = this.$loadingIndicator = $('<div/>')
    .addClass('ui-virtual-select--loading-indicator')
    .text('Loading...')
    .hide();
};

LoadingIndicator.prototype.render = function(state) {

  // toggle loading indicator and class
  if (state.itemsLoading) {
    this.$loadingIndicator.show();
  } else {
    this.$loadingIndicator.hide();
  }

  // this.renderedState = state;
  this.renderedState = $.extend({}, state);

};

export default LoadingIndicator;

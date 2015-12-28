import $ from 'jquery';
import noop from './noop.js';

function OptionList(options) {
  this.options = options;
  this.channels = {
    select: noop,
    activate: noop
  };
  this.lastMouseX = NaN;
  this.lastMouseY = NaN;
  this.init();
}

OptionList.prototype.onlyIfMousePositionChanged = function(callback) {
  return event => {
    // workaround to prevent scripted scrolling from triggering mousemove events
    const {lastMouseX: previousX, lastMouseY: previousY} = this;
    const {pageX: currentX, pageY: currentY} = event;
    return (currentX !== previousX || currentY !== previousY) ? callback(event) : noop();
  };
};

OptionList.prototype.on = function(channel, callback) {
  this.channels[channel] = callback ? callback : noop;
  return this;
};

OptionList.prototype.init = function() {
  const $items = $('<div/>')
    .addClass('ui-virtual-select--items')
    .css('overflow-y', 'scroll')
    .on('scroll', _.throttle(() => {
      this.render();
    }, 10))
    .on('mousemove', event => {
      this.lastMouseX = event.pageX;
      this.lastMouseY = event.pageY;
    })
    .on('mousedown', event => {
      /* prevent blur event when clicking options */
      if ($.contains($items.get(0), event.target)) {
        console.log('preventing default');
        event.preventDefault();
      }
    })
    .hide();

  const $canvas = $('<div/>')
    .addClass('ui-virtual-select--canvas')
    .appendTo($items)
    .on('mousemove', '.ui-virtual-select--item', this.onlyIfMousePositionChanged(event => {
      const index = $(event.currentTarget).data('index');
      if (index !== this.renderedState.activeItemIndex) {
        this.channels['activate'](index);
      }
    }))
    .on('click', '.ui-virtual-select--item', event => {
      const index = $(event.currentTarget).data('index');
      this.channels['select'](index);
    });

  this.element = this.$items = $items;
  this.$canvas = $canvas;
};

OptionList.prototype.render = function(state) {

  const self = this;

  if (arguments.length === 0) {
    state = this.renderedState;
  }

  // toggle open state and class
  if (state.open) {
    this.$items.show();
  } else {
    this.$items.hide();
  }

  if (state.open) {

    // adjust first item
    const scrollPosition = this.$items.scrollTop();
    const firstRenderedItemIndex = Math.max(Math.floor(scrollPosition / this.options.itemHeight) - this.options.maxVisibleItems, 0);

    // update items height
    const itemsElementHeight = Math.min(this.options.maxVisibleItems, this.options.dataProvider.items.length) * this.options.itemHeight;
    this.$items.css({
      height: `${itemsElementHeight}px`
    });

    // update canvas size
    const firstVisibleItemIndex = Math.max(Math.floor(this.$items.scrollTop() / this.options.itemHeight) - this.options.maxVisibleItems, 0);
    const canvasElementMarginTop = firstVisibleItemIndex * this.options.itemHeight;
    const canvasElementHeight = this.options.dataProvider.items.length * this.options.itemHeight - firstVisibleItemIndex * this.options.itemHeight;
    this.$canvas.css({
      'height': `${canvasElementHeight}px`,
      'margin-top': `${canvasElementMarginTop}px`
    });

    // adjust scroll position
    if (state.activeItemIndex !== this.renderedState.activeItemIndex || !this.renderedState.open) {
      const canvasSize = Math.min(this.options.dataProvider.items.length, this.options.maxVisibleItems) * this.options.itemHeight;
      const targetScrollPosition = state.activeItemIndex * this.options.itemHeight;
      const a1 = Math.ceil(scrollPosition / this.options.itemHeight) * this.options.itemHeight;
      const a2 = Math.floor(scrollPosition / this.options.itemHeight) * this.options.itemHeight + canvasSize;
      if (targetScrollPosition <= a1 || !this.renderedState.open) {
        this.$items.scrollTop(targetScrollPosition);
      } else if (targetScrollPosition >= a2) {
        this.$items.scrollTop(targetScrollPosition - canvasSize + this.options.itemHeight);
      }
    }

    // get items to render
    const items = this.options.dataProvider.get(firstRenderedItemIndex, firstRenderedItemIndex + this.options.maxRenderedItems);

    // create dom elements if necessary
    items.forEach((item, index) => {
      let $itemElement = this.$canvas.children('.ui-virtual-select--item').eq(index);
      if ($itemElement.length === 0) {
        $itemElement = $('<div/>').addClass('ui-virtual-select--item').appendTo(this.$canvas);
      }
      // TODO Optimize?
      $itemElement
        .data('item', item)
        .data('offset', firstRenderedItemIndex)
        .data('index', firstRenderedItemIndex + index);
    });

    // remove excess dom elements
    this.$canvas.children('.ui-virtual-select--item').slice(items.length).remove();

    // update text
    this.$canvas.children('.ui-virtual-select--item').each(function() {
      const $itemElement = $(this);
      const item = $itemElement.data('item');
      const displayText = self.options.dataProvider.displayText(item, state.extendedModeEnabled);
      if ($itemElement.text() !== displayText) {
        $itemElement.text(displayText).attr('title', displayText);
      }
    });
  }

  // change active class
  this.$canvas.children('.ui-virtual-select--item').each(function() {
    const $itemElement = $(this);
    const index = $itemElement.data('index');
    const hasActiveClass = $itemElement.hasClass('active');
    if (index === state.activeItemIndex && !hasActiveClass) {
      $itemElement.addClass('active');
    }
    if (index !== state.activeItemIndex && hasActiveClass) {
      $itemElement.removeClass('active');
    }
  });

  // update state with rendered one
  // this.renderedState = state;
  this.renderedState = $.extend({}, state);

};

export default OptionList;

function Renderer(dom, options) {
  this.dom = dom;
  this.options = options;
  this.renderedState = {};
}

Renderer.prototype.render = function(state) {
  const self = this;

  if (arguments.length === 0) {
    // re-render
    state = this.renderedState;
  }

  // update search input placeholder
  if (state.itemsLoaded && state.selectedItemIndex !== this.renderedState.selectedItemIndex) {
    const selectedItem = this.options.dataProvider.availableItems[state.selectedItemIndex];
    const displayText = selectedItem ?
      this.options.dataProvider.displayText(selectedItem) :
      this.options.dataProvider.noSelectionText();
    this.dom.$searchInput.attr('placeholder', displayText);
  }

  // toggle loading indicator and class
  if (state.itemsLoading) {
    this.dom.$loadingIndicator.show();
    this.dom.$container.addClass('loading');
  } else {
    this.dom.$loadingIndicator.hide();
    this.dom.$container.removeClass('loading');
  }

  // toggle open state and class
  if (state.open) {
    this.dom.$items.show();
    this.dom.$container.addClass('open');
  } else {
    this.dom.$items.hide();
    this.dom.$container.removeClass('open');
  }

  if (state.open) {

    // okay, i know this is not the best place for this, but I currently don't know where else to put it
    if (state.query && state.query !== this.renderedState.query) {
      this.options.dataProvider.filter(state.query);
    }

    // adjust first item
    const scrollPosition = this.dom.$items.scrollTop();
    const firstRenderedItemIndex = Math.max(Math.floor(scrollPosition / this.options.itemHeight) - this.options.maxVisibleItems, 0);

    // adjust scroll position
    if (state.activeItemIndex !== this.renderedState.activeItemIndex) {
      const canvasSize = Math.min(this.options.dataProvider.items.length, this.options.maxVisibleItems) * this.options.itemHeight;
      const targetScrollPosition = state.activeItemIndex * this.options.itemHeight;
      const a1 = Math.ceil(scrollPosition / this.options.itemHeight) * this.options.itemHeight;
      const a2 = Math.floor(scrollPosition / this.options.itemHeight) * this.options.itemHeight + canvasSize;
      if (targetScrollPosition <= a1) {
        this.dom.$items.scrollTop(targetScrollPosition);
      } else if (targetScrollPosition >= a2) {
        this.dom.$items.scrollTop(targetScrollPosition - canvasSize + this.options.itemHeight);
      }
    }

    const items = this.options.dataProvider.get(firstRenderedItemIndex, firstRenderedItemIndex + this.options.maxRenderedItems);

    // update items height
    const itemsElementHeight = Math.min(this.options.maxVisibleItems, this.options.dataProvider.items.length) * this.options.itemHeight;
    this.dom.$items.css({
      height: `${itemsElementHeight}px`
    });

    // update canvas size
    const firstVisibleItemIndex = Math.max(Math.floor(this.dom.$items.scrollTop() / this.options.itemHeight) - this.options.maxVisibleItems, 0);
    const canvasElementMarginTop = firstVisibleItemIndex * this.options.itemHeight;
    const canvasElementHeight = this.options.dataProvider.items.length * this.options.itemHeight - firstVisibleItemIndex * this.options.itemHeight;
    this.dom.$canvas.css({
      'height': `${canvasElementHeight}px`,
      'margin-top': `${canvasElementMarginTop}px`
    });

    // create dom elements if necessary
    items.forEach((item, index) => {
      let $itemElement = this.dom.$canvas.children('.ui-virtual-select--item').eq(index);
      if ($itemElement.length === 0) {
        $itemElement = $('<div/>').addClass('ui-virtual-select--item').appendTo(this.dom.$canvas);
      }
      // TODO Optimize?
      $itemElement.data('item', item).data('index', firstRenderedItemIndex + index);
    });

    // remove excess dom elements
    this.dom.$canvas.children('.ui-virtual-select--item').slice(items.length).remove();

    // update text
    this.dom.$canvas.children('.ui-virtual-select--item').each(function() {
      const $itemElement = $(this);
      const item = $itemElement.data('item');
      const displayText = self.options.dataProvider.displayText(item, state.extendedModeEnabled);
      if ($itemElement.text() !== displayText) {
        $itemElement.text(displayText).attr('title', displayText);
      }
    });
  }

  // change active class
  this.dom.$canvas.children('.ui-virtual-select--item').each(function() {
    const $itemElement = $(this);
    if ($itemElement.data('index') === state.activeItemIndex && !$itemElement.hasClass('active')) {
      $itemElement.addClass('active');
    }
    if ($itemElement.data('index') !== state.activeItemIndex && $itemElement.hasClass('active')) {
      $itemElement.removeClass('active');
    }
  });

  // update state with rendered one
  this.renderedState = $.extend({}, state);
  return this.renderedState;
};

export default Renderer;
